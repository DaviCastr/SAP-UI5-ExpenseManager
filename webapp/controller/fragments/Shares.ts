import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Table from "sap/m/Table";
import List from "sap/m/List";
import MessageBox from "sap/m/MessageBox";
import type Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import type Context from "sap/ui/model/odata/v4/Context";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { ODataService } from "../../service/ODataService";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { createRejectedChangeGuard } from "../../util/rejectedChanges";
import type Home from "../../controller/Home.controller";

/**
 * Finds the Shares dialog that contains the given control by walking up the
 * parent chain (footer buttons may be nested in an HBox).
 *
 * @param {Control} control the control inside the dialog
 * @returns {Dialog | undefined} the dialog, or `undefined` when not found
 */
function findSharesDialog(control: Control): Dialog | undefined {
    let current: Control | undefined = control;
    while (current) {
        if (current instanceof Dialog) {
            return current;
        }
        current = current.getParent() as Control | undefined;
    }
    return undefined;
}

/**
 * Walks up the parent chain of the given control and returns the first
 * `Table` found. Used to reach the nested Entities table of a Share from its
 * toolbar button.
 *
 * @param {Control} control the starting control
 * @returns {Table | undefined} the containing table, or `undefined`
 */
function containingTable(control: Control): Table | undefined {
    let current: Control | undefined = control;
    while (current) {
        if (current instanceof Table) {
            return current;
        }
        current = current.getParent() as Control | undefined;
    }
    return undefined;
}

/**
 * Returns the OData list binding that manages the Entities table of the given
 * Share (the glance on the toolbar "add entity" button).
 *
 * @param {Table} table the nested Entities table
 * @returns {ODataListBinding | undefined} the items binding, or `undefined`
 */
function entityListBinding(table: Table): ODataListBinding | undefined {
    return table.getBinding("items") as ODataListBinding | undefined;
}

/**
 * Confirms with the user and runs the given callback when confirmed.
 *
 * @param {XMLView} view the owning view
 * @param {string} confirmKey the confirmation message i18n key
 * @param {string} titleKey the confirmation title i18n key
 * @param {CoreFunction} onOk the callback executed on confirmation
 */
function confirmAction(view: XMLView, confirmKey: string, titleKey: string, onOk: () => void): void {
    MessageBox.confirm(getText(view, confirmKey), {
        title: getText(view, titleKey),
        onClose: (action) => {
            if (action === MessageBox.Action.OK) {
                onOk();
            }
        }
    });
}

/**
 * Detaches the dialog from its OData draft binding (best effort). Called after
 * close/save/discard so a later model refresh does not re-read a draft that
 * may already have been activated or discarded (404).
 *
 * @param {Dialog} dialog the bound Shares dialog
 */
function releaseDraftBinding(dialog: Dialog): void {
    try {
        dialog.unbindObject();
    } catch {
        // best effort; unbinding must not break the close flow
    }
}

// Watches the service model's `messageChange` event while the dialog is open so
// rejected backend changes (e.g. duplicate-share validation) are shown and
// reverted instead of being silently dropped or re-sent by the next submit.
const rejectedGuard = createRejectedChangeGuard();

/**
 * Tracks the result of a created entity through the binding's `createCompleted`
 * event. On failure the created context is deleted so the OData V4 model does
 * not keep retrying the rejected create; the backend error message itself is
 * shown by the dialog's `messageChange` listener.
 *
 * @param {ODataListBinding} binding the list binding the entity was created on
 * @param {Context} context the context returned by `create`
 * @param {Function} [onSuccess] optional callback on successful creation
 */
function trackCreate(
    binding: ODataListBinding,
    context: Context,
    onSuccess?: () => void
): void {
    const handler = (event: Event): void => {
        const params = event.getParameters() as { context?: Context; success?: boolean };
        if (params.context !== context) {
            return;
        }
        binding.detachCreateCompleted(handler);
        if (params.success) {
            onSuccess?.();
            return;
        }
        void context.delete().catch(() => undefined);
    };
    binding.attachCreateCompleted(handler);
}

const Shares = {

    onDialogBeforeOpen: function (): void {
        const view = Fragment.byId("Shares", "sharesDialog")?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;
        ui?.setProperty("/newShare", {
            shareUser: "",
            entity: "1",
            permission: "1"
        });
    },

    /**
     * Creates a new Share row in the selected person's Shares collection.
     * The row is created inside the person draft (the dialog is bound to the
     * draft path), so it participates in the same draft as the whole tree.
     *
     * @param {Control} this the pressed add-share button
     */
    onAddShare: function (this: Control): void {
        const dialog = findSharesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;

        if (!dialog || !view || !ui) {
            return;
        }

        const user = (ui.getProperty("/newShare/shareUser") as string) ?? "";
        if (!user.trim()) {
            showWarning(view, "sharesUserRequired");
            return;
        }

        const sharesList = Fragment.byId("Shares", "sharesList") as List | undefined;
        const binding = sharesList?.getBinding("items") as ODataListBinding | undefined;
        if (!binding) {
            showWarning(view, "sharesLoadError");
            return;
        }

        try {
            const context = binding.create({
                User: user.trim()
            });
            trackCreate(binding, context, () => {
                ui.setProperty("/newShare/shareUser", "");
            });
        } catch (error) {
            handleActionError(view, error, "sharesAddShareError");
        }
    },

    onRemoveShare: function (this: Control): void {
        const dialog = findSharesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const context = this.getBindingContext() as Context | undefined;

        if (!dialog || !view || !context) {
            return;
        }

        confirmAction(view, "sharesRemoveShareConfirm", "sharesRemoveShareTitle", () => {
            try {
                void context.delete().catch((error) => handleActionError(view, error, "sharesRemoveShareError"));
            } catch (error) {
                handleActionError(view, error, "sharesRemoveShareError");
            }
        });
    },

    /**
     * Creates a new Entity row inside the Entities collection of the Share that
     * owns the pressed toolbar button.
     *
     * @param {Control} this the pressed add-entity button
     */
    onAddEntity: function (this: Control): void {
        const dialog = findSharesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;

        if (!dialog || !view || !ui) {
            return;
        }

        const table = containingTable(this);
        const binding = table ? entityListBinding(table) : undefined;
        if (!binding) {
            showWarning(view, "sharesLoadError");
            return;
        }

        try {
            const context = binding.create({
                Entity: Number(ui.getProperty("/newShare/entity") ?? 1),
                Permission: Number(ui.getProperty("/newShare/permission") ?? 1)
            });
            trackCreate(binding, context);
        } catch (error) {
            handleActionError(view, error, "sharesAddEntityError");
        }
    },

    onRemoveEntity: function (this: Control): void {
        const dialog = findSharesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const context = this.getBindingContext() as Context | undefined;

        if (!dialog || !view || !context) {
            return;
        }

        confirmAction(view, "sharesRemoveEntityConfirm", "sharesRemoveEntityTitle", () => {
            try {
                void context.delete().catch((error) => handleActionError(view, error, "sharesRemoveEntityError"));
            } catch (error) {
                handleActionError(view, error, "sharesRemoveEntityError");
            }
        });
    },

    /**
     * Publishes the Share/Entity changes by activating the person draft they
     * live in. Because Shares/Entities are compositions of the person, all the
     * tree changes are contained in that single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveShares: async function (this: Control): Promise<void> {
        const dialog = findSharesDialog(this);

        if (!dialog) {
            return;
        }

        const view = dialog.getParent() as XMLView;
        const context = dialog.getBindingContext() as Context | undefined;

        if (rejectedGuard.warnIfBlocked()) {
            return;
        }

        try {
            (view.getModel("ui") as JSONModel).setProperty("/busy", true);

            const person = context?.getObject() as { ID?: string } | undefined;
            if (!person?.ID) {
                showWarning(view, "errorMissingPerson");
                return;
            }

            const odata = new ODataService(context?.getModel() as ODataModel);
            await odata.submitPending();
            await odata.prepareDraft("Persons", person.ID);
            await odata.activateDraft("Persons", person.ID);

            releaseDraftBinding(dialog);
            dialog.close();
            showToast(view, "sharesSaved");
        } catch (error) {
            handleActionError(view, error, "sharesSaveError");
        } finally {
            (view.getModel("ui") as JSONModel).setProperty("/busy", false);
        }
    },

    onDiscardShares: function (this: Control): void {
        const dialog = findSharesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;

        if (!dialog || !view) {
            return;
        }

        confirmAction(view, "sharesDiscardConfirm", "sharesDiscardTitle", () => {
            void (async () => {
                const context = dialog.getBindingContext() as Context | undefined;
                const person = context?.getObject() as { ID?: string } | undefined;
                if (!person?.ID) {
                    return;
                }

                try {
                    (view.getModel("ui") as JSONModel).setProperty("/busy", true);
                    const odata = new ODataService(context?.getModel() as ODataModel);
                    await odata.submitPending();
                    await odata.discardDraft("Persons", person.ID);
                    releaseDraftBinding(dialog);
                    dialog.close();
                    showToast(view, "sharesDiscarded");
                } catch (error) {
                    handleActionError(view, error, "sharesDiscardError");
                } finally {
                    (view.getModel("ui") as JSONModel).setProperty("/busy", false);
                }
            })();
        });
    },

    onCancelShares: function (this: Control): void {
        const dialog = findSharesDialog(this);
        if (!dialog) {
            return;
        }
        releaseDraftBinding(dialog);
        dialog.close();
    },

    onDialogAfterOpen: function (this: Dialog): void {
        rejectedGuard.attach(this, "sharesEditError", "sharesRejectedChanges");
    },

    onDialogAfterClose: function (this: Dialog): void {
        rejectedGuard.detach();
        releaseDraftBinding(this);

        const view = this.getParent() as XMLView | undefined;
        if (view) {
            void (view.getController() as Home).reload();
        }
    }
};

export default Shares;
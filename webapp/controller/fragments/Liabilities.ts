import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import List from "sap/m/List";
import CustomListItem from "sap/m/CustomListItem";
import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import type Context from "sap/ui/model/odata/v4/Context";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { ODataService } from "../../service/ODataService";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { createRejectedChangeGuard } from "../../util/rejectedChanges";
import type { NewLiability } from "../../model/UiModel";
import type Home from "../../controller/Home.controller";

/**
 * Finds the Liabilities dialog that contains the given control by walking up
 * the parent chain (the footer buttons may be nested in an HBox).
 *
 * @param {Control} control the control inside the dialog
 * @returns {Dialog | undefined} the dialog, or `undefined` when not found
 */
function findLiabilitiesDialog(control: Control): Dialog | undefined {
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
 * `CustomListItem` found. Used to reach the liability row of an inner button.
 *
 * @param {Control} control the starting control
 * @returns {CustomListItem | undefined} the containing list item, or `undefined`
 */
function containingListItem(control: Control): CustomListItem | undefined {
    let current: Control | undefined = control;
    while (current) {
        if (current instanceof CustomListItem) {
            return current;
        }
        current = current.getParent() as Control | undefined;
    }
    return undefined;
}

/**
 * Confirms with the user and runs the given callback when confirmed.
 *
 * @param {XMLView} view the owning view
 * @param {string} confirmKey the confirmation message i18n key
 * @param {string} titleKey the confirmation title i18n key
 * @param {Function} onOk the callback executed on confirmation
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
 * @param {Dialog} dialog the bound Liabilities dialog
 */
function releaseDraftBinding(dialog: Dialog): void {
    try {
        dialog.unbindObject();
    } catch {
        // best effort; unbinding must not break the close flow
    }
}

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

/**
 * Resets the "new liability" form to its defaults.
 *
 * @param {JSONModel} ui the ui model
 */
function resetNewLiability(ui: JSONModel): void {
    ui.setProperty("/newLiability", {
        name: "",
        creditor: "",
        description: "",
        type: "GENERAL",
        originalAmount: "",
        currency: "BRL",
        interestMode: "MANUAL",
        interestRate: "",
        installments: "1",
        startDate: new Date().toISOString().slice(0, 10),
        firstDueDate: "",
        externalReference: ""
    });
}

/**
 * Validates the parsed "new liability" form values.
 *
 * @param {string} name the trimmed liability name
 * @param {number} originalAmount the parsed original amount
 * @param {number} installments the number of installments
 * @returns {boolean} whether the form can be submitted
 */
function isValidLiabilityForm(name: string, originalAmount: number, installments: number): boolean {
    return !!name
        && Number.isFinite(originalAmount) && originalAmount > 0
        && Number.isInteger(installments) && installments >= 1;
}

/**
 * Validates the "new liability" form and builds the OData create payload.
 * Returns `undefined` when the required fields are missing or invalid.
 *
 * @param {Partial<NewLiability>} form the form values from the ui model
 * @returns {Record<string, unknown> | undefined} the create payload, or
 * `undefined` when the form is not valid
 */
function buildLiabilityPayload(form: Partial<NewLiability>): Record<string, unknown> | undefined {
    const name = (form.name ?? "").trim();
    const originalAmount = Number(String(form.originalAmount ?? "").replace(",", "."));
    const installments = Number(form.installments) || 1;

    if (!isValidLiabilityForm(name, originalAmount, installments)) {
        return undefined;
    }

    const interestRate = String(form.interestRate ?? "").trim();
    return {
        Name: name,
        Creditor: (form.creditor ?? "").trim() || undefined,
        Description: (form.description ?? "").trim() || undefined,
        Type: form.type || "GENERAL",
        OriginalAmount: originalAmount,
        // eslint-disable-next-line camelcase
        Currency_code: form.currency || "BRL",
        InterestMode: form.interestMode || "MANUAL",
        InterestRate: interestRate ? Number(interestRate.replace(",", ".")) : undefined,
        Installments: installments,
        StartDate: form.startDate,
        FirstDueDate: form.firstDueDate || undefined,
        ExternalReference: (form.externalReference ?? "").trim() || undefined
    };
}

// Watches the service model's `messageChange` event while the dialog is open so
// rejected backend changes (e.g. field validation) are shown and reverted
// instead of being silently dropped or re-sent by the next submit.
const rejectedGuard = createRejectedChangeGuard();

const Liabilities = {

    onDialogBeforeOpen: function (): void {
        const view = Fragment.byId("Liabilities", "liabilitiesDialog")?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;
        if (ui) {
            resetNewLiability(ui);
            ui.setProperty("/liabilityEditId", "");
        }
    },

    /**
     * Creates a new Liability row inside the selected person's Liabilities
     * collection. The row is created inside the person draft (the dialog is
     * bound to the draft path), so it participates in the same draft as the
     * whole tree.
     *
     * @param {Control} this the pressed add-liability button
     */
    onAddLiability: function (this: Control): void {
        const dialog = findLiabilitiesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;

        if (!dialog || !view || !ui) {
            return;
        }

        const form = ui.getProperty("/newLiability") as Partial<NewLiability>;
        const payload = buildLiabilityPayload(form);
        if (!payload) {
            showWarning(view, "liabilitiesFillFields");
            return;
        }

        const binding = (Fragment.byId("Liabilities", "liabilitiesList") as List | undefined)
            ?.getBinding("items") as ODataListBinding | undefined;
        if (!binding) {
            showWarning(view, "liabilitiesLoadError");
            return;
        }

        try {
            const context = binding.create(payload);
            trackCreate(binding, context, () => resetNewLiability(ui));
        } catch (error) {
            handleActionError(view, error, "liabilitiesAddError");
        }
    },

    onRemoveLiability: function (this: Control): void {
        const dialog = findLiabilitiesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const context = this.getBindingContext() as Context | undefined;

        if (!dialog || !view || !context) {
            return;
        }

        confirmAction(view, "liabilitiesRemoveConfirm", "liabilitiesRemoveTitle", () => {
            try {
                void context.delete().catch((error) => handleActionError(view, error, "liabilitiesRemoveError"));
            } catch (error) {
                handleActionError(view, error, "liabilitiesRemoveError");
            }
        });
    },

    /**
     * Toggles the read-only view and the editable form of the liability row
     * that owns the pressed button.
     *
     * @param {Control} this the pressed edit/finish button
     */
    onToggleEdit: function (this: Control): void {
        const item = containingListItem(this);
        const context = item?.getBindingContext() as Context | undefined;
        const liability = context?.getObject() as { ID?: string } | undefined;
        const view = findLiabilitiesDialog(this)?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;

        if (!ui || !liability?.ID) {
            return;
        }

        const current = ui.getProperty("/liabilityEditId") as string;
        ui.setProperty("/liabilityEditId", current === liability.ID ? "" : liability.ID);
    },

    /**
     * Opens the movements dialog for the liability that owns the pressed
     * button. Delegates to the Home controller, which owns the dialog cache and
     * the draft binding of the selected person.
     *
     * @param {Control} this the pressed movements button
     */
    onViewTransactions: function (this: Control): void {
        const dialog = findLiabilitiesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const item = containingListItem(this);
        const context = item?.getBindingContext() as Context | undefined;
        const liability = context?.getObject() as { ID?: string } | undefined;

        if (!view || !liability?.ID) {
            return;
        }

        void (view.getController() as Home).openLiabilityTransactions(liability.ID)
            .catch((error) => handleActionError(view, error, "liabilityTransactionsOpenError"));
    },

    /**
     * Publishes the Liability changes by activating the person draft they live
     * in. Because Liabilities are compositions of the person, all the tree
     * changes are contained in that single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveLiabilities: async function (this: Control): Promise<void> {
        const dialog = findLiabilitiesDialog(this);

        if (!dialog) {
            return;
        }

        const view = dialog.getParent() as XMLView;
        const context = dialog.getBindingContext() as Context | undefined;

        if (rejectedGuard.warnIfBlocked()) {
            return;
        }

        rejectedGuard.suspend();
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
            showToast(view, "liabilitiesSaved");
        } catch (error) {
            handleActionError(view, error, "liabilitiesSaveError");
        } finally {
            rejectedGuard.resume();
            (view.getModel("ui") as JSONModel).setProperty("/busy", false);
        }
    },

    onDiscardLiabilities: function (this: Control): void {
        const dialog = findLiabilitiesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;

        if (!dialog || !view) {
            return;
        }

        confirmAction(view, "liabilitiesDiscardConfirm", "liabilitiesDiscardTitle", () => {
            void (async () => {
                const context = dialog.getBindingContext() as Context | undefined;
                const person = context?.getObject() as { ID?: string } | undefined;
                if (!person?.ID) {
                    return;
                }

                try {
                    (view.getModel("ui") as JSONModel).setProperty("/busy", true);
                    const odata = new ODataService(context?.getModel() as ODataModel);
                    rejectedGuard.suspend();
                    await odata.submitPending();
                    await odata.discardDraft("Persons", person.ID);
                    releaseDraftBinding(dialog);
                    dialog.close();
                    showToast(view, "liabilitiesDiscarded");
                } catch (error) {
                    handleActionError(view, error, "liabilitiesDiscardError");
                } finally {
                    rejectedGuard.resume();
                    (view.getModel("ui") as JSONModel).setProperty("/busy", false);
                }
            })();
        });
    },

    onCancelLiabilities: function (this: Control): void {
        const dialog = findLiabilitiesDialog(this);
        if (!dialog) {
            return;
        }
        releaseDraftBinding(dialog);
        dialog.close();
    },

    onDialogAfterOpen: function (this: Dialog): void {
        rejectedGuard.attach(this, "liabilitiesEditError", "liabilitiesRejectedChanges");
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

export default Liabilities;

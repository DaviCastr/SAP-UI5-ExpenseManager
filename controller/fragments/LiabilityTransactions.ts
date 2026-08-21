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
import { TRANSACTION_TYPE_OPTIONS } from "../../util/liabilityRules";
import type { NewLiabilityTransaction } from "../../model/UiModel";
import type Home from "../../controller/Home.controller";

/**
 * Finds the movements dialog that contains the given control by walking up the
 * parent chain (the footer buttons may be nested in an HBox).
 *
 * @param {Control} control the control inside the dialog
 * @returns {Dialog | undefined} the dialog, or `undefined` when not found
 */
function findTransactionsDialog(control: Control): Dialog | undefined {
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
 * `CustomListItem` found. Used to reach the transaction row of an inner button.
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
 * @param {Dialog} dialog the bound movements dialog
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
 * Resets the "new transaction" form to its defaults.
 *
 * @param {JSONModel} ui the ui model
 */
function resetNewTransaction(ui: JSONModel): void {
    ui.setProperty("/newLiabilityTransaction", {
        type: "IN",
        description: "",
        date: new Date().toISOString().slice(0, 10),
        amount: "",
        currency: "BRL"
    });
}

/**
 * Validates the "new transaction" form and builds the OData create payload.
 * Returns `undefined` when the required fields are missing or invalid.
 *
 * @param {Partial<NewLiabilityTransaction>} form the form values from the ui model
 * @returns {Record<string, unknown> | undefined} the create payload, or
 * `undefined` when the form is not valid
 */
function buildTransactionPayload(form: Partial<NewLiabilityTransaction>): Record<string, unknown> | undefined {
    const type = form.type || "";
    const amount = Number(String(form.amount ?? "").replace(",", "."));
    const date = form.date || "";

    if ((type !== "IN" && type !== "OUT") || !Number.isFinite(amount) || amount <= 0 || !date) {
        return undefined;
    }

    return {
        Type: type,
        Description: (form.description ?? "").trim() || undefined,
        Date: date,
        Amount: amount,
        // eslint-disable-next-line camelcase
        Currency_code: form.currency || "BRL"
    };
}

/**
 * Extracts the person ID from a draft path like
 * `/Persons(ID='x',IsActiveEntity=false)/Liabilities(ID='y')`. Used as a
 * fallback when the bound context does not expose `Person_ID` through its
 * `$select`.
 *
 * @param {string} path the binding path
 * @returns {string} the person ID, or an empty string
 */
function personIdFromPath(path: string): string {
    const match = path.match(/Persons\(ID='([^']+)'/);
    return match ? decodeURIComponent(match[1]) : "";
}

// Watches the service model's `messageChange` event while the dialog is open so
// rejected backend changes (e.g. field validation) are shown and reverted
// instead of being silently dropped or re-sent by the next submit.
const rejectedGuard = createRejectedChangeGuard();

const LiabilityTransactions = {

    onDialogBeforeOpen: function (): void {
        const view = Fragment.byId("LiabilityTransactions", "liabilityTransactionsDialog")?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;
        if (ui) {
            resetNewTransaction(ui);
            ui.setProperty("/liabilityTransactionEditId", "");
        }
    },

    /**
     * Creates a new LiabilityTransaction row inside the liability's
     * transactions collection. The row is created inside the person draft (the
     * dialog is bound to the liability inside the draft path), so it
     * participates in the same draft as the whole tree. The backend recalculates
     * the liability balance once the transaction is created.
     *
     * @param {Control} this the pressed add-transaction button
     */
    onAddTransaction: function (this: Control): void {
        const dialog = findTransactionsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;

        if (!dialog || !view || !ui) {
            return;
        }

        const form = ui.getProperty("/newLiabilityTransaction") as Partial<NewLiabilityTransaction>;
        const payload = buildTransactionPayload(form);
        if (!payload) {
            showWarning(view, "liabilityTransactionsFillFields");
            return;
        }

        const binding = (Fragment.byId("LiabilityTransactions", "liabilityTransactionsList") as List | undefined)
            ?.getBinding("items") as ODataListBinding | undefined;
        if (!binding) {
            showWarning(view, "liabilityTransactionsLoadError");
            return;
        }

        try {
            const context = binding.create(payload);
            trackCreate(binding, context, () => resetNewTransaction(ui));
        } catch (error) {
            handleActionError(view, error, "liabilityTransactionsAddError");
        }
    },

    /**
     * Toggles the read-only view and the editable form of the transaction row
     * that owns the pressed button.
     *
     * @param {Control} this the pressed edit/finish button
     */
    onToggleEdit: function (this: Control): void {
        const item = containingListItem(this);
        const context = item?.getBindingContext() as Context | undefined;
        const transaction = context?.getObject() as { ID?: string } | undefined;
        const view = findTransactionsDialog(this)?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;

        if (!ui || !transaction?.ID) {
            return;
        }

        const current = ui.getProperty("/liabilityTransactionEditId") as string;
        ui.setProperty("/liabilityTransactionEditId", current === transaction.ID ? "" : transaction.ID);
    },

    onRemoveTransaction: function (this: Control): void {
        const dialog = findTransactionsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const context = this.getBindingContext() as Context | undefined;

        if (!dialog || !view || !context) {
            return;
        }

        confirmAction(view, "liabilityTransactionsRemoveConfirm", "liabilityTransactionsRemoveTitle", () => {
            try {
                void context.delete().catch((error) => handleActionError(view, error, "liabilityTransactionsRemoveError"));
            } catch (error) {
                handleActionError(view, error, "liabilityTransactionsRemoveError");
            }
        });
    },

    /**
     * Publishes the transaction changes by activating the person draft the
     * liability lives in. Because LiabilityTransactions are compositions of the
     * liability, all the tree changes are contained in that single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveTransactions: async function (this: Control): Promise<void> {
        const dialog = findTransactionsDialog(this);

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

            const liability = context?.getObject() as { ID?: string; Person_ID?: string } | undefined;
            const personId = liability?.Person_ID || personIdFromPath(context?.getPath() || "");
            if (!personId) {
                showWarning(view, "errorMissingPerson");
                return;
            }

            const odata = new ODataService(context?.getModel() as ODataModel);
            await odata.submitPending();
            await odata.prepareDraft("Persons", personId);
            await odata.activateDraft("Persons", personId);

            await (view.getController() as Home).reopenLiabilitiesDialogDraft();
            releaseDraftBinding(dialog);
            dialog.close();
            showToast(view, "liabilityTransactionsSaved");
        } catch (error) {
            handleActionError(view, error, "liabilityTransactionsSaveError");
        } finally {
            rejectedGuard.resume();
            (view.getModel("ui") as JSONModel).setProperty("/busy", false);
        }
    },

    onDiscardTransactions: function (this: Control): void {
        const dialog = findTransactionsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;

        if (!dialog || !view) {
            return;
        }

        confirmAction(view, "liabilityTransactionsDiscardConfirm", "liabilityTransactionsDiscardTitle", () => {
            void (async () => {
                const context = dialog.getBindingContext() as Context | undefined;
                const liability = context?.getObject() as { ID?: string; Person_ID?: string } | undefined;
                const personId = liability?.Person_ID || personIdFromPath(context?.getPath() || "");
                if (!personId) {
                    return;
                }

                try {
                    (view.getModel("ui") as JSONModel).setProperty("/busy", true);
                    const odata = new ODataService(context?.getModel() as ODataModel);
                    rejectedGuard.suspend();
                    await odata.submitPending();
                    await odata.discardDraft("Persons", personId);
                    await (view.getController() as Home).reopenLiabilitiesDialogDraft();
                    releaseDraftBinding(dialog);
                    dialog.close();
                    showToast(view, "liabilityTransactionsDiscarded");
                } catch (error) {
                    handleActionError(view, error, "liabilityTransactionsDiscardError");
                } finally {
                    rejectedGuard.resume();
                    (view.getModel("ui") as JSONModel).setProperty("/busy", false);
                }
            })();
        });
    },

    onCancelTransactions: function (this: Control): void {
        const dialog = findTransactionsDialog(this);
        if (!dialog) {
            return;
        }
        releaseDraftBinding(dialog);
        dialog.close();
    },

    onDialogAfterOpen: function (this: Dialog): void {
        const ui = this.getParent()?.getModel("ui") as JSONModel | undefined;

        if (ui) {
            ui.setProperty("/liabilityTxTypeOptions", TRANSACTION_TYPE_OPTIONS);

            const currentType = ui.getProperty("/newLiabilityTransaction/type") as string;
            if (!TRANSACTION_TYPE_OPTIONS.some((option) => option.key === currentType)) {
                ui.setProperty("/newLiabilityTransaction/type", TRANSACTION_TYPE_OPTIONS[0].key);
            }
        }

        rejectedGuard.attach(this, "liabilityTransactionsEditError", "liabilityTransactionsRejectedChanges");
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

export default LiabilityTransactions;
import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import CheckBox from "sap/m/CheckBox";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import Fragment from "sap/ui/core/Fragment";
import List from "sap/m/List";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type { IdentifierTransaction } from "../../service/InvoiceService";
import { deleteTransactionsViaBatch, type TransactionWriteTarget } from "../../util/invoiceWriter";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { reloadInvoiceData } from "./Invoices";

type DeleteTransactionRow = IdentifierTransaction;

const uiOf = (view: XMLView): JSONModel => view.getModel("ui") as JSONModel;

/**
 * Builds the write targets of the selected rows. Rows without the
 * invoice/card coordinates (deep path) cannot be addressed and are skipped.
 *
 * @param {DeleteTransactionRow[]} rows the selected rows
 * @returns {TransactionWriteTarget[]} the addressable write targets
 */
function buildTargets(rows: DeleteTransactionRow[]): TransactionWriteTarget[] {
    const targets: TransactionWriteTarget[] = [];
    for (const row of rows) {
        if (!row.Invoice?.ID || !row.Invoice.Card?.ID || !row.Identifier) {
            continue;
        }
        targets.push({
            ID: row.ID,
            cardId: row.Invoice.Card.ID,
            invoiceId: row.Invoice.ID,
            identifier: row.Identifier
        });
    }
    return targets;
}

/**
 * Selects (or clears) every transaction currently bound to the delete list,
 * keeping the "select all" checkbox in sync.
 *
 * @param {List} list the delete list
 * @param {XMLView} view the Home view
 * @param {boolean} selected whether to select or clear the rows
 * @returns {void}
 */
function setAllItemsSelected(list: List, view: XMLView, selected: boolean): void {
    list.getItems().forEach((item) => item.setSelected(selected));
    uiOf(view).setProperty("/deleteSelectAll", selected);
}

async function performDelete(
    dialog: Dialog,
    view: XMLView,
    personId: string,
    targets: TransactionWriteTarget[]
): Promise<void> {
    const ui = uiOf(view);
    ui.setProperty("/invoiceBusy", true);
    try {
        const published = await deleteTransactionsViaBatch(view.getModel() as ODataModel, personId, targets);
        if (!published) {
            showWarning(view, "deleteTransactionsError");
            return;
        }
        showToast(view, "deleteTransactionsDeleted", [String(targets.length)]);
        dialog.close();
        void reloadInvoiceData(view);
    } catch (error) {
        handleActionError(view, error, "deleteTransactionsError");
    } finally {
        ui.setProperty("/invoiceBusy", false);
    }
}

const DeleteTransactions = {

    onDialogBeforeOpen: function (this: Dialog): void {
        const view = this.getParent() as XMLView;
        const ui = uiOf(view);
        const personId = ui.getProperty("/selectedPersonId") as string;
        const identifier = ui.getProperty("/invoiceSelectedIdentifier") as string;
        const list = Fragment.byId("DeleteTransactions", "deleteTransactionList") as List | undefined;
        const binding = list?.getBinding("items") as ODataListBinding | undefined;

        if (!personId || !identifier || !binding) {
            ui.setProperty("/deleteTransactionsCount", 0);
            ui.setProperty("/deleteTransactionsCountText", "");
            setAllItemsSelected(list as List, view, false);
            return;
        }

        ui.setProperty("/invoiceBusy", true);
        void (async () => {
            try {
                binding.filter([
                    new Filter({ path: "Invoice/Card/Person/ID", operator: FilterOperator.EQ, value1: personId }),
                    new Filter({ path: "Identifier", operator: FilterOperator.EQ, value1: identifier })
                ]);

                const contexts = await binding.requestContexts();
                ui.setProperty("/deleteTransactionsCount", contexts.length);
                ui.setProperty("/deleteTransactionsCountText", getText(view, "deleteTransactionsFound", [String(contexts.length)]));
                if (contexts.length === 0) {
                    setAllItemsSelected(list as List, view, false);
                }
            } catch (error) {
                handleActionError(view, error, "deleteTransactionsError");
            } finally {
                ui.setProperty("/invoiceBusy", false);
            }
        })();
    },

    onDialogAfterOpen: function (this: Dialog): void {
        const view = this.getParent() as XMLView;
        const ui = uiOf(view);
        const list = Fragment.byId("DeleteTransactions", "deleteTransactionList") as List | undefined;
        if (list && ui.getProperty("/deleteTransactionsCount") > 0) {
            setAllItemsSelected(list, view, true);
        }
    },

    onSelectAll: function (this: CheckBox): void {
        const view = this.getParent() as XMLView;
        const list = Fragment.byId("DeleteTransactions", "deleteTransactionList") as List | undefined;
        if (list) {
            setAllItemsSelected(list, view, this.getSelected());
        } else {
            uiOf(view).setProperty("/deleteSelectAll", this.getSelected());
        }
    },

    onDeleteConfirmed: function (this: Control): void {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const ui = uiOf(view);
        const personId = ui.getProperty("/selectedPersonId") as string;
        const list = Fragment.byId("DeleteTransactions", "deleteTransactionList") as List | undefined;
        const binding = list?.getBinding("items") as ODataListBinding | undefined;

        if (!list || !binding) {
            showWarning(view, "deleteTransactionsError");
            return;
        }

        const selectedItems = list.getSelectedItems();
        if (selectedItems.length === 0) {
            showWarning(view, "deleteTransactionsNoSelection");
            return;
        }

        const selected = selectedItems
            .map((item) => item.getBindingContext()?.getObject() as DeleteTransactionRow | undefined)
            .filter((row): row is DeleteTransactionRow => Boolean(row));

        const targets = buildTargets(selected);
        if (targets.length === 0) {
            showWarning(view, "deleteTransactionsError");
            return;
        }

        MessageBox.confirm(getText(view, "deleteTransactionsConfirm", [String(targets.length)]), {
            title: getText(view, "deleteTransactionsConfirmTitle"),
            onClose: (action) => {
                if (action === MessageBox.Action.OK) {
                    void performDelete(dialog, view, personId, targets);
                }
            }
        });
    },

    onCancelDelete: function (this: Control): void {
        (this.getParent() as Dialog).close();
    }
};

export default DeleteTransactions;
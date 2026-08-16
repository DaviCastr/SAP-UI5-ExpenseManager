import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import CheckBox from "sap/m/CheckBox";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { ODataService } from "../../service/ODataService";
import { InvoiceService, type IdentifierTransaction } from "../../service/InvoiceService";
import { deleteTransactionsViaBatch, type TransactionWriteTarget } from "../../util/invoiceWriter";
import { formatDate, formatMonth } from "../../util/format";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { reloadInvoiceData } from "./Invoices";

interface DeleteTransactionRow extends IdentifierTransaction {
    DateText?: string;
    Subtitle?: string;
    CurrencyCode?: string;
    selected: boolean;
}

const uiOf = (view: XMLView): JSONModel => view.getModel("ui") as JSONModel;

/**
 * Builds the subtitle of a transaction row: the installments information when
 * the purchase was paid in more than one parcel, followed by the invoice month
 * of that transaction (e.g. "Parcela 1 de 2 • Março de 2026").
 *
 * @param {IdentifierTransaction} transaction the transaction
 * @returns {string} the human readable subtitle
 */
function buildSubtitle(transaction: IdentifierTransaction): string {
    const installments = Number(transaction.TotalInstallments) || 0;
    const parcel = installments > 1
        ? `Parcela ${Number(transaction.Installment) || 1} de ${installments}`
        : "";
    const month = transaction.Invoice?.Year && transaction.Invoice?.Month
        ? formatMonth(transaction.Invoice.Year, transaction.Invoice.Month)?.trim()
        : "";
    return [parcel, month].filter(Boolean).join(" • ");
}

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
            cardId: row.Invoice.Card?.ID,
            invoiceId: row.Invoice.ID,
            identifier: row.Identifier
        });
    }
    return targets;
}

/**
 * Loads every transaction of the person that shares the selected Identifier
 * and prepares the rows for the selector list. Every row starts selected so
 * "excluir todas" is the natural default.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the rows are loaded
 */
async function loadTransactions(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const identifier = ui.getProperty("/invoiceSelectedIdentifier") as string;

    if (!personId || !identifier) {
        ui.setProperty("/deleteTransactions", []);
        ui.setProperty("/deleteTransactionsCountText", "");
        return;
    }

    const service = new InvoiceService(new ODataService(view.getModel() as ODataModel));
    const list = await service.listTransactionsByIdentifier(personId, identifier);
    const rows: DeleteTransactionRow[] = list.map((transaction) => ({
        ...transaction,
        DateText: formatDate(transaction.Date),
        Subtitle: buildSubtitle(transaction),
        CurrencyCode: transaction.Currency?.code || "BRL",
        selected: true
    }));

    ui.setProperty("/deleteTransactions", rows);
    ui.setProperty("/deleteSelectAll", rows.length > 0);
    ui.setProperty("/deleteTransactionsCountText", getText(view, "deleteTransactionsFound", [String(rows.length)]));
}

const DeleteTransactions = {

    onDialogBeforeOpen: function (this: Dialog): void {
        const view = this.getParent() as XMLView;
        const ui = uiOf(view);
        ui.setProperty("/invoiceBusy", true);
        void loadTransactions(view)
            .catch((error) => handleActionError(view, error, "deleteTransactionsError"))
            .finally(() => ui.setProperty("/invoiceBusy", false));
    },

    onSelectAll: function (this: CheckBox): void {
        const view = this.getParent() as XMLView;
        const ui = uiOf(view);
        const selectedState = this.getSelected();
        const rows = ui.getProperty("/deleteTransactions") as DeleteTransactionRow[] | undefined;
        (rows || []).forEach((_, index) => {
            ui.setProperty(`/deleteTransactions/${index}/selected`, selectedState);
        });
    },

    onDeleteConfirmed: function (this: Control): void {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const ui = uiOf(view);
        const personId = ui.getProperty("/selectedPersonId") as string;
        const rows = (ui.getProperty("/deleteTransactions") as DeleteTransactionRow[] | undefined) || [];
        const selected = rows.filter((row) => row.selected === true);

        if (selected.length === 0) {
            showWarning(view, "deleteTransactionsNoSelection");
            return;
        }

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

/**
 * Executes the batch deletion of the confirmed targets, reloads the invoice
 * dialog data and reports the result.
 *
 * @param {Dialog} dialog the delete dialog
 * @param {XMLView} view the Home view
 * @param {string} personId the person that owns the transactions
 * @param {TransactionWriteTarget[]} targets the transactions to remove
 * @returns {Promise<void>} resolves once the deletion finished
 */
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

export default DeleteTransactions;
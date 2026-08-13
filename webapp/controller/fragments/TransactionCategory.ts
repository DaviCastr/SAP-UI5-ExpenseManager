import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import List from "sap/m/List";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { ODataService, DRAFT_FILTER, DRAFT_EXPAND } from "../../service/ODataService";
import { InvoiceService, type IdentifierTransaction } from "../../service/InvoiceService";
import { applyCategoryToTransactions, type TransactionWriteTarget } from "../../util/invoiceWriter";
import { formatDate } from "../../util/format";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { reloadInvoiceData } from "./Invoices";

interface CategorySelectorRow {
    ID: string;
    Name: string;
    ImageBase64: string;
}

interface AffectedTransactionRow extends IdentifierTransaction {
    DateText?: string;
}

const uiOf = (view: XMLView): JSONModel => view.getModel("ui") as JSONModel;

/**
 * Builds the write targets of every affected transaction. Rows without the
 * invoice/card coordinates (deep path) cannot be addressed and are skipped.
 *
 * @param {AffectedTransactionRow[]} rows the identifier group
 * @returns {TransactionWriteTarget[]} the addressable write targets
 */
function buildTargets(rows: AffectedTransactionRow[]): TransactionWriteTarget[] {
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
 * Loads the person's categories with their thumbnails for the selector dialog.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the categories are loaded
 */
async function loadCategories(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const odata = new ODataService(view.getModel() as ODataModel);

    if (!personId) {
        ui.setProperty("/invoiceCategories", []);
        return;
    }

    const categories = await odata.requestEntitySet<{ ID: string; Name: string } & { IsActiveEntity?: boolean }>("Categories", {
        select: ["ID", "Name"],
        filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
        filterExpression: DRAFT_FILTER,
        expand: DRAFT_EXPAND
    });

    const images: Record<string, string> = {};
    await Promise.all(
        categories.map(async (category) => {
            const base64 = await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(category.ID)}',IsActiveEntity=true)/Image`);
            if (base64) {
                images[category.ID] = base64;
            }
        })
    );

    const rows: CategorySelectorRow[] = categories.map((category) => ({
        ID: category.ID,
        Name: category.Name,
        ImageBase64: images[category.ID] || ""
    }));
    ui.setProperty("/invoiceCategories", rows);
}

/**
 * Loads every transaction of the person that shares the selected Identifier,
 * so the dialog can report how many rows the category change will affect.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the affected rows are loaded
 */
async function loadAffected(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const identifier = ui.getProperty("/invoiceSelectedIdentifier") as string;

    if (!personId || !identifier) {
        ui.setProperty("/invoiceCategoryAffected", []);
        ui.setProperty("/invoiceCategoryAffectedText", "");
        return;
    }

    const service = new InvoiceService(new ODataService(view.getModel() as ODataModel));
    const list = await service.listTransactionsByIdentifier(personId, identifier);
    const rows: AffectedTransactionRow[] = list.map((transaction) => ({
        ...transaction,
        DateText: formatDate(transaction.Date)
    }));
    ui.setProperty("/invoiceCategoryAffected", rows);
    ui.setProperty("/invoiceCategoryAffectedText", getText(view, "transactionCategoryAffected", [String(rows.length)]));
}

const TransactionCategory = {

    onDialogBeforeOpen: function (this: Dialog): void {
        const view = this.getParent() as XMLView;
        const ui = uiOf(view);
        ui.setProperty("/invoiceSelectedCategoryId", "");
        ui.setProperty("/invoiceBusy", true);
        void Promise.all([loadCategories(view), loadAffected(view)])
            .catch((error) => handleActionError(view, error, "transactionCategorySaveError"))
            .finally(() => ui.setProperty("/invoiceBusy", false));
    },

    onCategoryChanged: function (this: List): void {
        const row = this.getSelectedItem()?.getBindingContext("ui")?.getObject() as CategorySelectorRow | undefined;
        if (row?.ID) {
            uiOf(this.getParent() as XMLView).setProperty("/invoiceSelectedCategoryId", row.ID);
        }
    },

    onApplyCategory: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const ui = uiOf(view);
        const personId = ui.getProperty("/selectedPersonId") as string;
        const categoryId = ui.getProperty("/invoiceSelectedCategoryId") as string;
        const affected = ui.getProperty("/invoiceCategoryAffected") as AffectedTransactionRow[];

        if (!categoryId) {
            showWarning(view, "transactionCategorySelectHint");
            return;
        }

        const targets = buildTargets(affected || []);
        if (targets.length === 0) {
            showWarning(view, "transactionCategoryNoTargets");
            return;
        }

        ui.setProperty("/invoiceBusy", true);
        try {
            const published = await applyCategoryToTransactions(view.getModel() as ODataModel, personId, targets, categoryId);
            if (!published) {
                showWarning(view, "transactionCategorySaveError");
                return;
            }
            showToast(view, "transactionCategorySaved", [String(targets.length)]);
            dialog.close();
            void reloadInvoiceData(view);
        } catch (error) {
            handleActionError(view, error, "transactionCategorySaveError");
        } finally {
            ui.setProperty("/invoiceBusy", false);
        }
    },

    onCancelCategory: function (this: Control): void {
        (this.getParent() as Dialog).close();
    }
};

export default TransactionCategory;
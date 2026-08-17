import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import List from "sap/m/List";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { ODataService } from "../../service/ODataService";
import type { IdentifierTransaction } from "../../service/InvoiceService";
import { applyCategoryToTransactions, type TransactionWriteTarget } from "../../util/invoiceWriter";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { reloadInvoiceData } from "./Invoices";
import type Home from "../../controller/Home.controller";

interface CategorySelectorRow {
    ID: string;
    Name?: string;
}

type AffectedTransactionRow = IdentifierTransaction;

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
 * Filters the person's categories on the category selector list and resolves
 * their thumbnails into `ui>/transactionCategory/categoryImages` (keyed by category ID).
 * The list itself is bound to the OData `/Categories` entity set
 * declaratively; the person filter is server-side, applied on the binding.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the categories are loaded
 */
async function filterCategories(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const list = Fragment.byId("TransactionCategory", "transactionCategoryList") as List | undefined;
    const binding = list?.getBinding("items") as ODataListBinding | undefined;

    if (!personId || !binding) {
        ui.setProperty("/transactionCategory/categoryImages", {});
        return;
    }

    binding.filter([
        new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })
    ]);

    const contexts = await binding.requestContexts();
    const odata = new ODataService(view.getModel() as ODataModel);
    const images: Record<string, string> = {};

    await Promise.all(
        contexts.map(async (context) => {
            const category = context.getObject() as CategorySelectorRow | undefined;
            if (!category?.ID) {
                return;
            }
            // A freshly created category may only exist as a draft row, so the
            // draft media (IsActiveEntity=false) has precedence, falling back to
            // the active image when the category has no draft media (yet).
            const base64 = await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(category.ID)}',IsActiveEntity=false)/Image`)
                ?? await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(category.ID)}',IsActiveEntity=true)/Image`);
            if (base64) {
                images[category.ID] = base64;
            }
        })
    );

    ui.setProperty("/transactionCategory/categoryImages", images);
}

/**
 * Filters the transactions that share the selected Identifier on the affected
 * list, reporting how many rows the category change will affect. The list is
 * bound to the OData `/Transactions` entity set declaratively (sorted by
 * installment ascending); the person/identifier filters run on the server.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the affected rows are loaded
 */
async function filterAffected(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const identifier = ui.getProperty("/transactionCategory/selectedIdentifier") as string;
    const list = Fragment.byId("TransactionCategory", "transactionCategoryAffectedList") as List | undefined;
    const binding = list?.getBinding("items") as ODataListBinding | undefined;

    if (!personId || !identifier || !binding) {
        ui.setProperty("/transactionCategory/affectedText", "");
        return;
    }

    binding.filter([
        new Filter({ path: "Invoice/Card/Person/ID", operator: FilterOperator.EQ, value1: personId }),
        new Filter({ path: "Identifier", operator: FilterOperator.EQ, value1: identifier })
    ]);

    const contexts = await binding.requestContexts();
    ui.setProperty("/transactionCategory/affectedText", getText(view, "transactionCategoryAffected", [String(contexts.length)]));
}

/**
 * Preselects the category currently assigned to the transaction (if present)
 * on the selector list, mirroring it into `transactionCategory/selectedCategoryId`.
 *
 * @param {XMLView} view the Home view
 * @returns {void}
 */
function preselectCurrentCategory(view: XMLView): void {
    const ui = uiOf(view);
    const currentId = ui.getProperty("/transactionCategory/currentCategoryId") as string;
    const list = Fragment.byId("TransactionCategory", "transactionCategoryList") as List | undefined;

    if (!currentId || !list) {
        return;
    }

    list.getItems().some((item) => {
        const row = item.getBindingContext()?.getObject() as CategorySelectorRow | undefined;
        if (row?.ID === currentId) {
            list.setSelectedItem(item, true);
            ui.setProperty("/transactionCategory/selectedCategoryId", row.ID);
            return true;
        }
        return false;
    });
}

const TransactionCategory = {

    onDialogBeforeOpen: function (this: Dialog): void {
        const view = this.getParent() as XMLView;
        const ui = uiOf(view);
        ui.setProperty("/transactionCategory/selectedCategoryId", "");
        ui.setProperty("/transactionCategory/affectedText", "");
        ui.setProperty("/busy", true);
        void Promise.all([filterCategories(view), filterAffected(view)])
            .catch((error) => handleActionError(view, error, "transactionCategorySaveError"))
            .finally(() => ui.setProperty("/busy", false));
    },

    onDialogAfterOpen: function (this: Dialog): void {
        const view = this.getParent() as XMLView;
        preselectCurrentCategory(view);
    },

    onCategoryChanged: function (this: List): void {
        const row = this.getSelectedItem()?.getBindingContext()?.getObject() as CategorySelectorRow | undefined;
        if (row?.ID) {
            uiOf(this.getParent() as XMLView).setProperty("/transactionCategory/selectedCategoryId", row.ID);
        }
    },

    onApplyCategory: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const ui = uiOf(view);
        const personId = ui.getProperty("/selectedPersonId") as string;
        const categoryId = ui.getProperty("/transactionCategory/selectedCategoryId") as string;

        if (!categoryId) {
            showWarning(view, "transactionCategorySelectHint");
            return;
        }

        const list = Fragment.byId("TransactionCategory", "transactionCategoryAffectedList") as List | undefined;
        const binding = list?.getBinding("items") as ODataListBinding | undefined;
        if (!binding) {
            showWarning(view, "transactionCategoryNoTargets");
            return;
        }

        const contexts = await binding.requestContexts();
        const affected = contexts.map((context) => context.getObject() as AffectedTransactionRow);
        const targets = buildTargets(affected || []);
        if (targets.length === 0) {
            showWarning(view, "transactionCategoryNoTargets");
            return;
        }

        ui.setProperty("/busy", true);
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
            ui.setProperty("/busy", false);
        }
    },

    onCancelCategory: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onDialogAfterClose: function (this: Dialog): void {
        const view = this.getParent() as XMLView | undefined;
        if (view) {
            (view.getController() as Home).reload();
        }
    }
};

export default TransactionCategory;
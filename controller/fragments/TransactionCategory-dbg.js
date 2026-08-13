sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../../service/ODataService", "../../service/InvoiceService", "../../util/invoiceWriter", "../../util/format", "../../util/i18n", "../../util/feedback", "./Invoices"], function (Filter, FilterOperator, ____service_ODataService, ____service_InvoiceService, ____util_invoiceWriter, ____util_format, ____util_i18n, ____util_feedback, ___Invoices) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const DRAFT_FILTER = ____service_ODataService["DRAFT_FILTER"];
  const DRAFT_EXPAND = ____service_ODataService["DRAFT_EXPAND"];
  const InvoiceService = ____service_InvoiceService["InvoiceService"];
  const applyCategoryToTransactions = ____util_invoiceWriter["applyCategoryToTransactions"];
  const formatDate = ____util_format["formatDate"];
  const getText = ____util_i18n["getText"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const reloadInvoiceData = ___Invoices["reloadInvoiceData"];
  const uiOf = view => view.getModel("ui");

  /**
   * Builds the write targets of every affected transaction. Rows without the
   * invoice/card coordinates (deep path) cannot be addressed and are skipped.
   *
   * @param {AffectedTransactionRow[]} rows the identifier group
   * @returns {TransactionWriteTarget[]} the addressable write targets
   */
  function buildTargets(rows) {
    const targets = [];
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
  async function loadCategories(view) {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId");
    const odata = new ODataService(view.getModel());
    if (!personId) {
      ui.setProperty("/invoiceCategories", []);
      return;
    }
    const categories = await odata.requestEntitySet("Categories", {
      select: ["ID", "Name"],
      filters: [new Filter({
        path: "Person/ID",
        operator: FilterOperator.EQ,
        value1: personId
      })],
      filterExpression: DRAFT_FILTER,
      expand: DRAFT_EXPAND
    });
    const images = {};
    await Promise.all(categories.map(async category => {
      const base64 = await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(category.ID)}',IsActiveEntity=true)/Image`);
      if (base64) {
        images[category.ID] = base64;
      }
    }));
    const rows = categories.map(category => ({
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
  async function loadAffected(view) {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId");
    const identifier = ui.getProperty("/invoiceSelectedIdentifier");
    if (!personId || !identifier) {
      ui.setProperty("/invoiceCategoryAffected", []);
      ui.setProperty("/invoiceCategoryAffectedText", "");
      return;
    }
    const service = new InvoiceService(new ODataService(view.getModel()));
    const list = await service.listTransactionsByIdentifier(personId, identifier);
    const rows = list.map(transaction => ({
      ...transaction,
      DateText: formatDate(transaction.Date)
    }));
    ui.setProperty("/invoiceCategoryAffected", rows);
    ui.setProperty("/invoiceCategoryAffectedText", getText(view, "transactionCategoryAffected", [String(rows.length)]));
  }
  const TransactionCategory = {
    onDialogBeforeOpen: function () {
      const view = this.getParent();
      const ui = uiOf(view);
      ui.setProperty("/invoiceSelectedCategoryId", "");
      ui.setProperty("/invoiceBusy", true);
      void Promise.all([loadCategories(view), loadAffected(view)]).catch(error => handleActionError(view, error, "transactionCategorySaveError")).finally(() => ui.setProperty("/invoiceBusy", false));
    },
    onCategoryChanged: function () {
      const row = this.getSelectedItem()?.getBindingContext("ui")?.getObject();
      if (row?.ID) {
        uiOf(this.getParent()).setProperty("/invoiceSelectedCategoryId", row.ID);
      }
    },
    onApplyCategory: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const ui = uiOf(view);
      const personId = ui.getProperty("/selectedPersonId");
      const categoryId = ui.getProperty("/invoiceSelectedCategoryId");
      const affected = ui.getProperty("/invoiceCategoryAffected");
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
        const published = await applyCategoryToTransactions(view.getModel(), personId, targets, categoryId);
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
    onCancelCategory: function () {
      this.getParent().close();
    }
  };
  return TransactionCategory;
});
//# sourceMappingURL=TransactionCategory-dbg.js.map

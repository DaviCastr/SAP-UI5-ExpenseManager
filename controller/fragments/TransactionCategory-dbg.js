sap.ui.define(["sap/ui/core/Fragment", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../../service/ODataService", "../../util/invoiceWriter", "../../util/i18n", "../../util/feedback", "./Invoices"], function (Fragment, Filter, FilterOperator, ____service_ODataService, ____util_invoiceWriter, ____util_i18n, ____util_feedback, ___Invoices) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const applyCategoryToTransactions = ____util_invoiceWriter["applyCategoryToTransactions"];
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
   * Filters the person's categories on the category selector list and resolves
   * their thumbnails into `ui>/transactionCategory/categoryImages` (keyed by category ID).
   * The list itself is bound to the OData `/Categories` entity set
   * declaratively; the person filter is server-side, applied on the binding.
   *
   * @param {XMLView} view the Home view
   * @returns {Promise<void>} resolves once the categories are loaded
   */
  async function filterCategories(view) {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId");
    const list = Fragment.byId("TransactionCategory", "transactionCategoryList");
    const binding = list?.getBinding("items");
    if (!personId || !binding) {
      ui.setProperty("/transactionCategory/categoryImages", {});
      return;
    }
    binding.filter([new Filter({
      path: "Person/ID",
      operator: FilterOperator.EQ,
      value1: personId
    })]);
    const contexts = await binding.requestContexts();
    const odata = new ODataService(view.getModel());
    const images = {};
    await Promise.all(contexts.map(async context => {
      const category = context.getObject();
      if (!category?.ID) {
        return;
      }
      // A freshly created category may only exist as a draft row, so the
      // draft media (IsActiveEntity=false) has precedence, falling back to
      // the active image when the category has no draft media (yet).
      const base64 = (await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(category.ID)}',IsActiveEntity=false)/Image`)) ?? (await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(category.ID)}',IsActiveEntity=true)/Image`));
      if (base64) {
        images[category.ID] = base64;
      }
    }));
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
  async function filterAffected(view) {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId");
    const identifier = ui.getProperty("/transactionCategory/selectedIdentifier");
    const list = Fragment.byId("TransactionCategory", "transactionCategoryAffectedList");
    const binding = list?.getBinding("items");
    if (!personId || !identifier || !binding) {
      ui.setProperty("/transactionCategory/affectedText", "");
      return;
    }
    binding.filter([new Filter({
      path: "Invoice/Card/Person/ID",
      operator: FilterOperator.EQ,
      value1: personId
    }), new Filter({
      path: "Identifier",
      operator: FilterOperator.EQ,
      value1: identifier
    })]);
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
  function preselectCurrentCategory(view) {
    const ui = uiOf(view);
    const currentId = ui.getProperty("/transactionCategory/currentCategoryId");
    const list = Fragment.byId("TransactionCategory", "transactionCategoryList");
    if (!currentId || !list) {
      return;
    }
    list.getItems().some(item => {
      const row = item.getBindingContext()?.getObject();
      if (row?.ID === currentId) {
        list.setSelectedItem(item, true);
        ui.setProperty("/transactionCategory/selectedCategoryId", row.ID);
        return true;
      }
      return false;
    });
  }
  const TransactionCategory = {
    onDialogBeforeOpen: function () {
      const view = this.getParent();
      const ui = uiOf(view);
      ui.setProperty("/transactionCategory/selectedCategoryId", "");
      ui.setProperty("/transactionCategory/affectedText", "");
      ui.setProperty("/busy", true);
      void Promise.all([filterCategories(view), filterAffected(view)]).catch(error => handleActionError(view, error, "transactionCategorySaveError")).finally(() => ui.setProperty("/busy", false));
    },
    onDialogAfterOpen: function () {
      const view = this.getParent();
      preselectCurrentCategory(view);
    },
    onCategoryChanged: function () {
      const row = this.getSelectedItem()?.getBindingContext()?.getObject();
      if (row?.ID) {
        uiOf(this.getParent()).setProperty("/transactionCategory/selectedCategoryId", row.ID);
      }
    },
    onApplyCategory: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const ui = uiOf(view);
      const personId = ui.getProperty("/selectedPersonId");
      const categoryId = ui.getProperty("/transactionCategory/selectedCategoryId");
      if (!categoryId) {
        showWarning(view, "transactionCategorySelectHint");
        return;
      }
      const list = Fragment.byId("TransactionCategory", "transactionCategoryAffectedList");
      const binding = list?.getBinding("items");
      if (!binding) {
        showWarning(view, "transactionCategoryNoTargets");
        return;
      }
      const contexts = await binding.requestContexts();
      const affected = contexts.map(context => context.getObject());
      const targets = buildTargets(affected || []);
      if (targets.length === 0) {
        showWarning(view, "transactionCategoryNoTargets");
        return;
      }
      ui.setProperty("/busy", true);
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
        ui.setProperty("/busy", false);
      }
    },
    onCancelCategory: function () {
      this.getParent().close();
    },
    onDialogAfterClose: function () {
      const view = this.getParent();
      if (view) {
        view.getController().reload();
      }
    }
  };
  return TransactionCategory;
});
//# sourceMappingURL=TransactionCategory-dbg.js.map

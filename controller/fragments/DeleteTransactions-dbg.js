sap.ui.define(["../../service/ODataService", "../../service/InvoiceService", "../../util/invoiceWriter", "../../util/format", "../../util/i18n", "../../util/feedback", "./Invoices"], function (____service_ODataService, ____service_InvoiceService, ____util_invoiceWriter, ____util_format, ____util_i18n, ____util_feedback, ___Invoices) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const InvoiceService = ____service_InvoiceService["InvoiceService"];
  const deleteTransactionsViaBatch = ____util_invoiceWriter["deleteTransactionsViaBatch"];
  const formatDate = ____util_format["formatDate"];
  const formatMonth = ____util_format["formatMonth"];
  const getText = ____util_i18n["getText"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const reloadInvoiceData = ___Invoices["reloadInvoiceData"];
  const uiOf = view => view.getModel("ui");

  /**
   * Builds the write targets of the selected rows. Rows without the
   * invoice/card coordinates (deep path) cannot be addressed and are skipped.
   *
   * @param {DeleteTransactionRow[]} rows the selected rows
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
  async function loadTransactions(view) {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId");
    const identifier = ui.getProperty("/invoiceSelectedIdentifier");
    if (!personId || !identifier) {
      ui.setProperty("/deleteTransactions", []);
      ui.setProperty("/deleteTransactionsCountText", "");
      return;
    }
    const service = new InvoiceService(new ODataService(view.getModel()));
    const list = await service.listTransactionsByIdentifier(personId, identifier);
    const rows = list.map(transaction => ({
      ...transaction,
      DateText: formatDate(transaction.Date),
      InvoicePeriodText: transaction.Invoice?.Year && transaction.Invoice?.Month ? formatMonth(transaction.Invoice.Year, transaction.Invoice.Month)?.trim() : "",
      CurrencyCode: transaction.Currency?.code || "BRL",
      selected: true
    }));
    ui.setProperty("/deleteTransactions", rows);
    ui.setProperty("/deleteSelectAll", rows.length > 0);
    ui.setProperty("/deleteTransactionsCountText", getText(view, "deleteTransactionsFound", [String(rows.length)]));
  }
  const DeleteTransactions = {
    onDialogBeforeOpen: function () {
      const view = this.getParent();
      const ui = uiOf(view);
      ui.setProperty("/invoiceBusy", true);
      void loadTransactions(view).catch(error => handleActionError(view, error, "deleteTransactionsError")).finally(() => ui.setProperty("/invoiceBusy", false));
    },
    onSelectAll: function () {
      const view = this.getParent();
      const ui = uiOf(view);
      const selectedState = this.getSelected();
      const rows = ui.getProperty("/deleteTransactions");
      (rows || []).forEach((_, index) => {
        ui.setProperty(`/deleteTransactions/${index}/selected`, selectedState);
      });
    },
    onDeleteConfirmed: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const ui = uiOf(view);
      const personId = ui.getProperty("/selectedPersonId");
      const rows = ui.getProperty("/deleteTransactions") || [];
      const selected = rows.filter(row => row.selected === true);
      if (selected.length === 0) {
        showWarning(view, "deleteTransactionsNoSelection");
        return;
      }
      const targets = buildTargets(selected);
      if (targets.length === 0) {
        showWarning(view, "deleteTransactionsError");
        return;
      }
      ui.setProperty("/invoiceBusy", true);
      try {
        const published = await deleteTransactionsViaBatch(view.getModel(), personId, targets);
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
    },
    onCancelDelete: function () {
      this.getParent().close();
    }
  };
  return DeleteTransactions;
});
//# sourceMappingURL=DeleteTransactions-dbg.js.map

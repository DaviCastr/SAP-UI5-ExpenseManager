sap.ui.define(["sap/m/Dialog", "sap/ui/core/Fragment", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../../service/ODataService", "../../service/InvoiceService", "../../util/format", "../../util/feedback"], function (Dialog, Fragment, Filter, FilterOperator, ____service_ODataService, ____service_InvoiceService, ____util_format, ____util_feedback) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const DRAFT_FILTER = ____service_ODataService["DRAFT_FILTER"];
  const DRAFT_EXPAND = ____service_ODataService["DRAFT_EXPAND"];
  const InvoiceService = ____service_InvoiceService["InvoiceService"];
  const formatDate = ____util_format["formatDate"];
  const formatMonth = ____util_format["formatMonth"];
  const handleActionError = ____util_feedback["handleActionError"];
  const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  /**
   * Finds the Invoices dialog that contains the given control by walking up the
   * parent chain (footer buttons may be nested in an HBox).
   *
   * @param {Control} control the control inside the dialog
   * @returns {Dialog | undefined} the dialog, or `undefined` when not found
   */
  function findInvoicesDialog(control) {
    let current = control;
    while (current) {
      if (current instanceof Dialog) {
        return current;
      }
      current = current.getParent();
    }
    return undefined;
  }
  const uiOf = view => view.getModel("ui");

  /**
   * Builds the subtitle of an invoice transaction row: date plus installments
   * information when the purchase was paid in more than one installment.
   *
   * @param {InvoiceQueryTransaction} transaction the raw transaction
   * @returns {string} the human readable subtitle
   */
  function buildSubtitle(transaction) {
    const date = formatDate(transaction.Date);
    const installments = Number(transaction.TotalInstallments) || 0;
    if (installments > 1) {
      const current = Number(transaction.Installment) || 1;
      return `${date} • Parcela ${current} de ${installments}`;
    }
    return date;
  }

  /**
   * Moves the invoice period forward/backward by one month, wrapping years, and
   * reloads the invoice.
   *
   * @param {XMLView} view the Home view
   * @param {number} delta the month offset (−1 previous, +1 next)
   * @returns {void}
   */
  function shiftPeriod(view, delta) {
    const ui = uiOf(view);
    let year = Number(ui.getProperty("/invoiceYear"));
    let month = Number(ui.getProperty("/invoiceMonth"));
    if (!year || !month) {
      return;
    }
    const total = year * 12 + (month - 1) + delta;
    year = Math.floor(total / 12);
    month = total % 12 + 1;
    ui.setProperty("/invoiceYear", String(year));
    ui.setProperty("/invoiceMonth", String(month));
    void loadInvoice(view);
  }

  /**
   * Loads the person's cards into the ui model (`invoiceCards`) together with
   * their thumbnails and keeps `invoiceCardId` pointing at a valid card.
   *
   * @param {XMLView} view the Home view
   * @returns {Promise<void>} resolves once the cards are loaded
   */
  async function loadCards(view) {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId");
    const odata = new ODataService(view.getModel());
    if (!personId) {
      ui.setProperty("/invoiceCards", []);
      ui.setProperty("/invoiceCardsEmpty", false);
      ui.setProperty("/invoiceCardId", "");
      return;
    }
    ui.setProperty("/invoiceBusy", true);
    try {
      const cards = await odata.requestEntitySet("Cards", {
        select: ["ID", "Name", "Limit", "Currency_code"],
        filters: [new Filter({
          path: "Person/ID",
          operator: FilterOperator.EQ,
          value1: personId
        })],
        filterExpression: DRAFT_FILTER,
        expand: DRAFT_EXPAND
      });
      const images = {};
      await Promise.all(cards.map(async card => {
        const base64 = await odata.getMediaAsBase64(`Cards(ID='${encodeURIComponent(card.ID)}',IsActiveEntity=true)/Image`);
        if (base64) {
          images[card.ID] = base64;
        }
      }));
      const rows = cards.map(card => ({
        ID: card.ID,
        Name: card.Name,
        Limit: card.Limit,
        Currency_code: card.Currency_code,
        ImageBase64: images[card.ID] || ""
      }));
      ui.setProperty("/invoiceCards", rows);
      ui.setProperty("/invoiceCardsEmpty", rows.length === 0);
      const current = ui.getProperty("/invoiceCardId");
      if (!current || !rows.some(card => card.ID === current)) {
        ui.setProperty("/invoiceCardId", rows[0]?.ID || "");
      }
    } catch (error) {
      handleActionError(view, error, "invoicesCardsLoadError");
    } finally {
      ui.setProperty("/invoiceBusy", false);
    }
  }

  /**
   * Loads the invoice of the currently selected card/period into the ui model
   * (`invoiceHeader`, `invoiceTransactions`) and resolves the category images of
   * every shown transaction.
   *
   * @param {XMLView} view the Home view
   * @returns {Promise<void>} resolves once the invoice data is ready
   */
  async function loadInvoice(view) {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId");
    const cardId = ui.getProperty("/invoiceCardId");
    const year = Number(ui.getProperty("/invoiceYear"));
    const month = Number(ui.getProperty("/invoiceMonth"));
    if (!personId || !cardId || !year || !month) {
      ui.setProperty("/invoiceLoaded", false);
      ui.setProperty("/invoiceHeader", {});
      ui.setProperty("/invoiceTransactions", []);
      return;
    }
    const odata = new ODataService(view.getModel());
    const service = new InvoiceService(odata);
    ui.setProperty("/invoiceBusy", true);
    try {
      const invoice = await service.findInvoice(personId, cardId, {
        year,
        month
      });
      const label = formatMonth(year, month)?.trim();
      ui.setProperty("/invoicePeriodLabel", label ? label.charAt(0).toUpperCase() + label.slice(1) : "");
      if (!invoice) {
        ui.setProperty("/invoiceId", "");
        ui.setProperty("/invoiceLoaded", false);
        ui.setProperty("/invoiceHeader", {});
        ui.setProperty("/invoiceTransactions", []);
        return;
      }
      const currency = invoice.Currency?.code || invoice.Currency_code || "BRL";
      ui.setProperty("/invoiceId", invoice.ID);
      ui.setProperty("/invoiceHeader", {
        Description: invoice.Description || "",
        TotalAmount: Number(invoice.TotalAmount) || 0,
        CurrencyCode: currency,
        InvoiceSent: invoice.InvoiceSent === true
      });
      const rows = (invoice.Transactions || []).map(transaction => ({
        ...transaction,
        CurrencyCode: transaction.Currency?.code || currency,
        DateText: formatDate(transaction.Date),
        Subtitle: buildSubtitle(transaction)
      }));
      ui.setProperty("/invoiceTransactions", rows);
      await resolveTransactionCategoryImages(view, rows);
      ui.setProperty("/invoiceLoaded", true);
    } catch (error) {
      ui.setProperty("/invoiceLoaded", false);
      handleActionError(view, error, "invoicesLoadError");
    } finally {
      ui.setProperty("/invoiceBusy", false);
    }
  }

  /**
   * Resolves the thumbnail of every distinct category used by the shown invoice
   * transactions and stores it back into the ui model rows.
   *
   * @param {XMLView} view the Home view
   * @param {InvoiceTransactionRow[]} rows the transaction rows
   * @returns {Promise<void>} resolves once the images were resolved (best effort)
   */
  async function resolveTransactionCategoryImages(view, rows) {
    const ui = uiOf(view);
    const odata = new ODataService(view.getModel());
    const byId = new Map();
    rows.forEach((row, index) => {
      const categoryId = row.Category?.ID;
      if (categoryId) {
        const indexes = byId.get(categoryId) || [];
        indexes.push(index);
        byId.set(categoryId, indexes);
      }
    });
    await Promise.all(Array.from(byId.entries()).map(async ([categoryId, indexes]) => {
      const base64 = await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(categoryId)}',IsActiveEntity=true)/Image`);
      if (!base64) {
        return;
      }
      for (const index of indexes) {
        ui.setProperty(`/invoiceTransactions/${index}/Category/ImageBase64`, base64);
      }
    }));
  }

  /**
   * Reloads the whole invoice dialog state. Called after a transaction write
   * (recategorization/exclusion) so the open dialog reflects the published data.
   *
   * @param {XMLView} view the Home view
   * @returns {Promise<void>} resolves once the data is reloaded
   */
  async function reloadInvoiceData(view) {
    await loadCards(view);
    if (uiOf(view).getProperty("/invoiceCardId")) {
      await loadInvoice(view);
    }
  }
  const Invoices = {
    onDialogBeforeOpen: function () {
      const view = Fragment.byId("Invoices", "invoicesDialog")?.getParent();
      if (!view) {
        return;
      }
      const ui = uiOf(view);
      const now = new Date();
      const currentYear = now.getFullYear();
      ui.setProperty("/invoiceYearOptions", Array.from({
        length: 6
      }, (_, offset) => {
        const year = currentYear - 4 + offset;
        return {
          key: String(year),
          text: String(year)
        };
      }));
      ui.setProperty("/invoiceMonthOptions", MONTH_NAMES.map((name, index) => ({
        key: String(index + 1),
        text: name
      })));
      ui.setProperty("/invoiceYear", String(currentYear));
      ui.setProperty("/invoiceMonth", String(now.getMonth() + 1));
      ui.setProperty("/invoiceCardId", "");
      ui.setProperty("/invoiceId", "");
      ui.setProperty("/invoiceLoaded", false);
      ui.setProperty("/invoiceHeader", {});
      ui.setProperty("/invoiceTransactions", []);
      void reloadInvoiceData(view);
    },
    onDialogAfterOpen: function () {
      const list = Fragment.byId("Invoices", "invoiceCardList");
      const view = this.getParent();
      const id = uiOf(view).getProperty("/invoiceCardId");
      if (!list || !id) {
        return;
      }
      list.getItems().some(item => {
        const row = item.getBindingContext("ui")?.getObject();
        if (row?.ID === id) {
          list.setSelectedItem(item, true);
          return true;
        }
        return false;
      });
    },
    onCardChanged: function () {
      const row = this.getSelectedItem()?.getBindingContext("ui")?.getObject();
      if (!row?.ID) {
        return;
      }
      const view = this.getParent();
      uiOf(view).setProperty("/invoiceCardId", row.ID);
      void loadInvoice(view);
    },
    onYearChange: function () {
      const view = this.getParent();
      uiOf(view).setProperty("/invoiceYear", this.getSelectedKey());
      void loadInvoice(view);
    },
    onMonthChange: function () {
      const view = this.getParent();
      uiOf(view).setProperty("/invoiceMonth", this.getSelectedKey());
      void loadInvoice(view);
    },
    onPreviousPeriod: function () {
      const dialog = findInvoicesDialog(this);
      const view = dialog?.getParent();
      if (view) {
        shiftPeriod(view, -1);
      }
    },
    onNextPeriod: function () {
      const dialog = findInvoicesDialog(this);
      const view = dialog?.getParent();
      if (view) {
        shiftPeriod(view, 1);
      }
    },
    onEditCategoryPress: function () {
      const dialog = findInvoicesDialog(this);
      const view = dialog?.getParent();
      const transaction = this.getBindingContext("ui")?.getObject();
      if (!view || !transaction?.Identifier) {
        return;
      }
      const ui = uiOf(view);
      ui.setProperty("/invoiceSelectedIdentifier", transaction.Identifier);
      ui.setProperty("/invoiceCurrentCategoryId", transaction.Category?.ID || "");
      ui.setProperty("/invoiceCurrentCategoryName", transaction.Category?.Name || "");
      view.getController().openTransactionCategoryDialog();
    },
    onDeletePress: function () {
      const dialog = findInvoicesDialog(this);
      const view = dialog?.getParent();
      const transaction = this.getBindingContext("ui")?.getObject();
      if (!view || !transaction?.Identifier) {
        return;
      }
      uiOf(view).setProperty("/invoiceSelectedIdentifier", transaction.Identifier);
      view.getController().openDeleteTransactionsDialog();
    },
    onCloseInvoice: function () {
      const dialog = findInvoicesDialog(this);
      dialog?.close();
    },
    onDialogAfterClose: function () {
      const view = this.getParent();
      if (view) {
        void view.getController().reload();
      }
    }
  };
  Invoices.loadInvoice = loadInvoice;
  Invoices.reloadInvoiceData = reloadInvoiceData;
  return Invoices;
});
//# sourceMappingURL=Invoices-dbg.js.map

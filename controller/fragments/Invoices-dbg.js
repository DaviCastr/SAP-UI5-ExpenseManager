sap.ui.define(["sap/m/Dialog", "sap/ui/core/Fragment", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../../service/ODataService", "../../service/InvoiceService", "../../util/format", "../../util/feedback"], function (Dialog, Fragment, Filter, FilterOperator, ____service_ODataService, ____service_InvoiceService, ____util_format, ____util_feedback) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const DRAFT_FILTER = ____service_ODataService["DRAFT_FILTER"];
  const DRAFT_EXPAND = ____service_ODataService["DRAFT_EXPAND"];
  const InvoiceService = ____service_InvoiceService["InvoiceService"];
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
   * Parses a date typed by the user (`dd/mm/yyyy` with `.` or `-` separators)
   * into the `Edm.Date` notation used by the OData service (`yyyy-mm-dd`).
   *
   * @param {string} value the typed filter value
   * @returns {string | undefined} the ISO date, or `undefined` when not a date
   */
  function parseDateFilter(value) {
    const match = value.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!match) {
      return undefined;
    }
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) {
      year += 2000;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return undefined;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
   * Clears the transaction search field and removes the filters applied to the
   * transaction list. Used whenever the invoice being shown changes, so a stale
   * query does not leak into the newly bound list.
   *
   * @returns {void}
   */
  function resetTransactionSearch() {
    const search = Fragment.byId("Invoices", "invoiceTransactionSearch");
    const list = Fragment.byId("Invoices", "invoiceTransactionList");
    const binding = list?.getBinding("items");
    if (search) {
      search.setValue("");
    }
    binding?.filter([]);
  }

  /**
   * Detaches the Invoices dialog from its invoice binding. Used when no invoice
   * exists for the selected card/period so the transaction list shows its empty
   * text instead of stale rows.
   *
   * @returns {void}
   */
  function unbindTransactionList() {
    const dialog = Fragment.byId("Invoices", "invoicesDialog");
    resetTransactionSearch();
    dialog?.unbindObject();
  }

  /**
   * Binds the invoice transaction list to the transactions navigation of the
   * resolved invoice. The path uses the invoice key and its active/draft state,
   * so the OData V4 model reads exactly the transactions of the entity being
   * shown. `$orderby` (descending date) runs on the server.
   *
   * @param {XMLView} view the Home view
   * @param {string} invoiceId the resolved invoice ID
   * @param {boolean} isDraft whether the invoice is being shown as a draft
   * @returns {void}
   */
  function bindTransactionList(view, invoiceId, isDraft) {
    const dialog = Fragment.byId("Invoices", "invoicesDialog");
    resetTransactionSearch();
    if (!dialog) {
      return;
    }
    const path = `/Invoices(ID='${encodeURIComponent(invoiceId)}',IsActiveEntity=${isDraft ? "false" : "true"})`;
    dialog.unbindObject();
    dialog.bindObject(path);
  }

  /**
   * Resolves the thumbnail of every distinct category used by the bound invoice
   * transactions and mirrors it into `ui>/invoiceTransactionImages` (keyed by
   * category ID). When the invoice being shown is a draft, the draft media is
   * tried first, falling back to the active category image. Best effort.
   *
   * @param {XMLView} view the Home view
   * @returns {Promise<void>} resolves once the images were resolved
   */
  async function resolveTransactionCategoryImages(view) {
    const ui = uiOf(view);
    const odata = new ODataService(view.getModel());
    const list = Fragment.byId("Invoices", "invoiceTransactionList");
    const binding = list?.getBinding("items");
    if (!binding) {
      return;
    }
    try {
      const contexts = await binding.requestContexts();
      const byId = new Set();
      contexts.forEach(context => {
        const transaction = context.getObject();
        const categoryId = transaction?.Category?.ID;
        if (categoryId) {
          byId.add(categoryId);
        }
      });
      if (byId.size === 0) {
        return;
      }
      const images = {};
      await Promise.all(Array.from(byId).map(async categoryId => {
        const states = invoiceShowsDraft(view) ? [false, true] : [true];
        for (const isActiveEntity of states) {
          const base64 = await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(categoryId)}',IsActiveEntity=${isActiveEntity})/Image`);
          if (base64) {
            images[categoryId] = base64;
            return;
          }
        }
      }));
      ui.setProperty("/invoiceTransactionImages", images);
    } catch {
      // keep initials; image loading must not break the dialog
    }
  }

  /**
   * Loads the invoice of the currently selected card/period into the ui model
   * (`invoiceHeader`) and binds the transaction list to the resolved invoice.
   * The transaction ordering (date desc) and the draft/active resolution happen
   * server-side via the OData V4 binding.
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
        ui.setProperty("/invoiceIsDraft", false);
        ui.setProperty("/invoiceLoaded", false);
        ui.setProperty("/invoiceHeader", {});
        unbindTransactionList();
        return;
      }
      const isDraft = invoice.IsActiveEntity === false;
      const currency = invoice.Currency?.code || invoice.Currency_code || "BRL";
      ui.setProperty("/invoiceId", invoice.ID);
      ui.setProperty("/invoiceIsDraft", isDraft);
      ui.setProperty("/invoiceHeader", {
        Description: invoice.Description || "",
        TotalAmount: Number(invoice.TotalAmount) || 0,
        CurrencyCode: currency,
        InvoiceSent: invoice.InvoiceSent === true
      });
      bindTransactionList(view, invoice.ID, isDraft);
      await resolveTransactionCategoryImages(view);
      ui.setProperty("/invoiceLoaded", true);
    } catch (error) {
      ui.setProperty("/invoiceLoaded", false);
      handleActionError(view, error, "invoicesLoadError");
    } finally {
      ui.setProperty("/invoiceBusy", false);
    }
  }

  /**
   * Tells whether the transaction list is currently showing a draft invoice.
   *
   * @param {XMLView} view the Home view
   * @returns {boolean} whether the draft media should be preferred
   */
  function invoiceShowsDraft(view) {
    return uiOf(view).getProperty("/invoiceIsDraft") === true;
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
      ui.setProperty("/invoiceIsDraft", false);
      ui.setProperty("/invoiceLoaded", false);
      ui.setProperty("/invoiceHeader", {});
      ui.setProperty("/invoiceTransactionImages", {});
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
    onTransactionSearch: function () {
      const view = Fragment.byId("Invoices", "invoicesDialog")?.getParent();
      const list = Fragment.byId("Invoices", "invoiceTransactionList");
      const binding = list?.getBinding("items");
      if (!view || !binding) {
        return;
      }
      const query = this.getValue()?.trim() || "";
      const filters = [];
      const isoDate = parseDateFilter(query);
      if (query) {
        filters.push(new Filter({
          path: "Description",
          operator: FilterOperator.Contains,
          value1: query
        }));
      }
      if (isoDate) {
        filters.push(new Filter({
          path: "Date",
          operator: FilterOperator.EQ,
          value1: isoDate
        }));
      }
      const applied = filters.length > 1 ? [new Filter({
        filters,
        and: false
      })] : filters;
      binding.filter(applied);
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
      const transaction = this.getBindingContext()?.getObject();
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
      const transaction = this.getBindingContext()?.getObject();
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

sap.ui.define(["sap/m/MessageToast", "sap/m/MessageBox", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "./BaseController", "../service/ODataService", "../service/InvoiceService", "../service/PeriodService", "../service/MediaService", "../service/DashboardRenderer", "../util/expenseApi", "../util/http", "../util/feedback", "../util/draftDialogFlow", "../util/personEvents", "../util/charts", "../util/format", "sap/base/i18n/Localization"], function (MessageToast, MessageBox, Filter, FilterOperator, ___BaseController, ___service_ODataService, ___service_InvoiceService, ___service_PeriodService, ___service_MediaService, ___service_DashboardRenderer, ___util_expenseApi, ___util_http, ___util_feedback, ___util_draftDialogFlow, ___util_personEvents, ___util_charts, ___util_format, Localization) {
  "use strict";

  const BaseController = ___BaseController["BaseController"];
  const ODataService = ___service_ODataService["ODataService"];
  const DRAFT_FILTER = ___service_ODataService["DRAFT_FILTER"];
  const DRAFT_EXPAND = ___service_ODataService["DRAFT_EXPAND"];
  const InvoiceService = ___service_InvoiceService["InvoiceService"];
  const PeriodService = ___service_PeriodService["PeriodService"];
  const MediaService = ___service_MediaService["MediaService"];
  const DashboardRenderer = ___service_DashboardRenderer["DashboardRenderer"];
  const getTransactionsByCategory = ___util_expenseApi["getTransactionsByCategory"];
  const isSessionExpiredError = ___util_http["isSessionExpiredError"];
  const isBackendUnavailableError = ___util_http["isBackendUnavailableError"];
  const getBackendErrorMessage = ___util_feedback["getBackendErrorMessage"];
  const runExclusiveAction = ___util_draftDialogFlow["runExclusiveAction"];
  const PERSON_CHANNEL = ___util_personEvents["PERSON_CHANNEL"];
  const PERSON_DRAFT_CLOSING = ___util_personEvents["PERSON_DRAFT_CLOSING"];
  const PERSON_SELECTED = ___util_personEvents["PERSON_SELECTED"];
  const columnChart = ___util_charts["columnChart"];
  const donutChart = ___util_charts["donutChart"];
  const foldSlices = ___util_charts["foldSlices"];
  const seriesClass = ___util_charts["seriesClass"];
  const currencyCode = ___util_format["currencyCode"];
  const formatCurrency = ___util_format["formatCurrency"];
  const formatMonth = ___util_format["formatMonth"];
  const HISTORY_MONTHS = 6;
  /**
   * "Visão geral" tab: period navigation, metrics, movements, spending by
   * category, cards and debts of the person selected in the workspace (Home).
   * Reloads whenever the workspace announces a new selection or a reload.
   */
  class Overview extends BaseController {
    periodService = new PeriodService();
    onInit() {
      this.getOwnerComponent()?.getEventBus().subscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
      this.getOwnerComponent()?.getEventBus().subscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
      if (this.getSelectedPersonId()) {
        this.onPersonSelected();
      }
    }
    onExit() {
      this.getOwnerComponent()?.getEventBus().unsubscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
      this.getOwnerComponent()?.getEventBus().unsubscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
    }
    onOpenExpenseDialog() {
      this.workspace()?.onOpenExpenseDialog();
    }
    onOpenCardManagerDialog() {
      this.navTo("Cards");
    }
    onOpenCategoryManagerDialog() {
      this.navTo("Categories");
    }
    onOpenInvoicesDialog() {
      this.navTo("Invoices");
    }
    onOpenLiabilitiesDialog() {
      this.navTo("Liabilities");
    }
    onOpenLiabilityTransactions(oEvent) {
      this.workspace()?.onOpenLiabilityTransactions(oEvent);
    }
    onRestoreBackup() {
      this.workspace()?.onRestoreBackup();
    }
    onPreviousMonth() {
      this.navigateMonth(-1);
    }
    onNextMonth() {
      this.navigateMonth(1);
    }
    onThisMonth() {
      const period = this.periodService.current();
      this.getUiModel().setProperty("/period", period);
      this.applyPeriodData();
    }
    onHomeYearChanged() {
      const ui = this.getUiModel();
      const period = this.currentPeriod();
      period.year = Number(ui.getProperty("/periodSelector/year")) || period.year;
      ui.setProperty("/period", period);
      this.applyPeriodData();
    }
    onHomeMonthChanged() {
      const ui = this.getUiModel();
      const period = this.currentPeriod();
      period.month = Number(ui.getProperty("/periodSelector/month")) || period.month;
      ui.setProperty("/period", period);
      this.applyPeriodData();
    }
    async onSendInvoices() {
      await runExclusiveAction("sendInvoices", async () => {
        const period = this.currentPeriod();
        if (!this._invoiceService) {
          return;
        }
        const ui = this.getUiModel();
        ui.setProperty("/busy", true);
        try {
          const sent = await this._invoiceService.sendInvoices(this.getSelectedPersonId(), period);
          if (sent) {
            MessageToast.show(this.getText("sendInvoicesSuccess"));
          } else {
            MessageBox.error(this.getText("sendInvoicesNoData"));
          }
        } catch (error) {
          if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
            const detail = getBackendErrorMessage(error);
            MessageBox.error(detail ? `${this.getText("sendInvoicesError")}\n\n${detail}` : this.getText("sendInvoicesError"));
          }
        } finally {
          ui.setProperty("/busy", false);
        }
      });
    }

    /**
     * Filters the local (JSON) transaction list by date, description, category
     * or card. The search text is matched against `SearchText` (description +
     * category + card + formatted date) assembled by the DashboardRenderer, so a
     * query such as "mercado", "Nubank" or "15/08" finds the matching rows client-side.
     *
     * @returns {void}
     */
    onTransactionSearch() {
      const search = this.byId("transactionsSearch");
      const list = this.byId("transactionsList");
      const binding = list?.getBinding("items");
      const query = search?.getValue()?.trim() || "";
      if (!binding) {
        return;
      }
      if (!query) {
        binding.filter([]);
        return;
      }
      binding.filter([new Filter({
        path: "SearchText",
        operator: FilterOperator.Contains,
        value1: query
      })]);
    }
    onCategoryPress(oEvent) {
      const source = oEvent.getSource();
      const bindingContext = source?.getBindingContext("ui");
      const category = bindingContext?.getObject();
      if (!category) {
        return;
      }
      const ui = this.getUiModel();
      const period = this.currentPeriod();
      ui.setProperty("/busy", true);
      void getTransactionsByCategory(this.getServiceModel(), this.getSelectedPersonId(), category.ID, false, period.year, period.month).then(result => {
        ui.setProperty("/categoryDetail", result);
        return this.workspace()?.openCategoryDetailDialog();
      }).catch(error => this.handleError(error, "errorLoadCategoryDetail")).finally(() => ui.setProperty("/busy", false));
    }

    /**
     * Opens the category picker for the transaction whose action button was
     * pressed, mirroring the selected Identifier and its current category into
     * the ui model (same contract used by the invoice dialog).
     *
     * @param {Event} oEvent the press event
     * @returns {void}
     */
    onTransactionCategoryPress(oEvent) {
      const source = oEvent.getSource();
      const transaction = source?.getBindingContext("ui")?.getObject();
      if (!transaction?.Identifier) {
        return;
      }
      const ui = this.getUiModel();
      ui.setProperty("/transactionCategory/selectedIdentifier", transaction.Identifier);
      ui.setProperty("/transactionCategory/currentCategoryId", transaction.Category?.ID || "");
      ui.setProperty("/transactionCategory/currentCategoryName", transaction.Category?.Name || "");
      this.workspace()?.openTransactionCategoryDialog();
    }

    /**
     * Opens the batch-exclusion dialog for the transaction whose action button
     * was pressed, mirroring the selected Identifier into the ui model (same
     * contract used by the invoice dialog).
     *
     * @param {Event} oEvent the press event
     * @returns {void}
     */
    onTransactionDeletePress(oEvent) {
      const source = oEvent.getSource();
      const transaction = source?.getBindingContext("ui")?.getObject();
      if (!transaction?.Identifier) {
        return;
      }
      this.getUiModel().setProperty("/deleteTransactions/selectedIdentifier", transaction.Identifier);
      this.workspace()?.openDeleteTransactionsDialog();
    }

    /**
     * Rebinds the person-scoped sections and reloads the dashboard for the
     * person currently selected in the workspace.
     */
    onPersonSelected = () => {
      void this.ensureServices().then(ready => {
        if (!ready) {
          return;
        }
        this.bindPersonContext(this.getSelectedPersonId());
        if (this.getSelectedPersonId()) {
          this.applyPeriodData();
        }
      });
    };
    onDraftClosing = () => {
      ["personDetails", "cardsList", "metricsGrid", "liabilitiesList"].forEach(id => this.byId(id)?.unbindObject());
    };
    async ensureServices() {
      const model = await this.ensureServiceModel();
      if (!model) {
        return false;
      }
      if (!this._odata || this._serviceModelRef !== model) {
        this._odata = new ODataService(model);
        this._invoiceService = new InvoiceService(this._odata);
        this._mediaService = new MediaService(this._odata, this.getUiModel());
        this._renderer = new DashboardRenderer(this._invoiceService, this.getUiModel(), (key, parameters) => this.getText(key, parameters));
        this._serviceModelRef = model;
      }
      return true;
    }

    /**
     * Binds the person-scoped sections (`personDetails`, `cardsList`,
     * `metricsGrid`, `liabilitiesList`) to the path of the selected person
     * (its draft when one is open, otherwise the active entity).
     *
     * @param {string} id the person id; empty when the selection is cleared
     */
    bindPersonContext(id) {
      const path = this.workspace()?.personPathFor(id) ?? "";
      this.byId("personDetails")?.setModel(this.getView()?.getModel());
      this.byId("personDetails")?.bindObject(path);
      this.byId("cardsList")?.bindObject(path);
      this.byId("metricsGrid")?.bindObject(path);
      this.byId("liabilitiesList")?.bindObject(path);
    }
    applyPeriodData() {
      const ui = this.getUiModel();
      const period = this.currentPeriod();
      ui.setProperty("/period", period);
      ui.setProperty("/monthLabel", this.periodService.label(period.year, period.month));
      ui.setProperty("/periodSelector/year", String(period.year));
      ui.setProperty("/periodSelector/month", String(period.month));
      this.resetTransactionSearch();
      void this.loadDashboard();
    }

    /**
     * Clears the local transaction search field and removes the filter applied
     * to the JSON transaction list. Called whenever the period or person
     * changes, so a stale query does not hide the freshly loaded rows.
     *
     * @returns {void}
     */
    resetTransactionSearch() {
      const search = this.byId("transactionsSearch");
      const list = this.byId("transactionsList");
      const binding = list?.getBinding("items");
      if (search) {
        search.setValue("");
      }
      binding?.filter([]);
    }
    navigateMonth(delta) {
      const period = this.currentPeriod();
      this.getUiModel().setProperty("/period", this.periodService.shift(period, delta));
      this.applyPeriodData();
    }
    currentPeriod() {
      return this.periodService.currentOrDefault(this.getUiModel().getProperty("/period"));
    }
    async loadDashboard() {
      const ui = this.getUiModel();
      const personId = this.getSelectedPersonId();
      const period = this.currentPeriod();
      const invoiceService = this._invoiceService;
      const renderer = this._renderer;
      if (!personId || !invoiceService || !renderer) {
        return;
      }
      ui.setProperty("/busy", true);
      try {
        const invoice = await invoiceService.getCompleteInvoice(personId, period);
        const expenses = Number(invoice.TotalAmount) || 0;
        const transactions = renderer.renderInvoice(invoice, this.selectedPerson());
        const preferDraft = ui.getProperty("/selectedPersonDraft") === true;
        void this._mediaService?.resolveCategoryImages(transactions, preferDraft);
        void renderer.loadTrend(personId, period, expenses);
        this.renderCategoryChart();
        void this.renderHistoryChart(personId, period, expenses);

        // The person-scoped metrics (Income, ExpenseTarget, TotalExpenses*)
        // are bound directly to the OData V4 model via metricsGrid.
        const cards = await this._odata?.requestEntitySet("Cards", {
          select: ["ID", "Name"],
          filters: [new Filter({
            path: "Person/ID",
            operator: FilterOperator.EQ,
            value1: personId
          })],
          filterExpression: DRAFT_FILTER,
          expand: DRAFT_EXPAND
        });
        if (cards) {
          void this._mediaService?.resolveCardImages(cards, preferDraft);
        }
      } catch (error) {
        this.handleLoadError(error, "backendUnavailableLogin");
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Colors the category list like the donut slices and draws the donut of
     * the spending by category (largest categories, the rest as "others").
     */
    renderCategoryChart() {
      const ui = this.getUiModel();
      const categories = ui.getProperty("/categories") ?? [];
      categories.forEach((_, index) => ui.setProperty(`/categories/${index}/ColorClass`, seriesClass(index)));
      const slices = foldSlices(categories.map(category => ({
        label: category.Name,
        value: category.Total
      })), this.getText("chartOthers"));
      ui.setProperty("/charts/categories", donutChart(slices, value => this.money(value), this.getText("chartTotalSpent")));
    }

    /**
     * Draws the spending of the last months (the shown one included), with
     * the monthly target as a reference line. Months that cannot be loaded
     * count as zero instead of breaking the chart.
     *
     * @param {string} personId the selected person
     * @param {Period} period the period being shown
     * @param {number} expenses the spending of the shown period
     */
    async renderHistoryChart(personId, period, expenses) {
      const periods = Array.from({
        length: HISTORY_MONTHS
      }, (_, index) => this.periodService.shift(period, index - HISTORY_MONTHS + 1));
      const locale = Localization.getLanguage();
      const values = await Promise.all(periods.map(async (month, index) => {
        if (index === HISTORY_MONTHS - 1) {
          return expenses;
        }
        try {
          return Number((await this._invoiceService?.getCompleteInvoice(personId, month))?.TotalAmount) || 0;
        } catch {
          return 0;
        }
      }));
      if (this.getSelectedPersonId() !== personId) {
        return;
      }
      const bars = periods.map((month, index) => ({
        label: new Date(month.year, month.month - 1, 1).toLocaleDateString(locale, {
          month: "short"
        }).replace(".", ""),
        hint: formatMonth(month.year, month.month),
        value: values[index],
        current: index === HISTORY_MONTHS - 1
      }));
      const target = Number(this.selectedPerson().ExpenseTarget) || 0;
      const compact = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: this.currency(),
        notation: "compact",
        maximumFractionDigits: 1
      });
      this.getUiModel().setProperty("/charts/history", columnChart(bars, value => this.money(value), value => compact.format(value), {
        value: target,
        label: this.getText("chartTargetLine", [this.money(target)])
      }));
    }
    money(value) {
      return formatCurrency(value, this.currency());
    }
    currency() {
      return currencyCode(this.selectedPerson().Currency);
    }
    selectedPerson() {
      return this.getUiModel().getProperty("/selectedPerson") || {};
    }
    getSelectedPersonId() {
      return this.getUiModel().getProperty("/selectedPersonId") || "";
    }
    workspace() {
      return this.getOwnerComponent()?.getWorkspace();
    }
  }
  return Overview;
});
//# sourceMappingURL=Overview-dbg.controller.js.map

sap.ui.define(["sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/Fragment", "./BaseController", "../auth/AuthenticationService", "../util/Environment", "../util/format", "../service/ODataService", "../service/InvoiceService", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../util/expenseApi", "../util/backupApi", "../util/http"], function (MessageBox, MessageToast, Fragment, ___BaseController, ___auth_AuthenticationService, __Environment, ___util_format, ___service_ODataService, ___service_InvoiceService, Filter, FilterOperator, ___util_expenseApi, ___util_backupApi, ___util_http) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = ___BaseController["BaseController"];
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const Environment = _interopRequireDefault(__Environment);
  const EnvironmentType = __Environment["EnvironmentType"];
  const formatCurrency = ___util_format["formatCurrency"];
  const ODataService = ___service_ODataService["ODataService"];
  const DRAFT_FILTER = ___service_ODataService["DRAFT_FILTER"];
  const DRAFT_EXPAND = ___service_ODataService["DRAFT_EXPAND"];
  const InvoiceService = ___service_InvoiceService["InvoiceService"];
  const getTransactionsByCategory = ___util_expenseApi["getTransactionsByCategory"];
  const requestExportBackup = ___util_backupApi["requestExportBackup"];
  const fetchBackupStream = ___util_backupApi["fetchBackupStream"];
  const deleteBackupRow = ___util_backupApi["deleteBackupRow"];
  const downloadBlob = ___util_backupApi["downloadBlob"];
  const isSessionExpiredError = ___util_http["isSessionExpiredError"];
  const buildHeaders = ___util_http["buildHeaders"];
  const getOdataServiceUrl = ___util_http["getOdataServiceUrl"];
  function resolveCurrency(currency, fallback = "BRL") {
    if (typeof currency === "string" && currency) {
      return currency;
    }
    if (currency && typeof currency === "object") {
      return currency.code || fallback;
    }
    return fallback;
  }
  class Home extends BaseController {
    _persons = [];
    get uiModel() {
      return this.getOwnerComponent()?.getModel("ui");
    }
    onInit() {
      void this.initView();
    }
    async initView() {
      const model = await this.ensureServiceModel();
      if (!model) {
        this.navTo("Login");
        return;
      }
      this._odata = new ODataService(model);
      this._invoiceService = new InvoiceService(this._odata);
      try {
        await this.setupPersonSelector();
        this.applyPersonSelection(this.getSelectedPersonId());
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        if (Environment.current() !== EnvironmentType.GITHUB) {
          MessageBox.error(this.getText("backendUnavailable"));
        }
      }
    }
    onPersonChange(oEvent) {
      const selectedItem = oEvent.getParameters().selectedItem;
      const id = selectedItem?.getKey?.();
      if (!id) {
        return;
      }
      this.applyPersonSelection(id);
    }
    async onLogout() {
      await AuthenticationService.logout();
      this.navTo("Login");
    }
    onOpenExpenseDialog() {
      const oView = this.getView();
      const ui = this.uiModel;
      const personId = this.getSelectedPersonId();
      ui.setProperty("/newExpense", {
        description: "",
        amount: "",
        cardId: "",
        categoryId: "",
        installments: 1,
        fixedExpense: false,
        transactionDate: new Date().toISOString().slice(0, 10)
      });
      if (!this._expenseDialog) {
        this._expenseDialog = this.loadFragmentDialog(oView, "AddExpense");
      }
      void this._expenseDialog.then(dialog => dialog.open());
      if (personId) {
        void this.loadExpenseOptions(personId);
      }
    }
    async loadExpenseOptions(personId) {
      if (!this._odata) {
        return;
      }
      try {
        const [cards, categories] = await Promise.all([this._odata.requestEntitySet("Cards", {
          select: ["ID", "Name"],
          filters: [new Filter({
            path: "Person/ID",
            operator: FilterOperator.EQ,
            value1: personId
          })],
          filterExpression: DRAFT_FILTER,
          expand: DRAFT_EXPAND
        }), this._odata.requestEntitySet("Categories", {
          select: ["ID", "Name"],
          filters: [new Filter({
            path: "Person/ID",
            operator: FilterOperator.EQ,
            value1: personId
          })],
          filterExpression: DRAFT_FILTER,
          expand: DRAFT_EXPAND
        })]);
        const cardOptions = cards.map(card => ({
          key: card.ID,
          text: card.Name,
          isDraft: card.IsActiveEntity === false
        }));
        const categoryOptions = categories.map(category => ({
          key: category.ID,
          text: category.Name,
          isDraft: category.IsActiveEntity === false
        }));

        // eslint-disable-next-line no-console
        console.log("[expenseOptions] first card:", cards[0]);
        // eslint-disable-next-line no-console
        console.log("[expenseOptions] first category:", categories[0]);
        // eslint-disable-next-line no-console
        console.log("[expenseOptions] cardOptions[0]:", cardOptions[0], "categoryOptions[0]:", categoryOptions[0]);
        this.uiModel.setProperty("/expenseCardOptions", cardOptions);
        this.uiModel.setProperty("/expenseCategoryOptions", categoryOptions);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[expenseOptions] failed to load options:", error);
        if (isSessionExpiredError(error)) {
          return;
        }
      }
    }
    onOpenPersonDialog() {
      const oView = this.getView();
      this.uiModel.setProperty("/newPerson", {
        name: "",
        email: "",
        phone: "",
        income: "",
        currency: "BRL",
        target: ""
      });
      if (!this._personDialog) {
        this._personDialog = this.loadFragmentDialog(oView, "AddPerson");
      }
      void this._personDialog.then(dialog => dialog.open());
    }
    onOpenCardDialog() {
      const oView = this.getView();
      this.uiModel.setProperty("/newCard", {
        name: "",
        limit: "",
        currency: "BRL"
      });
      if (!this._cardDialog) {
        this._cardDialog = this.loadFragmentDialog(oView, "AddCard");
      }
      void this._cardDialog.then(dialog => dialog.open());
    }
    onOpenCategoryDialog() {
      const oView = this.getView();
      this.uiModel.setProperty("/newCategory", {
        name: ""
      });
      if (!this._categoryDialog) {
        this._categoryDialog = this.loadFragmentDialog(oView, "AddCategory");
      }
      void this._categoryDialog.then(dialog => dialog.open());
    }
    onPreviousMonth() {
      this.navigateMonth(-1);
    }
    onNextMonth() {
      this.navigateMonth(1);
    }
    onThisMonth() {
      const now = new Date();
      this.uiModel.setProperty("/period", {
        year: now.getFullYear(),
        month: now.getMonth() + 1
      });
      this.applyPeriodData();
    }
    onCategoryPress(oEvent) {
      const source = oEvent.getSource();
      const bindingContext = source?.getBindingContext("ui");
      const category = bindingContext?.getObject();
      if (!category) {
        return;
      }
      const oView = this.getView();
      const ui = this.uiModel;
      const personId = ui.getProperty("/selectedPersonId");
      const period = ui.getProperty("/period");
      ui.setProperty("/busy", true);
      void getTransactionsByCategory(this.getServiceModel(), personId, category.ID, false, period.year, period.month).then(result => {
        ui.setProperty("/categoryDetail", result);
        if (!this._categoryDetailDialog) {
          this._categoryDetailDialog = this.loadFragmentDialog(oView, "CategoryDetail");
        }
        return this._categoryDetailDialog;
      }).then(dialog => dialog.open()).catch(error => {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(this.getText("errorLoadCategoryDetail"));
      }).finally(() => {
        ui.setProperty("/busy", false);
      });
    }
    onOpenSimulationDialog() {
      const oView = this.getView();
      const now = new Date();
      const ui = this.uiModel;
      if (!ui.getProperty("/simulation")) {
        ui.setProperty("/simulation", {
          month: String(now.getMonth() + 1),
          year: String(now.getFullYear())
        });
      }
      if (!ui.getProperty("/simulationMonthOptions")) {
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        ui.setProperty("/simulationMonthOptions", monthNames.map((name, index) => ({
          key: String(index + 1),
          text: name
        })));
      }
      ui.setProperty("/simulationResult", null);
      if (!this._simulationDialog) {
        this._simulationDialog = this.loadFragmentDialog(oView, "Simulation");
      }
      void this._simulationDialog.then(dialog => dialog.open());
    }
    onRestoreBackup() {
      const oView = this.getView();
      if (!this._backupDialog) {
        this._backupDialog = this.loadFragmentDialog(oView, "Backup");
      }
      void this._backupDialog.then(dialog => dialog.open());
    }
    async onExportBackup() {
      const ui = this.uiModel;
      ui.setProperty("/busy", true);
      try {
        const guid = await requestExportBackup();
        const blob = await fetchBackupStream(guid);
        downloadBlob(blob, `meu-fluxo-backup-${new Date().toISOString().slice(0, 10)}.zip`);
        await deleteBackupRow(guid);
        MessageToast.show(this.getText("backupExported"));
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(this.getText("errorExportBackup"));
      } finally {
        ui.setProperty("/busy", false);
      }
    }
    refresh() {
      void this.loadDashboard();
    }

    /**
     * Reloads persons and refreshes the current dashboard. Used by the create/restore dialogs.
     */
    reload() {
      try {
        this._persons = [];
        this.getServiceModel().refresh();
      } catch {
        // ignore transient refresh errors; setupPersonSelector re-fetches the list.
      }
      void this.setupPersonSelector();
    }
    getSelectedPersonId() {
      return this.uiModel.getProperty("/selectedPersonId") || "";
    }
    async setupPersonSelector() {
      if (!this._odata) {
        return;
      }
      let persons = [];

      // Do NOT pass $select here: a "$select" that includes the key property is
      // rejected on draft bindings; omitting it returns every property (incl. ID).
      try {
        const result = await this._odata.requestEntitySet("/Persons", {
          filterExpression: DRAFT_FILTER,
          expand: DRAFT_EXPAND
        });
        persons = result.filter(person => !!person.ID).map(person => ({
          ID: person.ID,
          Name: person.Name + (person.IsActiveEntity === false ? " (rascunho)" : ""),
          Income: person.Income,
          ExpenseTarget: person.ExpenseTarget,
          Currency: person.Currency,
          ImageType: person.ImageType
        }));
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[setupPersonSelector] requestEntitySet /Persons failed:", error);
      }
      this._persons = persons;
      const select = this.byId("personSelect");
      if (persons.length === 0) {
        this.uiModel.setProperty("/personsEmpty", true);
        this.uiModel.setProperty("/selectedPersonId", "");
        if (select) {
          select.setSelectedKey("");
        }
        return;
      }
      this.uiModel.setProperty("/personsEmpty", false);
      const current = this.getSelectedPersonId();
      const currentExists = persons.some(person => person.ID === current);
      this.applyPersonSelection(current && currentExists ? current : persons[0].ID);
    }
    getPersonsFromBinding() {
      if (this._persons.length > 0) {
        return this._persons;
      }
      const select = this.byId("personSelect");
      const binding = select.getBinding("items");
      if (!binding) {
        return [];
      }
      return binding.getContexts(0, 100).map(context => context.getObject()).filter(person => !!person?.ID);
    }
    applyPersonSelection(id) {
      const ui = this.uiModel;
      // eslint-disable-next-line no-console
      console.log("[applyPersonSelection] id:", id);
      if (!id) {
        ui.setProperty("/selectedPersonId", "");
        ui.setProperty("/selectedPerson", {});
        ui.setProperty("/selectedPersonImage", "");
        return;
      }
      ui.setProperty("/selectedPersonId", id);
      const person = this.getPersonsFromBinding().find(candidate => candidate.ID === id);
      if (person) {
        // eslint-disable-next-line no-console
        console.log("[applyPersonSelection] selected person:", person);
        ui.setProperty("/selectedPerson", {
          ID: person.ID,
          Name: person.Name,
          Income: person.Income,
          ExpenseTarget: person.ExpenseTarget,
          Currency: person.Currency,
          ImageType: person.ImageType
        });
        void this.loadSelectedPersonImage(person);
      }
      this.applyPeriodData();
    }
    async loadSelectedPersonImage(person) {
      if (!person?.ID || !person.ImageType) {
        this.uiModel.setProperty("/selectedPersonImage", "");
        return;
      }
      try {
        const url = `${getOdataServiceUrl()}Persons(ID='${encodeURIComponent(person.ID)}',IsActiveEntity=true)/Image`;
        const response = await fetch(url, {
          headers: buildHeaders({})
        });
        if (!response.ok) {
          return;
        }
        const blob = await response.blob();
        this.uiModel.setProperty("/selectedPersonImage", URL.createObjectURL(blob));
      } catch {
        // avatar stays with initials when the image cannot be loaded
      }
    }
    applyPeriodData() {
      const ui = this.uiModel;
      const period = ui.getProperty("/period") || this.currentPeriod();
      ui.setProperty("/period", period);
      ui.setProperty("/monthLabel", this.periodLabel(period.year, period.month));
      void this.loadDashboard();
    }
    async loadDashboard() {
      const ui = this.uiModel;
      const personId = this.getSelectedPersonId();
      const period = ui.getProperty("/period") || this.currentPeriod();

      // eslint-disable-next-line no-console
      console.log("[loadDashboard] personId:", personId, "period:", period.year, period.month);
      if (!personId) {
        return;
      }
      ui.setProperty("/busy", true);
      try {
        if (!this._invoiceService || !this._odata) {
          return;
        }
        const invoice = await this._invoiceService.getCompleteInvoice(personId, period);
        this.renderInvoice(invoice);
        // eslint-disable-next-line no-console
        console.log("[loadDashboard] invoice TotalAmount:", invoice.TotalAmount);
        const cards = await this._odata.requestEntitySet("Cards", {
          select: ["ID", "Name", "Limit", "Currency", "DueDay", "ClosingDay"],
          filters: [new Filter({
            path: "Person/ID",
            operator: FilterOperator.EQ,
            value1: personId
          })],
          filterExpression: DRAFT_FILTER,
          expand: DRAFT_EXPAND
        });
        // eslint-disable-next-line no-console
        console.log("[dashboard] first card:", cards[0]);
        ui.setProperty("/cards", cards.map(card => ({
          ...card,
          Currency: resolveCurrency(card.Currency)
        })));
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[loadDashboard] ERROR:", error);
        if (Environment.current() !== EnvironmentType.GITHUB) {
          MessageBox.error(this.getText("backendUnavailable"));
        }
      } finally {
        ui.setProperty("/busy", false);
      }
    }
    renderInvoice(invoice) {
      const ui = this.uiModel;
      const person = ui.getProperty("/selectedPerson") || {};
      const expenses = Number(invoice.TotalAmount) || 0;
      const income = Number(person.Income) || 0;
      const target = Number(person.ExpenseTarget) || 0;
      const currency = resolveCurrency(invoice.Currency?.code, resolveCurrency(person.Currency)) || "BRL";
      const available = income - expenses;
      const targetPercent = target > 0 ? Math.round(expenses / target * 100) : 0;
      const transactions = (invoice.Transactions || []).map(transaction => ({
        ...transaction,
        Currency: currency
      }));
      ui.setProperty("/summary", {
        available: formatCurrency(available, currency),
        income: formatCurrency(income, currency),
        expenses: formatCurrency(expenses, currency),
        savings: formatCurrency(available, currency),
        target: formatCurrency(target, currency),
        expenseHint: target > 0 ? this.getText("summaryExpenseHintMeta", [String(targetPercent)]) : this.getText("summaryExpenseHintSpent", [String(Math.round(expenses))]),
        targetHint: target > 0 ? this.getText("summaryTargetHintPlanned") : this.getText("summaryTargetHintEmpty"),
        trendText: this.getText("trendCalculating"),
        trendIcon: "sap-icon://trend-up"
      });
      ui.setProperty("/transactions", transactions);
      this.buildCategories(transactions, expenses, currency);
      void this.loadTrend(this.getSelectedPersonId(), this.currentPeriodDefault(), expenses);
    }
    async loadTrend(personId, period, expenses) {
      if (!this._invoiceService) {
        return;
      }
      const previous = this.shiftMonth(period.year, period.month, -1);
      try {
        const previousInvoice = await this._invoiceService.getCompleteInvoice(personId, previous);
        const previousExpenses = Number(previousInvoice.TotalAmount) || 0;
        const trend = previousExpenses > 0 ? (expenses - previousExpenses) / previousExpenses * 100 : expenses > 0 ? 100 : 0;
        const trendingUp = trend > 0;
        const delta = String(Math.abs(Math.round(trend)));
        let trendText;
        if (previousExpenses > 0) {
          trendText = trendingUp ? this.getText("trendMore", [delta]) : this.getText("trendLess", [delta]);
        } else {
          trendText = expenses > 0 ? this.getText("trendNoComparison") : this.getText("trendNoExpenses");
        }
        this.uiModel.setProperty("/summary/trendText", trendText);
        this.uiModel.setProperty("/summary/trendIcon", trendingUp ? "sap-icon://trend-down" : "sap-icon://trend-up");
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
      }
    }
    currentPeriodDefault() {
      return this.uiModel.getProperty("/period") || this.currentPeriod();
    }
    buildCategories(transactions, expenses, currency) {
      const map = new Map();
      for (const transaction of transactions) {
        const category = transaction.Category;
        if (!category) {
          continue;
        }
        const entry = map.get(category.ID) || {
          ID: category.ID,
          Name: category.Name,
          CategoryImagePath: category.ImagePath,
          Total: 0
        };
        entry.Total += Number(transaction.Amount) || 0;
        map.set(category.ID, entry);
      }
      const categories = Array.from(map.values()).map(item => ({
        ID: item.ID,
        Name: item.Name,
        CategoryImagePath: item.CategoryImagePath,
        Total: item.Total,
        Percent: expenses > 0 ? Math.round(item.Total / expenses * 100) : 0,
        CurrencyCode: currency
      })).sort((a, b) => b.Total - a.Total);
      this.uiModel.setProperty("/categories", categories);
    }
    navigateMonth(delta) {
      const period = this.currentPeriodDefault();
      this.uiModel.setProperty("/period", this.shiftMonth(period.year, period.month, delta));
      this.applyPeriodData();
    }
    shiftMonth(year, month, delta) {
      const total = year * 12 + (month - 1) + delta;
      return {
        year: Math.floor(total / 12),
        month: total % 12 + 1
      };
    }
    currentPeriod() {
      const now = new Date();
      return {
        year: now.getFullYear(),
        month: now.getMonth() + 1
      };
    }
    periodLabel(year, month) {
      const label = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric"
      });
      return `Visão geral • ${label}`;
    }
    loadFragmentDialog(oView, fragmentName) {
      return Fragment.load({
        name: `apps.dflc.expensemanager.view.fragments.${fragmentName}`
      }).then(dialog => {
        oView.addDependent(dialog);
        return dialog;
      });
    }
  }
  return Home;
});
//# sourceMappingURL=Home-dbg.controller.js.map

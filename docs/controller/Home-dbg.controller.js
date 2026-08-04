sap.ui.define(["sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/Fragment", "./BaseController", "../auth/AuthenticationService", "../util/Environment", "../util/format", "../service/ODataService", "../service/InvoiceService", "../util/expenseApi", "../util/backupApi", "../util/http"], function (MessageBox, MessageToast, Fragment, ___BaseController, ___auth_AuthenticationService, __Environment, ___util_format, ___service_ODataService, ___service_InvoiceService, ___util_expenseApi, ___util_backupApi, ___util_http) {
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
  const InvoiceService = ___service_InvoiceService["InvoiceService"];
  const getTransactionsByCategory = ___util_expenseApi["getTransactionsByCategory"];
  const requestExportBackup = ___util_backupApi["requestExportBackup"];
  const fetchBackupStream = ___util_backupApi["fetchBackupStream"];
  const deleteBackupRow = ___util_backupApi["deleteBackupRow"];
  const downloadBlob = ___util_backupApi["downloadBlob"];
  const isSessionExpiredError = ___util_http["isSessionExpiredError"];
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
      const odata = new ODataService(model);
      this._invoiceService = new InvoiceService(odata);
      try {
        this.setupPersonSelector();
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
      this.uiModel.setProperty("/newExpense", {
        description: "",
        amount: "",
        cardId: "",
        categoryId: ""
      });
      if (!this._expenseDialog) {
        this._expenseDialog = this.loadFragmentDialog(oView, "AddExpense");
      }
      void this._expenseDialog.then(dialog => dialog.open());
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
      try {
        this.getServiceModel().refresh();
      } catch {
        // The OData model refresh re-triggers the period binding and its dataReceived handler.
      }
      this.refreshDerived();
    }

    /**
     * Reloads persons and period data. Used by the create/restore dialogs after a successful operation.
     */
    reload() {
      try {
        try {
          this.getServiceModel().refresh();
        } catch {
          // The /Persons binding re-fires dataReceived and re-picks the selection.
        }
        this.refreshDerived();
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(this.getText("backendUnavailable"));
      }
    }
    getSelectedPersonId() {
      return this.uiModel.getProperty("/selectedPersonId") || "";
    }
    setupPersonSelector() {
      const select = this.byId("personSelect");
      const binding = select.getBinding("items");
      const applyLoaded = () => {
        const contexts = binding.getContexts(0, 50);
        const empty = contexts.length === 0;
        if (empty) {
          this.uiModel.setProperty("/personsEmpty", true);
          this.uiModel.setProperty("/selectedPersonId", "");
          return;
        }
        this.uiModel.setProperty("/personsEmpty", false);
        const current = this.getSelectedPersonId();
        if (!current) {
          const first = contexts[0]?.getProperty("ID");
          if (first) {
            this.applyPersonSelection(first);
          }
        } else if (!this.byId("personSection").getBindingContext()) {
          this.applyPersonSelection(current);
        }
      };

      // The /Persons list may already be resolved (earlyRequests); check now and attach as fallback.
      binding?.attachDataReceived(applyLoaded);
      applyLoaded();
    }
    applyPersonSelection(id) {
      const ui = this.uiModel;
      if (!id) {
        ui.setProperty("/selectedPersonId", "");
        return;
      }
      ui.setProperty("/selectedPersonId", id);
      const section = this.byId("personSection");
      section.bindElement({
        path: `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=true)`
      });
      this.applyPeriodData();
    }
    applyPeriodData() {
      const ui = this.uiModel;
      const personId = this.getSelectedPersonId();
      if (!personId) {
        return;
      }
      const period = ui.getProperty("/period") || this.currentPeriod();
      ui.setProperty("/period", period);
      ui.setProperty("/monthLabel", this.periodLabel(period.year, period.month));

      // The /Transactions list binding re-applies its filters (person + period) and
      // recomputes the summary via onTransactionsDataReceived.
      ui.setProperty("/busy", true);
    }
    onTransactionsDataReceived() {
      this.refreshDerived();
    }
    refreshDerived() {
      const ui = this.uiModel;
      const personContext = this.byId("personSection").getBindingContext();
      const person = personContext?.getObject();
      const list = this.byId("transactionsList");
      const binding = list.getBinding("items");
      const transactions = binding ? binding.getContexts(0, 500).map(ctx => ctx.getObject()) : [];
      const period = ui.getProperty("/period") || this.currentPeriod();
      const currency = person ? resolveCurrency(person.Currency) || "BRL" : "BRL";
      const income = Number(person?.Income) || 0;
      const target = Number(person?.ExpenseTarget) || 0;
      const expenses = transactions.reduce((sum, tx) => sum + (Number(tx.Amount) || 0), 0);
      const available = income - expenses;
      const savings = income - expenses;
      const targetPercent = target > 0 ? Math.round(expenses / target * 100) : 0;
      ui.setProperty("/summary", {
        available: formatCurrency(available, currency),
        income: formatCurrency(income, currency),
        expenses: formatCurrency(expenses, currency),
        savings: formatCurrency(savings, currency),
        target: formatCurrency(target, currency),
        expenseHint: target > 0 ? this.getText("summaryExpenseHintMeta", [String(targetPercent)]) : this.getText("summaryExpenseHintSpent", [String(Math.round(expenses))]),
        targetHint: target > 0 ? this.getText("summaryTargetHintPlanned") : this.getText("summaryTargetHintEmpty"),
        trendText: this.getText("trendCalculating"),
        trendIcon: "sap-icon://trend-up"
      });
      ui.setProperty("/monthLabel", this.periodLabel(period.year, period.month));
      this.buildCategories(transactions, expenses, currency);
      ui.setProperty("/busy", false);
      if (person?.ID) {
        void this.loadTrend(person.ID, period, expenses);
      }
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
      const period = this.uiModel.getProperty("/period") || this.currentPeriod();
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

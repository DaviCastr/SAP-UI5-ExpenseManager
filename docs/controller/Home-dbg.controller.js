sap.ui.define(["sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/Fragment", "./BaseController", "../auth/AuthenticationService", "../util/Environment", "../util/format", "../service/ODataService", "../service/PersonService", "../service/InvoiceService", "../util/expenseApi", "../util/backupApi", "../util/http"], function (MessageBox, MessageToast, Fragment, ___BaseController, ___auth_AuthenticationService, __Environment, ___util_format, ___service_ODataService, ___service_PersonService, ___service_InvoiceService, ___util_expenseApi, ___util_backupApi, ___util_http) {
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
  const PersonService = ___service_PersonService["PersonService"];
  const InvoiceService = ___service_InvoiceService["InvoiceService"];
  const getTransactionsByCategory = ___util_expenseApi["getTransactionsByCategory"];
  const requestExportBackup = ___util_backupApi["requestExportBackup"];
  const fetchBackupStream = ___util_backupApi["fetchBackupStream"];
  const deleteBackupRow = ___util_backupApi["deleteBackupRow"];
  const downloadBlob = ___util_backupApi["downloadBlob"];
  const isSessionExpiredError = ___util_http["isSessionExpiredError"];
  const EMPTY_SUMMARY = {
    available: "",
    income: "",
    expenses: "",
    savings: "",
    target: "",
    expenseHint: "",
    targetHint: "",
    trendText: "",
    trendIcon: "sap-icon://trend-up"
  };
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
      this._personService = new PersonService(odata);
      this._invoiceService = new InvoiceService(odata);
      try {
        await this.loadPersons();
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        if (Environment.current() !== EnvironmentType.GITHUB) {
          MessageBox.error(this.getText("backendUnavailable"));
        }
      }
    }
    onPersonChange() {
      void this.loadPeriodData();
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
      void this.loadPeriodData();
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
      const person = ui.getProperty("/selectedPerson");
      const period = ui.getProperty("/period");
      ui.setProperty("/busy", true);
      void getTransactionsByCategory(this.getServiceModel(), person.ID, category.ID, false, period.year, period.month).then(result => {
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
    async refresh() {
      try {
        this.getServiceModel().refresh();
      } catch (error) {
        // The period data below is reloaded through the API regardless of the OData model.
      }
      await this.loadPeriodData();
    }

    /**
     * Reloads the list of persons and the period data for the current selection.
     * Used by the create/restore dialogs after a successful operation.
     */
    async reload() {
      try {
        await this.loadPersons();
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(this.getText("backendUnavailable"));
      }
    }
    async loadPersons() {
      const persons = await this._personService.fetchAll();
      const ui = this.uiModel;
      ui.setProperty("/persons", persons);
      if (!persons.length) {
        ui.setProperty("/personsEmpty", true);
        ui.setProperty("/selectedPerson", {
          ID: ""
        });
        ui.setProperty("/invoice", {
          Transactions: []
        });
        ui.setProperty("/categories", []);
        ui.setProperty("/summary", {
          ...EMPTY_SUMMARY
        });
        ui.setProperty("/monthLabel", "Nenhuma pessoa para gerenciar");
        return;
      }
      ui.setProperty("/personsEmpty", false);
      const currentId = ui.getProperty("/selectedPerson/ID");
      const selected = persons.find(person => person.ID === currentId) || persons[0];
      ui.setProperty("/selectedPerson", selected || {
        ID: ""
      });
      if (!ui.getProperty("/period")) {
        const now = new Date();
        ui.setProperty("/period", {
          year: now.getFullYear(),
          month: now.getMonth() + 1
        });
      }
      if (selected?.ID) {
        await this.loadPeriodData();
      }
    }
    async loadPeriodData() {
      const ui = this.uiModel;
      const person = ui.getProperty("/selectedPerson");
      if (!person?.ID || !this._invoiceService) {
        return;
      }
      const period = ui.getProperty("/period") || this.currentPeriod();
      ui.setProperty("/busy", true);
      try {
        const previous = this.shiftMonth(period.year, period.month, -1);
        const [invoice, previousInvoice] = await Promise.all([this._invoiceService.getCompleteInvoice(person.ID, period), this._invoiceService.getCompleteInvoice(person.ID, previous)]);
        ui.setProperty("/invoice", invoice);
        ui.setProperty("/period", period);
        const currency = invoice.Currency?.code || resolveCurrency(person.Currency);
        const income = Number(person.Income) || 0;
        const expenses = Number(invoice.TotalAmount) || 0;
        const previousExpenses = Number(previousInvoice.TotalAmount) || 0;
        const target = Number(person.ExpenseTarget) || 0;
        const available = income - expenses;
        const savings = income - expenses;
        const trend = previousExpenses > 0 ? (expenses - previousExpenses) / previousExpenses * 100 : expenses > 0 ? 100 : 0;
        const trendText = previousExpenses > 0 ? `${Math.abs(Math.round(trend))}% ${trend <= 0 ? "menos" : "mais"} que o mês anterior` : expenses > 0 ? "Sem comparação com o mês anterior" : "Sem gastos registrados no período";
        const trendIcon = trend > 0 ? "sap-icon://trend-down" : "sap-icon://trend-up";
        const targetPercent = target > 0 ? Math.round(expenses / target * 100) : 0;
        ui.setProperty("/summary", {
          available: formatCurrency(available, currency),
          income: formatCurrency(income, currency),
          expenses: formatCurrency(expenses, currency),
          savings: formatCurrency(savings, currency),
          target: formatCurrency(target, currency),
          expenseHint: target > 0 ? `${targetPercent}% da meta utilizada` : `${Math.round(expenses)} de gastos no período`,
          targetHint: target > 0 ? "Meta planejada para o período" : "Defina uma meta de gasto",
          trendText,
          trendIcon
        });
        ui.setProperty("/monthLabel", this.periodLabel(period.year, period.month));
        this.buildCategories(invoice);
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(this.getText("errorLoadPeriod"));
      } finally {
        ui.setProperty("/busy", false);
      }
    }
    buildCategories(invoice) {
      const map = new Map();
      const total = Number(invoice.TotalAmount) || 0;
      for (const transaction of invoice.Transactions || []) {
        if (!transaction.Category) {
          continue;
        }
        const category = transaction.Category;
        const entry = map.get(category.ID) || {
          ID: category.ID,
          Name: category.Name,
          CategoryImagePath: category.ImagePath,
          Total: 0
        };
        entry.Total += Number(transaction.Amount) || 0;
        map.set(category.ID, entry);
      }
      const currency = invoice.Currency?.code || "BRL";
      const categories = Array.from(map.values()).map(item => ({
        ID: item.ID,
        Name: item.Name,
        CategoryImagePath: item.CategoryImagePath,
        Total: item.Total,
        Percent: total > 0 ? Math.round(item.Total / total * 100) : 0,
        CurrencyCode: currency
      })).sort((a, b) => b.Total - a.Total);
      this.uiModel.setProperty("/categories", categories);
    }
    navigateMonth(delta) {
      const period = this.uiModel.getProperty("/period") || this.currentPeriod();
      this.uiModel.setProperty("/period", this.shiftMonth(period.year, period.month, delta));
      void this.loadPeriodData();
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

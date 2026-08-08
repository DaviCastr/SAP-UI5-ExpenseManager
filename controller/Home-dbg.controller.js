sap.ui.define(["sap/m/MessageToast", "sap/ui/core/Fragment", "./BaseController", "../auth/AuthenticationService", "../service/ODataService", "../service/InvoiceService", "../service/PeriodService", "../service/MediaService", "../service/DashboardRenderer", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../util/expenseApi", "../util/backupApi", "../util/http"], function (MessageToast, Fragment, ___BaseController, ___auth_AuthenticationService, ___service_ODataService, ___service_InvoiceService, ___service_PeriodService, ___service_MediaService, ___service_DashboardRenderer, Filter, FilterOperator, ___util_expenseApi, ___util_backupApi, ___util_http) {
  "use strict";

  const BaseController = ___BaseController["BaseController"];
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const ODataService = ___service_ODataService["ODataService"];
  const DRAFT_FILTER = ___service_ODataService["DRAFT_FILTER"];
  const DRAFT_EXPAND = ___service_ODataService["DRAFT_EXPAND"];
  const InvoiceService = ___service_InvoiceService["InvoiceService"];
  const PeriodService = ___service_PeriodService["PeriodService"];
  const MediaService = ___service_MediaService["MediaService"];
  const DashboardRenderer = ___service_DashboardRenderer["DashboardRenderer"];
  const getTransactionsByCategory = ___util_expenseApi["getTransactionsByCategory"];
  const requestExportBackup = ___util_backupApi["requestExportBackup"];
  const fetchBackupStream = ___util_backupApi["fetchBackupStream"];
  const deleteBackupRow = ___util_backupApi["deleteBackupRow"];
  const downloadBlob = ___util_backupApi["downloadBlob"];
  const isSessionExpiredError = ___util_http["isSessionExpiredError"];
  const isBackendUnavailableError = ___util_http["isBackendUnavailableError"];
  /**
   * Orchestrates the Home dashboard. Loading, selection and image/media state
   * is delegated to focused services (PeriodService, MediaService,
   * DashboardRenderer) so the controller stays small and descriptive.
   */
  class Home extends BaseController {
    _dialogs = new Map();
    _persons = [];
    periodService = new PeriodService();
    onInit() {
      void this.initView();
    }
    async initView() {
      const model = await this.ensureServiceModel();
      if (!model) {
        if (!AuthenticationService.isAuthErrorPending()) {
          this.navTo("Login");
        }
        return;
      }
      this._odata = new ODataService(model);
      this._invoiceService = new InvoiceService(this._odata);
      this._mediaService = new MediaService(this._odata, this.getUiModel());
      this._renderer = new DashboardRenderer(this._invoiceService, this.getUiModel(), (key, parameters) => this.getText(key, parameters));
      try {
        await this.refreshPersonSelector();
      } catch (error) {
        if (isSessionExpiredError(error) || isBackendUnavailableError(error)) {
          return;
        }
        this.showBackendError("backendUnavailableLogin");
      }
    }
    onPersonChange() {
      const selectPersons = this.byId("personSelect");
      const id = selectPersons.getSelectedItem()?.getKey?.() || "";
      this.applyPersonSelection(id);
    }
    async onLogout() {
      await AuthenticationService.logout();
      this.navTo("Login");
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
    onOpenExpenseDialog() {
      this.prepareExpenseDialogState();
      void this.openPreparedDialog("AddExpense", dialog => {
        this.bindExpenseSelects();
        Fragment.byId("AddExpense", "expenseCard")?.setSelectedItem(null);
        Fragment.byId("AddExpense", "expenseCategory")?.setSelectedItem(null);
        dialog.open();
      });
    }
    onOpenPersonDialog() {
      const ui = this.getUiModel();
      ui.setProperty("/newPerson", {
        name: "",
        email: "",
        phone: "",
        income: "",
        currency: "BRL",
        target: ""
      });
      void this.openPreparedDialog("AddPerson", dialog => dialog.open());
    }
    onOpenPersonDetailDialog() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        this.showErrorMessage("errorMissingPerson");
        return;
      }
      void this.openPreparedDialog("PersonDetail", dialog => {
        dialog.setModel(this.getView()?.getModel());
        dialog.bindObject(this.personPathFor(personId));
        dialog.open();
      });
    }
    onOpenCardDialog() {
      const ui = this.getUiModel();
      ui.setProperty("/newCard", {
        name: "",
        limit: "",
        currency: "BRL"
      });
      void this.openPreparedDialog("AddCard", dialog => dialog.open());
    }
    onOpenCategoryDialog() {
      const ui = this.getUiModel();
      ui.setProperty("/newCategory", {
        name: ""
      });
      void this.openPreparedDialog("AddCategory", dialog => dialog.open());
    }
    onRestoreBackup() {
      void this.openPreparedDialog("Backup", dialog => dialog.open());
    }
    onCategoryPress(oEvent) {
      const source = oEvent.getSource();
      const bindingContext = source?.getBindingContext("ui");
      const category = bindingContext?.getObject();
      if (!category) {
        return;
      }
      const ui = this.getUiModel();
      const personId = ui.getProperty("/selectedPersonId");
      const period = this.currentPeriod();
      ui.setProperty("/busy", true);
      void getTransactionsByCategory(this.getServiceModel(), personId, category.ID, false, period.year, period.month).then(result => {
        ui.setProperty("/categoryDetail", result);
        return this.openPreparedDialog("CategoryDetail", dialog => dialog.open());
      }).catch(error => this.handleError(error, "errorLoadCategoryDetail")).finally(() => ui.setProperty("/busy", false));
    }
    onOpenSimulationDialog() {
      const ui = this.getUiModel();
      const period = this.currentPeriod();
      if (!ui.getProperty("/simulation")) {
        ui.setProperty("/simulation", {
          month: String(period.month),
          year: String(period.year)
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
      void this.openPreparedDialog("Simulation", dialog => dialog.open());
    }
    async onExportBackup() {
      const ui = this.getUiModel();
      ui.setProperty("/busy", true);
      try {
        const guid = await requestExportBackup();
        const blob = await fetchBackupStream(guid);
        downloadBlob(blob, `meu-fluxo-backup-${new Date().toISOString().slice(0, 10)}.zip`);
        await deleteBackupRow(guid);
        MessageToast.show(this.getText("backupExported"));
      } catch (error) {
        this.handleError(error, "errorExportBackup");
      } finally {
        ui.setProperty("/busy", false);
      }
    }
    refresh() {
      const cardsList = this.byId("cardsListItems");
      const binding = cardsList?.getBinding("items");
      if (binding) {
        binding.refresh();
      }
      void this.loadDashboard();
    }

    /**
     * Reloads persons and refreshes the current dashboard. Used by the
     * create/restore dialogs.
     */
    reload() {
      try {
        this._persons = [];
        this.getServiceModel().refresh();
      } catch {
        // ignore transient refresh errors; setupPersonSelector re-fetches the list.
      }
      void this.refreshPersonSelector();
    }

    // ---------------------------------------------------------------------------
    // Person selector
    // ---------------------------------------------------------------------------

    async refreshPersonSelector() {
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
          ImageType: person.ImageType,
          IsActiveEntity: person.IsActiveEntity
        }));
      } catch (error) {
        if (isSessionExpiredError(error) || isBackendUnavailableError(error)) {
          return;
        }
        this.showBackendError("backendUnavailableLogin");
      }
      this._persons = persons;
      const select = this.byId("personSelect");
      if (persons.length === 0) {
        this.getUiModel().setProperty("/personsEmpty", true);
        this.getUiModel().setProperty("/selectedPersonId", "");
        if (select) {
          select.setSelectedKey("");
        }
        return;
      }
      this.getUiModel().setProperty("/personsEmpty", false);
      const current = this.getSelectedPersonId();
      const currentExists = persons.some(person => person.ID === current);
      this.applyPersonSelection(current && currentExists ? current : persons[0].ID);
    }
    getPersonsFromSource() {
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
      const ui = this.getUiModel();
      this.bindPersonContext(id);
      if (!id) {
        ui.setProperty("/selectedPersonId", "");
        ui.setProperty("/selectedPerson", {});
        ui.setProperty("/selectedPersonImage", "");
        return;
      }
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === id);
      ui.setProperty("/selectedPersonId", id);
      ui.setProperty("/selectedPerson", {
        ID: person?.ID,
        Name: person?.Name,
        Income: person?.Income,
        ExpenseTarget: person?.ExpenseTarget,
        Currency: person?.Currency,
        ImageType: person?.ImageType
      });
      if (person) {
        void this._mediaService?.resolvePersonImage(person);
      }
      this.applyPeriodData();
    }

    /**
     * Binds the person-scoped sections (`personDetails`, `cardsList`) to the
     * selected person context using the derived OData path. The path is built
     * from the stored person metadata instead of the Select's binding context,
     * which may not be hydrated yet during startup.
     *
     * @param {string} id the person id; empty when the selection is cleared
     */
    bindPersonContext(id) {
      const path = this.personPathFor(id);
      this.byId("personDetails")?.bindObject(path);
      this.byId("cardsList")?.bindObject(path);
    }
    personPathFor(id) {
      if (!id) {
        return "";
      }
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === id);
      const isActiveEntity = person?.IsActiveEntity === false ? "false" : "true";
      return `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=${isActiveEntity})`;
    }
    getSelectedPersonId() {
      return this.getUiModel().getProperty("/selectedPersonId") || "";
    }

    // ---------------------------------------------------------------------------
    // Dashboard loading
    // ---------------------------------------------------------------------------

    applyPeriodData() {
      const ui = this.getUiModel();
      const period = this.currentPeriod();
      ui.setProperty("/period", period);
      ui.setProperty("/monthLabel", this.presentPeriodLabel(period));
      void this.loadDashboard();
    }
    navigateMonth(delta) {
      const period = this.currentPeriod();
      this.getUiModel().setProperty("/period", this.periodService.shift(period, delta));
      this.applyPeriodData();
    }
    currentPeriod() {
      return this.periodService.currentOrDefault(this.getUiModel().getProperty("/period"));
    }
    presentPeriodLabel(period) {
      return this.periodService.label(period.year, period.month);
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
        void this._mediaService?.resolveCategoryImages(transactions);
        void renderer.loadTrend(personId, period, expenses);
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
          void this._mediaService?.resolveCardImages(cards);
        }
      } catch (error) {
        if (isSessionExpiredError(error) || isBackendUnavailableError(error)) {
          return;
        }
        this.showBackendError("backendUnavailableLogin");
      } finally {
        ui.setProperty("/busy", false);
      }
    }
    selectedPerson() {
      return this.getUiModel().getProperty("/selectedPerson") || {};
    }

    // ---------------------------------------------------------------------------
    // Fragment dialogs
    // ---------------------------------------------------------------------------

    prepareExpenseDialogState() {
      const ui = this.getUiModel();
      ui.setProperty("/newExpense", {
        description: "",
        amount: "",
        installments: 1,
        fixedExpense: false,
        transactionDate: new Date().toISOString().slice(0, 10)
      });
    }
    bindExpenseSelects() {
      const selectPersons = this.byId("personSelect");
      const selectedPerson = selectPersons.getSelectedItem();
      const contextSelected = selectedPerson?.getBindingContext();
      const personPath = contextSelected?.getPath() || "";
      Fragment.byId("AddExpense", "expenseCard")?.bindObject(personPath);
      Fragment.byId("AddExpense", "expenseCategory")?.bindObject(personPath);
    }
    async openPreparedDialog(fragmentName, onOpen) {
      const dialog = await this.getOrCreateDialog(fragmentName);
      onOpen(dialog);
    }
    getOrCreateDialog(fragmentName) {
      const cached = this._dialogs.get(fragmentName);
      if (cached) {
        return cached;
      }
      const fragment = Fragment.load({
        id: fragmentName,
        name: `apps.dflc.expensemanager.view.fragments.${fragmentName}`
      }).then(dialog => {
        this.getView().addDependent(dialog);
        return dialog;
      });
      this._dialogs.set(fragmentName, fragment);
      return fragment;
    }
  }
  return Home;
});
//# sourceMappingURL=Home-dbg.controller.js.map

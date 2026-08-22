sap.ui.define(["sap/m/MessageToast", "sap/ui/core/Fragment", "sap/m/MessageBox", "./BaseController", "../auth/AuthenticationService", "../service/ODataService", "../service/InvoiceService", "../service/PeriodService", "../service/MediaService", "../service/DashboardRenderer", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../util/expenseApi", "../util/http", "../util/feedback"], function (MessageToast, Fragment, MessageBox, ___BaseController, ___auth_AuthenticationService, ___service_ODataService, ___service_InvoiceService, ___service_PeriodService, ___service_MediaService, ___service_DashboardRenderer, Filter, FilterOperator, ___util_expenseApi, ___util_http, ___util_feedback) {
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
  const isSessionExpiredError = ___util_http["isSessionExpiredError"];
  const isBackendUnavailableError = ___util_http["isBackendUnavailableError"];
  const getBackendErrorMessage = ___util_feedback["getBackendErrorMessage"];
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
      const period = this.currentPeriod();
      if (!this._invoiceService) {
        return;
      }
      const ui = this.getUiModel();
      ui.setProperty("/busy", true);
      try {
        const result = await this._invoiceService.sendInvoices(period);
        if (result.success) {
          MessageToast.show(result.data || this.getText("sendInvoicesSuccess"));
        } else {
          MessageBox.error(result.data || this.getText("sendInvoicesNoData"));
        }
      } catch (error) {
        if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
          const detail = getBackendErrorMessage(error);
          MessageBox.error(detail ? `${this.getText("sendInvoicesError")}\n\n${detail}` : this.getText("sendInvoicesError"));
        }
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Filters the local (JSON) transaction list by date or description. The
     * search text is matched against `SearchText` (description + formatted
     * date) assembled by the DashboardRenderer, so a query such as "mercado"
     * or "15/08" finds the matching rows client-side.
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
      return this.openPersonDetailDialog();
    }

    /**
     * Publishes the open draft of the currently selected person after a
     * confirmation (the "Efetivar salvamento" action in the draft banner), then
     * reloads the dashboard. Pending edits are flushed first so every two-way
     * bound change reaches the draft before it is activated.
     */
    onSavePersonDraft() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        return;
      }
      MessageBox.confirm(this.getText("personSaveDraftConfirm"), {
        title: this.getText("personSaveDraftTitle"),
        onClose: action => {
          if (action !== MessageBox.Action.OK || !this._odata) {
            return;
          }
          void this.saveSelectedPersonDraft();
        }
      });
    }
    async saveSelectedPersonDraft() {
      const ui = this.getUiModel();
      const personId = this.getSelectedPersonId();
      if (!personId || !this._odata) {
        return;
      }
      ui.setProperty("/busy", true);
      try {
        this.releasePersonDetailDraftBinding();
        await this._odata.submitPending();
        await this._odata.prepareDraft("Persons", personId);
        await this._odata.activateDraft("Persons", personId);
        ui.setProperty("/selectedPersonDraft", false);
        MessageToast.show(this.getText("personDraftSaved"));
        this.reload();
      } catch (error) {
        if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
          const detail = getBackendErrorMessage(error);
          MessageBox.error(detail ? `${this.getText("errorSavePersonDraft")}\n\n${detail}` : this.getText("errorSavePersonDraft"));
        }
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Discards the open draft of the currently selected person after a
     * confirmation, then reloads the dashboard. The edit dialog (when bound to
     * that person) is released first so the model refresh does not re-read the
     * just-deleted draft and fail with a 404.
     */
    onDiscardPersonDraft() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        return;
      }
      MessageBox.confirm(this.getText("personDraftDiscardConfirm"), {
        title: this.getText("personDraftDiscardTitle"),
        onClose: action => {
          if (action !== MessageBox.Action.OK || !this._odata) {
            return;
          }
          void this.discardSelectedPersonDraft();
        }
      });
    }
    async discardSelectedPersonDraft() {
      const ui = this.getUiModel();
      const personId = this.getSelectedPersonId();
      if (!personId || !this._odata) {
        return;
      }
      ui.setProperty("/busy", true);
      try {
        this.releasePersonDetailDraftBinding();
        await this._odata.discardDraft("Persons", personId);
        ui.setProperty("/selectedPersonDraft", false);
        MessageToast.show(this.getText("personDraftDiscarded"));
        this.reload();
      } catch (error) {
        if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
          this.showErrorMessage("errorDiscardPersonDraft");
        }
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Permanently deletes the currently selected person after a confirmation.
     * Any open draft is discarded automatically (the active row cannot be
     * deleted while a draft exists), then the selection is cleared and the
     * dashboard reloaded.
     */
    onDeletePerson() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        return;
      }
      MessageBox.confirm(this.getText("personDeleteConfirm"), {
        title: this.getText("personDeleteTitle"),
        onClose: action => {
          if (action !== MessageBox.Action.OK || !this._odata) {
            return;
          }
          void this.deleteSelectedPerson();
        }
      });
    }
    async deleteSelectedPerson() {
      const ui = this.getUiModel();
      const personId = this.getSelectedPersonId();
      if (!personId || !this._odata) {
        return;
      }
      ui.setProperty("/busy", true);
      try {
        this.releasePersonDetailDraftBinding();
        await this._odata.submitPending();
        await this._odata.deleteEntity("Persons", personId);
        ui.setProperty("/selectedPersonId", "");
        ui.setProperty("/selectedPersonDraft", false);
        MessageToast.show(this.getText("personDeleted"));
        this.reload();
      } catch (error) {
        if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
          this.showErrorMessage("errorDeletePerson");
        }
      } finally {
        ui.setProperty("/busy", false);
      }
    }
    onOpenCardManagerDialog() {
      void this.openDraftManagerDialog("Cards", "cardsOpenError", undefined, {
        readOnlyOpen: true
      });
    }
    onOpenCategoryManagerDialog() {
      void this.openDraftManagerDialog("Categories", "categoriesOpenError", undefined, {
        readOnlyOpen: true
      });
    }
    onOpenInvoicesDialog() {
      void this.openInvoicesDialog();
    }

    /**
     * Opens the Liabilities management dialog for the selected person. Because
     * Liabilities/LiabilityTransactions are compositions of the selected person, the
     * dialog is bound to the person's (draft) OData context, so every change
     * made there is contained in the same person draft as the rest of the
     * entity tree. Saving activates that draft; discarding drops it.
     */
    /**
     * Opens the Liabilities management dialog in read-only mode: the dialog is
     * bound to the active entity, so nothing is created until the user clicks
     * edit/add inside it, which switches the dialog to the person draft.
     */
    onOpenLiabilitiesDialog() {
      this.getUiModel().setProperty("/liabilityEditId", "");
      void this.openDraftManagerDialog("Liabilities", "liabilitiesOpenError", undefined, {
        readOnlyOpen: true
      });
    }

    /**
     * Opens the Liabilities management dialog in read-only mode. The dialog
     * stays read-only: the person draft is only created when the user clicks
     * edit or add inside it (see `enterDialogDraftMode`).
     *
     * @param {Event} oEvent the press event of the row's edit button
     */
    onOpenLiabilityEdit(oEvent) {
      const source = oEvent.getSource();
      const liability = source?.getBindingContext()?.getObject();
      if (!liability?.ID) {
        return;
      }
      void this.openDraftManagerDialog("Liabilities", "liabilitiesOpenError", undefined, {
        readOnlyOpen: true
      });
    }

    /**
     * Opens the movements dialog of the debt whose action button was pressed.
     *
     * @param {Event} oEvent the press event of the row's movements button
     */
    onOpenLiabilityTransactions(oEvent) {
      const source = oEvent.getSource();
      const liability = source?.getBindingContext()?.getObject();
      if (!liability?.ID) {
        return;
      }
      void this.openLiabilityTransactions(liability.ID).catch(error => this.handleError(error, "liabilityTransactionsOpenError"));
    }

    /**
     * Opens the movements dialog of the given liability in read-only mode: the
     * dialog is bound to the liability under the active entity, so no draft is
     * created until the user clicks add/edit/remove inside it, which switches
     * the dialog to the person draft (see `enterDialogDraftMode`).
     *
     * @param {string} liabilityId the ID of the liability whose movements are shown
     * @returns {Promise<void>} resolves once the dialog is open
     */
    async openLiabilityTransactions(liabilityId) {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        this.showErrorMessage("errorMissingPerson");
        return;
      }
      const ui = this.getUiModel();
      ui.setProperty("/busy", true);
      try {
        const basePath = this.currentPersonPathFor(personId);
        const path = `${basePath}/Liabilities(ID='${encodeURIComponent(liabilityId)}')`;
        await this.openPreparedDialog("LiabilityTransactions", dialog => {
          dialog.setModel(this.getServiceModel());
          dialog.unbindObject();
          dialog.bindObject(path);
          dialog.open();
        });
      } catch (error) {
        this.handleError(error, "liabilityTransactionsOpenError");
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Opens the invoice management dialog. The dialog is read-only for the
     * invoice data itself; the per-transaction actions (recategorization and
     * batch exclusion) are opened on top of it through the manager methods below.
     */
    async openInvoicesDialog() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        this.showErrorMessage("errorMissingPerson");
        return;
      }
      try {
        await this.openPreparedDialog("Invoices", dialog => dialog.open());
      } catch (error) {
        this.handleError(error, "invoicesOpenError");
      }
    }

    /**
     * Opens the category-picker dialog for the transaction whose Identifier is
     * stored in `ui>/transactionCategory/selectedIdentifier`.
     */
    openTransactionCategoryDialog() {
      void this.openPreparedDialog("TransactionCategory", dialog => dialog.open()).catch(error => this.handleError(error, "invoicesOpenError"));
    }

    /**
     * Opens the batch-exclusion dialog for the transaction whose Identifier is
     * stored in `ui>/deleteTransactions/selectedIdentifier`.
     */
    openDeleteTransactionsDialog() {
      void this.openPreparedDialog("DeleteTransactions", dialog => dialog.open()).catch(error => this.handleError(error, "invoicesOpenError"));
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
      this.openTransactionCategoryDialog();
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
      this.openDeleteTransactionsDialog();
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
     * create/restore/person-edit dialogs.
     *
     * The OData model is NOT refreshed globally on purpose: after a draft is
     * saved or discarded, the person-scoped bindings (`personDetails`,
     * `cardsList`, `metricsGrid`) may still point at the draft path and a full
     * `model.refresh()` would re-read the now deleted draft and fail with a
     * 404. Instead the select list is refreshed and `refreshPersonSelector`
     * re-binds those sections to the correct (active/draft) path.
     */
    reload() {
      this._persons = [];
      const select = this.byId("personSelect");
      try {
        select?.getBinding("items")?.refresh();
      } catch {
        // ignore transient refresh errors; refreshPersonSelector re-fetches the list.
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

        // Find persons that have an open draft (unsaved changes). The regular
        // list only returns the active row for those, so their IDs must be
        // collected from the draft entities.
        let openDraftIds = [];
        try {
          openDraftIds = await this._odata.listDraftIds("Persons");
        } catch {
          // best effort; the draft indicator just stays off
        }
        persons = result.filter(person => !!person.ID).map(person => {
          const hasDraft = person.IsActiveEntity === false || openDraftIds.includes(person.ID);
          return {
            ID: person.ID,
            Name: person.Name + (hasDraft ? " (rascunho)" : ""),
            Income: person.Income,
            ExpenseTarget: person.ExpenseTarget,
            Currency: person.Currency,
            ImageType: person.ImageType,
            IsActiveEntity: person.IsActiveEntity,
            hasDraft
          };
        });
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
        this.getUiModel().setProperty("/selectedPersonDraft", false);
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
        ui.setProperty("/selectedPersonDraft", false);
        return;
      }
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === id);
      ui.setProperty("/selectedPersonId", id);
      ui.setProperty("/selectedPersonDraft", person?.hasDraft === true);
      ui.setProperty("/selectedPerson", {
        ID: person?.ID,
        Name: person?.Name,
        Income: person?.Income,
        ExpenseTarget: person?.ExpenseTarget,
        Currency: person?.Currency?.code,
        ImageType: person?.ImageType
      });
      if (person) {
        void this._mediaService?.resolvePersonImage(person, person?.hasDraft === true);
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
      this.byId("personDetails")?.setModel(this.getView()?.getModel());
      this.byId("personDetails")?.bindObject(path);
      this.byId("cardsList")?.bindObject(path);
      this.byId("metricsGrid")?.bindObject(path);
      this.byId("liabilitiesList")?.bindObject(path);
    }
    personPathFor(id) {
      if (!id) {
        return "";
      }
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === id);
      const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;
      return `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=${isDraft ? "false" : "true"})`;
    }

    /**
     * Builds the OData path of the active (published) entity of the given
     * person, used by the read-only bindings of the liability dialogs.
     *
     * @param {string} id the person id
     * @returns {string} the active entity path
     */
    activePersonPathFor(id) {
      return `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=true)`;
    }

    /**
     * Whether an editable draft currently exists for the person. Mirrors the
     * checks of `ensurePersonDraft` without creating anything.
     *
     * @param {string} personId the person to check
     * @returns {boolean} whether a draft is open
     */
    isPersonDraftOpen(personId) {
      if (this.getUiModel().getProperty("/selectedPersonDraft") === true) {
        return true;
      }
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === personId);
      return person?.IsActiveEntity === false || person?.hasDraft === true;
    }

    /**
     * Absolute path of the person in its CURRENT state: the draft when one is
     * open, the active entity otherwise. Read-only dialogs bind through this
     * so entities created inside an unsaved draft stay reachable, mirroring
     * how the home screen reads person-scoped data (`preferDraft`).
     *
     * @param {string} id the person ID
     * @returns {string} the absolute OData path of the person
     */
    currentPersonPathFor(id) {
      if (this.isPersonDraftOpen(id)) {
        return this._odata?.draftPath("Persons", id) ?? this.activePersonPathFor(id);
      }
      return this.activePersonPathFor(id);
    }

    /**
     * Ensures an editable draft of the selected person exists and keeps the
     * `/selectedPersonDraft` flag in sync with reality.
     *
     * The flag is the source of truth here: the person metadata cached in
     * `_persons` may be stale (e.g. the Liabilities dialog already opened a
     * draft after the list was loaded), and calling draftEdit again while a
     * draft is open makes the backend answer "a draft for this entity already
     * exists", which the open dialog would surface as an error message.
     *
     * @param {string} personId the person whose draft is ensured
     * @returns {Promise<boolean>} whether a draft is available
     */
    async ensurePersonDraft(personId) {
      const ui = this.getUiModel();
      if (ui.getProperty("/selectedPersonDraft") === true) {
        return true;
      }
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === personId);
      const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;
      if (isDraft) {
        ui.setProperty("/selectedPersonDraft", true);
        return true;
      }
      if (this._odata) {
        await this._odata.enableDraftEdit("Persons", personId);
      }
      ui.setProperty("/selectedPersonDraft", true);
      return true;
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
        const preferDraft = ui.getProperty("/selectedPersonDraft") === true;
        void this._mediaService?.resolveCategoryImages(transactions, preferDraft);
        void renderer.loadTrend(personId, period, expenses);

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

    /**
     * Opens the PersonDetail edit dialog for the selected person. Editing the
     * active entity opens a draft first and binds the dialog to it, so the
     * two-way bound fields PATCH the draft instead of the (read-only) active
     * entity. Editing a person that already has a draft continues on that draft.
     */
    async openPersonDetailDialog() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        this.showErrorMessage("errorMissingPerson");
        return;
      }
      const ui = this.getUiModel();
      ui.setProperty("/busy", true);
      try {
        await this.ensurePersonDraft(personId);

        // Show the draft's own photo (when it has one), falling back to the
        // active entity image otherwise.
        const person = this.getPersonsFromSource().find(candidate => candidate.ID === personId);
        if (this._mediaService && person) {
          void this._mediaService.resolvePersonImage(person, true);
        }
        const path = this._odata?.draftPath("Persons", personId) ?? "";
        await this.openPreparedDialog("PersonDetail", dialog => {
          dialog.setModel(this.getServiceModel());
          dialog.unbindObject();
          dialog.bindObject(path);
          dialog.open();
        });
      } catch (error) {
        this.handleError(error, "errorUpdatePerson");
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Opens the Shares management dialog in read-only mode: the dialog is
     * bound to the person's CURRENT state (the draft when one is open,
     * otherwise the active entity) and no draft is created until the user
     * adds/edits/removes inside it, which switches the dialog to the person
     * draft binding (see `enterDialogDraftMode`). Shares/Entities are
     * compositions of the selected person, so every change made there is
     * contained in the same person draft as the rest of the entity tree.
     */
    async onOpenSharesDialog() {
      await this.openDraftManagerDialog("Shares", "sharesOpenError", undefined, {
        readOnlyOpen: true
      });
    }

    /**
     * Opens the Cards, Categories or Liabilities management dialog for the
     * selected person. By default the dialog is bound to the person's draft
     * (created when none is open), so every change made there is contained in
     * the same person draft as the rest of the entity tree; saving activates
     * that draft and discarding drops it.
     *
     * With `options.readOnlyOpen` the dialog opens bound to the person's
     * CURRENT state (the draft when one is open, otherwise the active entity)
     * and no draft is created: mutating actions inside the dialog must then
     * call `enterDialogDraftMode` to switch to the draft binding.
     *
     * @param {string} fragmentName the dialog fragment to open
     * @param {string} errorKey i18n key shown when the dialog cannot be opened
     * @param {Function} [onOpened] callback invoked after the dialog is bound
     * and opened (e.g. to expand a specific row into edit mode)
     * @param {{ readOnlyOpen?: boolean }} [options] read-only open behavior
     * @returns {Promise<void>} resolves once the dialog is open
     */
    async openDraftManagerDialog(fragmentName, errorKey, onOpened, options) {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        this.showErrorMessage("errorMissingPerson");
        return;
      }
      const ui = this.getUiModel();
      ui.setProperty("/busy", true);
      try {
        let path;
        if (options?.readOnlyOpen) {
          path = this.currentPersonPathFor(personId);
        } else {
          await this.ensurePersonDraft(personId);
          path = this._odata?.draftPath("Persons", personId) ?? "";
        }
        await this.openPreparedDialog(fragmentName, dialog => {
          dialog.setModel(this.getServiceModel());
          dialog.unbindObject();
          dialog.bindObject(path);
          dialog.open();
          onOpened?.(dialog);
        });
      } catch (error) {
        this.handleError(error, errorKey);
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Switches a manager dialog (Liabilities, LiabilityTransactions and later
     * Cards/Categories/Shares) from its read-only binding (active entity) to
     * the person draft binding, creating the draft first when none is open.
     * Idempotent: when the dialog already points at the draft, only the ui
     * flag is refreshed.
     *
     * @param {Dialog} dialog the manager dialog to switch
     * @param {string} [subPath] optional composition path appended to the
     * draft root (e.g. "/Liabilities(ID='x')" for the movements dialog)
     * @returns {Promise<void>} resolves once the dialog is bound to the draft
     */
    async enterDialogDraftMode(dialog, subPath) {
      const personId = this.getSelectedPersonId();
      const ui = this.getUiModel();
      if (!personId || !this._odata) {
        this.showErrorMessage("errorMissingPerson");
        throw new Error("missing person");
      }
      const draftBase = this._odata.draftPath("Persons", personId);
      if ((dialog.getBindingContext()?.getPath() ?? "").startsWith(draftBase)) {
        ui.setProperty("/managerDialogInDraft", true);
        return;
      }
      ui.setProperty("/busy", true);
      try {
        await this.ensurePersonDraft(personId);
        const path = `${draftBase}${subPath ?? ""}`;
        dialog.setModel(this.getServiceModel());
        dialog.unbindObject();
        dialog.bindObject(path);
        ui.setProperty("/managerDialogInDraft", true);

        // Wait until the draft context is actually loaded: returning
        // earlier let actions run against bindings still switching from
        // the active entity, so the first add/edit could fail.
        await this.waitForDialogDraftContext(dialog, draftBase);
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Waits until the dialog's binding context points at the given draft root
     * and its data has been read. `bindObject` resolves asynchronously and
     * every dependent list binding only switches to the draft after this
     * context arrives, so mutating actions must not proceed before it.
     *
     * @param {Dialog} dialog the manager dialog
     * @param {string} draftBase absolute path of the person draft root
     * @returns {Promise<void>} resolves once the draft context is loaded
     * @throws {Error} when the draft context does not arrive in time
     */
    async waitForDialogDraftContext(dialog, draftBase) {
      const deadline = Date.now() + 15000;
      for (;;) {
        const context = dialog.getBindingContext();
        const path = context?.getPath() ?? "";
        if (path.startsWith(draftBase) && !!context?.getObject()) {
          return;
        }
        if (Date.now() > deadline) {
          throw new Error("draft context timeout");
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    /**
     * Rebinds a manager dialog back to the read-only active entity binding.
     * Called after another dialog saved or discarded the shared person draft:
     * that action publishes/drops the draft the dialog was bound to, so the
     * dialog returns to its read-only mode until the user edits again.
     *
     * @param {string} fragmentName cache key of the dialog to rebind
     * @param {{ editIdPaths?: string[] }} [options] ui model paths of row-edit
     * flags that must be cleared (e.g. ["/liabilityEditId"])
     * @returns {Promise<void>} resolves once the dialog is rebound
     */
    async resetManagerDialogToActive(fragmentName, options) {
      const personId = this.getSelectedPersonId();
      const cached = this._dialogs.get(fragmentName);
      if (!personId || !cached) {
        return;
      }
      const dialog = await cached;
      if (!dialog.isOpen()) {
        return;
      }
      try {
        dialog.setModel(this.getServiceModel());
        dialog.unbindObject();
        dialog.bindObject(this.activePersonPathFor(personId));
        const ui = this.getUiModel();
        (options?.editIdPaths ?? []).forEach(editIdPath => ui.setProperty(editIdPath, ""));
        ui.setProperty("/managerDialogInDraft", false);
      } catch {
        // best effort; reload() re-syncs the person-scoped sections anyway
      }
    }

    /**
     * Detaches the PersonDetail dialog from its OData draft binding, if present,
     * so a model refresh does not re-read a draft that is about to be discarded.
     */
    releasePersonDetailDraftBinding() {
      const cached = this._dialogs.get("PersonDetail");
      if (!cached) {
        return;
      }
      void cached.then(dialog => {
        try {
          dialog.unbindObject();
        } catch {
          // best effort; the binding cleanup must not break the discard flow
        }
      });
    }
  }
  return Home;
});
//# sourceMappingURL=Home-dbg.controller.js.map

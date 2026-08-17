sap.ui.define(["sap/m/MessageToast", "sap/ui/core/Fragment", "sap/m/MessageBox", "./BaseController", "../auth/AuthenticationService", "../service/ODataService", "../service/InvoiceService", "../service/PeriodService", "../service/MediaService", "../service/DashboardRenderer", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../util/expenseApi", "../util/backupApi", "../util/http", "../util/feedback"], function (MessageToast, Fragment, MessageBox, ___BaseController, ___auth_AuthenticationService, ___service_ODataService, ___service_InvoiceService, ___service_PeriodService, ___service_MediaService, ___service_DashboardRenderer, Filter, FilterOperator, ___util_expenseApi, ___util_backupApi, ___util_http, ___util_feedback) {
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
    onOpenCardManagerDialog() {
      void this.openDraftManagerDialog("Cards", "cardsOpenError");
    }
    onOpenCategoryManagerDialog() {
      void this.openDraftManagerDialog("Categories", "categoriesOpenError");
    }
    onOpenInvoicesDialog() {
      void this.openInvoicesDialog();
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
     * stored in `ui>/invoiceSelectedIdentifier`.
     */
    openTransactionCategoryDialog() {
      void this.openPreparedDialog("TransactionCategory", dialog => dialog.open()).catch(error => this.handleError(error, "invoicesOpenError"));
    }

    /**
     * Opens the batch-exclusion dialog for the transaction whose Identifier is
     * stored in `ui>/invoiceSelectedIdentifier`.
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
      ui.setProperty("/invoiceSelectedIdentifier", transaction.Identifier);
      ui.setProperty("/invoiceCurrentCategoryId", transaction.Category?.ID || "");
      ui.setProperty("/invoiceCurrentCategoryName", transaction.Category?.Name || "");
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
      this.getUiModel().setProperty("/invoiceSelectedIdentifier", transaction.Identifier);
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
    }
    personPathFor(id) {
      if (!id) {
        return "";
      }
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === id);
      const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;
      return `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=${isDraft ? "false" : "true"})`;
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
        const person = this.getPersonsFromSource().find(candidate => candidate.ID === personId);
        const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;
        if (this._odata && !isDraft) {
          await this._odata.enableDraftEdit("Persons", personId);
        }

        // Show the draft's own photo (when it has one), falling back to the
        // active entity image otherwise.
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
     * Opens the Shares management dialog for the selected person. Because
     * Shares/Entities are compositions of the selected person, the dialog is
     * bound to the person's (draft) OData context, so every change made there is
     * contained in the same person draft as the rest of the entity tree. Saving
     * activates that draft; discarding drops it.
     */
    async onOpenSharesDialog() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        this.showErrorMessage("errorMissingPerson");
        return;
      }
      const ui = this.getUiModel();
      ui.setProperty("/busy", true);
      try {
        const person = this.getPersonsFromSource().find(candidate => candidate.ID === personId);
        const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;
        if (this._odata && !isDraft) {
          await this._odata.enableDraftEdit("Persons", personId);
        }
        const path = this._odata?.draftPath("Persons", personId) ?? "";
        await this.openPreparedDialog("Shares", dialog => {
          dialog.setModel(this.getServiceModel());
          dialog.unbindObject();
          dialog.bindObject(path);
          dialog.open();
        });
      } catch (error) {
        this.handleError(error, "sharesOpenError");
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Opens the Cards or Categories management dialog for the selected person.
     * Because Cards/Categories are compositions of the selected person, the
     * dialog is bound to the person's (draft) OData context, so every change
     * made there is contained in the same person draft as the rest of the entity
     * tree. Saving activates that draft; discarding drops it.
     *
     * @param {string} fragmentName the dialog fragment to open
     * @param {string} errorKey i18n key shown when the dialog cannot be opened
     * @returns {Promise<void>} resolves once the dialog is open
     */
    async openDraftManagerDialog(fragmentName, errorKey) {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        this.showErrorMessage("errorMissingPerson");
        return;
      }
      const ui = this.getUiModel();
      ui.setProperty("/busy", true);
      try {
        const person = this.getPersonsFromSource().find(candidate => candidate.ID === personId);
        const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;
        if (this._odata && !isDraft) {
          await this._odata.enableDraftEdit("Persons", personId);
        }
        const path = this._odata?.draftPath("Persons", personId) ?? "";
        await this.openPreparedDialog(fragmentName, dialog => {
          dialog.setModel(this.getServiceModel());
          dialog.unbindObject();
          dialog.bindObject(path);
          dialog.open();
        });
      } catch (error) {
        this.handleError(error, errorKey);
      } finally {
        ui.setProperty("/busy", false);
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

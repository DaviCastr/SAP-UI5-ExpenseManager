sap.ui.define(["sap/m/MessageToast", "sap/ui/core/Fragment", "sap/m/MessageBox", "./BaseController", "../auth/AuthenticationService", "../service/ODataService", "sap/ui/core/format/DateFormat", "sap/base/strings/formatMessage", "sap/m/library", "sap/ui/core/library", "../util/choiceDialog", "../service/PeriodService", "../service/MediaService", "../util/http", "../util/theme", "../util/feedback", "../util/personEvents"], function (MessageToast, Fragment, MessageBox, ___BaseController, ___auth_AuthenticationService, ___service_ODataService, DateFormat, formatMessage, sap_m_library, sap_ui_core_library, ___util_choiceDialog, ___service_PeriodService, ___service_MediaService, ___util_http, ___util_theme, ___util_feedback, ___util_personEvents) {
  "use strict";

  const BaseController = ___BaseController["BaseController"];
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const ODataService = ___service_ODataService["ODataService"];
  const DRAFT_FILTER = ___service_ODataService["DRAFT_FILTER"];
  const DRAFT_EXPAND = ___service_ODataService["DRAFT_EXPAND"];
  const DraftEditCancelledError = ___service_ODataService["DraftEditCancelledError"];
  const DraftLockedError = ___service_ODataService["DraftLockedError"];
  const ButtonType = sap_m_library["ButtonType"];
  const ValueState = sap_ui_core_library["ValueState"];
  const chooseAction = ___util_choiceDialog["chooseAction"];
  const PeriodService = ___service_PeriodService["PeriodService"];
  const MediaService = ___service_MediaService["MediaService"];
  const isSessionExpiredError = ___util_http["isSessionExpiredError"];
  const isBackendUnavailableError = ___util_http["isBackendUnavailableError"];
  const applyThemePreference = ___util_theme["applyThemePreference"];
  const applyStoredTheme = ___util_theme["ensureThemeApplied"];
  const isDarkTheme = ___util_theme["isDarkTheme"];
  const getBackendErrorMessage = ___util_feedback["getBackendErrorMessage"];
  const PERSON_CHANNEL = ___util_personEvents["PERSON_CHANNEL"];
  const PERSON_DRAFT_CLOSING = ___util_personEvents["PERSON_DRAFT_CLOSING"];
  const PERSON_SELECTED = ___util_personEvents["PERSON_SELECTED"];
  /**
   * Orchestrates the Home dashboard. Loading, selection and image/media state
   * is delegated to focused services (PeriodService, MediaService,
   * DashboardRenderer) so the controller stays small and descriptive.
   */
  class Home extends BaseController {
    _dialogs = new Map();
    _persons = [];
    _currentPersonId = "";
    _draftsHandled = new Set();
    periodService = new PeriodService();
    onInit() {
      this.getOwnerComponent().setWorkspace(this);
      this.getRouter().attachRouteMatched(event => {
        const route = event.getParameter("name");
        if (route && route !== "Login") {
          this.getUiModel().setProperty("/tab", route);
          if (this.isServiceOutdated()) {
            void this.initView();
          }
        }
      });
      this.applyShareOptionTexts();
      this.syncThemeState();
      void this.initView();
    }
    applyShareOptionTexts() {
      const ui = this.getUiModel();
      ui.setProperty("/entityOptions", [{
        key: "1",
        text: this.getText("sharesEntityPersons")
      }, {
        key: "2",
        text: this.getText("sharesEntityShares")
      }, {
        key: "3",
        text: this.getText("sharesEntityEntities")
      }, {
        key: "4",
        text: this.getText("sharesEntityCategories")
      }, {
        key: "5",
        text: this.getText("sharesEntityCards")
      }, {
        key: "6",
        text: this.getText("sharesEntityInvoices")
      }, {
        key: "7",
        text: this.getText("sharesEntityTransactions")
      }, {
        key: "8",
        text: this.getText("sharesEntityBackups")
      }, {
        key: "9",
        text: this.getText("sharesEntityLiabilities")
      }, {
        key: "10",
        text: this.getText("sharesEntityLiabilityTx")
      }]);
      ui.setProperty("/permissionOptions", [{
        key: "1",
        text: this.getText("sharesActionView")
      }, {
        key: "2",
        text: this.getText("sharesActionCreate")
      }, {
        key: "3",
        text: this.getText("sharesActionEdit")
      }, {
        key: "4",
        text: this.getText("sharesActionDelete")
      }]);
    }
    onTabSelect(event) {
      this.navTo(event.getParameter("key") ?? "Home");
    }
    onToggleTheme() {
      applyThemePreference(!isDarkTheme());
      this.syncThemeToggle();
    }
    syncThemeState() {
      applyStoredTheme();
      this.syncThemeToggle();
    }
    syncThemeToggle() {
      const isDark = isDarkTheme();
      const button = this.byId("themeToggle");
      if (!button) {
        return;
      }
      button.setIcon(isDark ? "sap-icon://dark-mode" : "sap-icon://light-mode");
      button.setTooltip(this.getText(isDark ? "themeLightTooltip" : "themeDarkTooltip"));
    }

    /**
     * Whether the workspace still has to load (or reload) its data: the Home
     * view may be created before the login (the app starts on its route and
     * is redirected), so it initializes again once a session model exists.
     *
     * @returns {boolean} whether the service model changed since the last load
     */
    isServiceOutdated() {
      return !this._odata || this._serviceModelRef !== this.getOwnerComponent()?.getModel();
    }
    initView() {
      this._initializing ??= this.loadWorkspace().finally(() => {
        this._initializing = undefined;
      });
      return this._initializing;
    }
    async loadWorkspace() {
      try {
        const model = await this.ensureServiceModel();
        if (!model) {
          if (!AuthenticationService.isAuthErrorPending()) {
            this.navTo("Login");
          }
          return;
        }
        if (!this._odata || this._serviceModelRef !== model) {
          this._odata = new ODataService(model);
          this._mediaService = new MediaService(this._odata, this.getUiModel());
          this._serviceModelRef = model;
        }
        await this.refreshPersonSelector();
      } catch (error) {
        this.handleLoadError(error, "backendUnavailableLogin");
      }
    }
    onPersonChange() {
      const selectPersons = this.byId("personSelect");
      const id = selectPersons.getSelectedItem()?.getKey?.() || "";
      const previousId = this._currentPersonId;
      if (previousId && previousId !== id && this.getUiModel().getProperty("/selectedPersonDraft") === true) {
        selectPersons.setSelectedKey(previousId);
        this.confirmLeaveDraft(previousId, () => {
          this.getUiModel().setProperty("/selectedPersonId", id);
          this.reload();
        });
        return;
      }
      this.applyPersonSelection(id);
    }
    onLogout() {
      if (this._currentPersonId && this.getUiModel().getProperty("/selectedPersonDraft") === true) {
        this.confirmLeaveDraft(this._currentPersonId, () => void this.logout());
        return;
      }
      void this.logout();
    }
    async logout() {
      try {
        await AuthenticationService.logout();
      } catch (error) {
        console.error("[logout]", error);
      }
      // Recarrega a página na tela de login para descartar todo o estado em
      // memória da conta anterior: model OData (com o token antigo no header
      // e o cache), model "ui", abas e dialogs. Sem isso, outra conta entrava
      // vendo os dados da anterior. Sem a query string, um "?code=" do OAuth
      // não é reprocessado.
      window.location.replace(`${window.location.pathname}#/login`);
    }
    onOpenExpenseDialog() {
      this.prepareExpenseDialogState();
      void this.openPreparedDialog("AddExpense", dialog => {
        this.bindExpenseSelects();
        Fragment.byId("AddExpense", "expenseCard")?.setSelectedItem(null);
        Fragment.byId("AddExpense", "expenseCategory")?.setSelectedItem(null);
        dialog.open();
      }).catch(error => this.handleError(error, "dialogOpenError"));
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
      void this.openPreparedDialog("AddPerson", dialog => dialog.open()).catch(error => this.handleError(error, "dialogOpenError"));
    }
    onOpenPersonDetailDialog() {
      return this.openPersonDetailDialog();
    }

    /**
     * Publishes the open draft of the currently selected person (footer
     * "Salvar alterações"), then reloads the dashboard.
     */
    onSavePersonDraft() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        return;
      }
      void this.publishPersonDraft(personId).then(saved => {
        if (saved) {
          this.reload();
        }
      });
    }

    /**
     * Discards the open draft of the currently selected person after a
     * confirmation, then reloads the dashboard.
     */
    onDiscardPersonDraft() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        return;
      }
      MessageBox.confirm(this.getText("personDraftDiscardConfirm"), {
        title: this.getText("personDraftDiscardTitle"),
        onClose: action => {
          if (action !== MessageBox.Action.OK) {
            return;
          }
          void this.discardPersonDraft(personId).then(discarded => {
            if (discarded) {
              this.reload();
            }
          });
        }
      });
    }

    /**
     * Publishes the draft of the given person. Pending edits are flushed first
     * so every two-way bound change reaches the draft before it is activated.
     * The edit dialog is released first so the following refresh does not
     * re-read the published draft and fail with a 404.
     *
     * @param {string} personId the person whose draft is published
     * @returns {Promise<boolean>} whether the draft was saved
     */
    async publishPersonDraft(personId) {
      const ui = this.getUiModel();
      if (!this._odata) {
        return false;
      }
      ui.setProperty("/busy", true);
      this.announceDraftClosing();
      try {
        this.releasePersonDetailDraftBinding();
        await this._odata.publishPersonDraft(personId);
        ui.setProperty("/selectedPersonDraft", false);
        MessageToast.show(this.getText("personDraftSaved"));
        return true;
      } catch (error) {
        this.announcePersonSelected();
        if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
          const detail = getBackendErrorMessage(error);
          MessageBox.error(detail ? `${this.getText("errorSavePersonDraft")}\n\n${detail}` : this.getText("errorSavePersonDraft"));
        }
        return false;
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Discards the draft of the given person without touching its active data.
     *
     * @param {string} personId the person whose draft is discarded
     * @returns {Promise<boolean>} whether the draft was discarded
     */
    async discardPersonDraft(personId) {
      const ui = this.getUiModel();
      if (!this._odata) {
        return false;
      }
      ui.setProperty("/busy", true);
      this.announceDraftClosing();
      try {
        this.releasePersonDetailDraftBinding();
        await this._odata.discardDraft("Persons", personId);
        ui.setProperty("/selectedPersonDraft", false);
        MessageToast.show(this.getText("personDraftDiscarded"));
        return true;
      } catch (error) {
        this.announcePersonSelected();
        if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
          this.showErrorMessage("errorDiscardPersonDraft");
        }
        return false;
      } finally {
        ui.setProperty("/busy", false);
      }
    }

    /**
     * Asks what to do with the open draft before leaving the person (switching
     * person or logging out): save, keep it for later, discard or stay.
     *
     * @param {string} personId the person whose draft is open
     * @param {Function} proceed continues the navigation once the draft was handled
     */
    confirmLeaveDraft(personId, proceed) {
      void chooseAction({
        title: this.getText("personDraftLeaveTitle"),
        message: this.getText("personDraftLeaveMessage"),
        choices: [{
          key: "save",
          text: this.getText("personSaveDraftButton"),
          type: ButtonType.Emphasized
        }, {
          key: "keep",
          text: this.getText("personDraftLeaveKeep")
        }, {
          key: "discard",
          text: this.getText("personDiscardButton"),
          type: ButtonType.Reject
        }],
        cancelText: this.getText("personCancelButton")
      }).then(choice => this.applyLeaveChoice(choice, personId)).then(leave => {
        if (leave) {
          proceed();
        }
      });
    }
    async applyLeaveChoice(choice, personId) {
      switch (choice) {
        case "keep":
          return true;
        case "save":
          return this.publishPersonDraft(personId);
        case "discard":
          return this.discardPersonDraft(personId);
        default:
          return false;
      }
    }

    /**
     * Offers to continue or discard a draft left open in a previous session.
     * Asked once per person and session; drafts opened in this session are
     * registered in `_draftsHandled` and never trigger the question.
     *
     * @param {string} personId the selected person
     * @param {string} [changedAt] when the draft was last changed
     */
    offerDraftResume(personId, changedAt) {
      if (this._draftsHandled.has(personId)) {
        return;
      }
      this._draftsHandled.add(personId);
      void chooseAction({
        title: this.getText("personDraftResumeTitle"),
        message: this.getText("personDraftResumeMessage", [this.formatDateTime(changedAt)]),
        state: ValueState.Information,
        choices: [{
          key: "resume",
          text: this.getText("personDraftResumeContinue"),
          type: ButtonType.Emphasized
        }, {
          key: "discard",
          text: this.getText("personDraftResumeDiscard"),
          type: ButtonType.Reject
        }]
      }).then(async choice => {
        if (choice === "discard" && (await this.discardPersonDraft(personId))) {
          this.reload();
        }
      });
    }
    formatMessage(pattern, ...values) {
      return formatMessage(pattern, values);
    }
    formatDateTime(value) {
      return value ? DateFormat.getDateTimeInstance({
        style: "short"
      }).format(new Date(value)) : "";
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
      this.navTo("Cards");
    }
    onOpenCategoryManagerDialog() {
      this.navTo("Categories");
    }
    onOpenInvoicesDialog() {
      this.navTo("Invoices");
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
      this.navTo("Liabilities");
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
      this.navTo("Liabilities");
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
     * Opens the category-picker dialog for the transaction whose Identifier is
     * stored in `ui>/transactionCategory/selectedIdentifier`.
     */
    openCategoryDetailDialog() {
      return this.openPreparedDialog("CategoryDetail", dialog => dialog.open());
    }
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
      void this.openPreparedDialog("Backup", dialog => dialog.open()).catch(error => this.handleError(error, "dialogOpenError"));
    }
    onOpenSimulationDialog() {
      const ui = this.getUiModel();
      const period = this.periodService.currentOrDefault(ui.getProperty("/period"));
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
      void this.openPreparedDialog("Simulation", dialog => dialog.open()).catch(error => this.handleError(error, "dialogOpenError"));
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
          const otherUserDraft = !hasDraft && person.HasDraftEntity === true;
          const lockedBy = otherUserDraft ? person.DraftAdministrativeData?.InProcessByUser ?? "" : "";
          const abandonedBy = otherUserDraft && !lockedBy ? person.DraftAdministrativeData?.LastChangedByUser ?? "" : "";
          return {
            ID: person.ID,
            Name: person.Name,
            Income: person.Income,
            ExpenseTarget: person.ExpenseTarget,
            Currency: person.Currency,
            ImageType: person.ImageType,
            IsActiveEntity: person.IsActiveEntity,
            hasDraft,
            lockedBy,
            abandonedBy,
            draftChangedAt: person.DraftAdministrativeData?.LastChangeDateTime
          };
        });
      } catch (error) {
        this.handleLoadError(error, "backendUnavailableLogin");
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
      this._currentPersonId = id;
      if (!id) {
        ui.setProperty("/selectedPersonId", "");
        ui.setProperty("/selectedPerson", {});
        ui.setProperty("/selectedPersonImage", "");
        ui.setProperty("/selectedPersonDraft", false);
        ui.setProperty("/selectedPersonDraftChangedAt", "");
        ui.setProperty("/selectedPersonLockedBy", "");
        ui.setProperty("/selectedPersonLockedAt", "");
        ui.setProperty("/selectedPersonAbandonedBy", "");
        this.announcePersonSelected();
        return;
      }
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === id);
      ui.setProperty("/selectedPersonId", id);
      ui.setProperty("/selectedPersonDraft", person?.hasDraft === true);
      ui.setProperty("/selectedPersonDraftChangedAt", this.formatDateTime(person?.draftChangedAt));
      ui.setProperty("/selectedPersonLockedBy", person?.lockedBy ?? "");
      ui.setProperty("/selectedPersonLockedAt", person?.lockedBy || person?.abandonedBy ? this.formatDateTime(person.draftChangedAt) : "");
      ui.setProperty("/selectedPersonAbandonedBy", person?.abandonedBy ?? "");
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
      this.announcePersonSelected();
      if (person?.hasDraft) {
        this.offerDraftResume(id, person.draftChangedAt);
      }
    }
    announcePersonSelected() {
      this.getOwnerComponent()?.getEventBus().publish(PERSON_CHANNEL, PERSON_SELECTED);
    }

    /**
     * Tells the tab views that the person draft is about to be saved or
     * discarded, so they release their draft bindings before the draft is gone.
     */
    announceDraftClosing() {
      this.getOwnerComponent()?.getEventBus().publish(PERSON_CHANNEL, PERSON_DRAFT_CLOSING);
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
        await this.openPersonDraft(this._odata, personId);
      }
      this._draftsHandled.add(personId);
      ui.setProperty("/selectedPersonDraft", true);
      ui.setProperty("/selectedPersonDraftChangedAt", this.formatDateTime(new Date().toISOString()));
      return true;
    }

    /**
     * Opens the draft of the person according to who holds it right now:
     * blocked while another user is editing, taken over (after confirmation)
     * when that user's lock expired, created or resumed otherwise.
     *
     * @param {ODataService} odata the OData service
     * @param {string} personId the person to edit
     * @returns {Promise<void>} resolves once the draft belongs to the current user
     */
    async openPersonDraft(odata, personId) {
      const ui = this.getUiModel();
      const state = await odata.inspectDraft("Persons", personId);
      if (state.kind === "locked") {
        ui.setProperty("/selectedPersonLockedBy", state.user);
        throw new DraftLockedError(state.user);
      }
      if (state.kind === "expired") {
        if (!(await this.confirmDraftTakeOver(state.user))) {
          throw new DraftEditCancelledError();
        }
        await odata.takeOverDraft("Persons", personId);
        ui.setProperty("/selectedPersonAbandonedBy", "");
        ui.setProperty("/selectedPersonLockedBy", "");
        return;
      }
      await odata.enableDraftEdit("Persons", personId);
    }
    async confirmDraftTakeOver(user) {
      const choice = await chooseAction({
        title: this.getText("personTakeOverTitle"),
        message: this.getText("personTakeOverMessage", [user]),
        choices: [{
          key: "takeOver",
          text: this.getText("personTakeOverButton"),
          type: ButtonType.Emphasized
        }],
        cancelText: this.getText("personCancelButton")
      });
      return choice === "takeOver";
    }
    getSelectedPersonId() {
      return this.getUiModel().getProperty("/selectedPersonId") || "";
    }

    // ---------------------------------------------------------------------------
    // Dashboard loading
    // ---------------------------------------------------------------------------

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
     * Opens the PersonDetail dialog in read-only mode, bound to the person's
     * current state (the open draft when one exists, otherwise the active
     * entity). Editing happens through the dialog's own edit action, which
     * switches to a draft on demand.
     */
    async openPersonDetailDialog() {
      const personId = this.getSelectedPersonId();
      if (!personId) {
        this.showErrorMessage("errorMissingPerson");
        return;
      }
      const path = this.currentPersonPathFor(personId);

      // Show the person's own photo (when it has one), falling back to the
      // active entity image otherwise.
      const person = this.getPersonsFromSource().find(candidate => candidate.ID === personId);
      if (this._mediaService && person) {
        void this._mediaService.resolvePersonImage(person, this.isPersonDraftOpen(personId));
      }
      await this.openPreparedDialog("PersonDetail", dialog => {
        dialog.setModel(this.getServiceModel());
        dialog.unbindObject();
        dialog.bindObject(path);
        dialog.open();
      });
    }
    onOpenSharesDialog() {
      this.navTo("Shares");
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

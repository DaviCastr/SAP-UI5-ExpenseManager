import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Select from "sap/m/Select";
import List from "sap/m/List";
import SearchField from "sap/m/SearchField";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import Context from "sap/ui/model/Context";
import Fragment from "sap/ui/core/Fragment";
import XMLView from "sap/ui/core/mvc/XMLView";
import MessageBox from "sap/m/MessageBox";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";
import { ODataService, DRAFT_FILTER, DRAFT_EXPAND, DraftEditCancelledError, DraftLockedError } from "../service/ODataService";
import DateFormat from "sap/ui/core/format/DateFormat";
import formatMessage from "sap/base/strings/formatMessage";
import { ButtonType } from "sap/m/library";
import { ValueState } from "sap/ui/core/library";
import { chooseAction } from "../util/choiceDialog";
import type { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
import type { Period } from "../service/InvoiceService";
import { PeriodService } from "../service/PeriodService";
import { MediaService } from "../service/MediaService";
import type ListBinding from "sap/ui/model/ListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import {
    getTransactionsByCategory,
    type CategoryTransactionsProperties,
    type CategoryBreakdownItem
} from "../util/expenseApi";
import { isSessionExpiredError, isBackendUnavailableError } from "../util/http";
import { applyThemePreference, ensureThemeApplied as applyStoredTheme, isDarkTheme } from "../util/theme";
import { getBackendErrorMessage } from "../util/feedback";
import { runExclusiveAction } from "../util/draftDialogFlow";
import type { UiPerson } from "../model/UiModel";
import type Component from "../Component";
import { PERSON_CHANNEL, PERSON_DRAFT_CLOSING, PERSON_SELECTED } from "../util/personEvents";

interface CardRow {
    ID: string;
    Name: string;
}

/**
 * Orchestrates the Home dashboard. Loading, selection and image/media state
 * is delegated to focused services (PeriodService, MediaService,
 * DashboardRenderer) so the controller stays small and descriptive.
 */
export default class Home extends BaseController {
    private _odata?: ODataService;
    private _mediaService?: MediaService;
    private _serviceModelRef?: ODataModel;

    private _dialogs = new Map<string, Promise<Dialog>>();
    private _persons: UiPerson[] = [];
    private _currentPersonId = "";
    private readonly _draftsHandled = new Set<string>();

    private readonly periodService = new PeriodService();

    public onInit(): void {
        (this.getOwnerComponent() as unknown as Component).setWorkspace(this);
        this.getRouter().attachRouteMatched((event) => {
            const route = event.getParameter("name");
            if (route && route !== "Login") {
                this.getUiModel().setProperty("/tab", route);
            }
        });
        this.applyShareOptionTexts();
        this.syncThemeState();
        void this.initView();
    }

    private applyShareOptionTexts(): void {
        const ui = this.getUiModel();

        ui.setProperty("/entityOptions", [
            { key: "1", text: this.getText("sharesEntityPersons") },
            { key: "2", text: this.getText("sharesEntityShares") },
            { key: "3", text: this.getText("sharesEntityEntities") },
            { key: "4", text: this.getText("sharesEntityCategories") },
            { key: "5", text: this.getText("sharesEntityCards") },
            { key: "6", text: this.getText("sharesEntityInvoices") },
            { key: "7", text: this.getText("sharesEntityTransactions") },
            { key: "8", text: this.getText("sharesEntityBackups") },
            { key: "9", text: this.getText("sharesEntityLiabilities") },
            { key: "10", text: this.getText("sharesEntityLiabilityTx") }
        ]);

        ui.setProperty("/permissionOptions", [
            { key: "1", text: this.getText("sharesActionView") },
            { key: "2", text: this.getText("sharesActionCreate") },
            { key: "3", text: this.getText("sharesActionEdit") },
            { key: "4", text: this.getText("sharesActionDelete") }
        ]);
    }

    public onTabSelect(event: IconTabBar$SelectEvent): void {
        this.navTo(event.getParameter("key") ?? "Home");
    }

    public onToggleTheme(): void {
        applyThemePreference(!isDarkTheme());
        this.syncThemeToggle();
    }

    private syncThemeState(): void {
        applyStoredTheme();
        this.syncThemeToggle();
    }

    private syncThemeToggle(): void {
        const isDark = isDarkTheme();
        const button = this.byId("themeToggle") as Button | undefined;
        if (!button) {
            return;
        }
        button.setIcon(isDark ? "sap-icon://dark-mode" : "sap-icon://light-mode");
        button.setTooltip(this.getText(isDark ? "themeLightTooltip" : "themeDarkTooltip"));
    }

    private async initView(): Promise<void> {
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

    public onPersonChange(): void {
        const selectPersons = this.byId("personSelect") as Select;
        const id = (selectPersons.getSelectedItem() as { getKey?: () => string } | undefined)?.getKey?.() || "";
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

    public onLogout(): void {
        if (this._currentPersonId && this.getUiModel().getProperty("/selectedPersonDraft") === true) {
            this.confirmLeaveDraft(this._currentPersonId, () => void this.logout());
            return;
        }

        void this.logout();
    }

    private async logout(): Promise<void> {
        try {
            await AuthenticationService.logout();
        } catch (error) {
            console.error("[logout]", error);
        }
        this.navTo("Login");
    }

    public onOpenExpenseDialog(): void {
        this.prepareExpenseDialogState();
        void this.openPreparedDialog("AddExpense", (dialog) => {
            this.bindExpenseSelects();
            (Fragment.byId("AddExpense", "expenseCard") as Select | undefined)?.setSelectedItem(null);
            (Fragment.byId("AddExpense", "expenseCategory") as Select | undefined)?.setSelectedItem(null);
            dialog.open();
        }).catch((error) => this.handleError(error, "dialogOpenError"));
    }

    public onOpenPersonDialog(): void {
        const ui = this.getUiModel();
        ui.setProperty("/newPerson", { name: "", email: "", phone: "", income: "", currency: "BRL", target: "" });
        void this.openPreparedDialog("AddPerson", (dialog) => dialog.open())
            .catch((error) => this.handleError(error, "dialogOpenError"));
    }

    public onOpenPersonDetailDialog(): Promise<void> {
        return this.openPersonDetailDialog();
    }

    /**
     * Publishes the open draft of the currently selected person (footer
     * "Salvar alterações"), then reloads the dashboard.
     */
    public onSavePersonDraft(): void {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            return;
        }

        void this.publishPersonDraft(personId).then((saved) => {
            if (saved) {
                this.reload();
            }
        });
    }

    /**
     * Discards the open draft of the currently selected person after a
     * confirmation, then reloads the dashboard.
     */
    public onDiscardPersonDraft(): void {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            return;
        }

        MessageBox.confirm(this.getText("personDraftDiscardConfirm"), {
            title: this.getText("personDraftDiscardTitle"),
            onClose: (action) => {
                if (action !== MessageBox.Action.OK) {
                    return;
                }
                void this.discardPersonDraft(personId).then((discarded) => {
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
    private async publishPersonDraft(personId: string): Promise<boolean> {
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
                MessageBox.error(
                    detail ? `${this.getText("errorSavePersonDraft")}\n\n${detail}` : this.getText("errorSavePersonDraft")
                );
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
    private async discardPersonDraft(personId: string): Promise<boolean> {
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
    private confirmLeaveDraft(personId: string, proceed: () => void): void {
        void chooseAction({
            title: this.getText("personDraftLeaveTitle"),
            message: this.getText("personDraftLeaveMessage"),
            choices: [
                { key: "save", text: this.getText("personSaveDraftButton"), type: ButtonType.Emphasized },
                { key: "keep", text: this.getText("personDraftLeaveKeep") },
                { key: "discard", text: this.getText("personDiscardButton"), type: ButtonType.Reject }
            ],
            cancelText: this.getText("personCancelButton")
        })
            .then((choice) => this.applyLeaveChoice(choice, personId))
            .then((leave) => {
                if (leave) {
                    proceed();
                }
            });
    }

    private async applyLeaveChoice(choice: string | null, personId: string): Promise<boolean> {
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
    private offerDraftResume(personId: string, changedAt?: string): void {
        if (this._draftsHandled.has(personId)) {
            return;
        }

        this._draftsHandled.add(personId);

        void chooseAction({
            title: this.getText("personDraftResumeTitle"),
            message: this.getText("personDraftResumeMessage", [this.formatDateTime(changedAt)]),
            state: ValueState.Information,
            choices: [
                { key: "resume", text: this.getText("personDraftResumeContinue"), type: ButtonType.Emphasized },
                { key: "discard", text: this.getText("personDraftResumeDiscard"), type: ButtonType.Reject }
            ]
        }).then(async (choice) => {
            if (choice === "discard" && await this.discardPersonDraft(personId)) {
                this.reload();
            }
        });
    }

    public formatMessage(pattern: string, ...values: string[]): string {
        return formatMessage(pattern, values);
    }

    private formatDateTime(value?: string): string {
        return value ? DateFormat.getDateTimeInstance({ style: "short" }).format(new Date(value)) : "";
    }

    /**
     * Permanently deletes the currently selected person after a confirmation.
     * Any open draft is discarded automatically (the active row cannot be
     * deleted while a draft exists), then the selection is cleared and the
     * dashboard reloaded.
     */
    public onDeletePerson(): void {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            return;
        }

        MessageBox.confirm(this.getText("personDeleteConfirm"), {
            title: this.getText("personDeleteTitle"),
            onClose: (action) => {
                if (action !== MessageBox.Action.OK || !this._odata) {
                    return;
                }
                void this.deleteSelectedPerson();
            }
        });
    }

    private async deleteSelectedPerson(): Promise<void> {
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

    public onOpenCardManagerDialog(): void {
        this.navTo("Cards");
    }

    public onOpenCategoryManagerDialog(): void {
        void this.openDraftManagerDialog("Categories", "categoriesOpenError", undefined, { readOnlyOpen: true });
    }

    public onOpenInvoicesDialog(): void {
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
    public onOpenLiabilitiesDialog(): void {
        this.getUiModel().setProperty("/liabilityEditId", "");
        void this.openDraftManagerDialog("Liabilities", "liabilitiesOpenError", undefined, { readOnlyOpen: true });
    }

    /**
     * Opens the Liabilities management dialog in read-only mode. The dialog
     * stays read-only: the person draft is only created when the user clicks
     * edit or add inside it (see `enterDialogDraftMode`).
     *
     * @param {Event} oEvent the press event of the row's edit button
     */
    public onOpenLiabilityEdit(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const liability = source?.getBindingContext()?.getObject() as { ID?: string } | undefined;
        if (!liability?.ID) {
            return;
        }

        void this.openDraftManagerDialog("Liabilities", "liabilitiesOpenError", undefined, { readOnlyOpen: true });
    }

    /**
     * Opens the movements dialog of the debt whose action button was pressed.
     *
     * @param {Event} oEvent the press event of the row's movements button
     */
    public onOpenLiabilityTransactions(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const liability = source?.getBindingContext()?.getObject() as { ID?: string } | undefined;
        if (!liability?.ID) {
            return;
        }
        void this.openLiabilityTransactions(liability.ID)
            .catch((error) => this.handleError(error, "liabilityTransactionsOpenError"));
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
    public async openLiabilityTransactions(liabilityId: string): Promise<void> {
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

            await this.openPreparedDialog("LiabilityTransactions", (dialog) => {
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
    private async openInvoicesDialog(): Promise<void> {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            this.showErrorMessage("errorMissingPerson");
            return;
        }

        try {
            await this.openPreparedDialog("Invoices", (dialog) => dialog.open());
        } catch (error) {
            this.handleError(error, "invoicesOpenError");
        }
    }

    /**
     * Opens the category-picker dialog for the transaction whose Identifier is
     * stored in `ui>/transactionCategory/selectedIdentifier`.
     */
    public openCategoryDetailDialog(): Promise<void> {
        return this.openPreparedDialog("CategoryDetail", (dialog) => dialog.open());
    }

    public openTransactionCategoryDialog(): void {
        void this.openPreparedDialog("TransactionCategory", (dialog) => dialog.open())
            .catch((error) => this.handleError(error, "invoicesOpenError"));
    }

    /**
     * Opens the batch-exclusion dialog for the transaction whose Identifier is
     * stored in `ui>/deleteTransactions/selectedIdentifier`.
     */
    public openDeleteTransactionsDialog(): void {
        void this.openPreparedDialog("DeleteTransactions", (dialog) => dialog.open())
            .catch((error) => this.handleError(error, "invoicesOpenError"));
    }

    public onRestoreBackup(): void {
        void this.openPreparedDialog("Backup", (dialog) => dialog.open())
            .catch((error) => this.handleError(error, "dialogOpenError"));
    }

    public onOpenSimulationDialog(): void {
        const ui = this.getUiModel();
        const period = this.periodService.currentOrDefault(ui.getProperty("/period") as Period | undefined);

        if (!ui.getProperty("/simulation")) {
            ui.setProperty("/simulation", { month: String(period.month), year: String(period.year) });
        }
        if (!ui.getProperty("/simulationMonthOptions")) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            ui.setProperty("/simulationMonthOptions", monthNames.map((name, index) => ({ key: String(index + 1), text: name })));
        }
        ui.setProperty("/simulationResult", null);

        void this.openPreparedDialog("Simulation", (dialog) => dialog.open())
            .catch((error) => this.handleError(error, "dialogOpenError"));
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
    public reload(): void {
        this._persons = [];

        const select = this.byId("personSelect") as Select | undefined;
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

    private async refreshPersonSelector(): Promise<void> {
        if (!this._odata) {
            return;
        }

        let persons: UiPerson[] = [];

        // Do NOT pass $select here: a "$select" that includes the key property is
        // rejected on draft bindings; omitting it returns every property (incl. ID).
        try {
            const result = await this._odata.requestEntitySet<UiPerson & {
                IsActiveEntity?: boolean;
                HasDraftEntity?: boolean;
                DraftAdministrativeData?: { InProcessByUser?: string; LastChangedByUser?: string; LastChangeDateTime?: string } | null;
            }>("/Persons", {
                filterExpression: DRAFT_FILTER,
                expand: DRAFT_EXPAND
            });

            // Find persons that have an open draft (unsaved changes). The regular
            // list only returns the active row for those, so their IDs must be
            // collected from the draft entities.
            let openDraftIds: string[] = [];
            try {
                openDraftIds = await this._odata.listDraftIds("Persons");
            } catch {
                // best effort; the draft indicator just stays off
            }

            persons = result
                .filter((person) => !!person.ID)
                .map((person) => {
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

        const select = this.byId("personSelect") as Select;

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
        const currentExists = persons.some((person) => person.ID === current);

        this.applyPersonSelection(current && currentExists ? current : persons[0].ID);
    }

    private getPersonsFromSource(): UiPerson[] {
        if (this._persons.length > 0) {
            return this._persons;
        }

        const select = this.byId("personSelect") as Select;
        const binding = select.getBinding("items") as ListBinding;

        if (!binding) {
            return [];
        }

        return binding
            .getContexts(0, 100)
            .map((context) => context.getObject() as UiPerson)
            .filter((person) => !!person?.ID);
    }

    private applyPersonSelection(id: string): void {
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

        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === id);

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

    private announcePersonSelected(): void {
        this.getOwnerComponent()?.getEventBus().publish(PERSON_CHANNEL, PERSON_SELECTED);
    }

    /**
     * Tells the tab views that the person draft is about to be saved or
     * discarded, so they release their draft bindings before the draft is gone.
     */
    private announceDraftClosing(): void {
        this.getOwnerComponent()?.getEventBus().publish(PERSON_CHANNEL, PERSON_DRAFT_CLOSING);
    }

    public personPathFor(id: string): string {
        if (!id) {
            return "";
        }
        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === id);
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
    private activePersonPathFor(id: string): string {
        return `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=true)`;
    }

    /**
     * Whether an editable draft currently exists for the person. Mirrors the
     * checks of `ensurePersonDraft` without creating anything.
     *
     * @param {string} personId the person to check
     * @returns {boolean} whether a draft is open
     */
    private isPersonDraftOpen(personId: string): boolean {
        if (this.getUiModel().getProperty("/selectedPersonDraft") === true) {
            return true;
        }
        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === personId);
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
    public currentPersonPathFor(id: string): string {
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
    private async ensurePersonDraft(personId: string): Promise<boolean> {
        const ui = this.getUiModel();

        if (ui.getProperty("/selectedPersonDraft") === true) {
            return true;
        }

        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === personId);
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
    private async openPersonDraft(odata: ODataService, personId: string): Promise<void> {
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

    private async confirmDraftTakeOver(user: string): Promise<boolean> {
        const choice = await chooseAction({
            title: this.getText("personTakeOverTitle"),
            message: this.getText("personTakeOverMessage", [user]),
            choices: [{ key: "takeOver", text: this.getText("personTakeOverButton"), type: ButtonType.Emphasized }],
            cancelText: this.getText("personCancelButton")
        });

        return choice === "takeOver";
    }

    private getSelectedPersonId(): string {
        return (this.getUiModel().getProperty("/selectedPersonId") as string) || "";
    }

    // ---------------------------------------------------------------------------
    // Dashboard loading
    // ---------------------------------------------------------------------------

    // ---------------------------------------------------------------------------
    // Fragment dialogs
    // ---------------------------------------------------------------------------

    private prepareExpenseDialogState(): void {
        const ui = this.getUiModel();
        ui.setProperty("/newExpense", {
            description: "",
            amount: "",
            installments: 1,
            fixedExpense: false,
            transactionDate: new Date().toISOString().slice(0, 10)
        });
    }

    private bindExpenseSelects(): void {
        const selectPersons = this.byId("personSelect") as Select;
        const selectedPerson = selectPersons.getSelectedItem();
        const contextSelected = selectedPerson?.getBindingContext() as Context | undefined;
        const personPath = contextSelected?.getPath() || "";

        Fragment.byId("AddExpense", "expenseCard")?.bindObject(personPath);
        Fragment.byId("AddExpense", "expenseCategory")?.bindObject(personPath);
    }

    private async openPreparedDialog(fragmentName: string, onOpen: (dialog: Dialog) => void): Promise<void> {
        const dialog = await this.getOrCreateDialog(fragmentName);
        onOpen(dialog);
    }

    private getOrCreateDialog(fragmentName: string): Promise<Dialog> {
        const cached = this._dialogs.get(fragmentName);
        if (cached) {
            return cached;
        }

        const fragment = Fragment.load({
            id: fragmentName,
            name: `apps.dflc.expensemanager.view.fragments.${fragmentName}`
        }).then((dialog) => {
            (this.getView() as XMLView).addDependent(dialog as Control);
            return dialog as Dialog;
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
    private async openPersonDetailDialog(): Promise<void> {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            this.showErrorMessage("errorMissingPerson");
            return;
        }

        const path = this.currentPersonPathFor(personId);

        // Show the person's own photo (when it has one), falling back to the
        // active entity image otherwise.
        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === personId);
        if (this._mediaService && person) {
            void this._mediaService.resolvePersonImage(person, this.isPersonDraftOpen(personId));
        }

        await this.openPreparedDialog("PersonDetail", (dialog) => {
            dialog.setModel(this.getServiceModel());
            dialog.unbindObject();
            dialog.bindObject(path);
            dialog.open();
        });
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
    private async onOpenSharesDialog(): Promise<void> {
        await this.openDraftManagerDialog("Shares", "sharesOpenError", undefined, { readOnlyOpen: true });
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
    private async openDraftManagerDialog(
        fragmentName: "Categories" | "Liabilities" | "Shares",
        errorKey: string,
        onOpened?: (dialog: Dialog) => void,
        options?: { readOnlyOpen?: boolean }
    ): Promise<void> {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            this.showErrorMessage("errorMissingPerson");
            return;
        }

        const ui = this.getUiModel();
        ui.setProperty("/busy", true);

        try {
            let path: string;
            if (options?.readOnlyOpen) {
                path = this.currentPersonPathFor(personId);
            } else {
                await this.ensurePersonDraft(personId);
                path = this._odata?.draftPath("Persons", personId) ?? "";
            }

            await this.openPreparedDialog(fragmentName, (dialog) => {
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
    public async enterDialogDraftMode(dialog: Control, subPath?: string): Promise<void> {
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
    private async waitForDialogDraftContext(dialog: Control, draftBase: string): Promise<void> {
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
            await new Promise((resolve) => setTimeout(resolve, 100));
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
    public async resetManagerDialogToActive(
        fragmentName: string,
        options?: { editIdPaths?: string[] }
    ): Promise<void> {
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
            (options?.editIdPaths ?? []).forEach((editIdPath) => ui.setProperty(editIdPath, ""));
            ui.setProperty("/managerDialogInDraft", false);
        } catch {
            // best effort; reload() re-syncs the person-scoped sections anyway
        }
    }

    /**
     * Detaches the PersonDetail dialog from its OData draft binding, if present,
     * so a model refresh does not re-read a draft that is about to be discarded.
     */
    private releasePersonDetailDraftBinding(): void {
        const cached = this._dialogs.get("PersonDetail");
        if (!cached) {
            return;
        }

        void cached.then((dialog) => {
            try {
                dialog.unbindObject();
            } catch {
                // best effort; the binding cleanup must not break the discard flow
            }
        });
    }
}
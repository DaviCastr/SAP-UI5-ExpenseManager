import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
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
import { ODataService, DRAFT_FILTER, DRAFT_EXPAND } from "../service/ODataService";
import { InvoiceService, type Period } from "../service/InvoiceService";
import { PeriodService } from "../service/PeriodService";
import { MediaService } from "../service/MediaService";
import { DashboardRenderer } from "../service/DashboardRenderer";
import type ListBinding from "sap/ui/model/ListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import {
    getTransactionsByCategory,
    type CategoryTransactionsProperties,
    type CategoryBreakdownItem
} from "../util/expenseApi";
import { isSessionExpiredError, isBackendUnavailableError } from "../util/http";
import { getBackendErrorMessage } from "../util/feedback";
import type { UiPerson } from "../model/UiModel";

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
    private _invoiceService?: InvoiceService;
    private _mediaService?: MediaService;
    private _renderer?: DashboardRenderer;

    private _dialogs = new Map<string, Promise<Dialog>>();
    private _persons: UiPerson[] = [];

    private readonly periodService = new PeriodService();

    public onInit(): void {
        void this.initView();
    }

    private async initView(): Promise<void> {
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

    public onPersonChange(): void {
        const selectPersons = this.byId("personSelect") as Select;
        const id = (selectPersons.getSelectedItem() as { getKey?: () => string } | undefined)?.getKey?.() || "";
        this.applyPersonSelection(id);
    }

    public async onLogout(): Promise<void> {
        await AuthenticationService.logout();
        this.navTo("Login");
    }

    public onPreviousMonth(): void {
        this.navigateMonth(-1);
    }

    public onNextMonth(): void {
        this.navigateMonth(1);
    }

    public onThisMonth(): void {
        const period = this.periodService.current();
        this.getUiModel().setProperty("/period", period);
        this.applyPeriodData();
    }

    public onHomeYearChanged(): void {
        const ui = this.getUiModel();
        const period = this.currentPeriod();
        period.year = Number(ui.getProperty("/periodSelector/year")) || period.year;
        ui.setProperty("/period", period);
        this.applyPeriodData();
    }

    public onHomeMonthChanged(): void {
        const ui = this.getUiModel();
        const period = this.currentPeriod();
        period.month = Number(ui.getProperty("/periodSelector/month")) || period.month;
        ui.setProperty("/period", period);
        this.applyPeriodData();
    }

    public async onSendInvoices(): Promise<void> {
        const period = this.currentPeriod();

        if (!this._invoiceService) {
            return;
        }

        const ui = this.getUiModel();
        ui.setProperty("/busy", true);

        try {
            const result = await this._invoiceService.sendInvoices(period);
            if (result.success) {
                MessageToast.show(
                    result.data || this.getText("sendInvoicesSuccess")
                );
            } else {
                MessageBox.error(result.data || this.getText("sendInvoicesNoData"));
            }
        } catch (error) {
            if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
                const detail = getBackendErrorMessage(error);
                MessageBox.error(
                    detail ? `${this.getText("sendInvoicesError")}\n\n${detail}` : this.getText("sendInvoicesError")
                );
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
    public onTransactionSearch(): void {
        const search = this.byId("transactionsSearch") as SearchField | undefined;
        const list = this.byId("transactionsList") as List | undefined;
        const binding = list?.getBinding("items") as ListBinding | undefined;
        const query = search?.getValue()?.trim() || "";

        if (!binding) {
            return;
        }

        if (!query) {
            binding.filter([]);
            return;
        }

        binding.filter([new Filter({ path: "SearchText", operator: FilterOperator.Contains, value1: query })]);
    }

    public onOpenExpenseDialog(): void {
        this.prepareExpenseDialogState();
        void this.openPreparedDialog("AddExpense", (dialog) => {
            this.bindExpenseSelects();
            (Fragment.byId("AddExpense", "expenseCard") as Select | undefined)?.setSelectedItem(null);
            (Fragment.byId("AddExpense", "expenseCategory") as Select | undefined)?.setSelectedItem(null);
            dialog.open();
        });
    }

    public onOpenPersonDialog(): void {
        const ui = this.getUiModel();
        ui.setProperty("/newPerson", { name: "", email: "", phone: "", income: "", currency: "BRL", target: "" });
        void this.openPreparedDialog("AddPerson", (dialog) => dialog.open());
    }

    public onOpenPersonDetailDialog(): Promise<void> {
        return this.openPersonDetailDialog();
    }

    /**
     * Publishes the open draft of the currently selected person after a
     * confirmation (the "Efetivar salvamento" action in the draft banner), then
     * reloads the dashboard. Pending edits are flushed first so every two-way
     * bound change reaches the draft before it is activated.
     */
    public onSavePersonDraft(): void {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            return;
        }

        MessageBox.confirm(this.getText("personSaveDraftConfirm"), {
            title: this.getText("personSaveDraftTitle"),
            onClose: (action) => {
                if (action !== MessageBox.Action.OK || !this._odata) {
                    return;
                }
                void this.saveSelectedPersonDraft();
            }
        });
    }

    private async saveSelectedPersonDraft(): Promise<void> {
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
                MessageBox.error(
                    detail ? `${this.getText("errorSavePersonDraft")}\n\n${detail}` : this.getText("errorSavePersonDraft")
                );
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
    public onDiscardPersonDraft(): void {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            return;
        }

        MessageBox.confirm(this.getText("personDraftDiscardConfirm"), {
            title: this.getText("personDraftDiscardTitle"),
            onClose: (action) => {
                if (action !== MessageBox.Action.OK || !this._odata) {
                    return;
                }
                void this.discardSelectedPersonDraft();
            }
        });
    }

    private async discardSelectedPersonDraft(): Promise<void> {
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
        void this.openDraftManagerDialog("Cards", "cardsOpenError");
    }

    public onOpenCategoryManagerDialog(): void {
        void this.openDraftManagerDialog("Categories", "categoriesOpenError");
    }

    public onOpenInvoicesDialog(): void {
        void this.openInvoicesDialog();
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
        void this.openPreparedDialog("Backup", (dialog) => dialog.open());
    }

    public onCategoryPress(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const bindingContext = source?.getBindingContext("ui") as Context | undefined;
        const category = bindingContext?.getObject() as CategoryBreakdownItem | undefined;

        if (!category) {
            return;
        }

        const ui = this.getUiModel();
        const personId = ui.getProperty("/selectedPersonId") as string;
        const period = this.currentPeriod();

        ui.setProperty("/busy", true);

        void getTransactionsByCategory(this.getServiceModel(), personId, category.ID, false, period.year, period.month)
            .then((result: CategoryTransactionsProperties) => {
                ui.setProperty("/categoryDetail", result);
                return this.openPreparedDialog("CategoryDetail", (dialog) => dialog.open());
            })
            .catch((error) => this.handleError(error, "errorLoadCategoryDetail"))
            .finally(() => ui.setProperty("/busy", false));
    }

    /**
     * Opens the category picker for the transaction whose action button was
     * pressed, mirroring the selected Identifier and its current category into
     * the ui model (same contract used by the invoice dialog).
     *
     * @param {Event} oEvent the press event
     * @returns {void}
     */
    public onTransactionCategoryPress(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const transaction = source?.getBindingContext("ui")?.getObject() as
            | { Identifier?: string; Category?: { ID?: string; Name?: string } | null }
            | undefined;

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
    public onTransactionDeletePress(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const transaction = source?.getBindingContext("ui")?.getObject() as
            | { Identifier?: string }
            | undefined;

        if (!transaction?.Identifier) {
            return;
        }

        this.getUiModel().setProperty("/deleteTransactions/selectedIdentifier", transaction.Identifier);
        this.openDeleteTransactionsDialog();
    }

    public onOpenSimulationDialog(): void {
        const ui = this.getUiModel();
        const period = this.currentPeriod();

        if (!ui.getProperty("/simulation")) {
            ui.setProperty("/simulation", { month: String(period.month), year: String(period.year) });
        }
        if (!ui.getProperty("/simulationMonthOptions")) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            ui.setProperty("/simulationMonthOptions", monthNames.map((name, index) => ({ key: String(index + 1), text: name })));
        }
        ui.setProperty("/simulationResult", null);

        void this.openPreparedDialog("Simulation", (dialog) => dialog.open());
    }

    public refresh(): void {
        const cardsList = this.byId("cardsListItems") as List | undefined;
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
            const result = await this._odata.requestEntitySet<UiPerson & { IsActiveEntity?: boolean }>("/Persons", {
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

        this.bindPersonContext(id);

        if (!id) {
            ui.setProperty("/selectedPersonId", "");
            ui.setProperty("/selectedPerson", {});
            ui.setProperty("/selectedPersonImage", "");
            ui.setProperty("/selectedPersonDraft", false);
            return;
        }

        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === id);

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
    private bindPersonContext(id: string): void {
        const path = this.personPathFor(id);
        this.byId("personDetails")?.setModel(this.getView()?.getModel() as ODataModel);
        this.byId("personDetails")?.bindObject(path);
        this.byId("cardsList")?.bindObject(path);
        this.byId("metricsGrid")?.bindObject(path);
    }

    private personPathFor(id: string): string {
        if (!id) {
            return "";
        }
        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === id);
        const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;
        return `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=${isDraft ? "false" : "true"})`;
    }

    private getSelectedPersonId(): string {
        return (this.getUiModel().getProperty("/selectedPersonId") as string) || "";
    }

    // ---------------------------------------------------------------------------
    // Dashboard loading
    // ---------------------------------------------------------------------------

    private applyPeriodData(): void {
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
    private resetTransactionSearch(): void {
        const search = this.byId("transactionsSearch") as SearchField | undefined;
        const list = this.byId("transactionsList") as List | undefined;
        const binding = list?.getBinding("items") as ListBinding | undefined;
        if (search) {
            search.setValue("");
        }
        binding?.filter([]);
    }

    private navigateMonth(delta: number): void {
        const period = this.currentPeriod();
        this.getUiModel().setProperty("/period", this.periodService.shift(period, delta));
        this.applyPeriodData();
    }

    private currentPeriod(): Period {
        return this.periodService.currentOrDefault(
            this.getUiModel().getProperty("/period") as Period | undefined
        );
    }

    private presentPeriodLabel(period: Period): string {
        return this.periodService.label(period.year, period.month);
    }

    private async loadDashboard(): Promise<void> {
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
            const cards = await this._odata?.requestEntitySet<CardRow & { IsActiveEntity?: boolean }>("Cards", {
                select: ["ID", "Name"],
                filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
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

    private selectedPerson(): { Income?: number; ExpenseTarget?: number; Currency?: unknown } {
        return (this.getUiModel().getProperty("/selectedPerson") as UiPerson) || {};
    }

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
     * Opens the PersonDetail edit dialog for the selected person. Editing the
     * active entity opens a draft first and binds the dialog to it, so the
     * two-way bound fields PATCH the draft instead of the (read-only) active
     * entity. Editing a person that already has a draft continues on that draft.
     */
    private async openPersonDetailDialog(): Promise<void> {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            this.showErrorMessage("errorMissingPerson");
            return;
        }

        const ui = this.getUiModel();
        ui.setProperty("/busy", true);

        try {
            const person = this.getPersonsFromSource().find((candidate) => candidate.ID === personId);
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

            await this.openPreparedDialog("PersonDetail", (dialog) => {
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
    private async onOpenSharesDialog(): Promise<void> {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            this.showErrorMessage("errorMissingPerson");
            return;
        }

        const ui = this.getUiModel();
        ui.setProperty("/busy", true);

        try {
            const person = this.getPersonsFromSource().find((candidate) => candidate.ID === personId);
            const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;

            if (this._odata && !isDraft) {
                await this._odata.enableDraftEdit("Persons", personId);
            }

            const path = this._odata?.draftPath("Persons", personId) ?? "";

            await this.openPreparedDialog("Shares", (dialog) => {
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
    private async openDraftManagerDialog(fragmentName: "Cards" | "Categories", errorKey: string): Promise<void> {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            this.showErrorMessage("errorMissingPerson");
            return;
        }

        const ui = this.getUiModel();
        ui.setProperty("/busy", true);

        try {
            const person = this.getPersonsFromSource().find((candidate) => candidate.ID === personId);
            const isDraft = person?.IsActiveEntity === false || person?.hasDraft === true;

            if (this._odata && !isDraft) {
                await this._odata.enableDraftEdit("Persons", personId);
            }

            const path = this._odata?.draftPath("Persons", personId) ?? "";

            await this.openPreparedDialog(fragmentName, (dialog) => {
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
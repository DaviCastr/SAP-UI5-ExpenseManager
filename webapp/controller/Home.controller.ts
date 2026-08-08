import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Select from "sap/m/Select";
import List from "sap/m/List";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import Context from "sap/ui/model/Context";
import Fragment from "sap/ui/core/Fragment";
import XMLView from "sap/ui/core/mvc/XMLView";
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
import {
    requestExportBackup,
    fetchBackupStream,
    deleteBackupRow,
    downloadBlob
} from "../util/backupApi";
import { isSessionExpiredError, isBackendUnavailableError } from "../util/http";
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

    public onOpenPersonDetailDialog(): void {
        const personId = this.getSelectedPersonId();

        if (!personId) {
            this.showErrorMessage("errorMissingPerson");
            return;
        }

        void this.openPreparedDialog("PersonDetail", (dialog) => {
            dialog.setModel(this.getView()?.getModel() as ODataModel);
            dialog.bindObject(this.personPathFor(personId));
            dialog.open();
        });
    }

    public onOpenCardDialog(): void {
        const ui = this.getUiModel();
        ui.setProperty("/newCard", { name: "", limit: "", currency: "BRL" });
        void this.openPreparedDialog("AddCard", (dialog) => dialog.open());
    }

    public onOpenCategoryDialog(): void {
        const ui = this.getUiModel();
        ui.setProperty("/newCategory", { name: "" });
        void this.openPreparedDialog("AddCategory", (dialog) => dialog.open());
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

    public async onExportBackup(): Promise<void> {
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
     * create/restore dialogs.
     */
    public reload(): void {
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

            persons = result
                .filter((person) => !!person.ID)
                .map((person) => ({
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

        const select = this.byId("personSelect") as Select;

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
            return;
        }

        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === id);

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
    private bindPersonContext(id: string): void {
        const path = this.personPathFor(id);
        this.byId("personDetails")?.bindObject(path);
        this.byId("cardsList")?.bindObject(path);
    }

    private personPathFor(id: string): string {
        if (!id) {
            return "";
        }
        const person = this.getPersonsFromSource().find((candidate) => candidate.ID === id);
        const isActiveEntity = person?.IsActiveEntity === false ? "false" : "true";
        return `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=${isActiveEntity})`;
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
        void this.loadDashboard();
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

            void this._mediaService?.resolveCategoryImages(transactions);
            void renderer.loadTrend(personId, period, expenses);

            const cards = await this._odata?.requestEntitySet<CardRow & { IsActiveEntity?: boolean }>("Cards", {
                select: ["ID", "Name"],
                filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
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
}
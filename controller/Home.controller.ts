import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Select from "sap/m/Select";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import Context from "sap/ui/model/Context";
import Fragment from "sap/ui/core/Fragment";
import XMLView from "sap/ui/core/mvc/XMLView";
import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";
import { SessionStorage } from "../auth/storage/SessionStorage";
import { formatCurrency } from "../util/format";
import { ODataService, DRAFT_FILTER, DRAFT_EXPAND } from "../service/ODataService";
import { InvoiceService, type CompleteInvoice, type Period } from "../service/InvoiceService";
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
import { isSessionExpiredError, buildHeaders, getOdataServiceUrl } from "../util/http";
import type { UiPerson } from "../model/UiModel";

function resolveCurrency(currency: unknown, fallback = "BRL"): string {
    if (typeof currency === "string" && currency) {
        return currency;
    }
    if (currency && typeof currency === "object") {
        return (currency as { code?: string }).code || fallback;
    }
    return fallback;
}

interface TransactionRow {
    ID: string;
    Description?: string;
    Date?: string;
    Amount?: number;
    Currency?: string;
    Category?: { ID: string; Name: string; ImagePath?: string };
}

interface CardRow {
    ID: string;
    Name: string;
    Limit: number;
    Currency: string;
    DueDay: number;
    ClosingDay: number;
}

export default class Home extends BaseController {
    private _odata?: ODataService;
    private _invoiceService?: InvoiceService;
    private _expenseDialog?: Promise<Dialog>;
    private _backupDialog?: Promise<Dialog>;
    private _personDialog?: Promise<Dialog>;
    private _cardDialog?: Promise<Dialog>;
    private _categoryDialog?: Promise<Dialog>;
    private _categoryDetailDialog?: Promise<Dialog>;
    private _simulationDialog?: Promise<Dialog>;
    private _persons: UiPerson[] = [];
    private _backendErrorShown = false;

    private get uiModel(): JSONModel {
        return this.getOwnerComponent()?.getModel("ui") as JSONModel;
    }

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

        try {
            await this.setupPersonSelector();
            this.applyPersonSelection(this.getSelectedPersonId());
        } catch (error) {
            if (isSessionExpiredError(error)) {
                return;
            }
            this.showBackendError();
        }
    }

    public onPersonChange(oEvent: Event): void {
        const selectedItem = (oEvent.getParameters() as { selectedItem?: { getKey?: () => string } }).selectedItem;
        const id = selectedItem?.getKey?.();

        if (!id) {
            return;
        }

        this.applyPersonSelection(id);
    }

    public async onLogout(): Promise<void> {
        await AuthenticationService.logout();
        this.navTo("Login");
    }

    private showBackendError(): void {
        if (this._backendErrorShown) {
            return;
        }

        this._backendErrorShown = true;
        SessionStorage.clear();
        MessageBox.error(this.getText("backendUnavailableLogin"), {
            onClose: () => {
                this._backendErrorShown = false;
                this.navTo("Login");
            }
        });
    }

    public onOpenExpenseDialog(): void {
        const oView = this.getView() as XMLView;
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

        void this._expenseDialog.then((dialog) => dialog.open());

        if (personId) {
            void this.loadExpenseOptions(personId);
        }
    }

    private async loadExpenseOptions(personId: string): Promise<void> {
        if (!this._odata) {
            return;
        }

        try {
            const [cards, categories] = await Promise.all([
                this._odata.requestEntitySet<CardRow & { IsActiveEntity?: boolean }>("Cards", {
                    select: ["ID", "Name"],
                    filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
                    filterExpression: DRAFT_FILTER,
                    expand: DRAFT_EXPAND
                }),
                this._odata.requestEntitySet<{ ID: string; Name: string; IsActiveEntity?: boolean }>("Categories", {
                    select: ["ID", "Name"],
                    filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
                    filterExpression: DRAFT_FILTER,
                    expand: DRAFT_EXPAND
                })
            ]);

            const cardOptions = cards.map((card) => ({ key: card.ID, text: card.Name, isDraft: card.IsActiveEntity === false }));
            const categoryOptions = categories.map((category) => ({ key: category.ID, text: category.Name, isDraft: category.IsActiveEntity === false }));

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

    public onOpenPersonDialog(): void {
        const oView = this.getView() as XMLView;
        this.uiModel.setProperty("/newPerson", { name: "", email: "", phone: "", income: "", currency: "BRL", target: "" });

        if (!this._personDialog) {
            this._personDialog = this.loadFragmentDialog(oView, "AddPerson");
        }

        void this._personDialog.then((dialog) => dialog.open());
    }

    public onOpenCardDialog(): void {
        const oView = this.getView() as XMLView;
        this.uiModel.setProperty("/newCard", { name: "", limit: "", currency: "BRL" });

        if (!this._cardDialog) {
            this._cardDialog = this.loadFragmentDialog(oView, "AddCard");
        }

        void this._cardDialog.then((dialog) => dialog.open());
    }

    public onOpenCategoryDialog(): void {
        const oView = this.getView() as XMLView;
        this.uiModel.setProperty("/newCategory", { name: "" });

        if (!this._categoryDialog) {
            this._categoryDialog = this.loadFragmentDialog(oView, "AddCategory");
        }

        void this._categoryDialog.then((dialog) => dialog.open());
    }

    public onPreviousMonth(): void {
        this.navigateMonth(-1);
    }

    public onNextMonth(): void {
        this.navigateMonth(1);
    }

    public onThisMonth(): void {
        const now = new Date();
        this.uiModel.setProperty("/period", { year: now.getFullYear(), month: now.getMonth() + 1 });
        this.applyPeriodData();
    }

    public onCategoryPress(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const bindingContext = source?.getBindingContext("ui") as Context | undefined;
        const category = bindingContext?.getObject() as CategoryBreakdownItem | undefined;

        if (!category) {
            return;
        }

        const oView = this.getView() as XMLView;
        const ui = this.uiModel;
        const personId = ui.getProperty("/selectedPersonId") as string;
        const period = ui.getProperty("/period") as Period;

        ui.setProperty("/busy", true);

        void getTransactionsByCategory(this.getServiceModel(), personId, category.ID, false, period.year, period.month)
            .then((result: CategoryTransactionsProperties) => {
                ui.setProperty("/categoryDetail", result);
                if (!this._categoryDetailDialog) {
                    this._categoryDetailDialog = this.loadFragmentDialog(oView, "CategoryDetail");
                }
                return this._categoryDetailDialog;
            })
            .then((dialog) => dialog.open())
            .catch((error) => {
                if (isSessionExpiredError(error)) {
                    return;
                }
                MessageBox.error(this.getText("errorLoadCategoryDetail"));
            })
            .finally(() => {
                ui.setProperty("/busy", false);
            });
    }

    public onOpenSimulationDialog(): void {
        const oView = this.getView() as XMLView;
        const now = new Date();
        const ui = this.uiModel;

        if (!ui.getProperty("/simulation")) {
            ui.setProperty("/simulation", { month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
        }
        if (!ui.getProperty("/simulationMonthOptions")) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            ui.setProperty("/simulationMonthOptions", monthNames.map((name, index) => ({ key: String(index + 1), text: name })));
        }
        ui.setProperty("/simulationResult", null);

        if (!this._simulationDialog) {
            this._simulationDialog = this.loadFragmentDialog(oView, "Simulation");
        }

        void this._simulationDialog.then((dialog) => dialog.open());
    }

    public onRestoreBackup(): void {
        const oView = this.getView() as XMLView;

        if (!this._backupDialog) {
            this._backupDialog = this.loadFragmentDialog(oView, "Backup");
        }

        void this._backupDialog.then((dialog) => dialog.open());
    }

    public async onExportBackup(): Promise<void> {
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

    public refresh(): void {
        void this.loadDashboard();
    }

    /**
     * Reloads persons and refreshes the current dashboard. Used by the create/restore dialogs.
     */
    public reload(): void {
        try {
            this._persons = [];
            this.getServiceModel().refresh();
        } catch {
            // ignore transient refresh errors; setupPersonSelector re-fetches the list.
        }

        void this.setupPersonSelector();
    }

    private getSelectedPersonId(): string {
        return (this.uiModel.getProperty("/selectedPersonId") as string) || "";
    }

    private async setupPersonSelector(): Promise<void> {
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
                    ImageType: person.ImageType
                }));
        } catch (error) {
            if (isSessionExpiredError(error)) {
                return;
            }
            this.showBackendError();
        }

        this._persons = persons;

        const select = this.byId("personSelect") as Select;

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
        const currentExists = persons.some((person) => person.ID === current);

        this.applyPersonSelection(current && currentExists ? current : persons[0].ID);
    }

    private getPersonsFromBinding(): UiPerson[] {
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

        const person = this.getPersonsFromBinding().find((candidate) => candidate.ID === id);
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

    private async loadSelectedPersonImage(person: UiPerson): Promise<void> {
        if (!person?.ID || !person.ImageType) {
            this.uiModel.setProperty("/selectedPersonImage", "");
            return;
        }

        try {
            const url = `${getOdataServiceUrl()}Persons(ID='${encodeURIComponent(person.ID)}',IsActiveEntity=true)/Image`;
            const response = await fetch(url, { headers: buildHeaders({}) });

            if (!response.ok) {
                return;
            }

            const blob = await response.blob();
            this.uiModel.setProperty("/selectedPersonImage", URL.createObjectURL(blob));
        } catch {
            // avatar stays with initials when the image cannot be loaded
        }
    }

    private applyPeriodData(): void {
        const ui = this.uiModel;
        const period = (ui.getProperty("/period") as Period) || this.currentPeriod();
        ui.setProperty("/period", period);
        ui.setProperty("/monthLabel", this.periodLabel(period.year, period.month));
        void this.loadDashboard();
    }

    private async loadDashboard(): Promise<void> {
        const ui = this.uiModel;
        const personId = this.getSelectedPersonId();
        const period = (ui.getProperty("/period") as Period) || this.currentPeriod();

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

            const cards = await this._odata.requestEntitySet<CardRow & { IsActiveEntity?: boolean }>("Cards", {
                select: ["ID", "Name", "Limit", "Currency", "DueDay", "ClosingDay"],
                filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
                filterExpression: DRAFT_FILTER,
                expand: DRAFT_EXPAND
            });
            // eslint-disable-next-line no-console
            console.log("[dashboard] first card:", cards[0]);
            ui.setProperty("/cards", cards.map((card) => ({
                ...card,
                Currency: resolveCurrency(card.Currency)
            })));
        } catch (error) {
            if (isSessionExpiredError(error)) {
                return;
            }
            // eslint-disable-next-line no-console
            console.error("[loadDashboard] ERROR:", error);
            this.showBackendError();
        } finally {
            ui.setProperty("/busy", false);
        }
    }

    private renderInvoice(invoice: CompleteInvoice): void {
        const ui = this.uiModel;
        const person = (ui.getProperty("/selectedPerson") as UiPerson) || {};

        const expenses = Number(invoice.TotalAmount) || 0;
        const income = Number(person.Income) || 0;
        const target = Number(person.ExpenseTarget) || 0;
        const currency = resolveCurrency(invoice.Currency?.code, resolveCurrency(person.Currency)) || "BRL";
        const available = income - expenses;
        const targetPercent = target > 0 ? Math.round((expenses / target) * 100) : 0;

        const transactions = (invoice.Transactions || []).map((transaction) => ({
            ...transaction,
            Currency: currency
        }));

        ui.setProperty("/summary", {
            available: formatCurrency(available, currency),
            income: formatCurrency(income, currency),
            expenses: formatCurrency(expenses, currency),
            savings: formatCurrency(available, currency),
            target: formatCurrency(target, currency),
            expenseHint: target > 0
                ? this.getText("summaryExpenseHintMeta", [String(targetPercent)])
                : this.getText("summaryExpenseHintSpent", [String(Math.round(expenses))]),
            targetHint: target > 0
                ? this.getText("summaryTargetHintPlanned")
                : this.getText("summaryTargetHintEmpty"),
            trendText: this.getText("trendCalculating"),
            trendIcon: "sap-icon://trend-up"
        });
        ui.setProperty("/transactions", transactions);

        this.buildCategories(transactions, expenses, currency);

        void this.loadTrend(this.getSelectedPersonId(), this.currentPeriodDefault(), expenses);
    }

    private async loadTrend(personId: string, period: Period, expenses: number): Promise<void> {
        if (!this._invoiceService) {
            return;
        }

        const previous = this.shiftMonth(period.year, period.month, -1);

        try {
            const previousInvoice = await this._invoiceService.getCompleteInvoice(personId, previous);
            const previousExpenses = Number(previousInvoice.TotalAmount) || 0;

            const trend = previousExpenses > 0
                ? ((expenses - previousExpenses) / previousExpenses) * 100
                : (expenses > 0 ? 100 : 0);
            const trendingUp = trend > 0;
            const delta = String(Math.abs(Math.round(trend)));

            let trendText: string;
            if (previousExpenses > 0) {
                trendText = trendingUp
                    ? this.getText("trendMore", [delta])
                    : this.getText("trendLess", [delta]);
            } else {
                trendText = expenses > 0
                    ? this.getText("trendNoComparison")
                    : this.getText("trendNoExpenses");
            }

            this.uiModel.setProperty("/summary/trendText", trendText);
            this.uiModel.setProperty("/summary/trendIcon", trendingUp ? "sap-icon://trend-down" : "sap-icon://trend-up");
        } catch (error) {
            if (isSessionExpiredError(error)) {
                return;
            }
        }
    }

    private currentPeriodDefault(): Period {
        return (this.uiModel.getProperty("/period") as Period) || this.currentPeriod();
    }

    private buildCategories(transactions: TransactionRow[], expenses: number, currency: string): void {
        const map = new Map<string, { ID: string; Name: string; CategoryImagePath?: string; Total: number }>();

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

        const categories: CategoryBreakdownItem[] = Array.from(map.values())
            .map((item) => ({
                ID: item.ID,
                Name: item.Name,
                CategoryImagePath: item.CategoryImagePath,
                Total: item.Total,
                Percent: expenses > 0 ? Math.round((item.Total / expenses) * 100) : 0,
                CurrencyCode: currency
            }))
            .sort((a, b) => b.Total - a.Total);

        this.uiModel.setProperty("/categories", categories);
    }

    private navigateMonth(delta: number): void {
        const period = this.currentPeriodDefault();
        this.uiModel.setProperty("/period", this.shiftMonth(period.year, period.month, delta));
        this.applyPeriodData();
    }

    private shiftMonth(year: number, month: number, delta: number): Period {
        const total = year * 12 + (month - 1) + delta;
        return {
            year: Math.floor(total / 12),
            month: (total % 12) + 1
        };
    }

    private currentPeriod(): Period {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }

    private periodLabel(year: number, month: number): string {
        const label = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        return `Visão geral • ${label}`;
    }

    private loadFragmentDialog(oView: XMLView, fragmentName: string): Promise<Dialog> {
        return Fragment.load({
            name: `apps.dflc.expensemanager.view.fragments.${fragmentName}`
        }).then((dialog) => {
            oView.addDependent(dialog as Control);
            return dialog as Dialog;
        });
    }
}

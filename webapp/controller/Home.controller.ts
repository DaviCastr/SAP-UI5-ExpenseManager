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
import Environment, { EnvironmentType } from "../util/Environment";
import { formatCurrency } from "../util/format";
import { ODataService } from "../service/ODataService";
import { InvoiceService, type CompleteInvoice, type Period } from "../service/InvoiceService";
import type ListBinding from "sap/ui/model/ListBinding";
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
import { isSessionExpiredError } from "../util/http";

function resolveCurrency(currency: unknown, fallback = "BRL"): string {
    if (typeof currency === "string" && currency) {
        return currency;
    }
    if (currency && typeof currency === "object") {
        return (currency as { code?: string }).code || fallback;
    }
    return fallback;
}

export default class Home extends BaseController {
    private _invoiceService?: InvoiceService;
    private _expenseDialog?: Promise<Dialog>;
    private _backupDialog?: Promise<Dialog>;
    private _personDialog?: Promise<Dialog>;
    private _cardDialog?: Promise<Dialog>;
    private _categoryDialog?: Promise<Dialog>;
    private _categoryDetailDialog?: Promise<Dialog>;
    private _simulationDialog?: Promise<Dialog>;

    private get uiModel(): JSONModel {
        return this.getOwnerComponent()?.getModel("ui") as JSONModel;
    }

    public onInit(): void {
        void this.initView();
    }

    private async initView(): Promise<void> {
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

    public onOpenExpenseDialog(): void {
        const oView = this.getView() as XMLView;
        this.uiModel.setProperty("/newExpense", { description: "", amount: "", cardId: "", categoryId: "" });

        if (!this._expenseDialog) {
            this._expenseDialog = this.loadFragmentDialog(oView, "AddExpense");
        }

        void this._expenseDialog.then((dialog) => dialog.open());
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
    public reload(): void {
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

    private getSelectedPersonId(): string {
        return (this.uiModel.getProperty("/selectedPersonId") as string) || "";
    }

    private setupPersonSelector(): void {
        const select = this.byId("personSelect") as Select;
        const binding = select.getBinding("items") as ListBinding;

        binding?.attachDataReceived(() => {
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
                const first = contexts[0]?.getProperty("ID") as string | undefined;
                if (first) {
                    this.applyPersonSelection(first);
                }
            } else if (!(this.byId("personSection") as Control).getBindingContext()) {
                this.applyPersonSelection(current);
            }
        });
    }

    private applyPersonSelection(id: string): void {
        const ui = this.uiModel;

        if (!id) {
            ui.setProperty("/selectedPersonId", "");
            return;
        }

        ui.setProperty("/selectedPersonId", id);

        const section = this.byId("personSection") as Control;
        section.bindElement({
            path: `/Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=true)`
        });

        this.applyPeriodData();
    }

    private applyPeriodData(): void {
        const ui = this.uiModel;
        const personId = this.getSelectedPersonId();

        if (!personId) {
            return;
        }

        const period = (ui.getProperty("/period") as Period) || this.currentPeriod();
        ui.setProperty("/period", period);
        ui.setProperty("/monthLabel", this.periodLabel(period.year, period.month));

        const section = this.byId("periodSection") as Control;
        section.bindElement({
            path: `/RetrieveCompleteInvoice(PersonId='${encodeURIComponent(personId)}',Year=${period.year},Month=${period.month})`,
            events: {
                dataRequested: () => ui.setProperty("/busy", true),
                dataReceived: () => {
                    void this.refreshDerived();
                }
            }
        });
    }

    public onTransactionsDataReceived(): void {
        void this.refreshDerived();
    }

    private refreshDerived(): void {
        const ui = this.uiModel;
        const personContext = (this.byId("personSection") as Control).getBindingContext();
        const periodContext = (this.byId("periodSection") as Control).getBindingContext();
        const person = personContext?.getObject() as {
            ID: string;
            Name?: string;
            Income?: number;
            ExpenseTarget?: number;
            Currency?: string | { code?: string };
        } | undefined;
        const invoice = periodContext?.getObject() as CompleteInvoice | undefined;

        if (!person?.ID || !invoice) {
            return;
        }

        const period = (ui.getProperty("/period") as Period) || this.currentPeriod();

        const currency = invoice.Currency?.code || resolveCurrency(person.Currency) || "BRL";
        const income = Number(person.Income) || 0;
        const expenses = Number(invoice.TotalAmount) || 0;
        const target = Number(person.ExpenseTarget) || 0;
        const available = income - expenses;
        const savings = income - expenses;
        const targetPercent = target > 0 ? Math.round((expenses / target) * 100) : 0;

        ui.setProperty("/summary", {
            available: formatCurrency(available, currency),
            income: formatCurrency(income, currency),
            expenses: formatCurrency(expenses, currency),
            savings: formatCurrency(savings, currency),
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
        ui.setProperty("/monthLabel", this.periodLabel(period.year, period.month));

        this.buildCategories(invoice);
        ui.setProperty("/busy", false);

        void this.loadTrend(person.ID, period);
    }

    private async loadTrend(personId: string, period: Period): Promise<void> {
        if (!this._invoiceService) {
            return;
        }

        const previous = this.shiftMonth(period.year, period.month, -1);

        try {
            const expenses = Number((this.byId("periodSection") as Control).getBindingContext()?.getProperty("TotalAmount")) || 0;
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

    private buildCategories(invoice: CompleteInvoice): void {
        const map = new Map<string, { ID: string; Name: string; CategoryImagePath?: string; Total: number }>();
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
        const categories: CategoryBreakdownItem[] = Array.from(map.values())
            .map((item) => ({
                ID: item.ID,
                Name: item.Name,
                CategoryImagePath: item.CategoryImagePath,
                Total: item.Total,
                Percent: total > 0 ? Math.round((item.Total / total) * 100) : 0,
                CurrencyCode: currency
            }))
            .sort((a, b) => b.Total - a.Total);

        this.uiModel.setProperty("/categories", categories);
    }

    private navigateMonth(delta: number): void {
        const period = (this.uiModel.getProperty("/period") as Period) || this.currentPeriod();
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

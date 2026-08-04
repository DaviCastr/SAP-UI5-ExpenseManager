import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import Context from "sap/ui/model/Context";
import Fragment from "sap/ui/core/Fragment";
import XMLView from "sap/ui/core/mvc/XMLView";
import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";
import Environment, { EnvironmentType } from "../util/Environment";
import { formatCurrency } from "../util/format";
import {
    getCompleteInvoice,
    getTransactionsByCategory,
    CompleteInvoiceReturnProperties,
    CategoryTransactionsProperties,
    CategoryBreakdownItem
} from "../util/expenseApi";
import {
    requestExportBackup,
    fetchBackupStream,
    deleteBackupRow,
    downloadBlob
} from "../util/backupApi";
import { isSessionExpiredError } from "../util/http";

interface Person {
    ID: string;
    Name: string;
    Income: number;
    ExpenseTarget: number;
    Currency: unknown;
}

interface Period {
    year: number;
    month: number;
}

interface Summary {
    available: string;
    income: string;
    expenses: string;
    savings: string;
    target: string;
    expenseHint: string;
    targetHint: string;
    trendText: string;
    trendIcon: string;
}

const EMPTY_SUMMARY: Summary = {
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
        void this.bootstrap();
    }

    public async bootstrap(): Promise<void> {
        const model = await this.waitForServiceModel();

        if (!model) {
            if (Environment.current() !== EnvironmentType.GITHUB) {
                MessageBox.error(this.getText("backendUnavailable"));
            }
            return;
        }

        await this.loadPersons(model);
    }

    public onPersonChange(): void {
        void this.loadPeriodData();
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
        void this.loadPeriodData();
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
        const person = ui.getProperty("/selectedPerson") as Person;
        const period = ui.getProperty("/period") as Period;

        ui.setProperty("/busy", true);

        void getTransactionsByCategory(person.ID, category.ID, false, period.year, period.month)
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

    public async refresh(): Promise<void> {
        try {
            const model = this.getServiceModel();
            model.refresh();
        } catch (error) {
            // The period data below is reloaded through the API regardless of the OData model.
        }

        await this.loadPeriodData();
    }

    private async waitForServiceModel(): Promise<ODataModel | null> {
        const environment = Environment.current();

        for (let attempt = 0; attempt < 40; attempt++) {
            const model = this.getOwnerComponent()?.getModel() as ODataModel | undefined;

            if (model) {
                const serviceUrl = this.getServiceUrl(model);

                if (environment === EnvironmentType.GITHUB) {
                    if (serviceUrl && serviceUrl.indexOf("/api/") !== 0) {
                        return model;
                    }
                } else {
                    return model;
                }
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        return null;
    }

    private getServiceUrl(model: ODataModel): string {
        const maybeOdata = model as unknown as { getServiceUrl?: () => string };
        return typeof maybeOdata.getServiceUrl === "function" ? maybeOdata.getServiceUrl() : "";
    }

    private async loadPersons(model: ODataModel): Promise<void> {
        try {
            const binding = model.bindList("/Persons", undefined, undefined, undefined, {
                $select: "ID,Name,Income,ExpenseTarget,Currency"
            });
            const contexts = await binding.requestContexts();
            const persons = contexts.map((context) => context.getObject()) as Person[];

            const ui = this.uiModel;
            ui.setProperty("/persons", persons);

            if (!persons.length) {
                ui.setProperty("/personsEmpty", true);
                ui.setProperty("/selectedPerson", { ID: "" });
                ui.setProperty("/invoice", { Transactions: [] });
                ui.setProperty("/categories", []);
                ui.setProperty("/summary", { ...EMPTY_SUMMARY });
                ui.setProperty("/monthLabel", "Nenhuma pessoa para gerenciar");
                return;
            }

            ui.setProperty("/personsEmpty", false);

            const currentId = ui.getProperty("/selectedPerson/ID") as string;
            const selected = persons.find((person) => person.ID === currentId) || persons[0];

            ui.setProperty("/selectedPerson", selected || { ID: "" });

            if (!ui.getProperty("/period")) {
                const now = new Date();
                ui.setProperty("/period", { year: now.getFullYear(), month: now.getMonth() + 1 });
            }

            if (selected?.ID) {
                await this.loadPeriodData();
            }
        } catch (error) {
            if (isSessionExpiredError(error)) {
                return;
            }
            MessageBox.error(this.getText("errorLoadPersons"));
        }
    }

    private async loadPeriodData(): Promise<void> {
        const ui = this.uiModel;
        const person = ui.getProperty("/selectedPerson") as Person | undefined;

        if (!person?.ID) {
            return;
        }

        const period = (ui.getProperty("/period") as Period) || this.currentPeriod();
        ui.setProperty("/busy", true);

        try {
            const previous = this.shiftMonth(period.year, period.month, -1);
            const [invoice, previousInvoice] = await Promise.all([
                getCompleteInvoice(person.ID, period.year, period.month),
                getCompleteInvoice(person.ID, previous.year, previous.month)
            ]);

            ui.setProperty("/invoice", invoice);
            ui.setProperty("/period", period);

            const currency = invoice.Currency?.code || resolveCurrency(person.Currency);
            const income = Number(person.Income) || 0;
            const expenses = Number(invoice.TotalAmount) || 0;
            const previousExpenses = Number(previousInvoice.TotalAmount) || 0;
            const target = Number(person.ExpenseTarget) || 0;
            const available = income - expenses;
            const savings = income - expenses;

            const trend = previousExpenses > 0
                ? ((expenses - previousExpenses) / previousExpenses) * 100
                : (expenses > 0 ? 100 : 0);

            const trendText = previousExpenses > 0
                ? `${Math.abs(Math.round(trend))}% ${trend <= 0 ? "menos" : "mais"} que o mês anterior`
                : (expenses > 0 ? "Sem comparação com o mês anterior" : "Sem gastos registrados no período");
            const trendIcon = trend > 0 ? "sap-icon://trend-down" : "sap-icon://trend-up";

            const targetPercent = target > 0 ? Math.round((expenses / target) * 100) : 0;

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

    private buildCategories(invoice: CompleteInvoiceReturnProperties): void {
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
        void this.loadPeriodData();
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

    private getServiceModel(): ODataModel {
        const model = this.getOwnerComponent()?.getModel();
        if (!model) {
            throw new Error("O serviço financeiro não está disponível.");
        }
        return model as ODataModel;
    }
}

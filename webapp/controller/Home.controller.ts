import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Control from "sap/ui/core/Control";
import Fragment from "sap/ui/core/Fragment";
import XMLView from "sap/ui/core/mvc/XMLView";
import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";
import Environment, { EnvironmentType } from "../util/Environment";
import { formatCurrency } from "../util/format";
import {
    requestExportBackup,
    fetchBackupStream,
    deleteBackupRow,
    downloadBlob
} from "../util/backupApi";

interface Person {
    ID: string;
    Name: string;
    Income: number;
    ExpenseTarget: number;
    Currency: string;
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

export default class Home extends BaseController {
    private _expenseDialog?: Promise<Dialog>;
    private _backupDialog?: Promise<Dialog>;
    private _personDialog?: Promise<Dialog>;
    private _cardDialog?: Promise<Dialog>;
    private _categoryDialog?: Promise<Dialog>;

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
                MessageBox.error("Não foi possível conectar ao serviço financeiro.");
            }
            return;
        }

        await this.loadPersons(model);
    }

    public onPersonChange(): void {
        const ui = this.uiModel;
        const personId = ui.getProperty("/selectedPerson/ID") as string;
        const persons = ui.getProperty("/persons") as Person[];
        const person = persons.find((item) => item.ID === personId);

        if (person) {
            const model = this.getOwnerComponent()?.getModel() as ODataModel;
            void this.loadPersonData(model, person);
        }
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

    public async refresh(): Promise<void> {
        const model = this.getServiceModel();
        const ui = this.uiModel;

        try {
            model.refresh();
            const person = ui.getProperty("/selectedPerson") as Person | undefined;
            if (person?.ID) {
                await this.loadPersonData(model, person);
            }
        } catch (error) {
            MessageBox.error("Não foi possível atualizar os dados.");
        }
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
            MessageToast.show("Backup exportado com sucesso.");
        } catch (error) {
            MessageBox.error("Não foi possível exportar o backup. Verifique sua conexão.");
        } finally {
            ui.setProperty("/busy", false);
        }
    }

    private async waitForServiceModel(): Promise<ODataModel | null> {
        const environment = Environment.current();

        for (let attempt = 0; attempt < 40; attempt++) {
            const model = this.getOwnerComponent()?.getModel() as ODataModel | undefined;

            if (model) {
                const serviceUrl = typeof (model as any).getServiceUrl === "function"
                    ? (model as any).getServiceUrl()
                    : "";

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
                ui.setProperty("/summary", { ...EMPTY_SUMMARY });
                ui.setProperty("/monthLabel", "Nenhuma pessoa para gerenciar");
                return;
            }

            ui.setProperty("/personsEmpty", false);

            const currentId = ui.getProperty("/selectedPerson/ID") as string;
            const selected = persons.find((person) => person.ID === currentId) || persons[0];

            ui.setProperty("/selectedPerson", selected || { ID: "" });

            if (selected) {
                await this.loadPersonData(model, selected);
            } else {
                ui.setProperty("/monthLabel", this.currentMonthLabel());
            }
        } catch (error) {
            MessageBox.error("Não foi possível carregar suas pessoas. Verifique sua conexão.");
        }
    }

    private async loadPersonData(model: ODataModel, person: Person): Promise<void> {
        const ui = this.uiModel;
        ui.setProperty("/busy", true);

        try {
            const now = new Date();
            const startPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
            const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const toIso = (date: Date) => date.toISOString().slice(0, 10);

            const filters = [
                new Filter({ path: "Invoice/Card/Person/ID", operator: FilterOperator.EQ, value1: person.ID }),
                new Filter({ path: "Date", operator: FilterOperator.GE, value1: toIso(startPrevious) }),
                new Filter({ path: "Date", operator: FilterOperator.LT, value1: toIso(startNext) })
            ];

            const binding = model.bindList("/Transactions", undefined, undefined, filters, {
                $select: "Amount,Date,Currency"
            });
            const contexts = await binding.requestContexts();

            let currentExpenses = 0;
            let previousExpenses = 0;

            contexts.forEach((context) => {
                const transaction = context.getObject();
                const amount = Number(transaction.Amount) || 0;
                const date = new Date(transaction.Date);

                if (date >= startCurrent && date < startNext) {
                    currentExpenses += amount;
                } else if (date >= startPrevious && date < startCurrent) {
                    previousExpenses += amount;
                }
            });

            const income = Number(person.Income) || 0;
            const target = Number(person.ExpenseTarget) || 0;
            const available = income - currentExpenses;
            const savings = income - currentExpenses;
            const currency = person.Currency || "BRL";

            const trend = previousExpenses > 0
                ? ((currentExpenses - previousExpenses) / previousExpenses) * 100
                : (currentExpenses > 0 ? 100 : 0);

            const trendText = previousExpenses > 0
                ? `${Math.abs(Math.round(trend))}% ${trend <= 0 ? "menos" : "mais"} que o mês anterior`
                : (currentExpenses > 0 ? "Sem comparação com o mês anterior" : "Sem gastos registrados este mês");
            const trendIcon = trend > 0 ? "sap-icon://trend-down" : "sap-icon://trend-up";

            const targetPercent = target > 0 ? Math.round((currentExpenses / target) * 100) : 0;

            ui.setProperty("/summary", {
                available: formatCurrency(available, currency),
                income: formatCurrency(income, currency),
                expenses: formatCurrency(currentExpenses, currency),
                savings: formatCurrency(savings, currency),
                target: formatCurrency(target, currency),
                expenseHint: target > 0 ? `${targetPercent}% da meta utilizada` : `${Math.round(currentExpenses)} de gastos no mês`,
                targetHint: target > 0 ? "Meta planejada para o mês" : "Defina uma meta de gasto",
                trendText,
                trendIcon
            });
            ui.setProperty("/monthLabel", this.currentMonthLabel());
        } catch (error) {
            MessageBox.error("Não foi possível carregar os dados desta pessoa.");
        } finally {
            ui.setProperty("/busy", false);
        }
    }

    private currentMonthLabel(): string {
        const label = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        return `Visão geral • ${label}`;
    }

    private loadFragmentDialog(oView: XMLView, fragmentName: string): Promise<Dialog> {
        return Fragment.load({
            name: `apps.dflc.expensemanager.ext.fragment.${fragmentName}`
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

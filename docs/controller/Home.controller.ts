import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";
import Environment, { EnvironmentType } from "../util/Environment";
import { formatCurrency } from "../util/format";

interface Person {
    ID: string;
    Name: string;
    Income: number;
    ExpenseTarget: number;
    Currency: string;
}

export default class Home extends BaseController {
    private get uiModel(): JSONModel {
        return this.getOwnerComponent()?.getModel("ui") as JSONModel;
    }

    public onInit(): void {
        void this.bootstrap();
    }

    private async bootstrap(): Promise<void> {
        const model = await this.waitForServiceModel();

        if (!model) {
            MessageBox.error("Não foi possível conectar ao serviço financeiro.");
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
        this.uiModel.setProperty("/newExpense", { description: "", amount: "", cardId: "", categoryId: "" });
        (this.byId("expenseDialog") as Dialog).open();
    }

    public onCloseExpenseDialog(): void {
        (this.byId("expenseDialog") as Dialog).close();
    }

    public async onCreateExpense(): Promise<void> {
        const expense = this.uiModel.getProperty("/newExpense") as { description: string; amount: string; cardId: string; categoryId: string };
        if (!expense.description || !expense.amount || !expense.cardId || !expense.categoryId) {
            MessageBox.warning("Preencha descrição, valor, cartão e categoria para continuar.");
            return;
        }

        const model = this.getServiceModel();
        const action = model.bindContext("/AddCardExpense(...)");
        action.setParameter("CardId", expense.cardId);
        action.setParameter("CategoryId", expense.categoryId);
        action.setParameter("Description", expense.description);
        action.setParameter("Value", Number(expense.amount.replace(",", ".")));
        action.setParameter("Currency", "BRL");
        action.setParameter("TransactionDate", new Date().toISOString().slice(0, 10));
        action.setParameter("Installments", 1);
        action.setParameter("FixedExpense", false);

        try {
            await action.invoke();
            (this.byId("expenseDialog") as Dialog).close();
            MessageToast.show("Gasto registrado com sucesso.");
        } catch (error) {
            MessageBox.error("Não foi possível registrar o gasto. Verifique sua conexão e tente novamente.");
        }
    }

    public onOpenCardDialog(): void {
        this.uiModel.setProperty("/newCard", { name: "", limit: "", currency: "BRL" });
        (this.byId("cardDialog") as Dialog).open();
    }

    public onCloseCardDialog(): void {
        (this.byId("cardDialog") as Dialog).close();
    }

    public async onCreateCardDraft(): Promise<void> {
        const card = this.uiModel.getProperty("/newCard") as { name: string; limit: string; currency: string };
        if (!card.name || !card.limit) {
            MessageBox.warning("Informe o nome e o limite do cartão.");
            return;
        }

        const model = this.getServiceModel();
        const binding = model.bindList("/Cards", undefined, undefined, undefined, { $$updateGroupId: "draft" });
        binding.create({
            Name: card.name,
            Limit: Number(card.limit.replace(",", ".")),
            AvailableLimit: Number(card.limit.replace(",", ".")),
            Currency_code: card.currency,
            DueDay: 10,
            ClosingDay: 3
        });

        try {
            await model.submitBatch("draft");
            (this.byId("cardDialog") as Dialog).close();
            MessageToast.show("Cartão salvo como rascunho. Revise-o antes de publicar.");
        } catch (error) {
            MessageBox.error("Não foi possível salvar o rascunho do cartão.");
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

    private getServiceModel(): ODataModel {
        const model = this.getOwnerComponent()?.getModel();
        if (!model) {
            throw new Error("O serviço financeiro não está disponível.");
        }
        return model as ODataModel;
    }
}

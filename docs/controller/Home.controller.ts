import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import { BaseController } from "./BaseController";

interface FormData {
    description: string;
    amount: string;
    cardId: string;
    categoryId: string;
}

export default class Home extends BaseController {
    private get uiModel(): JSONModel {
        return this.getOwnerComponent()?.getModel("ui") as JSONModel;
    }

    public onOpenInsights(): void {
        MessageToast.show("O planejamento detalhado será a próxima área do seu painel.");
    }

    public onOpenExpenseDialog(): void {
        this.uiModel.setProperty("/newExpense", { description: "", amount: "", cardId: "", categoryId: "" });
        (this.byId("expenseDialog") as Dialog).open();
    }

    public onCloseExpenseDialog(): void {
        (this.byId("expenseDialog") as Dialog).close();
    }

    public async onCreateExpense(): Promise<void> {
        const expense = this.uiModel.getProperty("/newExpense") as FormData;
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
            await action.execute();
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

    private getServiceModel(): ODataModel {
        const model = this.getOwnerComponent()?.getModel();
        if (!model) {
            throw new Error("O serviço financeiro não está disponível.");
        }
        return model as ODataModel;
    }
}

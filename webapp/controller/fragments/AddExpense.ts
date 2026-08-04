import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { addCardExpense } from "../../util/expenseApi";
import type Home from "../../controller/Home.controller";

interface NewExpense {
    description: string;
    amount: string;
    cardId: string;
    categoryId: string;
}

const AdicionarGasto = {
    onCancelarGasto: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onAddExpense: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const expense = uiModel.getProperty("/newExpense") as NewExpense;

        if (!expense.description || !expense.amount || !expense.cardId || !expense.categoryId) {
            MessageBox.warning("Preencha descrição, valor, cartão e categoria para continuar.");
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            await addCardExpense({
                CardId: expense.cardId,
                CategoryId: expense.categoryId,
                Description: expense.description,
                Value: Number(expense.amount.replace(",", ".")),
                Currency: "BRL",
                TransactionDate: new Date().toISOString().slice(0, 10),
                Installments: 1,
                FixedExpense: false
            });

            dialog.close();
            MessageToast.show("Gasto registrado com sucesso.");
            await (view.getController() as Home).refresh();
        } catch (error) {
            MessageBox.error("Não foi possível registrar o gasto. Verifique sua conexão e tente novamente.");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AdicionarGasto;

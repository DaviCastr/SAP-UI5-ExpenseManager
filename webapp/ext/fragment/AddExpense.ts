import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";

interface NewExpense {
    description: string;
    amount: string;
    cardId: string;
    categoryId: string;
}

const AddExpense = {
    onCancelarGasto: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onAddExpense: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;
        const model = view.getModel() as ODataModel;

        const expense = uiModel.getProperty("/newExpense") as NewExpense;

        if (!expense.description || !expense.amount || !expense.cardId || !expense.categoryId) {
            MessageBox.warning("Preencha descrição, valor, cartão e categoria para continuar.");
            return;
        }

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
            dialog.close();
            MessageToast.show("Gasto registrado com sucesso.");
        } catch (error) {
            MessageBox.error("Não foi possível registrar o gasto. Verifique sua conexão e tente novamente.");
        }
    }
};

export default AddExpense;

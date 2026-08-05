import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { addCardExpense } from "../../util/expenseApi";
import { isSessionExpiredError } from "../../util/http";
import { getText } from "../../util/i18n";
import type Home from "../../controller/Home.controller";

interface NewExpense {
    description: string;
    amount: string;
    cardId: string;
    categoryId: string;
    installments: number;
    fixedExpense: boolean;
    transactionDate: string;
}

interface ExpenseOption {
    key: string;
    text: string;
    isDraft?: boolean;
}

const DRAFT_BLOCK_MESSAGE = "Este item está como rascunho. Salve-o primeiro antes de registrar um gasto.";

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
            MessageBox.warning(getText(view, "errorFillRequiredFields"));
            return;
        }

        const selectedCard = (uiModel.getProperty("/expenseCardOptions") as ExpenseOption[] | undefined)?.find((option) => option.key === expense.cardId);
        const selectedCategory = (uiModel.getProperty("/expenseCategoryOptions") as ExpenseOption[] | undefined)?.find((option) => option.key === expense.categoryId);

        if (selectedCard?.isDraft) {
            MessageBox.warning(DRAFT_BLOCK_MESSAGE);
            return;
        }
        if (selectedCategory?.isDraft) {
            MessageBox.warning(DRAFT_BLOCK_MESSAGE);
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            await addCardExpense(view.getModel() as ODataModel, {
                CardId: expense.cardId,
                CategoryId: expense.categoryId,
                Description: expense.description,
                Value: Number(expense.amount.replace(",", ".")),
                Currency: "BRL",
                TransactionDate: expense.transactionDate || new Date().toISOString().slice(0, 10),
                Installments: Number(expense.installments) || 1,
                FixedExpense: !!expense.fixedExpense
            });

            dialog.close();
            MessageToast.show(getText(view, "expenseRegistered"));
            void (view.getController() as Home).refresh();
        } catch (error) {
            if (isSessionExpiredError(error)) {
                return;
            }
            MessageBox.error(getText(view, "errorRegisterExpense"));
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AdicionarGasto;

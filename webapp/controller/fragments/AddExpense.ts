import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Select from "sap/m/Select";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { addCardExpense } from "../../util/expenseApi";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import type Home from "../../controller/Home.controller";
import type { NewExpense } from "../../model/UiModel";

const AdicionarGasto = {
    onCancelarGasto: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onAddExpense: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const expense = uiModel.getProperty("/newExpense") as NewExpense;
        const selectedCard = (Fragment.byId("AddExpense", "expenseCard") as Select | undefined)?.getSelectedItem();
        const selectedCategory = (Fragment.byId("AddExpense", "expenseCategory") as Select | undefined)?.getSelectedItem();

        const card = selectedCard?.getBindingContext()?.getObject() as
            | { ID?: string; Name?: string; IsActiveEntity?: boolean }
            | undefined;
        const category = selectedCategory?.getBindingContext()?.getObject() as
            | { ID?: string; Name?: string; IsActiveEntity?: boolean }
            | undefined;

        if (!expense.description || !expense.amount || !card?.ID || !category?.ID) {
            showWarning(view, "errorFillRequiredFields");
            return;
        }

        if (card.IsActiveEntity === false || category.IsActiveEntity === false) {
            showWarning(view, "errorDraftBlocked");
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            await addCardExpense(view.getModel() as ODataModel, {
                CardId: card.ID,
                CategoryId: category.ID,
                Description: expense.description,
                Value: Number(expense.amount.replace(",", ".")),
                Currency: "BRL",
                TransactionDate: expense.transactionDate || new Date().toISOString().slice(0, 10),
                Installments: Number(expense.installments) || 1,
                FixedExpense: !!expense.fixedExpense
            });

            dialog.close();
            showToast(view, "expenseRegistered");
            void (view.getController() as Home).refresh();
        } catch (error) {
            handleActionError(view, error, "errorRegisterExpense");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AdicionarGasto;

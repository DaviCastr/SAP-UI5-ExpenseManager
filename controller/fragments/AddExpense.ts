import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Select from "sap/m/Select";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { addCardExpense } from "../../util/expenseApi";
import { isSessionExpiredError } from "../../util/http";
import { getText } from "../../util/i18n";
import type Home from "../../controller/Home.controller";
import type { NewExpense } from "../../model/UiModel";

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
        const selectedCard = (Fragment.byId("AddExpense", "expenseCard") as Select | undefined)?.getSelectedItem();
        const selectedCategory = (Fragment.byId("AddExpense", "expenseCategory") as Select | undefined)?.getSelectedItem();

        const card = selectedCard?.getBindingContext()?.getObject() as
            | { ID?: string; Name?: string; IsActiveEntity?: boolean }
            | undefined;
        const category = selectedCategory?.getBindingContext()?.getObject() as
            | { ID?: string; Name?: string; IsActiveEntity?: boolean }
            | undefined;

        if (!expense.description || !expense.amount || !card?.ID || !category?.ID) {
            MessageBox.warning(getText(view, "errorFillRequiredFields"));
            return;
        }

        if (card.IsActiveEntity === false || category.IsActiveEntity === false) {
            MessageBox.warning(DRAFT_BLOCK_MESSAGE);
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

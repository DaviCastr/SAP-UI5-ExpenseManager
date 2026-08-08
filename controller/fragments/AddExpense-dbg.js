sap.ui.define(["sap/ui/core/Fragment", "sap/m/MessageBox", "sap/m/MessageToast", "../../util/expenseApi", "../../util/http", "../../util/i18n"], function (Fragment, MessageBox, MessageToast, ____util_expenseApi, ____util_http, ____util_i18n) {
  "use strict";

  const addCardExpense = ____util_expenseApi["addCardExpense"];
  const isSessionExpiredError = ____util_http["isSessionExpiredError"];
  const getText = ____util_i18n["getText"];
  const DRAFT_BLOCK_MESSAGE = "Este item está como rascunho. Salve-o primeiro antes de registrar um gasto.";
  const AdicionarGasto = {
    onCancelarGasto: function () {
      this.getParent().close();
    },
    onAddExpense: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const uiModel = view.getModel("ui");
      const expense = uiModel.getProperty("/newExpense");
      const selectedCard = Fragment.byId("AddExpense", "expenseCard")?.getSelectedItem();
      const selectedCategory = Fragment.byId("AddExpense", "expenseCategory")?.getSelectedItem();
      const card = selectedCard?.getBindingContext()?.getObject();
      const category = selectedCategory?.getBindingContext()?.getObject();
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
        await addCardExpense(view.getModel(), {
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
        void view.getController().refresh();
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
  return AdicionarGasto;
});
//# sourceMappingURL=AddExpense-dbg.js.map

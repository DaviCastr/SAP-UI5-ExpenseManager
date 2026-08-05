sap.ui.define(["sap/m/MessageBox", "sap/m/MessageToast", "../../util/expenseApi", "../../util/http", "../../util/i18n"], function (MessageBox, MessageToast, ____util_expenseApi, ____util_http, ____util_i18n) {
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
      if (!expense.description || !expense.amount || !expense.cardId || !expense.categoryId) {
        MessageBox.warning(getText(view, "errorFillRequiredFields"));
        return;
      }
      const selectedCard = uiModel.getProperty("/expenseCardOptions")?.find(option => option.key === expense.cardId);
      const selectedCategory = uiModel.getProperty("/expenseCategoryOptions")?.find(option => option.key === expense.categoryId);
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
        await addCardExpense(view.getModel(), {
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

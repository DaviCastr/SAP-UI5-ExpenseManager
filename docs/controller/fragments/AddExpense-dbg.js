sap.ui.define(["sap/m/MessageBox", "sap/m/MessageToast", "../../util/expenseApi", "../../util/http", "../../util/i18n"], function (MessageBox, MessageToast, ____util_expenseApi, ____util_http, ____util_i18n) {
  "use strict";

  const addCardExpense = ____util_expenseApi["addCardExpense"];
  const isSessionExpiredError = ____util_http["isSessionExpiredError"];
  const getText = ____util_i18n["getText"];
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
      uiModel.setProperty("/busy", true);
      try {
        await addCardExpense(view.getModel(), {
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

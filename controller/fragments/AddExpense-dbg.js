sap.ui.define(["sap/ui/core/Fragment", "../../util/expenseApi", "../../util/feedback"], function (Fragment, ____util_expenseApi, ____util_feedback) {
  "use strict";

  const addCardExpense = ____util_expenseApi["addCardExpense"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const AddExpense = {
    onCancelExpense: function () {
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
        showWarning(view, "errorFillRequiredFields");
        return;
      }
      if (card.IsActiveEntity === false || category.IsActiveEntity === false) {
        showWarning(view, "errorDraftBlocked");
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
        showToast(view, "expenseRegistered");
        if (view) {
          void view.getController().reload();
        }
      } catch (error) {
        handleActionError(view, error, "errorRegisterExpense");
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return AddExpense;
});
//# sourceMappingURL=AddExpense-dbg.js.map

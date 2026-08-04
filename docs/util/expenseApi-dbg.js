sap.ui.define([], function () {
  "use strict";

  async function getCompleteInvoice(model, personId, year, month) {
    const binding = model.bindContext("/RetrieveCompleteInvoice(...)");
    binding.setParameter("PersonId", personId);
    binding.setParameter("Year", year);
    binding.setParameter("Month", month);
    await binding.invoke();
    return binding.getBoundContext()?.getObject();
  }
  async function getTransactionsByCategory(model, personId, categoryId, total, year, month) {
    const binding = model.bindContext("/RetrieveTransactionsByCategory(...)");
    binding.setParameter("PersonId", personId);
    binding.setParameter("CategoryId", categoryId);
    binding.setParameter("Total", total);
    binding.setParameter("Year", year);
    binding.setParameter("Month", month);
    await binding.invoke();
    return binding.getBoundContext()?.getObject();
  }
  async function simulateExpenses(model, personId, year, month) {
    const binding = model.bindContext("/SimulateExpenses(...)");
    binding.setParameter("PersonId", personId);
    binding.setParameter("Year", year);
    binding.setParameter("Month", month);
    await binding.invoke();
    return binding.getBoundContext()?.getObject();
  }
  async function addCardExpense(model, payload) {
    const binding = model.bindContext("/AddCardExpense(...)");
    binding.setParameter("CardId", payload.CardId);
    binding.setParameter("CategoryId", payload.CategoryId);
    binding.setParameter("Description", payload.Description);
    binding.setParameter("Value", payload.Value);
    binding.setParameter("Currency", payload.Currency);
    binding.setParameter("TransactionDate", payload.TransactionDate);
    binding.setParameter("Installments", payload.Installments);
    binding.setParameter("FixedExpense", payload.FixedExpense);
    await binding.invoke();
  }
  var __exports = {
    __esModule: true
  };
  __exports.getCompleteInvoice = getCompleteInvoice;
  __exports.getTransactionsByCategory = getTransactionsByCategory;
  __exports.simulateExpenses = simulateExpenses;
  __exports.addCardExpense = addCardExpense;
  return __exports;
});
//# sourceMappingURL=expenseApi-dbg.js.map

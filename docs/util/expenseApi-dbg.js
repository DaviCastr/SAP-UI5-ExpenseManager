sap.ui.define(["./http"], function (___http) {
  "use strict";

  const request = ___http["request"];
  async function unwrap(response, label) {
    if (!response.ok) {
      throw new Error(`Erro ao ${label} (${response.status})`);
    }
    const payload = await response.json();
    let data = payload.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (error) {
        throw new Error(`Resposta inválida ao ${label}`);
      }
    }
    if (data === undefined || data === null) {
      throw new Error(`Resposta vazia ao ${label}`);
    }
    return data;
  }
  async function getCompleteInvoice(personId, year, month) {
    const response = await request(`RetrieveCompleteInvoice(PersonId=${personId},Year=${year},Month=${month})`);
    return unwrap(response, "buscar a fatura");
  }
  async function getTransactionsByCategory(personId, categoryId, total, year, month) {
    const response = await request(`RetrieveTransactionsByCategory(PersonId=${personId},CategoryId=${categoryId},Total=${total},Year=${year},Month=${month})`);
    return unwrap(response, "buscar as transações da categoria");
  }
  async function simulateExpenses(personId, year, month) {
    const response = await request("SimulateExpenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        PersonId: personId,
        Year: year,
        Month: month
      })
    });
    return unwrap(response, "simular os gastos");
  }
  async function addCardExpense(payload) {
    const response = await request("AddCardExpense", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Erro ao registrar o gasto (${response.status})`);
    }
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

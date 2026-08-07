sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
  "use strict";

  class UiModel extends JSONModel {
    constructor() {
      const now = new Date();
      const data = {
        period: {
          year: now.getFullYear(),
          month: now.getMonth() + 1
        },
        monthLabel: "",
        selectedPerson: {
          ID: "",
          Name: ""
        },
        selectedPersonId: "",
        selectedPersonImage: "",
        personsEmpty: false,
        busy: false,
        transactions: [],
        cards: [],
        categories: [],
        categoryDetail: null,
        summary: {
          available: "",
          income: "",
          expenses: "",
          savings: "",
          target: "",
          expenseHint: "",
          targetHint: "",
          trendText: "",
          trendIcon: "sap-icon://trend-up"
        },
        expenseCardOptions: [],
        expenseCategoryOptions: [],
        newExpense: {
          description: "",
          amount: "",
          cardId: "",
          categoryId: "",
          installments: 1,
          fixedExpense: false,
          transactionDate: new Date().toISOString().slice(0, 10)
        },
        newPerson: {
          name: "",
          email: "",
          phone: "",
          income: "",
          currency: "BRL",
          target: ""
        },
        newCard: {
          name: "",
          limit: "",
          currency: "BRL"
        },
        newCategory: {
          name: ""
        },
        simulation: {
          month: "",
          year: ""
        },
        simulationMonthOptions: [],
        simulationResult: null
      };
      super(data);
    }
  }
  return UiModel;
});
//# sourceMappingURL=UiModel-dbg.js.map

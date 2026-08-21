sap.ui.define(["sap/ui/model/json/JSONModel", "../util/liabilityRules"], function (JSONModel, ___util_liabilityRules) {
  "use strict";

  const LIABILITY_STATUS_OPTIONS = ___util_liabilityRules["LIABILITY_STATUS_OPTIONS"];
  const TRANSACTION_TYPE_OPTIONS = ___util_liabilityRules["TRANSACTION_TYPE_OPTIONS"];
  class UiModel extends JSONModel {
    constructor() {
      const now = new Date();
      const data = {
        period: {
          year: now.getFullYear(),
          month: now.getMonth() + 1
        },
        periodSelector: {
          year: String(now.getFullYear()),
          month: String(now.getMonth() + 1),
          yearOptions: Array.from({
            length: 6
          }, (_, offset) => {
            const year = now.getFullYear() - 4 + offset;
            return {
              key: String(year),
              text: String(year)
            };
          }),
          monthOptions: Array.from({
            length: 12
          }, (_, index) => ({
            key: String(index + 1),
            text: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][index]
          }))
        },
        monthLabel: "",
        selectedPerson: {
          ID: "",
          Name: ""
        },
        selectedPersonId: "",
        selectedPersonImage: "",
        selectedPersonDraft: false,
        personsEmpty: false,
        busy: false,
        transactions: [],
        categories: [],
        categoryDetail: null,
        summary: {
          available: "",
          expenses: "",
          savings: "",
          expenseHint: "",
          targetHint: "",
          trendText: "",
          trendIcon: "sap-icon://trend-up"
        },
        newExpense: {
          description: "",
          amount: "",
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
          currency: "BRL",
          closingDay: "3",
          dueDay: "10"
        },
        newCategory: {
          name: ""
        },
        newShare: {
          shareUser: "",
          entity: "1",
          permission: "1"
        },
        newLiability: {
          name: "",
          description: "",
          totalAmount: "",
          currency: "BRL",
          dueDay: String(new Date().getDate())
        },
        liabilityEditId: "",
        newLiabilityTransaction: {
          type: "IN",
          description: "",
          date: new Date().toISOString().slice(0, 10),
          amount: "",
          currency: "BRL"
        },
        liabilityTransactionEditId: "",
        liabilityStatusOptions: LIABILITY_STATUS_OPTIONS,
        liabilityTxTypeOptions: TRANSACTION_TYPE_OPTIONS,
        entityOptions: [{
          key: "1",
          text: "Persons"
        }, {
          key: "2",
          text: "Shares"
        }, {
          key: "3",
          text: "Entities"
        }, {
          key: "4",
          text: "Categories"
        }, {
          key: "5",
          text: "Cards"
        }, {
          key: "6",
          text: "Invoices"
        }, {
          key: "7",
          text: "Transactions"
        }, {
          key: "8",
          text: "Backups"
        }, {
          key: "9",
          text: "Liabilities"
        }, {
          key: "10",
          text: "LiabilityTransactions"
        }, {
          key: "11",
          text: "Financings"
        }, {
          key: "12",
          text: "FinancingInstallments"
        }],
        permissionOptions: [{
          key: "1",
          text: "Viewer"
        }, {
          key: "2",
          text: "Creator"
        }, {
          key: "3",
          text: "Modifier"
        }, {
          key: "4",
          text: "Deleter"
        }],
        simulation: {
          month: "",
          year: ""
        },
        simulationMonthOptions: [],
        simulationResult: null,
        invoice: {
          cards: [],
          cardsEmpty: false,
          yearOptions: [],
          monthOptions: [],
          year: String(now.getFullYear()),
          month: String(now.getMonth() + 1),
          periodLabel: "",
          cardId: "",
          id: "",
          isDraft: false,
          loaded: false,
          header: {},
          transactionImages: {}
        },
        transactionCategory: {
          selectedIdentifier: "",
          currentCategoryId: "",
          currentCategoryName: "",
          selectedCategoryId: "",
          affectedText: "",
          categoryImages: {}
        },
        deleteTransactions: {
          selectedIdentifier: "",
          count: 0,
          countText: "",
          selectAll: false
        }
      };
      super(data);
    }
  }
  return UiModel;
});
//# sourceMappingURL=UiModel-dbg.js.map

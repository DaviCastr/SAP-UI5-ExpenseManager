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
        invoiceCards: [],
        invoiceCardImages: {},
        invoiceCardsEmpty: false,
        invoiceYearOptions: [],
        invoiceMonthOptions: [],
        invoiceYear: String(now.getFullYear()),
        invoiceMonth: String(now.getMonth() + 1),
        invoicePeriodLabel: "",
        invoiceCardId: "",
        invoiceId: "",
        invoiceIsDraft: false,
        invoiceLoaded: false,
        invoiceBusy: false,
        invoiceHeader: {},
        invoiceTransactionImages: {},
        invoiceCategories: [],
        invoiceCategoryImages: {},
        invoiceSelectedCategoryId: "",
        invoiceSelectedIdentifier: "",
        invoiceCurrentCategoryId: "",
        invoiceCurrentCategoryName: "",
        invoiceCategoryAffected: [],
        invoiceCategoryAffectedText: "",
        deleteTransactions: [],
        deleteTransactionsCountText: "",
        deleteSelectAll: true
      };
      super(data);
    }
  }
  return UiModel;
});
//# sourceMappingURL=UiModel-dbg.js.map

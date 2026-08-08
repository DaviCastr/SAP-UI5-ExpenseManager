sap.ui.define(["./PeriodService", "../util/format"], function (___PeriodService, ___util_format) {
  "use strict";

  const PeriodService = ___PeriodService["PeriodService"];
  const formatCurrency = ___util_format["formatCurrency"];
  const currencyCode = ___util_format["currencyCode"];
  /**
   * Converts the backend invoice (function result) into the view state of the
   * Home dashboard: the metrics, the trend comparison and the category breakdown.
   * All responsibilities of deciding what the UI shows belong here, keeping the
   * controller lean.
   */
  class DashboardRenderer {
    periodService = new PeriodService();
    constructor(invoiceService, ui, text) {
      this.invoiceService = invoiceService;
      this.ui = ui;
      this.text = text;
    }
    renderInvoice(invoice, person) {
      const expenses = Number(invoice.TotalAmount) || 0;
      const income = Number(person.Income) || 0;
      const target = Number(person.ExpenseTarget) || 0;
      const currency = currencyCode(invoice.Currency?.code, currencyCode(person.Currency));
      const available = income - expenses;
      const targetPercent = target > 0 ? Math.round(expenses / target * 100) : 0;
      const transactions = (invoice.Transactions || []).map(transaction => ({
        ...transaction,
        Currency: currency
      }));
      this.ui.setProperty("/summary", {
        available: formatCurrency(available, currency),
        income: formatCurrency(income, currency),
        expenses: formatCurrency(expenses, currency),
        savings: formatCurrency(available, currency),
        target: formatCurrency(target, currency),
        expenseHint: target > 0 ? this.text("summaryExpenseHintMeta", [String(targetPercent)]) : this.text("summaryExpenseHintSpent", [String(Math.round(expenses))]),
        targetHint: target > 0 ? this.text("summaryTargetHintPlanned") : this.text("summaryTargetHintEmpty"),
        trendText: this.text("trendCalculating"),
        trendIcon: "sap-icon://trend-up"
      });
      this.ui.setProperty("/transactions", transactions);
      const categories = this.buildCategoryBreakdown(transactions, expenses, currency);
      this.ui.setProperty("/categories", categories);
      return transactions;
    }

    /**
     * Compares the current period expenses with the previous month and publishes
     * the delta as the trend text/icon.
     *
     * @param {string} personId the selected person id
     * @param {Period} period the period being shown
     * @param {number} expenses the total expenses of the current period
     */
    async loadTrend(personId, period, expenses) {
      const previous = this.periodService.shift(period, -1);
      try {
        const previousInvoice = await this.invoiceService.getCompleteInvoice(personId, previous);
        const previousExpenses = Number(previousInvoice.TotalAmount) || 0;
        const delta = this.trendDelta(expenses, previousExpenses);
        const trendingUp = delta > 0;
        let trendText;
        if (previousExpenses > 0) {
          trendText = trendingUp ? this.text("trendMore", [String(Math.abs(Math.round(delta)))]) : this.text("trendLess", [String(Math.abs(Math.round(delta)))]);
        } else {
          trendText = expenses > 0 ? this.text("trendNoComparison") : this.text("trendNoExpenses");
        }
        this.ui.setProperty("/summary/trendText", trendText);
        this.ui.setProperty("/summary/trendIcon", trendingUp ? "sap-icon://trend-down" : "sap-icon://trend-up");
      } catch {
        // trend stays on the "calculating" placeholder when comparison fails
      }
    }
    trendDelta(expenses, previousExpenses) {
      if (previousExpenses > 0) {
        return (expenses - previousExpenses) / previousExpenses * 100;
      }
      return expenses > 0 ? 100 : 0;
    }
    buildCategoryBreakdown(transactions, expenses, currency) {
      const map = new Map();
      for (const transaction of transactions) {
        const category = transaction.Category;
        if (!category) {
          continue;
        }
        const entry = map.get(category.ID) || {
          ID: category.ID,
          Name: category.Name,
          CategoryImagePath: category.ImagePath,
          CategoryImageBase64: undefined,
          Total: 0,
          Percent: 0,
          CurrencyCode: currency
        };
        entry.Total += Number(transaction.Amount) || 0;
        map.set(category.ID, entry);
      }
      return Array.from(map.values()).map(item => ({
        ...item,
        Percent: expenses > 0 ? Math.round(item.Total / expenses * 100) : 0
      })).sort((a, b) => b.Total - a.Total);
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.DashboardRenderer = DashboardRenderer;
  return __exports;
});
//# sourceMappingURL=DashboardRenderer-dbg.js.map

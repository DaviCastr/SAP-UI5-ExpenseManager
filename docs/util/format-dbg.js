sap.ui.define([], function () {
  "use strict";

  function formatCurrency(value, currency) {
    const amount = Number(value) || 0;
    const code = currency || "BRL";
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: code
    });
  }
  function formatDate(dateValue) {
    if (!dateValue) {
      return "";
    }
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return String(dateValue);
    }
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }
  var __exports = {
    __esModule: true
  };
  __exports.formatCurrency = formatCurrency;
  __exports.formatDate = formatDate;
  return __exports;
});
//# sourceMappingURL=format-dbg.js.map

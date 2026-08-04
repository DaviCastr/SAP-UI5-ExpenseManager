sap.ui.define(["../auth/providers/XsuaaAuthHelper"], function (___auth_providers_XsuaaAuthHelper) {
  "use strict";

  const XsuaaAuthHelper = ___auth_providers_XsuaaAuthHelper["XsuaaAuthHelper"];
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
  function imageUrl(path) {
    if (!path) {
      return "";
    }
    const base = XsuaaAuthHelper.getConfig().odataService;
    return `${base}${path}`;
  }
  function formatMonth(year, month) {
    if (!year || !month) {
      return "";
    }
    return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric"
    });
  }
  function formatCardTitle(name, total, currency) {
    const formatted = formatCurrency(total, currency);
    return `${name} • ${formatted}`;
  }
  var __exports = {
    __esModule: true
  };
  __exports.formatCurrency = formatCurrency;
  __exports.formatDate = formatDate;
  __exports.imageUrl = imageUrl;
  __exports.formatMonth = formatMonth;
  __exports.formatCardTitle = formatCardTitle;
  return __exports;
});
//# sourceMappingURL=format-dbg.js.map

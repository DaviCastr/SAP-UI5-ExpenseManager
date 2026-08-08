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
  function personImage(id, imageType) {
    if (!id || !imageType) {
      return "";
    }
    return `${XsuaaAuthHelper.getConfig().odataService}Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=true)/Image`;
  }
  function transactionSubtle(category, date) {
    const formatted = date ? formatDate(date) : "";
    if (category && formatted) {
      return `${category} • ${formatted}`;
    }
    return category || formatted || "";
  }
  function formatTemplate(template, ...args) {
    if (!template) {
      return "";
    }
    return args.reduce((acc, arg, index) => acc.replace(new RegExp(`\\{${index}\\}`, "g"), String(arg ?? "")), template);
  }
  function initials(name) {
    if (!name) {
      return "?";
    }
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
    return (first + second).toUpperCase();
  }
  function currencyCode(currency, fallback = "BRL") {
    if (typeof currency === "string" && currency) {
      return currency;
    }
    if (currency && typeof currency === "object") {
      return currency.code || fallback;
    }
    return fallback;
  }
  function formatCardAmount(limit, currency) {
    return formatCurrency(Number(limit) || 0, currencyCode(currency));
  }
  function cardImageValue(id, images) {
    if (!id || !images) {
      return "";
    }
    return images[id] || "";
  }
  var __exports = {
    __esModule: true
  };
  __exports.formatCurrency = formatCurrency;
  __exports.formatDate = formatDate;
  __exports.imageUrl = imageUrl;
  __exports.formatMonth = formatMonth;
  __exports.formatCardTitle = formatCardTitle;
  __exports.personImage = personImage;
  __exports.transactionSubtle = transactionSubtle;
  __exports.formatTemplate = formatTemplate;
  __exports.initials = initials;
  __exports.currencyCode = currencyCode;
  __exports.formatCardAmount = formatCardAmount;
  __exports.cardImageValue = cardImageValue;
  return __exports;
});
//# sourceMappingURL=format-dbg.js.map

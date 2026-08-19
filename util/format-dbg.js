sap.ui.define(["../auth/providers/XsuaaAuthHelper"], function (___auth_providers_XsuaaAuthHelper) {
  "use strict";

  const XsuaaAuthHelper = ___auth_providers_XsuaaAuthHelper["XsuaaAuthHelper"];
  function currencyCode(currency, fallback = "BRL") {
    if (typeof currency === "string" && currency) {
      return currency;
    }
    if (currency && typeof currency === "object") {
      return currency.code || fallback;
    }
    return fallback;
  }
  function toFinite(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function toNumber(value) {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value !== "string" || !value.trim()) {
      return 0;
    }
    const text = value.trim().replace(/\s/g, "");
    if (text.includes(",")) {
      const normalized = text.replace(/\./g, "").replace(",", ".");
      return toFinite(normalized);
    }
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
      return toFinite(text.replace(/\./g, ""));
    }
    return toFinite(text);
  }
  function formatCurrency(value, currency) {
    const amount = toNumber(value);
    const code = currency || "BRL";
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: code
    });
  }
  function formatCardAmount(limit, currency) {
    return formatCurrency(toNumber(limit ?? 0), currencyCode(currency));
  }
  function criticalityState(value) {
    const criticality = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
    if (criticality === 1) {
      return "Error";
    }
    if (criticality === 2) {
      return "Warning";
    }
    if (criticality === 3) {
      return "Success";
    }
    return "None";
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

  /**
   * Builds the subtitle of a transaction row: the date, plus the installments
   * information when the purchase was paid in more than one parcel.
   *
   * @param {string} [date] the transaction date
   * @param {number|string} [installment] current installment index
   * @param {number|string} [totalInstallments] total number of installments
   * @returns {string} the human readable subtitle (e.g. "15/08/2026 • Parcela 1 de 2")
   */
  function transactionSubtitle(date, installment, totalInstallments) {
    const formatted = formatDate(date);
    const total = Number(totalInstallments) || 0;
    if (total > 1) {
      const current = Number(installment) || 1;
      return `${formatted} • Parcela ${current} de ${total}`;
    }
    return `${formatted} • Parcela única`;
  }

  /**
   * Builds the subtitle of an affected transaction row: the installments
   * information when the purchase was paid in more than one parcel, followed by
   * the invoice month of that transaction (e.g. "Parcela 1 de 2 • Março de 2026").
   *
   * @param {number|string} [installment] current installment index
   * @param {number|string} [totalInstallments] total number of installments
   * @param {number|string} [year] the invoice year
   * @param {number|string} [month] the invoice month (1-12)
   * @returns {string} the human readable subtitle
   */
  function installmentSubtitle(installment, totalInstallments, year, month) {
    const total = Number(totalInstallments) || 0;
    const parcel = total > 1 ? `Parcela ${Number(installment) || 1} de ${total}` : "";
    const monthText = year && month ? formatMonth(Number(String(year).replace(".", "")), Number(month))?.trim() : "";
    return [parcel, monthText].filter(Boolean).join(" • ");
  }

  /**
   * Formats the amount of a transaction row. Prefers the transaction's own
   * currency code, falling back to the invoice currency like the previous rows.
   *
   * @param {number|string} [amount] the transaction amount
   * @param {string} [transactionCurrency] the code of the transaction's currency
   * @param {string} [invoiceCurrency] the invoice currency code to fall back on
   * @returns {string} the formatted amount
   */
  function formatTransactionAmount(amount, transactionCurrency, invoiceCurrency) {
    const code = typeof transactionCurrency === "string" && transactionCurrency || invoiceCurrency || "BRL";
    return formatCurrency(toNumber(amount) || 0, code);
  }

  /**
   * Tells whether a total amount should be shown for a transaction row, i.e.
   * when the total exists and differs from the per-installment amount.
   *
   * @param {number|string} [total] the total amount of the purchase
   * @param {number|string} [amount] the per-transaction amount
   * @returns {boolean} whether the total label must be rendered
   */
  function hasTotalAmount(total) {
    const parsedTotal = toNumber(total ?? 0);
    return parsedTotal > 0;
  }
  function formatTemplate(template, ...args) {
    if (!template) {
      return "";
    }
    return args.reduce((acc, arg, index) => acc.replace(new RegExp(`\\{${index}\\}`, "g"), String(arg ?? "")), template);
  }

  /**
   * Formats the total amount of a transaction row inside the shared i18n label
   * (e.g. "Total R$ 1.234,56") when it differs from the per-installment amount,
   * otherwise returns an empty string.
   *
   * @param {string} [template] the i18n label with a `{0}` placeholder
   * @param {number|string} [total] the total amount of the purchase
   * @param {number|string} [amount] the per-transaction amount
   * @param {string} [currency] the currency code
   * @returns {string} the labeled formatted total, or an empty string when not applicable
   */
  function formatTotalWithLabel(template, total, amount, currency) {
    const code = typeof currency === "string" && currency || "BRL";
    if (!hasTotalAmount(total)) {
      return formatTemplate(template, formatCurrency(toNumber(amount), code));
    }
    return formatTemplate(template, formatCurrency(toNumber(total), code));
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
  function cardImageValue(id, images) {
    if (!id || !images) {
      return "";
    }
    return images[id] || "";
  }
  var __exports = {
    __esModule: true
  };
  __exports.currencyCode = currencyCode;
  __exports.formatCurrency = formatCurrency;
  __exports.formatCardAmount = formatCardAmount;
  __exports.criticalityState = criticalityState;
  __exports.formatDate = formatDate;
  __exports.imageUrl = imageUrl;
  __exports.formatMonth = formatMonth;
  __exports.formatCardTitle = formatCardTitle;
  __exports.personImage = personImage;
  __exports.transactionSubtle = transactionSubtle;
  __exports.transactionSubtitle = transactionSubtitle;
  __exports.installmentSubtitle = installmentSubtitle;
  __exports.formatTransactionAmount = formatTransactionAmount;
  __exports.hasTotalAmount = hasTotalAmount;
  __exports.formatTemplate = formatTemplate;
  __exports.formatTotalWithLabel = formatTotalWithLabel;
  __exports.initials = initials;
  __exports.cardImageValue = cardImageValue;
  return __exports;
});
//# sourceMappingURL=format-dbg.js.map

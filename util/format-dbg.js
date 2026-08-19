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
    const result = Number.isFinite(parsed) ? parsed : 0;
    return result;
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
  const LIABILITY_TYPE_LABELS = {
    GENERAL: "Genérica",
    PERSONAL_LOAN: "Empréstimo pessoal",
    FAMILY: "Familiar",
    BANK: "Banco",
    STORE: "Loja / Carnê",
    TAX: "Imposto",
    LEGAL: "Judicial",
    CREDIT_LINE: "Limite / cheque especial",
    OTHER: "Outros"
  };
  const LIABILITY_STATUS_LABELS = {
    OPEN: "Em aberto",
    PAID: "Paga",
    CANCELLED: "Cancelada",
    RENEGOTIATED: "Renegociada",
    OVERDUE: "Vencida"
  };
  const LIABILITY_INTEREST_MODE_LABELS = {
    MANUAL: "Manual",
    SIMPLE: "Simples",
    COMPOUND: "Composto"
  };
  const LIABILITY_TX_TYPE_LABELS = {
    OPENING: "Abertura",
    PAYMENT: "Pagamento",
    INTEREST: "Juros",
    FEE: "Taxa",
    DISCOUNT: "Desconto",
    AMORTIZATION: "Amortização",
    RENEGOTIATION: "Renegociação",
    REVERSAL: "Estorno"
  };
  function labelFromMap(map, value, fallback = "") {
    if (value && value in map) {
      return map[value];
    }
    return value || fallback;
  }

  /**
   * Resolves the human readable label of a liability type enum value
   * (e.g. "PERSONAL_LOAN" → "Empréstimo pessoal").
   *
   * @param {string} [value] the enum value
   * @returns {string} the label, or the raw value when unknown
   */
  function liabilityTypeText(value) {
    return labelFromMap(LIABILITY_TYPE_LABELS, value);
  }

  /**
   * Resolves the human readable label of a liability status enum value
   * (e.g. "OVERDUE" → "Vencida").
   *
   * @param {string} [value] the enum value
   * @returns {string} the label, or the raw value when unknown
   */
  function liabilityStatusText(value) {
    return labelFromMap(LIABILITY_STATUS_LABELS, value);
  }

  /**
   * Resolves the human readable label of a liability interest mode enum value
   * (e.g. "COMPOUND" → "Composto").
   *
   * @param {string} [value] the enum value
   * @returns {string} the label, or the raw value when unknown
   */
  function liabilityInterestModeText(value) {
    return labelFromMap(LIABILITY_INTEREST_MODE_LABELS, value);
  }

  /**
   * Resolves the human readable label of a liability transaction type enum value
   * (e.g. "PAYMENT" → "Pagamento").
   *
   * @param {string} [value] the enum value
   * @returns {string} the label, or the raw value when unknown
   */
  function liabilityTxTypeText(value) {
    return labelFromMap(LIABILITY_TX_TYPE_LABELS, value);
  }

  /**
   * Renders the "paid/total installments" summary of a liability (e.g. "3 de 10").
   *
   * @param {number|string} [paid] the number of paid installments
   * @param {number|string} [total] the total number of installments
   * @returns {string} the summary, or an empty string when there is no total
   */
  function liabilityInstallmentText(paid, total) {
    const totalNumber = Number(total) || 0;
    if (totalNumber <= 0) {
      return "";
    }
    return `${Number(paid) || 0} de ${totalNumber}`;
  }

  /**
   * Renders "Sim"/"Não" for the overdue flag of a liability.
   *
   * @param {boolean} [value] the flag
   * @returns {string} "Sim" or "Não"
   */
  function liabilityYesNoText(value) {
    return value ? "Sim" : "Não";
  }

  /**
   * Maps a liability status to the ObjectStatus/state used by the UI
   * (e.g. "OVERDUE" → "Error").
   *
   * @param {string} [status] the status enum value
   * @returns {string} the UI state
   */
  function liabilityStatusState(status) {
    if (status === "OVERDUE") {
      return "Error";
    }
    if (status === "PAID") {
      return "Success";
    }
    if (status === "RENEGOTIATED") {
      return "Warning";
    }
    return "None";
  }

  /**
   * Normalizes the progress percent of a liability (0-100) for the
   * ProgressIndicator control.
   *
   * @param {number|string} [value] the raw percent
   * @returns {number} a percent between 0 and 100
   */
  function liabilityProgressValue(value) {
    const parsed = Number(value) || 0;
    return Math.max(0, Math.min(100, parsed));
  }

  /**
   * Renders the progress percent of a liability as display text (e.g. "50%").
   *
   * @param {number|string} [value] the raw percent
   * @returns {string} the formatted percent
   */
  function liabilityProgressText(value) {
    const parsed = Number(value) || 0;
    return `${parsed.toLocaleString("pt-BR", {
      maximumFractionDigits: 1
    })}%`;
  }

  /**
   * Maps a liability health score (0-100) to the ObjectNumber state used by the
   * UI (the higher the score, the healthier the debt).
   *
   * @param {number|string} [value] the health score
   * @returns {string} the UI state
   */
  function liabilityHealthState(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) {
      return "None";
    }
    if (score < 40) {
      return "Error";
    }
    if (score < 70) {
      return "Warning";
    }
    return "Success";
  }

  /**
   * Renders the "StartDate • FirstDueDate" summary of a liability.
   *
   * @param {string} [start] the start date
   * @param {string} [firstDue] the first due date
   * @returns {string} the summary
   */
  function liabilityDatesText(start, firstDue) {
    const parts = [];
    if (start) {
      parts.push(`Início ${formatDate(start)}`);
    }
    if (firstDue) {
      parts.push(`1º venc. ${formatDate(firstDue)}`);
    }
    return parts.join(" • ");
  }

  /**
   * Renders the "InterestMode • InterestRate" summary of a liability
   * (e.g. "Juros Simples • 2,5%").
   *
   * @param {string} [mode] the interest mode enum value
   * @param {number|string} [rate] the interest rate
   * @returns {string} the summary
   */
  function liabilityInterestText(mode, rate) {
    const modeText = liabilityInterestModeText(mode);
    const parsed = Number(rate);
    if (modeText && Number.isFinite(parsed)) {
      return `${modeText} • ${parsed.toLocaleString("pt-BR", {
        maximumFractionDigits: 4
      })}%`;
    }
    return modeText || (Number.isFinite(parsed) ? `${parsed}%` : "");
  }

  /**
   * Renders the overdue label of a liability from the shared i18n label
   * (e.g. "Vencida: Sim").
   *
   * @param {string} [label] the i18n label
   * @param {boolean} [isOverdue] whether the liability is overdue
   * @returns {string} the labeled value
   */
  function liabilityOverdueText(label, isOverdue) {
    if (!label) {
      return "";
    }
    return `${label}: ${liabilityYesNoText(isOverdue)}`;
  }
  function isLiabilityBeingEdited(liabilityEditId, liabilityId) {
    return liabilityEditId === liabilityId;
  }
  function isLiabilityNotBeingEdited(liabilityEditId, liabilityId) {
    return !liabilityEditId || liabilityEditId !== liabilityId;
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
  __exports.liabilityTypeText = liabilityTypeText;
  __exports.liabilityStatusText = liabilityStatusText;
  __exports.liabilityInterestModeText = liabilityInterestModeText;
  __exports.liabilityTxTypeText = liabilityTxTypeText;
  __exports.liabilityInstallmentText = liabilityInstallmentText;
  __exports.liabilityYesNoText = liabilityYesNoText;
  __exports.liabilityStatusState = liabilityStatusState;
  __exports.liabilityProgressValue = liabilityProgressValue;
  __exports.liabilityProgressText = liabilityProgressText;
  __exports.liabilityHealthState = liabilityHealthState;
  __exports.liabilityDatesText = liabilityDatesText;
  __exports.liabilityInterestText = liabilityInterestText;
  __exports.liabilityOverdueText = liabilityOverdueText;
  __exports.isLiabilityBeingEdited = isLiabilityBeingEdited;
  __exports.isLiabilityNotBeingEdited = isLiabilityNotBeingEdited;
  return __exports;
});
//# sourceMappingURL=format-dbg.js.map

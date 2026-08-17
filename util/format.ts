import { XsuaaAuthHelper } from "../auth/providers/XsuaaAuthHelper";

export function currencyCode(currency: unknown, fallback = "BRL"): string {
    if (typeof currency === "string" && currency) {
        return currency;
    }
    if (currency && typeof currency === "object") {
        return (currency as { code?: string }).code || fallback;
    }
    return fallback;
}

function toFinite(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value: number | string): number {
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

export function formatCurrency(value: number | string, currency?: string): string {
    const amount = toNumber(value);
    const code = currency || "BRL";
    return amount.toLocaleString("pt-BR", { style: "currency", currency: code });
}

export function formatCardAmount(limit?: number | string, currency?: unknown): string {
    return formatCurrency(toNumber(limit ?? 0), currencyCode(currency));
}

export function criticalityState(value?: number | string): string {
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

export function formatDate(dateValue?: string | number | Date): string {
    if (!dateValue) {
        return "";
    }

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
        return String(dateValue);
    }

    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function imageUrl(path?: string): string {
    if (!path) {
        return "";
    }

    const base = XsuaaAuthHelper.getConfig().odataService;
    return `${base}${path}`;
}

export function formatMonth(year: number, month: number): string {
    if (!year || !month) {
        return "";
    }
    return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function formatCardTitle(name: string, total: number, currency: string): string {
    const formatted = formatCurrency(total, currency);
    return `${name} • ${formatted}`;
}

export function personImage(id?: string, imageType?: string): string {
    if (!id || !imageType) {
        return "";
    }
    return `${XsuaaAuthHelper.getConfig().odataService}Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=true)/Image`;
}

export function transactionSubtle(category?: string, date?: string): string {
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
export function transactionSubtitle(date?: string, installment?: number | string, totalInstallments?: number | string): string {
    const formatted = formatDate(date);
    const total = Number(totalInstallments) || 0;
    if (total > 1) {
        const current = Number(installment) || 1;
        return `${formatted} • Parcela ${current} de ${total}`;
    }
    return formatted;
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
export function installmentSubtitle(installment?: number | string, totalInstallments?: number | string, year?: number | string, month?: number | string): string {
    const total = Number(totalInstallments) || 0;
    const parcel = total > 1
        ? `Parcela ${Number(installment) || 1} de ${total}`
        : "";
    const monthText = year && month
        ? formatMonth(Number(year), Number(month))?.trim()
        : "";
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
export function formatTransactionAmount(amount?: number | string, transactionCurrency?: string, invoiceCurrency?: string): string {
    const code = (typeof transactionCurrency === "string" && transactionCurrency) || invoiceCurrency || "BRL";
    return formatCurrency(toNumber(amount as string) || 0, code);
}

/**
 * Tells whether a total amount should be shown for a transaction row, i.e.
 * when the total exists and differs from the per-installment amount.
 *
 * @param {number|string} [total] the total amount of the purchase
 * @param {number|string} [amount] the per-transaction amount
 * @returns {boolean} whether the total label must be rendered
 */
export function hasTotalAmount(total?: number | string): boolean {
    const parsedTotal = toNumber(total ?? 0);
    return parsedTotal > 0;
}


export function formatTemplate(template?: string, ...args: Array<string | number>): string {
    if (!template) {
        return "";
    }
    return args.reduce(
        (acc: string, arg, index) => acc.replace(new RegExp(`\\{${index}\\}`, "g"), String(arg ?? "")),
        template
    );
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
export function formatTotalWithLabel(template?: string, total?: number | string, amount?: number | string, currency?: string): string {

    const code = (typeof currency === "string" && currency) || "BRL";
    if (!hasTotalAmount(total)) {
        return formatTemplate(template, formatCurrency(toNumber(amount as string), code));
    }
    return formatTemplate(template, formatCurrency(toNumber(total as string), code));
}

export function initials(name?: string): string {
    if (!name) {
        return "?";
    }

    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";

    return (first + second).toUpperCase();
}

export function cardImageValue(id?: string, images?: Record<string, string>): string {
    if (!id || !images) {
        return "";
    }
    return images[id] || "";
}

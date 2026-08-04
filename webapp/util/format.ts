import { XsuaaAuthHelper } from "../auth/providers/XsuaaAuthHelper";

export function formatCurrency(value: number | string, currency?: string): string {
    const amount = Number(value) || 0;
    const code = currency || "BRL";
    return amount.toLocaleString("pt-BR", { style: "currency", currency: code });
}

export function formatDate(dateValue: string | number | Date): string {
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

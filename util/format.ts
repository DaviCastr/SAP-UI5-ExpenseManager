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

export function formatTemplate(template?: string, ...args: Array<string | number>): string {
    if (!template) {
        return "";
    }
    return args.reduce(
        (acc: string, arg, index) => acc.replace(new RegExp(`\\{${index}\\}`, "g"), String(arg ?? "")),
        template
    );
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

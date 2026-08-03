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

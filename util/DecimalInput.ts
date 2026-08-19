import SimpleType from "sap/ui/model/SimpleType";
import ParseException from "sap/ui/model/ParseException";
import ValidateException from "sap/ui/model/ValidateException";

function parseNumeric(text: string): number {
    const cleaned = text.trim().replace(/\s/g, "");
    if (cleaned.includes(",")) {
        return Number(cleaned.replace(/\./g, "").replace(",", "."));
    }
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
        return Number(cleaned.replace(/\./g, ""));
    }
    return Number(cleaned);
}

export default class DecimalInput extends SimpleType {
    formatValue(vValue: unknown): string {
        if (typeof vValue === "number") {
            return Number.isFinite(vValue) ? String(vValue).replace(".", ",") : "";
        }
        if (typeof vValue === "string") {
            const text = vValue.trim();
            if (!text) {
                return "";
            }
            const parsed = parseNumeric(text);
            if (Number.isFinite(parsed) && (parsed !== 0 || text === "0")) {
                return String(parsed).replace(".", ",");
            }
            return text;
        }
        return vValue === null || vValue === undefined ? "" : String(vValue);
    }

    parseValue(vValue: unknown): number | null {
        const text = vValue === null || vValue === undefined ? "" : String(vValue).trim();
        if (!text) {
            return null;
        }
        const parsed = parseNumeric(text);
        if (!Number.isFinite(parsed)) {
            throw new ParseException(`"${text}" não é um número válido.`);
        }
        return parsed;
    }

    validateValue(vValue: unknown): void {
        if (vValue === null || vValue === undefined) {
            return;
        }
        if (typeof vValue !== "number" || !Number.isFinite(vValue)) {
            throw new ValidateException("Valor numérico inválido.");
        }
    }
}
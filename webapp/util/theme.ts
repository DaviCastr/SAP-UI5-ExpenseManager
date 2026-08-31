import Core from "sap/ui/core/Core";
import Storage from "sap/ui/util/Storage";

const THEME_KEY = "expensemanager-theme";
const THEME_STORAGE = new Storage(Storage.Type.session);

/**
 * Preferência de tema do app, persistida em sessionStorage via sap.ui.util.Storage.
 * O Storage grava os valores em formato JSON (JSON.stringify), por isso a leitura
 * crua no pré-boot do index.html precisa usar JSON.parse para obter o valor.
 */

export function isDarkTheme(): boolean {
    return document.documentElement.getAttribute("data-theme") === "dark";
}

export function setHtmlTheme(dark: boolean): void {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "");
}

export function applyThemePreference(dark: boolean): void {
    THEME_STORAGE.put(THEME_KEY, dark ? "dark" : "light");
    setHtmlTheme(dark);
    Core.applyTheme(dark ? "sap_horizon_dark" : "sap_horizon");
}

/**
 * Aplica no boot o tema persistido (se houver), garantindo contraste na tela
 * atual (incluindo a de login). Chamado no init do Component (todas as telas)
 * e no Home.controller. Retorna se o tema ativo é escuro.
 *
 * @returns {boolean} true quando o tema ativo é escuro, false caso contrário
 */
export function ensureThemeApplied(): boolean {
    const stored = THEME_STORAGE.get(THEME_KEY) as string | null;
    const dark = stored === "dark";
    setHtmlTheme(dark);
    if (dark) {
        Core.applyTheme("sap_horizon_dark");
    }
    return dark;
}

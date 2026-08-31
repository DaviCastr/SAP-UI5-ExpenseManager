sap.ui.define(["sap/ui/core/Core", "sap/ui/util/Storage"], function (Core, Storage) {
  "use strict";

  const THEME_KEY = "expensemanager-theme";
  const THEME_STORAGE = new Storage(Storage.Type.session);

  /**
   * Preferência de tema do app, persistida em sessionStorage via sap.ui.util.Storage.
   * O Storage grava os valores em formato JSON (JSON.stringify), por isso a leitura
   * crua no pré-boot do index.html precisa usar JSON.parse para obter o valor.
   */

  function isDarkTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }
  function setHtmlTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "");
  }
  function applyThemePreference(dark) {
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
  function ensureThemeApplied() {
    const stored = THEME_STORAGE.get(THEME_KEY);
    const dark = stored === "dark";
    setHtmlTheme(dark);
    if (dark) {
      Core.applyTheme("sap_horizon_dark");
    }
    return dark;
  }
  var __exports = {
    __esModule: true
  };
  __exports.isDarkTheme = isDarkTheme;
  __exports.setHtmlTheme = setHtmlTheme;
  __exports.applyThemePreference = applyThemePreference;
  __exports.ensureThemeApplied = ensureThemeApplied;
  return __exports;
});
//# sourceMappingURL=theme-dbg.js.map

sap.ui.define(["sap/ui/core/Core", "sap/ui/util/Storage"], function (Core, Storage) {
  "use strict";

  const THEME_KEY = "expensemanager-theme";
  // localStorage: o tema sobrevive ao fechar o app, então ele já abre no tema
  // escolhido (e o iOS lê a cor da barra de status já no tema certo).
  const THEME_STORAGE = new Storage(Storage.Type.local);

  /**
   * Preferência de tema do app, persistida em localStorage via sap.ui.util.Storage.
   * O Storage grava os valores em formato JSON (JSON.stringify), por isso a leitura
   * crua no pré-boot do index.html precisa usar JSON.parse para obter o valor.
   */

  function isDarkTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }
  function setHtmlTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "");
    // A cor fixada pelo pré-boot (index.html) daria o header escuro no claro.
    document.documentElement.style.removeProperty("--header-bg");
    applyStatusBarColor(dark ? "#142422" : "#ffffff");
  }

  /**
   * Pinta a barra de status (PWA/navegador) na cor do header. O iOS usa a cor de
   * fundo do body e não repinta só porque a variável CSS mudou: a cor vai inline
   * no html/body e a meta theme-color é recriada, que é o que o WebKit observa.
   */
  function applyStatusBarColor(color) {
    document.documentElement.style.setProperty("background-color", color, "important");
    document.body?.style.setProperty("background-color", color, "important");
    document.querySelector("meta[name='theme-color']")?.remove();
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    document.head.appendChild(meta);
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

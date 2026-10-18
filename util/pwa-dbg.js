sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
  "use strict";

  /**
   * Instalação do app (PWA). O manifest só é incluído fora do iOS (index.html):
   * no iPhone ele faria a barra de status usar as cores fixas do manifest em vez
   * da cor do header. O evento beforeinstallprompt (Chrome/Edge no Android e no
   * PC) é capturado cedo no index.html e guardado em window.__emInstallPrompt.
   */

  function isStandalone() {
    return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  /**
   * Model "pwa": /canInstall diz se o botão de instalar aparece. Só no navegador:
   * já instalado (tela cheia) ou logo após instalar, some.
   */
  function createPwaModel() {
    const pwaWindow = window;
    const model = new JSONModel({
      canInstall: false,
      isIos: isIos()
    });
    const refresh = () => {
      model.setProperty("/canInstall", !isStandalone() && (isIos() || !!pwaWindow.__emInstallPrompt));
    };
    window.addEventListener("em-installable", refresh);
    window.addEventListener("appinstalled", () => {
      pwaWindow.__emInstallPrompt = null;
      refresh();
    });
    window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", refresh);
    refresh();
    return model;
  }

  /**
   * Abre o prompt nativo de instalação. Retorna "ios" quando não há prompt (iPhone),
   * para a tela mostrar o passo a passo do "Adicionar à Tela de Início".
   */
  async function promptInstall(model) {
    const pwaWindow = window;
    const installPrompt = pwaWindow.__emInstallPrompt;
    if (!installPrompt) {
      return isIos() ? "ios" : "unavailable";
    }
    await installPrompt.prompt();
    const {
      outcome
    } = await installPrompt.userChoice;

    // O evento só pode ser usado uma vez; o Chrome dispara outro se ainda der.
    pwaWindow.__emInstallPrompt = null;
    model.setProperty("/canInstall", outcome !== "accepted" && !isStandalone() && isIos());
    return outcome;
  }
  var __exports = {
    __esModule: true
  };
  __exports.isStandalone = isStandalone;
  __exports.isIos = isIos;
  __exports.createPwaModel = createPwaModel;
  __exports.promptInstall = promptInstall;
  return __exports;
});
//# sourceMappingURL=pwa-dbg.js.map

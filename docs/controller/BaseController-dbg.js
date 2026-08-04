sap.ui.define(["sap/ui/core/mvc/Controller", "sap/ui/core/UIComponent"], function (Controller, UIComponent) {
  "use strict";

  class BaseController extends Controller {
    getRouter() {
      return UIComponent.getRouterFor(this);
    }
    navTo(route, parameters) {
      this.getRouter().navTo(route, parameters);
    }
    getResourceBundle() {
      return (this.getOwnerComponent()?.getModel("i18n")).getResourceBundle();
    }
    getText(key, parameters) {
      return this.getResourceBundle().getText(key, parameters) ?? key;
    }

    /**
     * Resolves with the shared OData model once a valid session is available,
     * or `null` when the user is not authenticated.
     */
    async ensureServiceModel() {
      const component = this.getOwnerComponent();
      if (typeof component?.ensureServiceModel === "function") {
        return component.ensureServiceModel();
      }
      return component?.getModel() ?? null;
    }

    /**
     * Synchronous accessor used by actions that already run with the model in
     * place. Throws when the model is not available yet.
     */
    getServiceModel() {
      const model = this.getOwnerComponent()?.getModel();
      if (!model) {
        throw new Error("O serviço financeiro não está disponível.");
      }
      return model;
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.BaseController = BaseController;
  return __exports;
});
//# sourceMappingURL=BaseController-dbg.js.map

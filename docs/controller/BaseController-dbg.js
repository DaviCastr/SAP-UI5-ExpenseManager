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
      return this.getOwnerComponent().getModel("i18n").getResourceBundle();
    }
    getText(key, parameters) {
      return this.getResourceBundle().getText(key, parameters) ?? key;
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.BaseController = BaseController;
  return __exports;
});
//# sourceMappingURL=BaseController-dbg.js.map

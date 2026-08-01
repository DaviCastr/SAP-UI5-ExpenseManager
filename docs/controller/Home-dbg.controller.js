sap.ui.define(["./BaseController", "sap/m/MessageToast"], function (___BaseController, MessageToast) {
  "use strict";

  const BaseController = ___BaseController["BaseController"];
  class Home extends BaseController {
    onOpenInsights() {
      const message = this.getResourceBundle().getText("insightsMessage") ?? "Insights ready";
      MessageToast.show(message);
    }
  }
  return Home;
});
//# sourceMappingURL=Home-dbg.controller.js.map

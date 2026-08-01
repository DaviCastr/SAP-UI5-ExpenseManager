sap.ui.define(["sap/ui/test/Opa5"], function (Opa5) {
  "use strict";

  const sViewName = "App";
  class AppPage extends Opa5 {
    // Actions

    // Assertions
    iShouldSeeTheApp() {
      return this.waitFor({
        id: "app",
        viewName: sViewName,
        success: function () {
          Opa5.assert.ok(true, "The " + sViewName + " view is displayed");
        },
        errorMessage: "Did not find the " + sViewName + " view"
      });
    }
  }
  return AppPage;
});
//# sourceMappingURL=AppPage-dbg.js.map

sap.ui.define(["sap/ui/model/json/JSONModel", "sap/ui/Device"], function (JSONModel, Device) {
  "use strict";

  function isStandalone() {
    if (typeof window === "undefined" || !window.matchMedia) {
      return window.navigator.standalone === true;
    }
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function createDeviceModel() {
    const model = new JSONModel(Device);
    model.setProperty("/system/stretchDialogs", Device.system.phone && !isStandalone());
    model.setDefaultBindingMode("OneWay");
    return model;
  }
  var __exports = {
    __esModule: true
  };
  __exports.createDeviceModel = createDeviceModel;
  return __exports;
});
//# sourceMappingURL=models-dbg.js.map

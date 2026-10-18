sap.ui.define(["sap/ui/model/json/JSONModel", "sap/ui/Device", "../util/pwa"], function (JSONModel, Device, ___util_pwa) {
  "use strict";

  const isStandalone = ___util_pwa["isStandalone"];
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

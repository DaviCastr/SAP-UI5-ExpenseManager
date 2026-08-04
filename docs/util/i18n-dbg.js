sap.ui.define([], function () {
  "use strict";

  function getResourceBundle(view) {
    const model = view.getModel("i18n");
    if (!model) {
      return null;
    }
    const bundle = model.getResourceBundle();
    return bundle instanceof Promise ? null : bundle;
  }
  function getText(view, key, parameters) {
    return getResourceBundle(view)?.getText(key, parameters) ?? key;
  }
  var __exports = {
    __esModule: true
  };
  __exports.getResourceBundle = getResourceBundle;
  __exports.getText = getText;
  return __exports;
});
//# sourceMappingURL=i18n-dbg.js.map

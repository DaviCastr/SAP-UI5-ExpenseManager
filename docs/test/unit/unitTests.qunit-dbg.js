"use strict";

/* @sapUiRequire */
QUnit.config.autostart = false;

// import all your QUnit tests here
sap.ui.require([], function () {
  function __ui5_require_async(path) {
    return new Promise(function (resolve, reject) {
      sap.ui.require([path], function (module) {
        if (!(module && module.__esModule)) {
          module = module === null || !(typeof module === "object" && path.endsWith("/library")) ? {
            default: module
          } : module;
          Object.defineProperty(module, "__esModule", {
            value: true
          });
        }
        resolve(module);
      }, function (err) {
        reject(err);
      });
    });
  }
  void Promise.all([__ui5_require_async("sap/ui/core/Core"),
  // Required to wait until Core has booted to start the QUnit tests
  __ui5_require_async("unit/controller/MainPage.controller")]).then(([{
    default: Core
  }]) => Core.ready()).then(() => {
    QUnit.start();
  });
});
//# sourceMappingURL=unitTests.qunit-dbg.js.map

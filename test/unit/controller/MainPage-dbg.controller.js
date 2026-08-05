sap.ui.define(["apps/dflc/expensemanager/controller/Main.controller"], function (__Controller) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  /*global QUnit*/
  const Controller = _interopRequireDefault(__Controller);
  QUnit.module("Main Controller");
  QUnit.test("I should test the Main controller", function (assert) {
    const oAppController = new Controller("Main");
    oAppController.onInit();
    assert.ok(oAppController);
  });
});
//# sourceMappingURL=MainPage-dbg.controller.js.map

sap.ui.define([], function () {
  "use strict";

  /**
   * EventBus channel used by the workspace (Home) to tell the tab views that the
   * selected person changed or its data was reloaded.
   */
  const PERSON_CHANNEL = "expenseManager.person";
  const PERSON_SELECTED = "selected";
  const PERSON_DRAFT_CLOSING = "draftClosing";
  var __exports = {
    __esModule: true
  };
  __exports.PERSON_CHANNEL = PERSON_CHANNEL;
  __exports.PERSON_SELECTED = PERSON_SELECTED;
  __exports.PERSON_DRAFT_CLOSING = PERSON_DRAFT_CLOSING;
  return __exports;
});
//# sourceMappingURL=personEvents-dbg.js.map

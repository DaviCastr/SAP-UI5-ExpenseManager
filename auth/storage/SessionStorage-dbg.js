sap.ui.define([], function () {
  "use strict";

  class SessionStorage {
    static STORAGE_KEY = "expenseManager.session";
    static save(session) {
      window.sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
    }
    static load() {
      const value = window.sessionStorage.getItem(this.STORAGE_KEY);
      if (!value) {
        return null;
      }
      return JSON.parse(value);
    }
    static clear() {
      window.sessionStorage.removeItem(this.STORAGE_KEY);
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.SessionStorage = SessionStorage;
  return __exports;
});
//# sourceMappingURL=SessionStorage-dbg.js.map

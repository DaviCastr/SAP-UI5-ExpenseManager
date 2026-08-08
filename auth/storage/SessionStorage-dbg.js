sap.ui.define(["sap/ui/util/Storage"], function (Storage) {
  "use strict";

  class SessionStorage {
    static STORAGE_KEY = "expenseManager.session";
    static OAUTH_STATE_KEY = "expensemanager.state";
    static save(session) {
      Storage.put(this.STORAGE_KEY, session);
    }
    static load() {
      const value = Storage.get(this.STORAGE_KEY);
      return value ?? null;
    }
    static clear() {
      Storage.remove(this.STORAGE_KEY);
    }
    static saveOauthState(state) {
      Storage.put(this.OAUTH_STATE_KEY, state);
    }
    static loadOauthState() {
      const value = Storage.get(this.OAUTH_STATE_KEY);
      return value ?? null;
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.SessionStorage = SessionStorage;
  return __exports;
});
//# sourceMappingURL=SessionStorage-dbg.js.map

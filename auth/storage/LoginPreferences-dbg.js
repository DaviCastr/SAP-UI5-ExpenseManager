sap.ui.define(["sap/ui/util/Storage"], function (Storage) {
  "use strict";

  const EMAIL_KEY = "loginEmail";
  const storage = new Storage(Storage.Type.local, "expenseManager");

  /**
   * Remembers the last e-mail used on the login page (never the password).
   */
  class LoginPreferences {
    static loadEmail() {
      return storage.get(EMAIL_KEY) ?? "";
    }
    static saveEmail(email) {
      storage.put(EMAIL_KEY, email);
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.LoginPreferences = LoginPreferences;
  return __exports;
});
//# sourceMappingURL=LoginPreferences-dbg.js.map

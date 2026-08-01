sap.ui.define(["./storage/SessionStorage"], function (___storage_SessionStorage) {
  "use strict";

  const SessionStorage = ___storage_SessionStorage["SessionStorage"];
  class AuthenticationService {
    static initialize(provider) {
      this.provider = provider;
    }
    static async login() {
      const session = await this.provider.login();
      SessionStorage.save(session);
    }
    static async logout() {
      SessionStorage.clear();
      await this.provider.logout();
    }
    static getSession() {
      return SessionStorage.load();
    }
    static async isAuthenticated() {
      return this.provider.isAuthenticated();
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.AuthenticationService = AuthenticationService;
  return __exports;
});
//# sourceMappingURL=AuthenticationService-dbg.js.map

sap.ui.define(["../AuthenticationService", "../storage/SessionStorage"], function (___AuthenticationService, ___storage_SessionStorage) {
  "use strict";

  const AuthenticationService = ___AuthenticationService["AuthenticationService"];
  const SessionStorage = ___storage_SessionStorage["SessionStorage"];
  class GithubPagesAuthenticationProvider {
    async login() {
      const session = {
        accessToken: "github-pages-demo-token",
        expiresAt: Date.now() + 3600000,
        userName: "Visitante GitHub Pages"
      };
      SessionStorage.save(session);
      return session;
    }
    async logout() {
      SessionStorage.clear();
    }
    async isAuthenticated() {
      const session = AuthenticationService.getSession();
      return !!session && session.expiresAt > Date.now();
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.GithubPagesAuthenticationProvider = GithubPagesAuthenticationProvider;
  return __exports;
});
//# sourceMappingURL=GithubPagesAuthenticationProvider-dbg.js.map

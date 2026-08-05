sap.ui.define(["../AuthenticationService"], function (___AuthenticationService) {
  "use strict";

  const AuthenticationService = ___AuthenticationService["AuthenticationService"];
  class MockAuthenticationProvider {
    async login() {
      return {
        accessToken: "mock-token",
        expiresAt: Date.now() + 3600000,
        userName: "Davi"
      };
    }
    async logout() {
      await AuthenticationService.logout();
    }
    async isAuthenticated() {
      const session = AuthenticationService.getSession();
      return !!session && session.expiresAt > Date.now();
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.MockAuthenticationProvider = MockAuthenticationProvider;
  return __exports;
});
//# sourceMappingURL=MockAuthenticationProvider-dbg.js.map

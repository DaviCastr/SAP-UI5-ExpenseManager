sap.ui.define(["../storage/SessionStorage", "../AuthenticationService"], function (___storage_SessionStorage, ___AuthenticationService) {
  "use strict";

  const SessionStorage = ___storage_SessionStorage["SessionStorage"];
  const AuthenticationService = ___AuthenticationService["AuthenticationService"];
  class BtpAuthenticationProvider {
    login() {
      return Promise.resolve(this.createSession());
    }

    /**
     * On the BTP launchpad the managed app router authenticates the user,
     * so the password form simply opens the platform session.
     */
    loginWithPassword() {
      return this.login();
    }
    logout() {
      SessionStorage.clear();
      if (typeof window !== "undefined") {
        const redirectTarget = encodeURIComponent(window.location.href);
        window.location.assign(`${window.location.origin}/logout?redirect=${redirectTarget}`);
      }
      return Promise.resolve();
    }
    isAuthenticated() {
      const session = AuthenticationService.getSession();
      return Promise.resolve(!!session && session.expiresAt > Date.now());
    }
    createSession() {
      return {
        accessToken: "btp-session-token",
        expiresAt: Date.now() + 3600000,
        userName: "Usuário BTP"
      };
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.BtpAuthenticationProvider = BtpAuthenticationProvider;
  return __exports;
});
//# sourceMappingURL=BtpAuthenticationProvider-dbg.js.map

sap.ui.define(["../storage/SessionStorage", "../AuthenticationService", "./XsuaaAuthHelper"], function (___storage_SessionStorage, ___AuthenticationService, ___XsuaaAuthHelper) {
  "use strict";

  const SessionStorage = ___storage_SessionStorage["SessionStorage"];
  const AuthenticationService = ___AuthenticationService["AuthenticationService"];
  const XsuaaAuthHelper = ___XsuaaAuthHelper["XsuaaAuthHelper"];
  class BtpAuthenticationProvider {
    async login() {
      const config = XsuaaAuthHelper.getConfig();
      if (config.clientId && config.authDomain) {
        const {
          authorizeUrl,
          state,
          codeVerifier
        } = await XsuaaAuthHelper.createAuthorizationFlow();
        SessionStorage.save({
          accessToken: "",
          expiresAt: 0,
          userName: "Pending"
        });
        if (typeof window !== "undefined") {
          sessionStorage.setItem("expensemanager.state", state);
          sessionStorage.setItem("expensemanager.codeVerifier", codeVerifier);
          window.location.assign(authorizeUrl);
        }
        return {
          accessToken: "",
          expiresAt: 0,
          userName: "Pending"
        };
      }
      return this.createSession();
    }
    async logout() {
      SessionStorage.clear();
      if (typeof window !== "undefined") {
        const redirectTarget = encodeURIComponent(window.location.href);
        window.location.assign(`${window.location.origin}/logout?redirect=${redirectTarget}`);
      }
    }
    async isAuthenticated() {
      const session = AuthenticationService.getSession();
      if (session && session.expiresAt > Date.now()) {
        return true;
      }
      if (typeof window === "undefined") {
        return false;
      }
      const searchParams = new URLSearchParams(window.location.search);
      const authCode = searchParams.get("code");
      if (!authCode) {
        return false;
      }
      const codeVerifier = sessionStorage.getItem("expensemanager.codeVerifier") ?? "";
      const tokenResponse = await XsuaaAuthHelper.exchangeAuthorizationCode(authCode, codeVerifier);
      const sessionData = XsuaaAuthHelper.createSession(tokenResponse);
      SessionStorage.save(sessionData);
      return true;
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

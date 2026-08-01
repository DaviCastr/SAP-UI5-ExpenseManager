sap.ui.define(["../AuthenticationService", "../storage/SessionStorage", "./XsuaaAuthHelper"], function (___AuthenticationService, ___storage_SessionStorage, ___XsuaaAuthHelper) {
  "use strict";

  const AuthenticationService = ___AuthenticationService["AuthenticationService"];
  const SessionStorage = ___storage_SessionStorage["SessionStorage"];
  const XsuaaAuthHelper = ___XsuaaAuthHelper["XsuaaAuthHelper"];
  class GithubPagesAuthenticationProvider {
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
  }
  var __exports = {
    __esModule: true
  };
  __exports.GithubPagesAuthenticationProvider = GithubPagesAuthenticationProvider;
  return __exports;
});
//# sourceMappingURL=GithubPagesAuthenticationProvider-dbg.js.map

sap.ui.define(["../AuthenticationService", "../storage/SessionStorage", "./XsuaaAuthHelper"], function (___AuthenticationService, ___storage_SessionStorage, ___XsuaaAuthHelper) {
  "use strict";

  const AuthenticationService = ___AuthenticationService["AuthenticationService"];
  const SessionStorage = ___storage_SessionStorage["SessionStorage"];
  const XsuaaAuthHelper = ___XsuaaAuthHelper["XsuaaAuthHelper"];
  class GithubPagesAuthenticationProvider {
    async login() {
      try {
        const {
          authorizeUrl,
          state
        } = XsuaaAuthHelper.createAuthorizationFlow();
        SessionStorage.save({
          accessToken: "",
          expiresAt: 0,
          userName: "Pending"
        });
        if (typeof window !== "undefined") {
          sessionStorage.setItem("expensemanager.state", state);
          window.location.assign(authorizeUrl);
        }
        return {
          accessToken: "",
          expiresAt: 0,
          userName: "Pending"
        };
      } catch (error) {
        const session = {
          accessToken: "github-pages-demo-token",
          expiresAt: Date.now() + 3600000,
          userName: "Visitante GitHub Pages"
        };
        SessionStorage.save(session);
        return session;
      }
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
      const savedState = sessionStorage.getItem("expensemanager.state");
      const state = searchParams.get("state");
      if (savedState && state && savedState !== state) {
        return false;
      }
      try {
        const tokenResponse = await XsuaaAuthHelper.exchangeAuthorizationCode(authCode);
        const sessionData = XsuaaAuthHelper.createSession(tokenResponse);
        SessionStorage.save(sessionData);
        this.cleanUpAuthorizationParams();
        return true;
      } catch (error) {
        this.cleanUpAuthorizationParams();
        throw error;
      }
    }
    cleanUpAuthorizationParams() {
      if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") {
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      window.history.replaceState({}, document.title, url.toString());
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.GithubPagesAuthenticationProvider = GithubPagesAuthenticationProvider;
  return __exports;
});
//# sourceMappingURL=GithubPagesAuthenticationProvider-dbg.js.map

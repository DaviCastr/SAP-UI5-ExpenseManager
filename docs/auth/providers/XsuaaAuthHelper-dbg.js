sap.ui.define([], function () {
  "use strict";

  class XsuaaAuthHelper {
    static getConfig() {
      const globalWindow = window;
      return globalWindow.__EXPENSE_MANAGER_CONFIG__ ?? {
        btpHost: "",
        odataService: ""
      };
    }
    static setServiceUrl(url) {
      const globalWindow = window;
      if (!globalWindow.__EXPENSE_MANAGER_CONFIG__) {
        globalWindow.__EXPENSE_MANAGER_CONFIG__ = {
          btpHost: "",
          odataService: ""
        };
      }
      globalWindow.__EXPENSE_MANAGER_CONFIG__.odataService = url;
    }
    static setLocalOverrides() {
      const globalWindow = window;
      const config = globalWindow.__EXPENSE_MANAGER_CONFIG__ ?? {
        btpHost: "",
        odataService: ""
      };
      globalWindow.__EXPENSE_MANAGER_CONFIG__ = config;
      config.odataService = "/api/service/ExpenseManager/";
      if (config.auth) {
        config.auth.tokenEndpoint = "/auth/login";
        config.auth.refreshEndpoint = "/auth/refresh";
        config.auth.redirectUri = "";
      }
    }
    static createAuthorizationFlow() {
      const config = this.getConfig().auth;
      if (!config || !config.clientId || !config.authDomain) {
        throw new Error("XSUAA client configuration is missing in runtime-config.js");
      }
      const state = this.generateRandomString(32);
      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: this.getRedirectUri(),
        scope: config.scope || "openid",
        state
      });
      const authorizeUrl = `${config.authDomain}/oauth/authorize?${params.toString()}`;
      return {
        authorizeUrl,
        state
      };
    }
    static async exchangeAuthorizationCode(code) {
      const config = this.getConfig().auth;
      if (!config || !config.tokenEndpoint) {
        throw new Error("Token endpoint is not configured");
      }
      const response = await fetch(config.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code,
          redirect_uri: this.getRedirectUri()
        })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error_description ?? payload.error ?? "Token exchange failed");
      }
      return payload;
    }
    static async refresh(refreshToken) {
      const config = this.getConfig().auth;
      if (!config || !config.refreshEndpoint) {
        throw new Error("Refresh endpoint is not configured");
      }
      const response = await fetch(config.refreshEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error_description ?? payload.error ?? "Token refresh failed");
      }
      return payload;
    }
    static createSession(tokenResponse) {
      const expiresIn = Math.max(tokenResponse.expires_in ?? 3600, 60);
      const userName = tokenResponse.user_name ?? this.extractUserName(tokenResponse.id_token) ?? "Usuário XSUAA";
      return {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: Date.now() + expiresIn * 1000,
        userName
      };
    }
    static getRedirectUri() {
      const configured = this.getConfig().auth?.redirectUri;
      if (configured) {
        return configured;
      }
      if (typeof window === "undefined") {
        return "";
      }
      const currentUrl = new URL(window.location.href);
      currentUrl.search = "";
      currentUrl.hash = "";
      return currentUrl.toString();
    }
    static generateRandomString(length) {
      const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const values = new Uint8Array(length);
      crypto.getRandomValues(values);
      return Array.from(values, value => possible[value % possible.length]).join("");
    }
    static extractUserName(token) {
      if (!token) {
        return null;
      }
      const parts = token.split(".");
      if (parts.length < 2) {
        return null;
      }
      try {
        const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
        const decoded = decodeURIComponent(atob(padded).split("").map(character => {
          return "%" + ("00" + character.charCodeAt(0).toString(16)).slice(-2);
        }).join(""));
        const claims = JSON.parse(decoded);
        return claims.user_name ?? claims.name ?? claims.preferred_username ?? null;
      } catch (error) {
        return null;
      }
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.XsuaaAuthHelper = XsuaaAuthHelper;
  return __exports;
});
//# sourceMappingURL=XsuaaAuthHelper-dbg.js.map

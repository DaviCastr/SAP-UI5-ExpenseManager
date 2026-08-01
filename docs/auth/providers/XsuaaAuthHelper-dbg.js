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
    static async createAuthorizationFlow() {
      const config = this.getConfig();
      const codeVerifier = this.generateRandomString(64);
      const state = this.generateRandomString(32);
      const codeChallenge = await this.createCodeChallenge(codeVerifier);
      const redirectUri = this.getRedirectUri();
      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId ?? "",
        redirect_uri: redirectUri,
        scope: config.scope ?? "openid",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
      });
      const authorizeUrl = `${config.authDomain}/oauth/authorize?${params.toString()}`;
      return {
        authorizeUrl,
        state,
        codeVerifier
      };
    }
    static async exchangeAuthorizationCode(code, codeVerifier) {
      const config = this.getConfig();
      const redirectUri = this.getRedirectUri();
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: config.clientId ?? "",
        client_secret: config.clientSecret ?? "",
        code_verifier: codeVerifier
      });
      const response = await fetch(`${config.authDomain}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error_description ?? payload.error ?? "Authentication request failed");
      }
      return payload;
    }
    static createSession(tokenResponse) {
      const expiresIn = Math.max(tokenResponse.expires_in ?? 3600, 60);
      const userName = this.extractUserName(tokenResponse.id_token) ?? "Usuário XSUAA";
      return {
        accessToken: tokenResponse.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
        userName
      };
    }
    static getRedirectUri() {
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
    static async createCodeChallenge(codeVerifier) {
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return this.base64UrlEncode(new Uint8Array(digest));
    }
    static base64UrlEncode(value) {
      const base64 = btoa(String.fromCharCode(...value));
      return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

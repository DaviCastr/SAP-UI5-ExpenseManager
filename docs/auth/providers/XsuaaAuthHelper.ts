import { UserSession } from "../models/UserSession";

interface RuntimeConfig {
    btpHost: string;
    odataService: string;
    authDomain?: string;
    clientId?: string;
    scope?: string;
}

interface TokenResponse {
    access_token: string;
    expires_in?: number;
    token_type?: string;
    refresh_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
}

export class XsuaaAuthHelper {

    public static getConfig(): RuntimeConfig {
        const globalWindow = window as Window & typeof globalThis & { __EXPENSE_MANAGER_CONFIG__?: RuntimeConfig };
        return globalWindow.__EXPENSE_MANAGER_CONFIG__ ?? {
            btpHost: "",
            odataService: ""
        };
    }

    public static async createAuthorizationFlow(): Promise<{ authorizeUrl: string; state: string; codeVerifier: string }> {
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
        return { authorizeUrl, state, codeVerifier };
    }

    public static async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<TokenResponse> {
        const config = this.getConfig();
        const redirectUri = this.getRedirectUri();
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: config.clientId ?? "",
            code_verifier: codeVerifier
        });

        const response = await fetch(`${config.authDomain}/oauth/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body.toString()
        });

        const payload = await response.json() as TokenResponse;

        if (!response.ok || payload.error) {
            throw new Error(payload.error_description ?? payload.error ?? "Authentication request failed");
        }

        return payload;
    }

    public static createSession(tokenResponse: TokenResponse): UserSession {
        const expiresIn = Math.max(tokenResponse.expires_in ?? 3600, 60);
        const userName = this.extractUserName(tokenResponse.id_token) ?? "Usuário XSUAA";

        return {
            accessToken: tokenResponse.access_token,
            expiresAt: Date.now() + (expiresIn * 1000),
            userName
        };
    }

    public static getRedirectUri(): string {
        if (typeof window === "undefined") {
            return "";
        }

        const currentUrl = new URL(window.location.href);
        currentUrl.search = "";
        currentUrl.hash = "";

        return currentUrl.toString();
    }

    private static generateRandomString(length: number): string {
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const values = new Uint8Array(length);
        crypto.getRandomValues(values);

        return Array.from(values, (value) => possible[value % possible.length]).join("");
    }

    private static async createCodeChallenge(codeVerifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return this.base64UrlEncode(new Uint8Array(digest));
    }

    private static base64UrlEncode(value: Uint8Array): string {
        const base64 = btoa(String.fromCharCode(...value));
        return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    private static extractUserName(token?: string): string | null {
        if (!token) {
            return null;
        }

        const parts = token.split(".");
        if (parts.length < 2) {
            return null;
        }

        try {
            const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
            const decoded = decodeURIComponent(atob(padded).split("").map((character) => {
                return "%" + ("00" + character.charCodeAt(0).toString(16)).slice(-2);
            }).join(""));
            const claims = JSON.parse(decoded);
            return claims.user_name ?? claims.name ?? claims.preferred_username ?? null;
        } catch (error) {
            return null;
        }
    }

}

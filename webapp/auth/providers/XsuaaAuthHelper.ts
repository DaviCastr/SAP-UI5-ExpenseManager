import { UserSession } from "../models/UserSession";

interface AuthConfig {
    authDomain: string;
    clientId: string;
    scope: string;
    redirectUri: string;
    tokenEndpoint: string;
    refreshEndpoint: string;
}

interface RuntimeConfig {
    btpHost: string;
    odataService: string;
    auth?: AuthConfig;
}

interface TokenResponse {
    access_token: string;
    expires_in?: number;
    token_type?: string;
    refresh_token?: string;
    id_token?: string;
    user_name?: string;
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

    public static createAuthorizationFlow(): { authorizeUrl: string; state: string } {
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
        return { authorizeUrl, state };
    }

    public static async exchangeAuthorizationCode(code: string): Promise<TokenResponse> {
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

        const payload = await response.json() as TokenResponse;

        if (!response.ok || payload.error) {
            throw new Error(payload.error_description ?? payload.error ?? "Token exchange failed");
        }

        return payload;
    }

    public static async refresh(refreshToken: string): Promise<TokenResponse> {
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

        const payload = await response.json() as TokenResponse;

        if (!response.ok || payload.error) {
            throw new Error(payload.error_description ?? payload.error ?? "Token refresh failed");
        }

        return payload;
    }

    public static createSession(tokenResponse: TokenResponse): UserSession {
        const expiresIn = Math.max(tokenResponse.expires_in ?? 3600, 60);
        const userName = tokenResponse.user_name
            ?? this.extractUserName(tokenResponse.id_token)
            ?? "Usuário XSUAA";

        return {
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt: Date.now() + (expiresIn * 1000),
            userName
        };
    }

    public static getRedirectUri(): string {
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

    private static generateRandomString(length: number): string {
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const values = new Uint8Array(length);
        crypto.getRandomValues(values);

        return Array.from(values, (value) => possible[value % possible.length]).join("");
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

import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { SessionStorage } from "../storage/SessionStorage";
import { AuthenticationService } from "../AuthenticationService";
import { XsuaaAuthHelper } from "./XsuaaAuthHelper";

export class BtpAuthenticationProvider implements IAuthenticationProvider {

    public async login(): Promise<UserSession> {
        const config = XsuaaAuthHelper.getConfig();

        if (config.clientId && config.authDomain) {
            const { authorizeUrl, state, codeVerifier } = await XsuaaAuthHelper.createAuthorizationFlow();
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

    public async logout(): Promise<void> {
        SessionStorage.clear();

        if (typeof window !== "undefined") {
            const redirectTarget = encodeURIComponent(window.location.href);
            window.location.assign(`${window.location.origin}/logout?redirect=${redirectTarget}`);
        }
    }

    public async isAuthenticated(): Promise<boolean> {
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

    private createSession(): UserSession {
        return {
            accessToken: "btp-session-token",
            expiresAt: Date.now() + 3600000,
            userName: "Usuário BTP"
        };
    }

}
import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { AuthenticationService } from "../AuthenticationService";
import { SessionStorage } from "../storage/SessionStorage";
import { XsuaaAuthHelper } from "./XsuaaAuthHelper";

export class GithubPagesAuthenticationProvider implements IAuthenticationProvider {

    public async login(): Promise<UserSession> {
        try {
            const { authorizeUrl, state } = XsuaaAuthHelper.createAuthorizationFlow();
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

    public async logout(): Promise<void> {
        SessionStorage.clear();
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

    private cleanUpAuthorizationParams(): void {
        if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") {
            return;
        }

        const url = new URL(window.location.href);
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        window.history.replaceState({}, document.title, url.toString());
    }

}

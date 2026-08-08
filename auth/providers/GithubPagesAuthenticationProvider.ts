import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { AuthenticationService } from "../AuthenticationService";
import { SessionStorage } from "../storage/SessionStorage";
import { XsuaaAuthHelper } from "./XsuaaAuthHelper";

export class GithubPagesAuthenticationProvider implements IAuthenticationProvider {

    public login(): Promise<UserSession> {
        try {
            const { authorizeUrl, state } = XsuaaAuthHelper.createAuthorizationFlow();
            SessionStorage.save({
                accessToken: "",
                expiresAt: 0,
                userName: "Pending"
            });

            if (typeof window !== "undefined") {
                SessionStorage.saveOauthState(state);
                window.location.assign(authorizeUrl);
            }

            return Promise.resolve({
                accessToken: "",
                expiresAt: 0,
                userName: "Pending"
            });
        } catch (error) {
            const session = {
                accessToken: "github-pages-demo-token",
                expiresAt: Date.now() + 3600000,
                userName: "Visitante GitHub Pages"
            };

            SessionStorage.save(session);
            return Promise.resolve(session);
        }
    }

    public logout(): Promise<void> {
        SessionStorage.clear();
        return Promise.resolve();
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

        const savedState = SessionStorage.loadOauthState();
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

            const message = error instanceof Error ? error.message : String(error);
            AuthenticationService.notifyAuthError(message);

            return false;
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

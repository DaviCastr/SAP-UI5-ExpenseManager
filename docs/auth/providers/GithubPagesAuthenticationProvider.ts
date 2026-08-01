import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { AuthenticationService } from "../AuthenticationService";
import { SessionStorage } from "../storage/SessionStorage";
import { XsuaaAuthHelper } from "./XsuaaAuthHelper";

export class GithubPagesAuthenticationProvider implements IAuthenticationProvider {

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

        const session = {
            accessToken: "github-pages-demo-token",
            expiresAt: Date.now() + 3600000,
            userName: "Visitante GitHub Pages"
        };

        SessionStorage.save(session);
        return session;
    }

    public async logout(): Promise<void> {
        SessionStorage.clear();
    }

    public async isAuthenticated(): Promise<boolean> {
        const session = AuthenticationService.getSession();
        return !!session && session.expiresAt > Date.now();
    }

}
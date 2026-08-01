import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { AuthenticationService } from "../AuthenticationService";
import { SessionStorage } from "../storage/SessionStorage";

export class GithubPagesAuthenticationProvider implements IAuthenticationProvider {

    public async login(): Promise<UserSession> {
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
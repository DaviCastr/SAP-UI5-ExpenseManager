import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { SessionStorage } from "../storage/SessionStorage";
import { AuthenticationService } from "../AuthenticationService";

export class BtpAuthenticationProvider implements IAuthenticationProvider {

    public async login(): Promise<UserSession> {
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
        return !!session && session.expiresAt > Date.now();
    }

    private createSession(): UserSession {
        return {
            accessToken: "btp-session-token",
            expiresAt: Date.now() + 3600000,
            userName: "Usuário BTP"
        };
    }

}

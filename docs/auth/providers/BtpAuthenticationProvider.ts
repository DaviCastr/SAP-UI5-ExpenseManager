import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { SessionStorage } from "../storage/SessionStorage";
import { AuthenticationService } from "../AuthenticationService";

export class BtpAuthenticationProvider implements IAuthenticationProvider {

    public async login(): Promise<UserSession> {
        const session = this.createSession();
        SessionStorage.save(session);

        if (typeof window !== "undefined") {
            const redirectTarget = encodeURIComponent(window.location.href);
            window.location.assign(`${window.location.origin}/login?redirect=${redirectTarget}`);
        }

        return session;
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
        return ["success", "true"].includes(searchParams.get("auth") ?? "")
            || ["success", "true"].includes(searchParams.get("loggedIn") ?? "")
            || ["success", "true"].includes(searchParams.get("login") ?? "");
    }

    private createSession(): UserSession {
        return {
            accessToken: "btp-session-token",
            expiresAt: Date.now() + 3600000,
            userName: "Usuário BTP"
        };
    }

}
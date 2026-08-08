import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { AuthenticationService } from "../AuthenticationService";

export class MockAuthenticationProvider implements IAuthenticationProvider {

    public login(): Promise<UserSession> {
        return Promise.resolve({
            accessToken: "mock-token",
            expiresAt: Date.now() + 3600000,
            userName: "Davi"
        });
    }

    public async logout(): Promise<void> {
        await AuthenticationService.logout();
    }

    public isAuthenticated(): Promise<boolean> {
        const session = AuthenticationService.getSession();
        return Promise.resolve(!!session && session.expiresAt > Date.now());
    }

}
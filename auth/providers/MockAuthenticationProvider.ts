import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { UserSession } from "../models/UserSession";
import { AuthenticationService } from "../AuthenticationService";

export class MockAuthenticationProvider implements IAuthenticationProvider {

    public async login(): Promise<UserSession> {

        return {

            accessToken: "mock-token",

            expiresAt: Date.now() + 3600000,

            userName: "Davi"

        };

    }

    public async logout(): Promise<void> {
        await AuthenticationService.logout();
    }

    public async isAuthenticated(): Promise<boolean> {
        const session = AuthenticationService.getSession();
        return !!session && session.expiresAt > Date.now();
    }

}
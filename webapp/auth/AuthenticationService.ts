import { IAuthenticationProvider } from "./IAuthenticationProvider";
import { UserSession } from "./models/UserSession";
import { SessionStorage } from "./storage/SessionStorage";

export class AuthenticationService {

    private static provider: IAuthenticationProvider;

    private static sessionExpiredHandler: (() => void) | null = null;

    public static initialize(provider: IAuthenticationProvider): void {

        this.provider = provider;

    }

    public static async login(): Promise<void> {

        const session = await this.provider.login();

        SessionStorage.save(session);

    }

    public static async logout(): Promise<void> {

        SessionStorage.clear();

        await this.provider.logout();

    }

    public static getSession(): UserSession | null {

        return SessionStorage.load();

    }

    public static async isAuthenticated(): Promise<boolean> {

        return this.provider.isAuthenticated();

    }

    public static onSessionExpired(handler: () => void): void {

        this.sessionExpiredHandler = handler;

    }

    public static notifySessionExpired(): void {

        SessionStorage.clear();

        this.sessionExpiredHandler?.();

    }

}
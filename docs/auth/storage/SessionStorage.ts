import { UserSession } from "../models/UserSession";

export class SessionStorage {

    private static readonly STORAGE_KEY = "expenseManager.session";

    public static save(session: UserSession): void {

        window.sessionStorage.setItem(
            this.STORAGE_KEY,
            JSON.stringify(session)
        );

    }

    public static load(): UserSession | null {

        const value = window.sessionStorage.getItem(this.STORAGE_KEY);

        if (!value) {
            return null;
        }

        return JSON.parse(value) as UserSession;

    }

    public static clear(): void {

        window.sessionStorage.removeItem(this.STORAGE_KEY);

    }

}
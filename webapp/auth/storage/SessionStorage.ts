import Storage from "sap/ui/util/Storage";
import { UserSession } from "../models/UserSession";

export class SessionStorage {

    private static readonly STORAGE_KEY = "session";

    private static readonly sessions = new Storage(Storage.Type.local, "expenseManager");

    private static readonly OAUTH_STATE_KEY = "expensemanager.state";

    public static save(session: UserSession): void {
        this.sessions.put(this.STORAGE_KEY, session);
    }

    public static load(): UserSession | null {
        const value = this.sessions.get(this.STORAGE_KEY) as UserSession | null;
        return value ?? null;
    }

    public static clear(): void {
        this.sessions.remove(this.STORAGE_KEY);
    }

    public static saveOauthState(state: string): void {
        Storage.put(this.OAUTH_STATE_KEY, state);
    }

    public static loadOauthState(): string | null {
        const value = Storage.get(this.OAUTH_STATE_KEY) as string | null;
        return value ?? null;
    }

}
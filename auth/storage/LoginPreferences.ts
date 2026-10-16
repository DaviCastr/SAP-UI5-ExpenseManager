import Storage from "sap/ui/util/Storage";

const EMAIL_KEY = "loginEmail";
const storage = new Storage(Storage.Type.local, "expenseManager");

/**
 * Remembers the last e-mail used on the login page (never the password).
 */
export class LoginPreferences {

    public static loadEmail(): string {
        return (storage.get(EMAIL_KEY) as string | null) ?? "";
    }

    public static saveEmail(email: string): void {
        storage.put(EMAIL_KEY, email);
    }

}

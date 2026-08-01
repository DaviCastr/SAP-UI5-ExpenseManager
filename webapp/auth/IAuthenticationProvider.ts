import { UserSession } from "./models/UserSession";

export interface IAuthenticationProvider {

    login(): Promise<UserSession>;

    logout(): Promise<void>;

    isAuthenticated(): Promise<boolean>;

}
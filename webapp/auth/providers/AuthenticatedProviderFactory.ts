import Environment, { EnvironmentType } from "../../util/Environment";
import { BtpAuthenticationProvider } from "./BtpAuthenticationProvider";
import { GithubPagesAuthenticationProvider } from "./GithubPagesAuthenticationProvider";
import { MockAuthenticationProvider } from "./MockAuthenticationProvider";
import { IAuthenticationProvider } from "../IAuthenticationProvider";

export class AuthenticatedProviderFactory {

    public static create(): IAuthenticationProvider {
        switch (Environment.current()) {
            case EnvironmentType.BTP:
                return new BtpAuthenticationProvider();
            case EnvironmentType.GITHUB:
                return new GithubPagesAuthenticationProvider();
            case EnvironmentType.LOCAL:
            default:
                return new MockAuthenticationProvider();
        }
    }

}
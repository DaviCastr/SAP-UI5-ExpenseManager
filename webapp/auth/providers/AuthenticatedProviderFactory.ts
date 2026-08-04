import Environment, { EnvironmentType } from "../../util/Environment";
import { BtpAuthenticationProvider } from "./BtpAuthenticationProvider";
import { GithubPagesAuthenticationProvider } from "./GithubPagesAuthenticationProvider";
import { MockAuthenticationProvider } from "./MockAuthenticationProvider";
import { IAuthenticationProvider } from "../IAuthenticationProvider";
import { XsuaaAuthHelper } from "./XsuaaAuthHelper";

export class AuthenticatedProviderFactory {

    public static create(): IAuthenticationProvider {
        switch (Environment.current()) {
            case EnvironmentType.BTP:
                return new BtpAuthenticationProvider();
            case EnvironmentType.GITHUB:
                return new GithubPagesAuthenticationProvider();
            case EnvironmentType.LOCAL:
                return XsuaaAuthHelper.getConfig().auth
                    ? new GithubPagesAuthenticationProvider()
                    : new MockAuthenticationProvider();
            default:
                return new MockAuthenticationProvider();
        }
    }

}
export enum EnvironmentType {

    LOCAL = "LOCAL",

    GITHUB = "GITHUB",

    BTP = "BTP"

}

export default class Environment {

    public static current(): Environment {

        const host = window.location.hostname;

        if (host.includes("github.io")) {
            return EnvironmentType.GITHUB;
        }

        if (host.includes("cfapps")) {
            return EnvironmentType.BTP;
        }

        return EnvironmentType.LOCAL;
    }

}
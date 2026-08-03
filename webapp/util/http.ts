import { AuthenticationService } from "../auth/AuthenticationService";
import { XsuaaAuthHelper } from "../auth/providers/XsuaaAuthHelper";

function getToken(): string {
    const session = AuthenticationService.getSession();
    return session?.accessToken || "";
}

export function getOdataServiceUrl(): string {
    return XsuaaAuthHelper.getConfig().odataService;
}

export function buildHeaders(init: RequestInit): Headers {
    const headers = new Headers(init.headers || {});
    const token = getToken();

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
}

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${getOdataServiceUrl()}${path}`, {
        ...init,
        headers: buildHeaders(init)
    });
}

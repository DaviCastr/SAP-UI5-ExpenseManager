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

export class BackendUnavailableError extends Error {
    public constructor() {
        super("O serviço financeiro está indisponível.");
        this.name = "BackendUnavailableError";
    }
}

export class SessionExpiredError extends Error {
    public constructor() {
        super("Sua sessão expirou.");
        this.name = "SessionExpiredError";
    }
}

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;

    try {
        response = await fetch(`${getOdataServiceUrl()}${path}`, {
            ...init,
            headers: buildHeaders(init)
        });
    } catch (error) {
        throw new BackendUnavailableError();
    }

    if (response.status === 401 || response.status === 403) {
        AuthenticationService.notifySessionExpired();
        throw new SessionExpiredError();
    }

    return response;
}

export function isSessionExpiredError(error: unknown): boolean {
    return error instanceof SessionExpiredError;
}

export function isBackendUnavailableError(error: unknown): boolean {
    return error instanceof BackendUnavailableError;
}

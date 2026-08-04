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

export class AccessDeniedError extends Error {
    public constructor() {
        super("Acesso negado (CSRF ou permissão).");
        this.name = "AccessDeniedError";
    }
}

let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
    if (csrfToken) {
        return csrfToken;
    }

    const headers = buildHeaders({});
    headers.set("x-csrf-token", "Fetch");

    const response = await fetch(getOdataServiceUrl(), { method: "GET", headers });
    csrfToken = response.headers.get("x-csrf-token") || null;

    return csrfToken || "";
}

export const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method || "GET").toUpperCase();
    const isUnsafe = UNSAFE_METHODS.includes(method);

    let response: Response;

    try {
        const headers = buildHeaders(init);

        if (isUnsafe) {
            const csrf = await fetchCsrfToken();
            if (csrf) {
                headers.set("x-csrf-token", csrf);
            }
        }

        response = await fetch(`${getOdataServiceUrl()}${path}`, {
            ...init,
            headers
        });
    } catch (error) {
        throw new BackendUnavailableError();
    }

    if (response.status === 401) {
        AuthenticationService.notifySessionExpired();
        throw new SessionExpiredError();
    }

    if (response.status === 403) {
        throw new AccessDeniedError();
    }

    return response;
}

export function isSessionExpiredError(error: unknown): boolean {
    return error instanceof SessionExpiredError;
}

export function isAccessDeniedError(error: unknown): boolean {
    return error instanceof AccessDeniedError;
}

export function isBackendUnavailableError(error: unknown): boolean {
    return error instanceof BackendUnavailableError;
}

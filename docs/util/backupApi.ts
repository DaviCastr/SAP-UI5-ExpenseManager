import { AuthenticationService } from "../auth/AuthenticationService";
import { XsuaaAuthHelper } from "../auth/providers/XsuaaAuthHelper";

function getToken(): string {
    const session = AuthenticationService.getSession();
    return session?.accessToken || "";
}

function getServiceUrl(): string {
    return XsuaaAuthHelper.getConfig().odataService;
}

function buildHeaders(init: RequestInit): Headers {
    const headers = new Headers(init.headers || {});
    const token = getToken();

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${getServiceUrl()}${path}`, {
        ...init,
        headers: buildHeaders(init)
    });
}

export async function createBackupRow(): Promise<{ ID: string }> {
    const response = await request("Backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
    });

    if (!response.ok) {
        throw new Error(`Erro ao criar registro de backup (${response.status})`);
    }

    return (await response.json()) as { ID: string };
}

export async function uploadBackupStream(id: string, file: Blob): Promise<void> {
    const response = await request(`Backups('${id}')/Backup`, {
        method: "PUT",
        headers: { "Content-Type": "application/x-zip-compressed" },
        body: file
    });

    if (!response.ok) {
        throw new Error(`Erro ao importar backup (${response.status})`);
    }
}

export async function requestExportBackup(): Promise<string> {
    const response = await request("ExportBackup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
    });

    if (!response.ok) {
        throw new Error(`Erro ao gerar backup (${response.status})`);
    }

    const payload = (await response.json()) as { status?: number; data?: string };

    if (!payload.data) {
        throw new Error("Backup não retornou identificador");
    }

    return payload.data;
}

export async function fetchBackupStream(id: string): Promise<Blob> {
    const response = await request(`Backups('${id}')/Backup`, {
        headers: { "Accept": "application/x-zip-compressed" }
    });

    if (!response.ok) {
        throw new Error(`Erro ao baixar backup (${response.status})`);
    }

    return response.blob();
}

export async function deleteBackupRow(id: string): Promise<void> {
    const response = await request(`Backups('${id}')`, { method: "DELETE" });

    if (!response.ok && response.status !== 404) {
        throw new Error(`Erro ao remover backup (${response.status})`);
    }
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

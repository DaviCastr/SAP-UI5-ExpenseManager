import { request } from "./http";

export interface CreatedEntity {
    ID: string;
}

export async function createEntity(entitySet: string, payload: object): Promise<CreatedEntity> {
    const response = await request(entitySet, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Erro ao criar ${entitySet} (${response.status})`);
    }

    return (await response.json()) as CreatedEntity;
}

export async function uploadImage(entitySet: string, id: string, file: Blob): Promise<void> {
    const response = await request(`${entitySet}(ID=${id},IsActiveEntity=true)/Image`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file
    });

    if (!response.ok) {
        throw new Error(`Erro ao enviar imagem (${response.status})`);
    }
}

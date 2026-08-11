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

export async function uploadPersonImage(id: string, isActiveEntity: boolean, file: Blob): Promise<void> {
    const response = await request(`Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=${isActiveEntity})/Image`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file
    });

    if (!response.ok) {
        throw new Error(`Erro ao enviar imagem (${response.status})`);
    }
}

/**
 * Uploads an entity image against a specific entity version. Pass
 * `isActiveEntity = false` to write into an open draft (the shared pattern of
 * the edit dialogs), or `true` for the active entity directly.
 *
 * @param {string} entitySet the draft-enabled entity set, e.g. "Cards"
 * @param {string} id the entity key
 * @param {boolean} isActiveEntity whether to target the active or the draft row
 * @param {Blob} file the image file to store
 * @returns {Promise<void>} resolves once the image was uploaded
 */
export async function uploadEntityImage(entitySet: string, id: string, isActiveEntity: boolean, file: Blob): Promise<void> {
    const response = await request(`${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=${isActiveEntity})/Image`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file
    });

    if (!response.ok) {
        throw new Error(`Erro ao enviar imagem (${response.status})`);
    }
}

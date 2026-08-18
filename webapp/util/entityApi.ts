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

sap.ui.define(["./http"], function (___http) {
  "use strict";

  const request = ___http["request"];
  async function createEntity(entitySet, payload) {
    const response = await request(entitySet, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Erro ao criar ${entitySet} (${response.status})`);
    }
    return await response.json();
  }
  async function updatePersonEntity(id, isActiveEntity, updates) {
    const response = await request(`Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=${isActiveEntity})`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updates)
    });
    if (!response.ok) {
      throw new Error(`Erro ao atualizar pessoa (${response.status})`);
    }
  }
  async function uploadImage(entitySet, id, file) {
    const response = await request(`${entitySet}(ID=${id},IsActiveEntity=true)/Image`, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    });
    if (!response.ok) {
      throw new Error(`Erro ao enviar imagem (${response.status})`);
    }
  }
  async function uploadPersonImage(id, isActiveEntity, file) {
    const response = await request(`Persons(ID='${encodeURIComponent(id)}',IsActiveEntity=${isActiveEntity})/Image`, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    });
    if (!response.ok) {
      throw new Error(`Erro ao enviar imagem (${response.status})`);
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.createEntity = createEntity;
  __exports.updatePersonEntity = updatePersonEntity;
  __exports.uploadImage = uploadImage;
  __exports.uploadPersonImage = uploadPersonImage;
  return __exports;
});
//# sourceMappingURL=entityApi-dbg.js.map

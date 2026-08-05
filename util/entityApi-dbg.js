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
  var __exports = {
    __esModule: true
  };
  __exports.createEntity = createEntity;
  __exports.uploadImage = uploadImage;
  return __exports;
});
//# sourceMappingURL=entityApi-dbg.js.map

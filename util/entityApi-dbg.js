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
  var __exports = {
    __esModule: true
  };
  __exports.createEntity = createEntity;
  return __exports;
});
//# sourceMappingURL=entityApi-dbg.js.map

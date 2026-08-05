sap.ui.define(["./http"], function (___http) {
  "use strict";

  const request = ___http["request"];
  async function createBackupRow() {
    const response = await request("Backups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    if (!response.ok) {
      throw new Error(`Erro ao criar registro de backup (${response.status})`);
    }
    return await response.json();
  }
  async function uploadBackupStream(id, file) {
    const response = await request(`Backups('${id}')/Backup`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/x-zip-compressed"
      },
      body: file
    });
    if (!response.ok) {
      throw new Error(`Erro ao importar backup (${response.status})`);
    }
  }
  async function requestExportBackup() {
    const response = await request("ExportBackup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    if (!response.ok) {
      throw new Error(`Erro ao gerar backup (${response.status})`);
    }
    const payload = await response.json();
    if (!payload.data) {
      throw new Error("Backup não retornou identificador");
    }
    return payload.data;
  }
  async function fetchBackupStream(id) {
    const response = await request(`Backups('${id}')/Backup`, {
      headers: {
        "Accept": "application/x-zip-compressed"
      }
    });
    if (!response.ok) {
      throw new Error(`Erro ao baixar backup (${response.status})`);
    }
    return response.blob();
  }
  async function deleteBackupRow(id) {
    const response = await request(`Backups('${id}')`, {
      method: "DELETE"
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Erro ao remover backup (${response.status})`);
    }
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
  var __exports = {
    __esModule: true
  };
  __exports.createBackupRow = createBackupRow;
  __exports.uploadBackupStream = uploadBackupStream;
  __exports.requestExportBackup = requestExportBackup;
  __exports.fetchBackupStream = fetchBackupStream;
  __exports.deleteBackupRow = deleteBackupRow;
  __exports.downloadBlob = downloadBlob;
  return __exports;
});
//# sourceMappingURL=backupApi-dbg.js.map

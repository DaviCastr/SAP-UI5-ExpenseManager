sap.ui.define(["sap/ui/core/Fragment", "sap/m/MessageBox", "sap/m/MessageToast", "../../util/backupApi", "../../util/http", "../../util/i18n"], function (Fragment, MessageBox, MessageToast, ____util_backupApi, ____util_http, ____util_i18n) {
  "use strict";

  const createBackupRow = ____util_backupApi["createBackupRow"];
  const uploadBackupStream = ____util_backupApi["uploadBackupStream"];
  const isSessionExpiredError = ____util_http["isSessionExpiredError"];
  const getText = ____util_i18n["getText"];
  let backupFile = null;
  const Backup = {
    onDialogBeforeOpen: function () {
      backupFile = null;
      const uploader = Fragment.byId("Backup", "backupFileUploader");
      uploader?.setValue("");
    },
    onModificaArquivo: function (event) {
      const parameters = event.getParameters();
      const files = parameters.files;
      backupFile = files && files.length > 0 ? files[0] : null;
    },
    onCancelarBackup: function () {
      this.getParent().close();
    },
    onImportarBackup: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const uiModel = view.getModel("ui");
      if (!backupFile) {
        MessageBox.warning(getText(view, "errorSelectBackupFile"));
        return;
      }
      uiModel.setProperty("/busy", true);
      try {
        const row = await createBackupRow();
        await uploadBackupStream(row.ID, backupFile);
        dialog.close();
        MessageToast.show(getText(view, "backupRestored"));
        await view.getController().bootstrap();
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(getText(view, "errorImportBackup"));
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return Backup;
});
//# sourceMappingURL=Backup-dbg.js.map

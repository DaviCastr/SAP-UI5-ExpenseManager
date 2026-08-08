sap.ui.define(["sap/ui/core/Fragment", "../../util/backupApi", "../../util/feedback"], function (Fragment, ____util_backupApi, ____util_feedback) {
  "use strict";

  const createBackupRow = ____util_backupApi["createBackupRow"];
  const uploadBackupStream = ____util_backupApi["uploadBackupStream"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
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
        showWarning(view, "errorSelectBackupFile");
        return;
      }
      uiModel.setProperty("/busy", true);
      try {
        const row = await createBackupRow();
        await uploadBackupStream(row.ID, backupFile);
        dialog.close();
        showToast(view, "backupRestored");
        void view.getController().reload();
      } catch (error) {
        handleActionError(view, error, "errorImportBackup");
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return Backup;
});
//# sourceMappingURL=Backup-dbg.js.map

import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import FileUploader from "sap/ui/unified/FileUploader";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import {
    createBackupRow,
    uploadBackupStream,
    requestExportBackup,
    fetchBackupStream,
    deleteBackupRow,
    downloadBlob
} from "../../util/backupApi";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import type Home from "../../controller/Home.controller";

let backupFile: File | null = null;

const Backup = {
    onDialogBeforeOpen: function (): void {
        backupFile = null;
        const uploader = Fragment.byId("Backup", "backupFileUploader") as FileUploader;
        uploader?.setValue("");
    },

    onModificaArquivo: function (event: Event): void {
        const parameters = event.getParameters() as { files?: File[] };
        const files = parameters.files;
        backupFile = files && files.length > 0 ? files[0] : null;
    },

    onCancelarBackup: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onImportarBackup: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

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
            void (view.getController() as Home).reload();
        } catch (error) {
            handleActionError(view, error, "errorImportBackup");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    },

    onExportBackup: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        uiModel.setProperty("/busy", true);

        try {
            const guid = await requestExportBackup();
            const blob = await fetchBackupStream(guid);
            downloadBlob(blob, `meu-fluxo-backup-${new Date().toISOString().slice(0, 10)}.zip`);
            await deleteBackupRow(guid);
            showToast(view, "backupExported");
        } catch (error) {
            handleActionError(view, error, "errorExportBackup");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default Backup;

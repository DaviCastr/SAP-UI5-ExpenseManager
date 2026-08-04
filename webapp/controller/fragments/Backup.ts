import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import FileUploader from "sap/ui/unified/FileUploader";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { createBackupRow, uploadBackupStream } from "../../util/backupApi";
import { isSessionExpiredError } from "../../util/http";
import { getText } from "../../util/i18n";
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
            MessageBox.warning(getText(view, "errorSelectBackupFile"));
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            const row = await createBackupRow();
            await uploadBackupStream(row.ID, backupFile);
            dialog.close();
            MessageToast.show(getText(view, "backupRestored"));
            await (view.getController() as Home).reload();
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

export default Backup;

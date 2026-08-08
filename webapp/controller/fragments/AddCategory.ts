import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Event from "sap/ui/base/Event";
import FileUploader from "sap/ui/unified/FileUploader";
import Avatar from "sap/m/Avatar";
import JSONModel from "sap/ui/model/json/JSONModel";
import { createEntity, uploadImage } from "../../util/entityApi";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import type Home from "../../controller/Home.controller";
import type { NewCategory } from "../../model/UiModel";

let categoryPhoto: File | null = null;

const AdicionarCategoria = {
    onDialogBeforeOpen: function (): void {
        categoryPhoto = null;
        (Fragment.byId("AdicionarCategoria", "categoryFileUploader") as FileUploader)?.setValue("");
        (Fragment.byId("AdicionarCategoria", "categoryAvatar") as Avatar)?.setSrc("");
    },

    onModificaArquivo: function (event: Event): void {
        const parameters = event.getParameters() as { files?: File[] };
        const files = parameters.files;
        categoryPhoto = files && files.length > 0 ? files[0] : null;

        if (categoryPhoto) {
            const reader = new FileReader();
            reader.onload = () => {
                (Fragment.byId("AdicionarCategoria", "categoryAvatar") as Avatar)?.setSrc(reader.result as string);
            };
            reader.readAsDataURL(categoryPhoto);
        }
    },

    onCancelarCategoria: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onAdicionarCategoria: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const category = uiModel.getProperty("/newCategory") as NewCategory;
        const personId = uiModel.getProperty("/selectedPersonId") as string;

        if (!category.name) {
            showWarning(view, "errorFillRequiredFields");
            return;
        }

        if (!personId) {
            showWarning(view, "errorMissingPerson");
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            const created = await createEntity("Categories", {
                Name: category.name,
                // eslint-disable-next-line camelcase
                Person_ID: personId,
                ImageType: categoryPhoto?.type || ""
            });

            if (categoryPhoto) {
                await uploadImage("Categories", created.ID, categoryPhoto);
            }

            dialog.close();
            showToast(view, "categoryCreated");
            void (view.getController() as Home).refresh();
        } catch (error) {
            handleActionError(view, error, "errorCreateCategory");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AdicionarCategoria;

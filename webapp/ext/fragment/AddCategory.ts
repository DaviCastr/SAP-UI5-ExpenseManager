import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Event from "sap/ui/base/Event";
import FileUploader from "sap/ui/unified/FileUploader";
import Avatar from "sap/m/Avatar";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { createEntity, uploadImage } from "../../util/entityApi";
import type Home from "../../controller/Home.controller";

interface NewCategory {
    name: string;
}

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
        const personId = uiModel.getProperty("/selectedPerson/ID") as string;

        if (!category.name) {
            MessageBox.warning("Informe o nome da categoria.");
            return;
        }

        if (!personId) {
            MessageBox.warning("Selecione uma pessoa antes de adicionar uma categoria.");
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
            MessageToast.show("Categoria criada com sucesso.");
            await (view.getController() as Home).refresh();
        } catch (error) {
            MessageBox.error("Não foi possível criar a categoria. Verifique sua conexão e tente novamente.");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AdicionarCategoria;

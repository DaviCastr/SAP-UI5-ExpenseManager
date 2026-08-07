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
import { isSessionExpiredError } from "../../util/http";
import { getText } from "../../util/i18n";
import type Home from "../../controller/Home.controller";
import type { NewPerson } from "../../model/UiModel";

let personPhoto: File | null = null;

const AdicionarPessoa = {
    onDialogBeforeOpen: function (): void {
        personPhoto = null;
        (Fragment.byId("AdicionarPessoa", "personFileUploader") as FileUploader)?.setValue("");
        (Fragment.byId("AdicionarPessoa", "personAvatar") as Avatar)?.setSrc("");
    },

    onModificaArquivo: function (event: Event): void {
        const parameters = event.getParameters() as { files?: File[] };
        const files = parameters.files;
        personPhoto = files && files.length > 0 ? files[0] : null;

        if (personPhoto) {
            const reader = new FileReader();
            reader.onload = () => {
                (Fragment.byId("AdicionarPessoa", "personAvatar") as Avatar)?.setSrc(reader.result as string);
            };
            reader.readAsDataURL(personPhoto);
        }
    },

    onCancelarPessoa: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onAdicionarPessoa: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const person = uiModel.getProperty("/newPerson") as NewPerson;

        if (!person.name || !person.email || !person.income || !person.currency || !person.target) {
            MessageBox.warning(getText(view, "errorFillRequiredFields"));
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            const created = await createEntity("Persons", {
                Name: person.name,
                Email: person.email,
                Phone: person.phone,
                Income: Number(person.income.replace(",", ".")),
                // eslint-disable-next-line camelcase
                Currency_code: person.currency,
                ExpenseTarget: Number(person.target.replace(",", ".")),
                ImageType: personPhoto?.type || ""
            });

            if (personPhoto) {
                await uploadImage("Persons", created.ID, personPhoto);
            }

            dialog.close();
            MessageToast.show(getText(view, "personCreated"));
            void (view.getController() as Home).reload();
        } catch (error) {
            if (isSessionExpiredError(error)) {
                return;
            }
            MessageBox.error(getText(view, "errorCreatePerson"));
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AdicionarPessoa;

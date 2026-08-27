import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Event from "sap/ui/base/Event";
import FileUploader from "sap/ui/unified/FileUploader";
import Avatar from "sap/m/Avatar";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { createEntity } from "../../util/entityApi";
import { ODataService } from "../../service/ODataService";
import { uploadNow } from "../../util/fileUpload";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import type Home from "../../controller/Home.controller";
import type { NewPerson } from "../../model/UiModel";

let personPhoto: File | null = null;
let creating = false;

const AddPerson = {
    onDialogBeforeOpen: function (): void {
        creating = false;
        personPhoto = null;
        (Fragment.byId("AddPerson", "personFileUploader") as FileUploader)?.setValue("");
        (Fragment.byId("AddPerson", "personAvatar") as Avatar)?.setSrc("");
    },

    onPhotoChanged: function (event: Event): void {
        const parameters = event.getParameters() as { files?: File[] };
        const files = parameters.files;
        personPhoto = files && files.length > 0 ? files[0] : null;

        if (personPhoto) {
            const reader = new FileReader();
            reader.onload = () => {
                (Fragment.byId("AddPerson", "personAvatar") as Avatar)?.setSrc(reader.result as string);
            };
            reader.readAsDataURL(personPhoto);
        }
    },

    onCancelPerson: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onAddPerson: async function (this: Control): Promise<void> {
        if (creating) {
            return;
        }

        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const person = uiModel.getProperty("/newPerson") as NewPerson;

        if (!person.name || !person.email || !person.income || !person.currency || !person.target) {
            showWarning(view, "errorFillRequiredFields");
            return;
        }

        const income = Number(person.income.replace(",", "."));
        const target = Number(person.target.replace(",", "."));
        if (!Number.isFinite(income) || !Number.isFinite(target)) {
            showWarning(view, "invalidNumberValue");
            return;
        }

        creating = true;
        uiModel.setProperty("/busy", true);

        try {
            const created = await createEntity("Persons", {
                Name: person.name,
                Email: person.email,
                Phone: person.phone,
                Income: income,
                // eslint-disable-next-line camelcase
                Currency_code: person.currency,
                ExpenseTarget: target,
                ImageType: personPhoto?.type || ""
            });

            const odata = new ODataService(view.getModel() as ODataModel);

            if (personPhoto) {
                // The photo is sent by the FileUploader itself (raw PUT with the
                // session's Authorization header) into the draft row that the
                // create above materialized server-side.
                const uploader = Fragment.byId("AddPerson", "personFileUploader") as FileUploader;
                const uploaded = await uploadNow(uploader, odata.getMediaUrl(`Persons(ID='${created.ID}',IsActiveEntity=false)/Image`));
                if (!uploaded) {
                    throw new Error("Erro ao enviar imagem");
                }
            }

            await odata.prepareDraft("Persons", created.ID);
            await odata.activateDraft("Persons", created.ID);

            dialog.close();
            showToast(view, "personCreated");
            void (view.getController() as Home).reload();
        } catch (error) {
            handleActionError(view, error, "errorCreatePerson");
        } finally {
            creating = false;
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AddPerson;

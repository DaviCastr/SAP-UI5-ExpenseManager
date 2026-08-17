import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Event from "sap/ui/base/Event";
import FileUploader from "sap/ui/unified/FileUploader";
import Avatar from "sap/m/Avatar";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { createEntity, uploadPersonImage } from "../../util/entityApi";
import { ODataService } from "../../service/ODataService";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import type Home from "../../controller/Home.controller";
import type { NewPerson } from "../../model/UiModel";

let personPhoto: File | null = null;

const AdicionarPessoa = {
    onDialogBeforeOpen: function (): void {
        personPhoto = null;
        (Fragment.byId("AddPerson", "personFileUploader") as FileUploader)?.setValue("");
        (Fragment.byId("AddPerson", "personAvatar") as Avatar)?.setSrc("");
    },

    onModificaArquivo: function (event: Event): void {
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

    onCancelarPessoa: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onAdicionarPessoa: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const person = uiModel.getProperty("/newPerson") as NewPerson;

        if (!person.name || !person.email || !person.income || !person.currency || !person.target) {
            showWarning(view, "errorFillRequiredFields");
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            // POST on a draft-enabled entity set creates the person as a draft,
            // so the photo must go to the draft row (IsActiveEntity=false)
            // before the draft is published to the active entity.
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
                await uploadPersonImage(created.ID, false, personPhoto);
            }

            const odata = new ODataService(view.getModel() as ODataModel);
            await odata.prepareDraft("Persons", created.ID);
            await odata.activateDraft("Persons", created.ID);

            dialog.close();
            showToast(view, "personCreated");
            void (view.getController() as Home).reload();
        } catch (error) {
            handleActionError(view, error, "errorCreatePerson");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AdicionarPessoa;

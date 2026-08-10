import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Event from "sap/ui/base/Event";
import FileUploader from "sap/ui/unified/FileUploader";
import Avatar from "sap/m/Avatar";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/Context";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { ODataService } from "../../service/ODataService";
import { uploadPersonImage } from "../../util/entityApi";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import type Home from "../../controller/Home.controller";

let personPhoto: File | null = null;

function toNumber(value: unknown): number | null {
    const text = typeof value === "number" ? String(value) : (value ?? "");
    if (!String(text).trim()) {
        return null;
    }
    return Number(String(text).replace(",", ".")) || null;
}

const PersonDetail = {
    onDialogBeforeOpen: function (): void {
        personPhoto = null;
        (Fragment.byId("PersonDetail", "editPersonFileUploader") as FileUploader)?.setValue("");
    },

    onModificaArquivo: function (event: Event): void {
        const parameters = event.getParameters() as { files?: File[] };
        const files = parameters.files;
        personPhoto = files && files.length > 0 ? files[0] : null;

        if (personPhoto) {
            const reader = new FileReader();
            reader.onload = () => {
                (Fragment.byId("PersonDetail", "editPersonAvatar") as Avatar)?.setSrc(reader.result as string);
            };
            reader.readAsDataURL(personPhoto);
        }
    },

    onCancelarEdicao: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onSalvarPessoa: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const context = dialog.getBindingContext() as Context | undefined;

        let person: {
            ID: string;
            Name?: string;
            Email?: string;
            Phone?: string;
            Income?: string | number;
            ExpenseTarget?: string | number;
            // eslint-disable-next-line camelcase
            Currency_code?: string;
            // eslint-disable-next-line camelcase
            ImageType?: string;
            IsActiveEntity?: boolean;
        } | undefined;
        let odata: ODataService | undefined;
        let draftCreated = false;

        try {

            (view.getModel("ui") as JSONModel).setProperty("/busy", true);

            if (!context) {
                showWarning(view, "errorMissingPerson");
                return;
            }

            person = context.getObject() as typeof person;

            if (!person?.ID || !person.Name) {
                showWarning(view, "errorFillRequiredFields");
                return;
            }

            // Draft flow: enable draft edit if editing the active entity, then
            // PATCH the draft (IsActiveEntity=false) and finally activate it. The
            // lifecycle runs through the OData V4 model so every request carries
            // the headers CAP expects (Content-Type, Prefer, ETag) and the CSRF
            // handling is done by the model itself.
            const updates = {
                Name: person.Name,
                Email: person.Email || "",
                Phone: person.Phone || "",
                Income: toNumber(person.Income),
                ExpenseTarget: toNumber(person.ExpenseTarget),
                // eslint-disable-next-line camelcase
                Currency_code: person.Currency_code || "BRL"
            };

            odata = new ODataService(context.getModel() as ODataModel);
            draftCreated = Boolean(person.IsActiveEntity);

            if (person.IsActiveEntity) {
                await odata.enableDraftEdit("Persons", person.ID);
            }

            await odata.saveDraft("Persons", person.ID, updates);

            if (personPhoto) {
                // upload to the draft entity (same pattern as the Backup zip upload)
                await uploadPersonImage(person.ID, false, personPhoto);
            }

            // apply backend side effects, then publish the draft
            await odata.prepareDraft("Persons", person.ID);
            await odata.activateDraft("Persons", person.ID);

            dialog.close();
            showToast(view, "personUpdated");
            void (view.getController() as Home).reload();
        } catch (error) {
            // The flow opens a draft when editing the active entity. If anything
            // fails after that point, discard the draft so an error ignored by
            // the user does not leave an orphan draft behind (an already open
            // draft, IsActiveEntity=false, is a pre-existing one and is kept).
            if (person?.ID && draftCreated && odata) {
                try {
                    await odata.discardDraft("Persons", person.ID);
                } catch {
                    // best effort: keep the original error
                }
            }
            handleActionError(view, error, "errorUpdatePerson");
        } finally {
            (view.getModel("ui") as JSONModel).setProperty("/busy", false);
        }
    }
};

export default PersonDetail;
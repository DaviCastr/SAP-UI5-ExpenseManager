import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Event from "sap/ui/base/Event";
import FileUploader from "sap/ui/unified/FileUploader";
import Avatar from "sap/m/Avatar";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/Context";
import { updatePersonEntity, uploadPersonImage } from "../../util/entityApi";
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

        if (!context) {
            showWarning(view, "errorMissingPerson");
            return;
        }

        const person = context.getObject() as {
            ID: string;
            Name?: string;
            Email?: string;
            Phone?: string;
            Income?: string | number;
            ExpenseTarget?: string | number;
            AmountToSave?: string | number;
            // eslint-disable-next-line camelcase
            Currency_code?: string;
            // eslint-disable-next-line camelcase
            ImageType?: string;
            IsActiveEntity?: boolean;
        };

        if (!person?.ID || !person.Name) {
            showWarning(view, "errorFillRequiredFields");
            return;
        }

        (view.getModel("ui") as JSONModel).setProperty("/busy", true);

        try {
            await updatePersonEntity(person.ID, !!person.IsActiveEntity, {
                Name: person.Name,
                Email: person.Email || "",
                Phone: person.Phone || "",
                Income: toNumber(person.Income),
                ExpenseTarget: toNumber(person.ExpenseTarget),
                AmountToSave: toNumber(person.AmountToSave),
                // eslint-disable-next-line camelcase
                Currency_code: person.Currency_code || "BRL",
                // eslint-disable-next-line camelcase
                ImageType: (person.ImageType as string) || personPhoto?.type || ""
            });

            if (personPhoto) {
                await uploadPersonImage(person.ID, !!person.IsActiveEntity, personPhoto);
            }

            dialog.close();
            showToast(view, "personUpdated");
            void (view.getController() as Home).reload();
        } catch (error) {
            handleActionError(view, error, "errorUpdatePerson");
        } finally {
            (view.getModel("ui") as JSONModel).setProperty("/busy", false);
        }
    }
};

export default PersonDetail;
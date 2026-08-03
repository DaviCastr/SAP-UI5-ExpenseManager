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

interface NewCard {
    name: string;
    limit: string;
    currency: string;
}

let cardPhoto: File | null = null;

const AdicionarCartao = {
    onDialogBeforeOpen: function (): void {
        cardPhoto = null;
        (Fragment.byId("AdicionarCartao", "cardFileUploader") as FileUploader)?.setValue("");
        (Fragment.byId("AdicionarCartao", "cardAvatar") as Avatar)?.setSrc("");
    },

    onModificaArquivo: function (event: Event): void {
        const parameters = event.getParameters() as { files?: File[] };
        const files = parameters.files;
        cardPhoto = files && files.length > 0 ? files[0] : null;

        if (cardPhoto) {
            const reader = new FileReader();
            reader.onload = () => {
                (Fragment.byId("AdicionarCartao", "cardAvatar") as Avatar)?.setSrc(reader.result as string);
            };
            reader.readAsDataURL(cardPhoto);
        }
    },

    onCancelarCartao: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onAdicionarCartao: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const card = uiModel.getProperty("/newCard") as NewCard;
        const personId = uiModel.getProperty("/selectedPerson/ID") as string;

        if (!card.name || !card.limit) {
            MessageBox.warning("Informe o nome e o limite do cartão.");
            return;
        }

        if (!personId) {
            MessageBox.warning("Selecione uma pessoa antes de adicionar um cartão.");
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            const created = await createEntity("Cards", {
                Name: card.name,
                Limit: Number(card.limit.replace(",", ".")),
                // eslint-disable-next-line camelcase
                Currency_code: card.currency,
                DueDay: 10,
                ClosingDay: 3,
                // eslint-disable-next-line camelcase
                Person_ID: personId,
                ImageType: cardPhoto?.type || ""
            });

            if (cardPhoto) {
                await uploadImage("Cards", created.ID, cardPhoto);
            }

            dialog.close();
            MessageToast.show("Cartão adicionado com sucesso.");
            await (view.getController() as Home).refresh();
        } catch (error) {
            MessageBox.error("Não foi possível adicionar o cartão. Verifique sua conexão e tente novamente.");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default AdicionarCartao;

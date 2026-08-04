sap.ui.define(["sap/ui/core/Fragment", "sap/m/MessageBox", "sap/m/MessageToast", "../../util/entityApi", "../../util/http", "../../util/i18n"], function (Fragment, MessageBox, MessageToast, ____util_entityApi, ____util_http, ____util_i18n) {
  "use strict";

  const createEntity = ____util_entityApi["createEntity"];
  const uploadImage = ____util_entityApi["uploadImage"];
  const isSessionExpiredError = ____util_http["isSessionExpiredError"];
  const getText = ____util_i18n["getText"];
  let cardPhoto = null;
  const AdicionarCartao = {
    onDialogBeforeOpen: function () {
      cardPhoto = null;
      Fragment.byId("AdicionarCartao", "cardFileUploader")?.setValue("");
      Fragment.byId("AdicionarCartao", "cardAvatar")?.setSrc("");
    },
    onModificaArquivo: function (event) {
      const parameters = event.getParameters();
      const files = parameters.files;
      cardPhoto = files && files.length > 0 ? files[0] : null;
      if (cardPhoto) {
        const reader = new FileReader();
        reader.onload = () => {
          Fragment.byId("AdicionarCartao", "cardAvatar")?.setSrc(reader.result);
        };
        reader.readAsDataURL(cardPhoto);
      }
    },
    onCancelarCartao: function () {
      this.getParent().close();
    },
    onAdicionarCartao: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const uiModel = view.getModel("ui");
      const card = uiModel.getProperty("/newCard");
      const personId = uiModel.getProperty("/selectedPerson/ID");
      if (!card.name || !card.limit) {
        MessageBox.warning(getText(view, "errorFillRequiredFields"));
        return;
      }
      if (!personId) {
        MessageBox.warning(getText(view, "errorMissingPerson"));
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
        MessageToast.show(getText(view, "cardAdded"));
        await view.getController().refresh();
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(getText(view, "errorCreateCard"));
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return AdicionarCartao;
});
//# sourceMappingURL=AddCard-dbg.js.map

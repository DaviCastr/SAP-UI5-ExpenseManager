sap.ui.define(["sap/ui/core/Fragment", "../../util/entityApi", "../../util/feedback"], function (Fragment, ____util_entityApi, ____util_feedback) {
  "use strict";

  const createEntity = ____util_entityApi["createEntity"];
  const uploadImage = ____util_entityApi["uploadImage"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
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
      const personId = uiModel.getProperty("/selectedPersonId");
      if (!card.name || !card.limit) {
        showWarning(view, "errorFillRequiredFields");
        return;
      }
      if (!personId) {
        showWarning(view, "errorMissingPerson");
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
        showToast(view, "cardAdded");
        void view.getController().refresh();
      } catch (error) {
        handleActionError(view, error, "errorCreateCard");
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return AdicionarCartao;
});
//# sourceMappingURL=AddCard-dbg.js.map

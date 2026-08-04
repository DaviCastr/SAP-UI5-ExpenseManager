sap.ui.define(["sap/ui/core/Fragment", "sap/m/MessageBox", "sap/m/MessageToast", "../../util/entityApi", "../../util/http", "../../util/i18n"], function (Fragment, MessageBox, MessageToast, ____util_entityApi, ____util_http, ____util_i18n) {
  "use strict";

  const createEntity = ____util_entityApi["createEntity"];
  const uploadImage = ____util_entityApi["uploadImage"];
  const isSessionExpiredError = ____util_http["isSessionExpiredError"];
  const getText = ____util_i18n["getText"];
  let personPhoto = null;
  const AdicionarPessoa = {
    onDialogBeforeOpen: function () {
      personPhoto = null;
      Fragment.byId("AdicionarPessoa", "personFileUploader")?.setValue("");
      Fragment.byId("AdicionarPessoa", "personAvatar")?.setSrc("");
    },
    onModificaArquivo: function (event) {
      const parameters = event.getParameters();
      const files = parameters.files;
      personPhoto = files && files.length > 0 ? files[0] : null;
      if (personPhoto) {
        const reader = new FileReader();
        reader.onload = () => {
          Fragment.byId("AdicionarPessoa", "personAvatar")?.setSrc(reader.result);
        };
        reader.readAsDataURL(personPhoto);
      }
    },
    onCancelarPessoa: function () {
      this.getParent().close();
    },
    onAdicionarPessoa: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const uiModel = view.getModel("ui");
      const person = uiModel.getProperty("/newPerson");
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
        await view.getController().bootstrap();
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
  return AdicionarPessoa;
});
//# sourceMappingURL=AddPerson-dbg.js.map

sap.ui.define(["sap/ui/core/Fragment", "sap/m/MessageBox", "sap/m/MessageToast", "../../util/entityApi", "../../util/http", "../../util/i18n"], function (Fragment, MessageBox, MessageToast, ____util_entityApi, ____util_http, ____util_i18n) {
  "use strict";

  const createEntity = ____util_entityApi["createEntity"];
  const uploadImage = ____util_entityApi["uploadImage"];
  const isSessionExpiredError = ____util_http["isSessionExpiredError"];
  const getText = ____util_i18n["getText"];
  let categoryPhoto = null;
  const AdicionarCategoria = {
    onDialogBeforeOpen: function () {
      categoryPhoto = null;
      Fragment.byId("AdicionarCategoria", "categoryFileUploader")?.setValue("");
      Fragment.byId("AdicionarCategoria", "categoryAvatar")?.setSrc("");
    },
    onModificaArquivo: function (event) {
      const parameters = event.getParameters();
      const files = parameters.files;
      categoryPhoto = files && files.length > 0 ? files[0] : null;
      if (categoryPhoto) {
        const reader = new FileReader();
        reader.onload = () => {
          Fragment.byId("AdicionarCategoria", "categoryAvatar")?.setSrc(reader.result);
        };
        reader.readAsDataURL(categoryPhoto);
      }
    },
    onCancelarCategoria: function () {
      this.getParent().close();
    },
    onAdicionarCategoria: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const uiModel = view.getModel("ui");
      const category = uiModel.getProperty("/newCategory");
      const personId = uiModel.getProperty("/selectedPerson/ID");
      if (!category.name) {
        MessageBox.warning(getText(view, "errorFillRequiredFields"));
        return;
      }
      if (!personId) {
        MessageBox.warning(getText(view, "errorMissingPerson"));
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
        MessageToast.show(getText(view, "categoryCreated"));
        await view.getController().refresh();
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(getText(view, "errorCreateCategory"));
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return AdicionarCategoria;
});
//# sourceMappingURL=AddCategory-dbg.js.map

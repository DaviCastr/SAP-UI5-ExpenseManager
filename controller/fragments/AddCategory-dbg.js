sap.ui.define(["sap/ui/core/Fragment", "../../util/entityApi", "../../util/feedback"], function (Fragment, ____util_entityApi, ____util_feedback) {
  "use strict";

  const createEntity = ____util_entityApi["createEntity"];
  const uploadImage = ____util_entityApi["uploadImage"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
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
      const personId = uiModel.getProperty("/selectedPersonId");
      if (!category.name) {
        showWarning(view, "errorFillRequiredFields");
        return;
      }
      if (!personId) {
        showWarning(view, "errorMissingPerson");
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
        showToast(view, "categoryCreated");
        if (view) {
          void view.getController().reload();
        }
      } catch (error) {
        handleActionError(view, error, "errorCreateCategory");
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return AdicionarCategoria;
});
//# sourceMappingURL=AddCategory-dbg.js.map

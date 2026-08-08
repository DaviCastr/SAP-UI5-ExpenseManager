sap.ui.define(["sap/ui/core/Fragment", "../../util/entityApi", "../../util/feedback"], function (Fragment, ____util_entityApi, ____util_feedback) {
  "use strict";

  const updatePersonEntity = ____util_entityApi["updatePersonEntity"];
  const uploadPersonImage = ____util_entityApi["uploadPersonImage"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  let personPhoto = null;
  function toNumber(value) {
    const text = typeof value === "number" ? String(value) : value ?? "";
    if (!String(text).trim()) {
      return null;
    }
    return Number(String(text).replace(",", ".")) || null;
  }
  const PersonDetail = {
    onDialogBeforeOpen: function () {
      personPhoto = null;
      Fragment.byId("PersonDetail", "editPersonFileUploader")?.setValue("");
    },
    onModificaArquivo: function (event) {
      const parameters = event.getParameters();
      const files = parameters.files;
      personPhoto = files && files.length > 0 ? files[0] : null;
      if (personPhoto) {
        const reader = new FileReader();
        reader.onload = () => {
          Fragment.byId("PersonDetail", "editPersonAvatar")?.setSrc(reader.result);
        };
        reader.readAsDataURL(personPhoto);
      }
    },
    onCancelarEdicao: function () {
      this.getParent().close();
    },
    onSalvarPessoa: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const context = dialog.getBindingContext();
      if (!context) {
        showWarning(view, "errorMissingPerson");
        return;
      }
      const person = context.getObject();
      if (!person?.ID || !person.Name) {
        showWarning(view, "errorFillRequiredFields");
        return;
      }
      view.getModel("ui").setProperty("/busy", true);
      try {
        await updatePersonEntity(person.ID, !!person.IsActiveEntity, {
          Name: person.Name,
          Email: person.Email || "",
          Phone: person.Phone || "",
          Income: toNumber(person.Income),
          ExpenseTarget: toNumber(person.ExpenseTarget),
          AmountToSave: toNumber(person.AmountToSave),
          // eslint-disable-next-line camelcase
          Currency_code: person.Currency_code || "BRL"
        });
        if (personPhoto) {
          await uploadPersonImage(person.ID, !!person.IsActiveEntity, personPhoto);
        }
        dialog.close();
        showToast(view, "personUpdated");
        void view.getController().reload();
      } catch (error) {
        handleActionError(view, error, "errorUpdatePerson");
      } finally {
        view.getModel("ui").setProperty("/busy", false);
      }
    }
  };
  return PersonDetail;
});
//# sourceMappingURL=EditPerson-dbg.js.map

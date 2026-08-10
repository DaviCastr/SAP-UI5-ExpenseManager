sap.ui.define(["sap/ui/core/Fragment", "../../service/ODataService", "../../util/entityApi", "../../util/feedback"], function (Fragment, ____service_ODataService, ____util_entityApi, ____util_feedback) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
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
      let person;
      let odata;
      let draftCreated = false;
      try {
        view.getModel("ui").setProperty("/busy", true);
        if (!context) {
          showWarning(view, "errorMissingPerson");
          return;
        }
        person = context.getObject();
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
        odata = new ODataService(context.getModel());
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
        void view.getController().reload();
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
        view.getModel("ui").setProperty("/busy", false);
      }
    }
  };
  return PersonDetail;
});
//# sourceMappingURL=EditPerson-dbg.js.map

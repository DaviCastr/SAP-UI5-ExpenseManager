sap.ui.define(["sap/ui/core/Fragment", "../../util/entityApi", "../../service/ODataService", "../../util/feedback"], function (Fragment, ____util_entityApi, ____service_ODataService, ____util_feedback) {
  "use strict";

  const createEntity = ____util_entityApi["createEntity"];
  const uploadPersonImage = ____util_entityApi["uploadPersonImage"];
  const ODataService = ____service_ODataService["ODataService"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  let personPhoto = null;
  const AdicionarPessoa = {
    onDialogBeforeOpen: function () {
      personPhoto = null;
      Fragment.byId("AddPerson", "personFileUploader")?.setValue("");
      Fragment.byId("AddPerson", "personAvatar")?.setSrc("");
    },
    onModificaArquivo: function (event) {
      const parameters = event.getParameters();
      const files = parameters.files;
      personPhoto = files && files.length > 0 ? files[0] : null;
      if (personPhoto) {
        const reader = new FileReader();
        reader.onload = () => {
          Fragment.byId("AddPerson", "personAvatar")?.setSrc(reader.result);
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
        showWarning(view, "errorFillRequiredFields");
        return;
      }
      uiModel.setProperty("/busy", true);
      try {
        // POST on a draft-enabled entity set creates the person as a draft,
        // so the photo must go to the draft row (IsActiveEntity=false)
        // before the draft is published to the active entity.
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
          await uploadPersonImage(created.ID, false, personPhoto);
        }
        const odata = new ODataService(view.getModel());
        await odata.prepareDraft("Persons", created.ID);
        await odata.activateDraft("Persons", created.ID);
        dialog.close();
        showToast(view, "personCreated");
        void view.getController().reload();
      } catch (error) {
        handleActionError(view, error, "errorCreatePerson");
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return AdicionarPessoa;
});
//# sourceMappingURL=AddPerson-dbg.js.map

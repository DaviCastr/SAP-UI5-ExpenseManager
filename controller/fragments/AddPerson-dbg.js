sap.ui.define(["sap/ui/core/Fragment", "../../util/entityApi", "../../service/ODataService", "../../util/fileUpload", "../../util/feedback"], function (Fragment, ____util_entityApi, ____service_ODataService, ____util_fileUpload, ____util_feedback) {
  "use strict";

  const createEntity = ____util_entityApi["createEntity"];
  const ODataService = ____service_ODataService["ODataService"];
  const uploadNow = ____util_fileUpload["uploadNow"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  let personPhoto = null;
  const AddPerson = {
    onDialogBeforeOpen: function () {
      personPhoto = null;
      Fragment.byId("AddPerson", "personFileUploader")?.setValue("");
      Fragment.byId("AddPerson", "personAvatar")?.setSrc("");
    },
    onPhotoChanged: function (event) {
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
    onCancelPerson: function () {
      this.getParent().close();
    },
    onAddPerson: async function () {
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
        const odata = new ODataService(view.getModel());
        if (personPhoto) {
          // The photo is sent by the FileUploader itself (raw PUT with the
          // session's Authorization header) into the draft row that the
          // create above materialized server-side.
          const uploader = Fragment.byId("AddPerson", "personFileUploader");
          const uploaded = await uploadNow(uploader, odata.getMediaUrl(`Persons(ID='${created.ID}',IsActiveEntity=false)/Image`));
          if (!uploaded) {
            throw new Error("Erro ao enviar imagem");
          }
        }
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
  return AddPerson;
});
//# sourceMappingURL=AddPerson-dbg.js.map

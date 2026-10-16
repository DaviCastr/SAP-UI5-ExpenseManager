sap.ui.define(["sap/m/Avatar", "sap/m/MessageBox", "sap/m/CustomListItem", "./BaseController", "../service/ODataService", "../util/draftDialogFlow", "../util/fileUpload", "../util/http", "../util/feedback", "../util/rejectedChanges", "../util/personEvents"], function (Avatar, MessageBox, CustomListItem, ___BaseController, ___service_ODataService, ___util_draftDialogFlow, ___util_fileUpload, ___util_http, ___util_feedback, ___util_rejectedChanges, ___util_personEvents) {
  "use strict";

  const BaseController = ___BaseController["BaseController"];
  const ODataService = ___service_ODataService["ODataService"];
  const deleteRowInDialogDraft = ___util_draftDialogFlow["deleteRowInDialogDraft"];
  const ensureDialogDraft = ___util_draftDialogFlow["ensureDialogDraft"];
  const runExclusiveDialogAction = ___util_draftDialogFlow["runExclusiveDialogAction"];
  const waitForDraftListBinding = ___util_draftDialogFlow["waitForDraftListBinding"];
  const uploadNow = ___util_fileUpload["uploadNow"];
  const request = ___util_http["request"];
  const handleActionError = ___util_feedback["handleActionError"];
  const showWarning = ___util_feedback["showWarning"];
  const createRejectedChangeGuard = ___util_rejectedChanges["createRejectedChangeGuard"];
  const PERSON_CHANNEL = ___util_personEvents["PERSON_CHANNEL"];
  const PERSON_DRAFT_CLOSING = ___util_personEvents["PERSON_DRAFT_CLOSING"];
  const PERSON_SELECTED = ___util_personEvents["PERSON_SELECTED"];
  /**
   * Base of the tabs that manage a collection of the selected person (cards,
   * categories…). The tab is bound to the person's current state (the draft
   * when one is open); editing switches it to the person draft, and the changes
   * are saved or discarded with the rest of the draft from the workspace footer.
   * Subclasses describe the collection and build the entry of the "add" form.
   */
  class CollectionTab extends BaseController {
    rejectedGuard = createRejectedChangeGuard();
    active = false;
    onInit() {
      const eventBus = this.getOwnerComponent()?.getEventBus();
      eventBus?.subscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
      eventBus?.subscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
      const router = this.getRouter();
      router.attachRouteMatched(event => this.onRouteMatched(event.getParameter("name") === this.config.route));
      this.onRouteMatched(router.getRouteInfoByHash(router.getHashChanger().getHash())?.name === this.config.route);
      this.resetForm();
    }
    onExit() {
      const eventBus = this.getOwnerComponent()?.getEventBus();
      eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
      eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
      this.rejectedGuard.detach();
    }

    /**
     * Adds the entry of the "add" form to the collection inside the person
     * draft (created when none is open).
     */
    async onAdd() {
      const entry = this.newEntry();
      if (!entry) {
        return;
      }
      const view = this.getView();
      await runExclusiveDialogAction(this.page(), async () => {
        if (!(await this.enterDraft(this.config.texts.addError))) {
          return;
        }
        try {
          const binding = await waitForDraftListBinding(this.list());
          if (!binding) {
            showWarning(view, this.config.texts.loadError);
            return;
          }
          this.trackCreate(binding, binding.create(entry));
        } catch (error) {
          handleActionError(view, error, this.config.texts.addError);
        }
      });
    }

    /**
     * Switches the tab to the person draft, which enables the inline editors.
     */
    async onToggleEdit() {
      await runExclusiveDialogAction(this.page(), () => this.enterDraft(this.config.texts.editError));
    }
    onRemove(event) {
      const context = event.getSource().getBindingContext();
      const row = context?.getObject();
      if (!row?.ID) {
        return;
      }
      MessageBox.confirm(this.getText(this.config.texts.removeConfirm), {
        title: this.getText(this.config.texts.removeTitle),
        onClose: action => {
          if (action !== MessageBox.Action.OK) {
            return;
          }
          void runExclusiveDialogAction(this.page(), () => deleteRowInDialogDraft({
            view: this.getView(),
            dialog: this.page(),
            list: this.list(),
            rowId: row.ID,
            errorKey: this.config.texts.removeError,
            missingRowKey: this.config.texts.loadError
          }));
        }
      });
    }

    /**
     * Previews the chosen photo and uploads it into the row's DRAFT entry; the
     * photo becomes active together with the rest of the draft on save.
     *
     * @param {Event} event the file uploader `change` event
     */
    onPhotoChanged(event) {
      const uploader = event.getSource();
      const file = event.getParameters().files?.[0];
      const item = this.containingListItem(uploader);
      const context = item?.getBindingContext();
      const row = context?.getObject();
      if (!file || !item || !context || !row?.ID) {
        return;
      }
      const id = row.ID;
      void this.uploadPhoto(id, row.Name, context, uploader).then(uploaded => {
        if (!uploaded) {
          showWarning(this.getView(), this.config.texts.imageFallback);
        }
      });
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        this.findAvatar(item)?.setSrc(dataUrl);
        this.getUiModel().setProperty(`${this.config.imagesPath}/${id}`, dataUrl);
        this.previewPhoto(id, dataUrl);
      };
      reader.readAsDataURL(file);
    }

    /**
     * Validates the "add" form and returns the entry to create, or null after
     * warning the user about missing data.
     */

    /**
     * Mirrors a newly chosen photo into other parts of the app while the draft
     * is open (optional).
     *
     * @param {string} id the row ID
     * @param {string} dataUrl the photo preview
     */
    previewPhoto(id, dataUrl) {
      void id;
      void dataUrl;
    }
    warn(key) {
      showWarning(this.getView(), key);
    }
    onRouteMatched(active) {
      this.active = active;
      if (!active) {
        this.rejectedGuard.detach();
        return;
      }
      this.onPersonSelected();
      this.rejectedGuard.attach(this.page(), this.config.texts.editError, this.config.texts.rejectedChanges);
    }
    onPersonSelected = () => {
      const personId = this.selectedPersonId();
      const workspace = this.workspace();
      if (!this.active) {
        return;
      }
      if (!personId || !workspace) {
        this.page().unbindObject();
        return;
      }
      this.page().setModel(this.getServiceModel());
      this.page().bindObject(workspace.currentPersonPathFor(personId));
      void this.loadRowImages();
    };
    onDraftClosing = () => {
      this.page().unbindObject();
    };
    async enterDraft(errorKey) {
      return ensureDialogDraft(this.getView(), this.page(), errorKey);
    }

    /**
     * Resets the "add" form once the row was created; on failure the created
     * context is deleted so the model does not keep retrying it (the backend
     * message is shown by the rejected-change guard).
     *
     * @param {ODataListBinding} binding the list binding the row was created on
     * @param {Context} context the created context
     */
    trackCreate(binding, context) {
      const handler = event => {
        const params = event.getParameters();
        if (params.context !== context) {
          return;
        }
        binding.detachCreateCompleted(handler);
        if (params.success) {
          this.resetForm();
          return;
        }
        void context.delete().catch(() => undefined);
      };
      binding.attachCreateCompleted(handler);
    }

    /**
     * Uploads the photo into the row's DRAFT entry. The draft row is touched
     * first (containment PATCH) so it exists before the media PUT.
     *
     * @param {string} id the row ID
     * @param {string | undefined} name the row name, sent by the touch PATCH
     * @param {Context} context the row context
     * @param {FileUploader} uploader the row uploader holding the file
     * @returns {Promise<boolean>} whether the photo was uploaded
     */
    async uploadPhoto(id, name, context, uploader) {
      const {
        entitySet
      } = this.config;
      const personId = this.selectedPersonId();
      try {
        await request(`Persons(ID='${encodeURIComponent(personId)}',IsActiveEntity=false)/${entitySet}(ID='${encodeURIComponent(id)}')`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            Name: name
          })
        });
        const odata = new ODataService(context.getModel());
        return await uploadNow(uploader, odata.getMediaUrl(`${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`));
      } catch {
        return false;
      }
    }

    /**
     * Loads the photo of every listed row into the images map of the ui model
     * (draft media first, then the active one). Best effort: rows without a
     * photo keep their initials.
     */
    async loadRowImages() {
      const binding = this.list()?.getBinding("items");
      const {
        entitySet,
        imagesPath
      } = this.config;
      if (!binding) {
        return;
      }
      try {
        const contexts = await binding.requestContexts();
        const odata = new ODataService(this.getServiceModel());
        const images = {};
        await Promise.all(contexts.map(async context => {
          const id = context.getObject()?.ID;
          if (!id) {
            return;
          }
          const base64 = (await odata.getMediaAsBase64(`${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`)) ?? (await odata.getMediaAsBase64(`${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=true)/Image`));
          if (base64) {
            images[id] = base64;
          }
        }));
        this.getUiModel().setProperty(imagesPath, images);
      } catch {
        // keep initials; image loading must not break the tab
      }
    }
    containingListItem(control) {
      let current = control;
      while (current && !(current instanceof CustomListItem)) {
        current = current.getParent();
      }
      return current;
    }
    findAvatar(control) {
      if (control instanceof Avatar) {
        return control;
      }
      const container = control;
      for (const child of container.getContent?.() ?? container.getItems?.() ?? []) {
        const avatar = this.findAvatar(child);
        if (avatar) {
          return avatar;
        }
      }
      return undefined;
    }
    page() {
      return this.byId(this.config.pageId);
    }
    list() {
      return this.byId(this.config.listId);
    }
    selectedPersonId() {
      return this.getUiModel().getProperty("/selectedPersonId") || "";
    }
    workspace() {
      return this.getOwnerComponent()?.getWorkspace();
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.CollectionTab = CollectionTab;
  return __exports;
});
//# sourceMappingURL=CollectionTab-dbg.js.map

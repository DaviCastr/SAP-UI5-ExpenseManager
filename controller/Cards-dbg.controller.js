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
   * "Cartões" tab: lists the cards of the selected person and edits them inline
   * inside the person draft. The tab is bound to the person's current state (the
   * draft when one is open); editing switches it to the draft, and the changes
   * are saved or discarded with the rest of the draft from the workspace footer.
   */
  class Cards extends BaseController {
    rejectedGuard = createRejectedChangeGuard();
    active = false;
    onInit() {
      const eventBus = this.getOwnerComponent()?.getEventBus();
      eventBus?.subscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
      eventBus?.subscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
      this.getRouter().attachRouteMatched(event => this.onRouteMatched(event.getParameter("name") === "Cards"));
      this.onRouteMatched(this.getRouter().getRouteInfoByHash(this.getRouter().getHashChanger().getHash())?.name === "Cards");
      this.resetNewCard();
    }
    onExit() {
      const eventBus = this.getOwnerComponent()?.getEventBus();
      eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
      eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
      this.rejectedGuard.detach();
    }

    /**
     * Adds a new card to the person's Cards collection inside the person draft
     * (created when none is open).
     */
    async onAddCard() {
      const page = this.page();
      const view = this.getView();
      const form = this.getUiModel().getProperty("/newCard");
      const name = (form.name ?? "").trim();
      const limit = Number(String(form.limit ?? "").replace(",", "."));
      const closingDay = Number(form.closingDay);
      const dueDay = Number(form.dueDay);
      if (!name || !Number.isFinite(limit) || limit <= 0 || !Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        showWarning(view, "cardsFillFields");
        return;
      }
      await runExclusiveDialogAction(page, async () => {
        if (!(await this.enterDraft("cardsAddError"))) {
          return;
        }
        try {
          const binding = await waitForDraftListBinding(this.byId("cardsList"));
          if (!binding) {
            showWarning(view, "cardsLoadError");
            return;
          }
          const context = binding.create({
            Name: name,
            Limit: limit,
            // eslint-disable-next-line camelcase
            Currency_code: form.currency,
            ClosingDay: closingDay,
            DueDay: dueDay
          });
          this.trackCreate(binding, context);
        } catch (error) {
          handleActionError(view, error, "cardsAddError");
        }
      });
    }

    /**
     * Switches the tab to the person draft, which enables the inline editors.
     */
    async onToggleCardsEdit() {
      await runExclusiveDialogAction(this.page(), () => this.enterDraft("cardsEditError"));
    }
    onRemoveCard(event) {
      const view = this.getView();
      const context = event.getSource().getBindingContext();
      const card = context?.getObject();
      if (!card?.ID) {
        return;
      }
      MessageBox.confirm(this.getText("cardsRemoveConfirm"), {
        title: this.getText("cardsRemoveTitle"),
        onClose: action => {
          if (action !== MessageBox.Action.OK) {
            return;
          }
          void runExclusiveDialogAction(this.page(), () => deleteRowInDialogDraft({
            view,
            dialog: this.page(),
            list: this.byId("cardsList"),
            rowId: card.ID,
            errorKey: "cardsRemoveError",
            missingRowKey: "cardsLoadError"
          }));
        }
      });
    }

    /**
     * Previews the chosen photo and uploads it into the card's DRAFT row; the
     * photo becomes active together with the rest of the draft on save.
     *
     * @param {Event} event the file uploader `change` event
     */
    onCardPhotoChanged(event) {
      const uploader = event.getSource();
      const file = event.getParameters().files?.[0];
      const item = this.containingListItem(uploader);
      const context = item?.getBindingContext();
      const card = context?.getObject();
      if (!file || !item || !context || !card?.ID) {
        return;
      }
      void this.uploadPhoto(card.ID, card.Name, context, uploader).then(uploaded => {
        if (!uploaded) {
          showWarning(this.getView(), "cardsImageFallback");
        }
      });
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        this.findAvatar(item)?.setSrc(dataUrl);
        this.getUiModel().setProperty(`/cardImages/${card.ID}`, dataUrl);
        this.getUiModel().setProperty(`/dialogCardImages/${card.ID}`, dataUrl);
      };
      reader.readAsDataURL(file);
    }
    onRouteMatched(active) {
      this.active = active;
      if (!active) {
        this.rejectedGuard.detach();
        return;
      }
      this.onPersonSelected();
      this.rejectedGuard.attach(this.page(), "cardsEditError", "cardsRejectedChanges");
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
     * Resets the "new card" form once the row was created; on failure the
     * created context is deleted so the model does not keep retrying it (the
     * backend message is shown by the rejected-change guard).
     *
     * @param {ODataListBinding} binding the list binding the card was created on
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
          this.resetNewCard();
          return;
        }
        void context.delete().catch(() => undefined);
      };
      binding.attachCreateCompleted(handler);
    }

    /**
     * Uploads the photo into the card's DRAFT row. The draft row is touched
     * first (containment PATCH) so it exists before the media PUT.
     *
     * @param {string} id the card ID
     * @param {string | undefined} name the card name, sent by the touch PATCH
     * @param {Context} context the card context
     * @param {FileUploader} uploader the row uploader holding the file
     * @returns {Promise<boolean>} whether the photo was uploaded
     */
    async uploadPhoto(id, name, context, uploader) {
      const personId = this.selectedPersonId();
      try {
        await request(`Persons(ID='${encodeURIComponent(personId)}',IsActiveEntity=false)/Cards(ID='${encodeURIComponent(id)}')`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            Name: name
          })
        });
        const odata = new ODataService(context.getModel());
        return await uploadNow(uploader, odata.getMediaUrl(`Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`));
      } catch {
        return false;
      }
    }

    /**
     * Loads the photo of every listed card into `ui>/dialogCardImages` (draft
     * media first, then the active one). Best effort: rows without a photo
     * keep their initials.
     */
    async loadRowImages() {
      const binding = this.byId("cardsList")?.getBinding("items");
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
          const base64 = (await odata.getMediaAsBase64(`Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`)) ?? (await odata.getMediaAsBase64(`Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=true)/Image`));
          if (base64) {
            images[id] = base64;
          }
        }));
        this.getUiModel().setProperty("/dialogCardImages", images);
      } catch {
        // keep initials; image loading must not break the tab
      }
    }
    resetNewCard() {
      this.getUiModel().setProperty("/newCard", {
        name: "",
        limit: "",
        currency: "BRL",
        closingDay: "3",
        dueDay: "10"
      });
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
      return this.byId("cardsPage");
    }
    selectedPersonId() {
      return this.getUiModel().getProperty("/selectedPersonId") || "";
    }
    workspace() {
      return this.getOwnerComponent()?.getWorkspace();
    }
  }
  return Cards;
});
//# sourceMappingURL=Cards-dbg.controller.js.map

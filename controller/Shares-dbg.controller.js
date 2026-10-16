sap.ui.define(["sap/m/CustomListItem", "sap/m/List", "sap/m/MessageBox", "./CollectionTab", "../util/draftDialogFlow", "../util/feedback"], function (CustomListItem, List, MessageBox, ___CollectionTab, ___util_draftDialogFlow, ___util_feedback) {
  "use strict";

  const CollectionTab = ___CollectionTab["CollectionTab"];
  const deleteRowInDialogDraft = ___util_draftDialogFlow["deleteRowInDialogDraft"];
  const runExclusiveDialogAction = ___util_draftDialogFlow["runExclusiveDialogAction"];
  const waitForDraftListBinding = ___util_draftDialogFlow["waitForDraftListBinding"];
  const handleActionError = ___util_feedback["handleActionError"];
  /**
   * "Compartilhar" tab: users the selected person's data is shared with and,
   * for each one, which entities they can see or change.
   */
  class Shares extends CollectionTab {
    config = {
      route: "Shares",
      pageId: "sharesPage",
      listId: "sharesList",
      entitySet: "Shares",
      texts: {
        addError: "sharesAddShareError",
        editError: "sharesEditError",
        removeError: "sharesRemoveShareError",
        loadError: "sharesLoadError",
        rejectedChanges: "sharesRejectedChanges",
        imageFallback: "sharesEditError",
        removeConfirm: "sharesRemoveShareConfirm",
        removeTitle: "sharesRemoveShareTitle"
      }
    };
    optionText(key, options) {
      return options?.find(option => option.key === String(key))?.text ?? "";
    }

    /**
     * Adds the entity/permission chosen below the share to that share, inside
     * the person draft (created when none is open).
     *
     * @param {Event} event the press event of the share's add button
     */
    async onAddEntity(event) {
      const shareId = this.shareIdOf(event.getSource());
      const ui = this.getUiModel();
      const view = this.getView();
      await runExclusiveDialogAction(this.page(), async () => {
        if (!(await this.enterDraft("sharesAddEntityError"))) {
          return;
        }
        try {
          const binding = await waitForDraftListBinding(() => this.entitiesListOf(shareId));
          if (!binding) {
            this.warn("sharesLoadError");
            return;
          }
          this.trackCreate(binding, binding.create({
            Entity: Number(ui.getProperty("/newShare/entity") ?? 1),
            Permission: Number(ui.getProperty("/newShare/permission") ?? 1)
          }), () => undefined);
        } catch (error) {
          handleActionError(view, error, "sharesAddEntityError");
        }
      });
    }
    onRemoveEntity(event) {
      const source = event.getSource();
      const entity = source.getBindingContext()?.getObject();
      const shareId = this.shareIdOf(source);
      if (!entity?.ID) {
        return;
      }
      MessageBox.confirm(this.getText("sharesRemoveEntityConfirm"), {
        title: this.getText("sharesRemoveEntityTitle"),
        onClose: action => {
          if (action !== MessageBox.Action.OK) {
            return;
          }
          void runExclusiveDialogAction(this.page(), () => deleteRowInDialogDraft({
            view: this.getView(),
            dialog: this.page(),
            list: () => this.entitiesListOf(shareId),
            rowId: entity.ID,
            errorKey: "sharesRemoveEntityError",
            missingRowKey: "sharesLoadError"
          }));
        }
      });
    }
    newEntry() {
      const user = (this.getUiModel().getProperty("/newShare/shareUser") ?? "").trim();
      if (!user) {
        this.warn("sharesUserRequired");
        return null;
      }
      return {
        User: user
      };
    }
    resetForm() {
      this.getUiModel().setProperty("/newShare", {
        shareUser: "",
        entity: "1",
        permission: "1"
      });
    }

    /**
     * Returns the ID of the share whose tile contains the control.
     *
     * @param {Control} control a control inside a share tile
     * @returns {string | undefined} the share ID
     */
    shareIdOf(control) {
      let current = control;
      while (current) {
        if (current instanceof CustomListItem && current.getParent() === this.list()) {
          return current.getBindingContext()?.getObject()?.ID;
        }
        current = current.getParent();
      }
      return undefined;
    }

    /**
     * Resolves the LIVE entities list of the share: switching to the draft
     * recreates the tiles, so it must be looked up again on every poll.
     *
     * @param {string | undefined} shareId the share ID
     * @returns {List | undefined} the entities list of that share
     */
    entitiesListOf(shareId) {
      const tile = this.list()?.getItems().find(item => item.getBindingContext()?.getObject()?.ID === shareId);
      return tile?.findAggregatedObjects(true).find(control => control instanceof List);
    }
  }
  return Shares;
});
//# sourceMappingURL=Shares-dbg.controller.js.map

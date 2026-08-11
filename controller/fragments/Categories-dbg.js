sap.ui.define(["sap/m/Dialog", "sap/ui/core/Fragment", "sap/m/Avatar", "sap/m/MessageBox", "sap/m/CustomListItem", "../../service/ODataService", "../../util/entityApi", "../../util/i18n", "../../util/feedback", "../../util/rejectedChanges"], function (Dialog, Fragment, Avatar, MessageBox, CustomListItem, ____service_ODataService, ____util_entityApi, ____util_i18n, ____util_feedback, ____util_rejectedChanges) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const uploadEntityImage = ____util_entityApi["uploadEntityImage"];
  const getText = ____util_i18n["getText"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const createRejectedChangeGuard = ____util_rejectedChanges["createRejectedChangeGuard"];
  /**
   * Finds the Categories dialog that contains the given control by walking up
   * the parent chain (footer buttons may be nested in an HBox).
   *
   * @param {Control} control the control inside the dialog
   * @returns {Dialog | undefined} the dialog, or `undefined` when not found
   */
  function findCategoriesDialog(control) {
    let current = control;
    while (current) {
      if (current instanceof Dialog) {
        return current;
      }
      current = current.getParent();
    }
    return undefined;
  }

  /**
   * Walks up the parent chain of the given control and returns the first
   * `CustomListItem` found. Used to reach the row of a category from an inner
   * control (delete button, file uploader).
   *
   * @param {Control} control the starting control
   * @returns {CustomListItem | undefined} the containing list item, or `undefined`
   */
  function containingListItem(control) {
    let current = control;
    while (current) {
      if (current instanceof CustomListItem) {
        return current;
      }
      current = current.getParent();
    }
    return undefined;
  }

  /**
   * Finds the first `Avatar` nested inside the given list item (the row preview).
   *
   * @param {CustomListItem} listItem the category row
   * @returns {Avatar | undefined} the preview avatar, or `undefined`
   */
  function findAvatar(listItem) {
    const scan = control => {
      if (control instanceof Avatar) {
        return control;
      }
      const concrete = control;
      const children = concrete.getContent?.() ?? concrete.getItems?.() ?? [];
      for (const child of children) {
        const found = scan(child);
        if (found) {
          return found;
        }
      }
      return undefined;
    };
    return scan(listItem);
  }

  /**
   * Confirms with the user and runs the given callback when confirmed.
   *
   * @param {XMLView} view the owning view
   * @param {string} confirmKey the confirmation message i18n key
   * @param {string} titleKey the confirmation title i18n key
   * @param {CoreFunction} onOk the callback executed on confirmation
   */
  function confirmAction(view, confirmKey, titleKey, onOk) {
    MessageBox.confirm(getText(view, confirmKey), {
      title: getText(view, titleKey),
      onClose: action => {
        if (action === MessageBox.Action.OK) {
          onOk();
        }
      }
    });
  }

  /**
   * Detaches the dialog from its OData draft binding (best effort). Called after
   * close/save/discard so a later model refresh does not re-read a draft that
   * may already have been activated or discarded (404).
   *
   * @param {Dialog} dialog the bound Categories dialog
   */
  function releaseDraftBinding(dialog) {
    try {
      dialog.unbindObject();
    } catch {
      // best effort; unbinding must not break the close flow
    }
  }

  /**
   * Tracks the result of a created entity through the binding's `createCompleted`
   * event. On failure the created context is deleted so the OData V4 model does
   * not keep retrying the rejected create; the backend error message itself is
   * shown by the dialog's `messageChange` listener.
   *
   * @param {ODataListBinding} binding the list binding the entity was created on
   * @param {Context} context the context returned by `create`
   * @param {Function} [onSuccess] optional callback on successful creation
   */
  function trackCreate(binding, context, onSuccess) {
    const handler = event => {
      const params = event.getParameters();
      if (params.context !== context) {
        return;
      }
      binding.detachCreateCompleted(handler);
      if (params.success) {
        onSuccess?.();
        return;
      }
      void context.delete().catch(() => undefined);
    };
    binding.attachCreateCompleted(handler);
  }

  // Watches the service model's `messageChange` event while the dialog is open so
  // rejected backend changes (e.g. field validation) are shown and reverted
  // instead of being silently dropped or re-sent by the next submit.
  const rejectedGuard = createRejectedChangeGuard();

  // Photos chosen for rows that do not have a server-side ID yet (new categories
  // are only POSTed on Save). They key off the row's OData context, whose ID
  // becomes available after `submitPending`, and are uploaded into the draft
  // right before the draft is activated.
  const pendingPhotos = new Map();

  /**
   * Uploads every pending row photo into the category's draft row
   * (`IsActiveEntity = false`). Run after `submitPending` so newly created
   * categories already exist on the backend before their image is PUT.
   *
   * @returns {Promise<void>} resolves once all pending photos were uploaded
   */
  async function uploadPendingPhotos() {
    for (const [context, file] of Array.from(pendingPhotos.entries())) {
      const id = context.getObject()?.ID;
      if (!id) {
        continue;
      }
      await uploadEntityImage("Categories", id, false, file);
      pendingPhotos.delete(context);
    }
  }

  /**
   * Loads the current photo of every listed category into `ui>/dialogCategoryImages`
   * (keyed by ID) so the dialog rows show the existing thumbnails. Best effort:
   * when an image cannot be loaded the row falls back to its initials.
   *
   * @param {Dialog} dialog the bound Categories dialog
   * @returns {Promise<void>} resolves once the images were resolved
   */
  async function loadRowImages(dialog) {
    const binding = Fragment.byId("Categories", "categoriesList")?.getBinding("items");
    const view = dialog.getParent();
    const ui = view.getModel("ui");
    if (!binding || !ui) {
      return;
    }
    try {
      const contexts = await binding.requestContexts();
      const odata = new ODataService(dialog.getModel());
      const images = {};
      await Promise.all(contexts.map(async context => {
        const id = context.getObject()?.ID;
        if (!id) {
          return;
        }
        const base64 = await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`);
        if (base64) {
          images[id] = base64;
        }
      }));
      ui.setProperty("/dialogCategoryImages", images);
    } catch {
      // keep initials; image loading must not break the dialog
    }
  }
  const Categories = {
    onDialogBeforeOpen: function () {
      pendingPhotos.clear();
      const view = Fragment.byId("Categories", "categoriesDialog")?.getParent();
      const ui = view?.getModel("ui");
      if (ui) {
        ui.setProperty("/newCategory", {
          name: ""
        });
        ui.setProperty("/dialogCategoryImages", {});
      }
    },
    /**
     * Adds a new Category row into the selected person's Categories collection.
     * The row is created inside the person draft (the dialog is bound to the
     * draft path), so it participates in the same draft as the whole tree.
     *
     * @param {Control} this the pressed add-category button
     */
    onAddCategory: function () {
      const dialog = findCategoriesDialog(this);
      const view = dialog?.getParent();
      const ui = view?.getModel("ui");
      if (!dialog || !view || !ui) {
        return;
      }
      const name = (ui.getProperty("/newCategory")?.name ?? "").trim();
      if (!name) {
        showWarning(view, "categoriesFillFields");
        return;
      }
      const binding = Fragment.byId("Categories", "categoriesList")?.getBinding("items");
      if (!binding) {
        showWarning(view, "categoriesLoadError");
        return;
      }
      try {
        const context = binding.create({
          Name: name
        });
        trackCreate(binding, context, () => {
          ui.setProperty("/newCategory", {
            name: ""
          });
        });
      } catch (error) {
        handleActionError(view, error, "categoriesAddError");
      }
    },
    onRemoveCategory: function () {
      const dialog = findCategoriesDialog(this);
      const view = dialog?.getParent();
      const context = this.getBindingContext();
      if (!dialog || !view || !context) {
        return;
      }
      confirmAction(view, "categoriesRemoveConfirm", "categoriesRemoveTitle", () => {
        try {
          void context.delete().catch(error => handleActionError(view, error, "categoriesRemoveError"));
        } catch (error) {
          handleActionError(view, error, "categoriesRemoveError");
        }
      });
    },
    /**
     * Shows the chosen photo as a row preview and uploads it into the
     * category's draft row. Rows that already have an ID are uploaded
     * immediately; rows created in this session are kept pending and uploaded
     * on Save (their ID only exists after `submitPending`).
     *
     * @param {Control} this the row's file uploader
     * @param {Event} event the `change` event
     */
    onCategoryPhotoChanged: function (event) {
      const files = event.getParameters();
      const file = files.files && files.files.length > 0 ? files.files[0] : null;
      if (!file) {
        return;
      }
      const item = containingListItem(this);
      const context = item?.getBindingContext();
      if (!item || !context) {
        return;
      }
      pendingPhotos.set(context, file);
      const reader = new FileReader();
      reader.onload = () => {
        findAvatar(item)?.setSrc(reader.result);
        const id = context.getObject()?.ID;
        if (!id) {
          return;
        }
        void uploadEntityImage("Categories", id, false, file).then(() => {
          if (pendingPhotos.get(context) === file) {
            pendingPhotos.delete(context);
          }
        }).catch(() => {
          // keep the photo pending so Save retries the upload
        });
      };
      reader.readAsDataURL(file);
    },
    /**
     * Publishes the Category changes by activating the person draft they live
     * in. Because Categories are compositions of the person, all the tree
     * changes are contained in that single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveCategories: async function () {
      const dialog = findCategoriesDialog(this);
      if (!dialog) {
        return;
      }
      const view = dialog.getParent();
      const context = dialog.getBindingContext();
      if (rejectedGuard.warnIfBlocked()) {
        return;
      }
      rejectedGuard.suspend();
      try {
        view.getModel("ui").setProperty("/busy", true);
        const person = context?.getObject();
        if (!person?.ID) {
          showWarning(view, "errorMissingPerson");
          return;
        }
        const odata = new ODataService(context?.getModel());
        await odata.submitPending();
        await uploadPendingPhotos();
        await odata.prepareDraft("Persons", person.ID);
        await odata.activateDraft("Persons", person.ID);
        releaseDraftBinding(dialog);
        dialog.close();
        showToast(view, "categoriesSaved");
      } catch (error) {
        handleActionError(view, error, "categoriesSaveError");
      } finally {
        rejectedGuard.resume();
        view.getModel("ui").setProperty("/busy", false);
      }
    },
    onDiscardCategories: function () {
      const dialog = findCategoriesDialog(this);
      const view = dialog?.getParent();
      if (!dialog || !view) {
        return;
      }
      confirmAction(view, "categoriesDiscardConfirm", "categoriesDiscardTitle", () => {
        void (async () => {
          const context = dialog.getBindingContext();
          const person = context?.getObject();
          if (!person?.ID) {
            return;
          }
          try {
            view.getModel("ui").setProperty("/busy", true);
            const odata = new ODataService(context?.getModel());
            rejectedGuard.suspend();
            await odata.submitPending();
            await odata.discardDraft("Persons", person.ID);
            releaseDraftBinding(dialog);
            dialog.close();
            showToast(view, "categoriesDiscarded");
          } catch (error) {
            handleActionError(view, error, "categoriesDiscardError");
          } finally {
            rejectedGuard.resume();
            view.getModel("ui").setProperty("/busy", false);
          }
        })();
      });
    },
    onCancelCategories: function () {
      const dialog = findCategoriesDialog(this);
      if (!dialog) {
        return;
      }
      releaseDraftBinding(dialog);
      dialog.close();
    },
    onDialogAfterOpen: function () {
      rejectedGuard.attach(this, "categoriesEditError", "categoriesRejectedChanges");
      void loadRowImages(this);
    },
    onDialogAfterClose: function () {
      rejectedGuard.detach();
      pendingPhotos.clear();
      releaseDraftBinding(this);
      const view = this.getParent();
      if (view) {
        void view.getController().reload();
      }
    }
  };
  return Categories;
});
//# sourceMappingURL=Categories-dbg.js.map

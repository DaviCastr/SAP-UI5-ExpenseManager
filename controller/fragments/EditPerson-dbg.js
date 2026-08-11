sap.ui.define(["sap/m/Dialog", "sap/ui/core/Fragment", "sap/m/MessageBox", "../../service/ODataService", "../../util/entityApi", "../../util/i18n", "../../util/feedback", "../../util/rejectedChanges"], function (Dialog, Fragment, MessageBox, ____service_ODataService, ____util_entityApi, ____util_i18n, ____util_feedback, ____util_rejectedChanges) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const uploadPersonImage = ____util_entityApi["uploadPersonImage"];
  const getText = ____util_i18n["getText"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const createRejectedChangeGuard = ____util_rejectedChanges["createRejectedChangeGuard"];
  let personPhoto = null;

  // Watches the service model's `messageChange` event while the dialog is open so
  // rejected backend changes (e.g. field validation) are shown and reverted
  // instead of being silently dropped or re-sent by the next submit.
  const rejectedGuard = createRejectedChangeGuard();

  /**
   * Returns the ID of the person the given dialog is currently bound to.
   *
   * @param {Dialog} dialog the bound edit dialog
   * @returns {string | undefined} the person ID, or `undefined` when unbound
   */
  function boundPersonId(dialog) {
    const context = dialog.getBindingContext();
    return context?.getObject()?.ID;
  }

  /**
   * Finds the person edit dialog that contains the given control by walking up
   * the parent chain (the footer buttons may be nested in an HBox).
   *
   * @param {Control} control the control inside the dialog footer
   * @returns {Dialog | undefined} the dialog, or `undefined` when not found
   */
  function findPersonDialog(control) {
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
   * Detaches the dialog from its OData draft binding (best effort). Called after
   * close/save/discard so a later model refresh does not re-read the draft entity
   * (which may already be activated or discarded) and fail with a 404.
   *
   * @param {Dialog} dialog the bound edit dialog
   */
  function releaseDraftBinding(dialog) {
    try {
      dialog.unbindObject();
    } catch {
      // best effort; the binding cleanup must not break the close flow
    }
  }

  /**
   * Flushes the pending two-way-bound edits of the dialog into its draft (best
   * effort). Used on plain close so an abandoned edit keeps its typed values in
   * the still-open draft.
   *
   * @param {Dialog} dialog the bound edit dialog
   */
  function flushPendingEdits(dialog) {
    try {
      void dialog.getModel().submitBatch("$auto");
    } catch {
      // best effort; the draft keeps whatever already reached the backend
    }
  }

  /**
   * Discards the draft of the given person (after confirmation) and returns to
   * the Home screen. The pending edits are flushed first so no stale PATCH
   * remains queued after the draft is deleted.
   *
   * @param {XMLView} view the owning view
   * @param {Dialog} dialog the bound edit dialog
   * @param {string} id the person ID whose draft should be discarded
   * @returns {Promise<void>} resolves once the draft was discarded
   */
  async function discardDraftAndClose(view, dialog, id) {
    const ui = view.getModel("ui");
    ui.setProperty("/busy", true);
    try {
      const odata = new ODataService(dialog.getModel());
      await odata.submitPending();
      await odata.discardDraft("Persons", id);
      releaseDraftBinding(dialog);
      dialog.close();
      showToast(view, "personDraftDiscarded");
    } catch (error) {
      handleActionError(view, error, "errorDiscardPersonDraft");
    } finally {
      ui.setProperty("/busy", false);
    }
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
          if (personPhoto) {
            const dialog = findPersonDialog(event.getSource());
            const context = dialog?.getBindingContext();
            const personId = context?.getObject()?.ID ?? "";
            if (personId) {
              void uploadPersonImage(personId, false, personPhoto).catch(() => {
                // keep the local preview; the photo is re-uploaded on save
              });
            }
          }
        };
        reader.readAsDataURL(personPhoto);
      }
    },
    // Cancel: only closes the popup. An open draft (with or without edits) is
    // preserved and kept in the list ("rascunho"), the user can discard it from
    // the popup or from the Home banner.
    onCancelEdit: function () {
      findPersonDialog(this)?.close();
    },
    onDiscardDraft: function () {
      const dialog = findPersonDialog(this);
      const view = dialog?.getParent();
      const id = dialog ? boundPersonId(dialog) : undefined;
      if (!id || !dialog) {
        return;
      }
      MessageBox.confirm(getText(view, "personDraftDiscardConfirm"), {
        title: getText(view, "personDraftDiscardTitle"),
        onClose: action => {
          if (action === MessageBox.Action.OK) {
            void discardDraftAndClose(view, dialog, id);
          }
        }
      });
    },
    // Runs when the dialog is fully closed (X, Escape, click-away, Cancel or
    // programmatic close). Keeps the draft but detaches the binding so a later
    // model refresh does not re-read a draft that may have been activated or
    // discarded meanwhile. The Home screen is then reloaded so the draft
    // indicator banner reflects the current state (a preserved draft is shown
    // after Cancel; a saved/discarded draft disappears).
    onDialogAfterOpen: function () {
      rejectedGuard.attach(this, "personEditError", "personRejectedChanges");
    },
    onDialogAfterClose: function () {
      rejectedGuard.detach();
      flushPendingEdits(this);
      releaseDraftBinding(this);
      const view = this.getParent();
      if (view) {
        void view.getController().reload();
      }
    },
    onSavePerson: async function () {
      const dialog = findPersonDialog(this);
      if (!dialog) {
        return;
      }
      const view = dialog.getParent();
      const context = dialog.getBindingContext();
      if (rejectedGuard.warnIfBlocked()) {
        return;
      }
      try {
        view.getModel("ui").setProperty("/busy", true);
        if (!context) {
          showWarning(view, "errorMissingPerson");
          return;
        }
        const person = context.getObject();
        if (!person?.ID || !person.Name) {
          showWarning(view, "errorFillRequiredFields");
          return;
        }
        const odata = new ODataService(context.getModel());

        // The dialog is bound to the draft entity, so every edited field is
        // already PATCHed to the draft by the two-way binding. Flush any
        // still pending change, upload a new photo, then publish the draft.
        await odata.submitPending();

        // if (personPhoto) {
        //     await uploadPersonImage(person.ID, false, personPhoto);
        // }

        await odata.prepareDraft("Persons", person.ID);
        await odata.activateDraft("Persons", person.ID);
        releaseDraftBinding(dialog);
        dialog.close();
        showToast(view, "personUpdated");
      } catch (error) {
        // keep the draft so the user can retry or cancel to discard it
        handleActionError(view, error, "errorUpdatePerson");
      } finally {
        view.getModel("ui").setProperty("/busy", false);
      }
    }
  };
  return PersonDetail;
});
//# sourceMappingURL=EditPerson-dbg.js.map

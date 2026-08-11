sap.ui.define(["sap/m/Dialog", "sap/ui/core/Fragment", "sap/m/Table", "sap/m/MessageBox", "../../service/ODataService", "../../util/i18n", "../../util/feedback", "../../util/rejectedChanges"], function (Dialog, Fragment, Table, MessageBox, ____service_ODataService, ____util_i18n, ____util_feedback, ____util_rejectedChanges) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const getText = ____util_i18n["getText"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const createRejectedChangeGuard = ____util_rejectedChanges["createRejectedChangeGuard"];
  /**
   * Finds the Shares dialog that contains the given control by walking up the
   * parent chain (footer buttons may be nested in an HBox).
   *
   * @param {Control} control the control inside the dialog
   * @returns {Dialog | undefined} the dialog, or `undefined` when not found
   */
  function findSharesDialog(control) {
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
   * `Table` found. Used to reach the nested Entities table of a Share from its
   * toolbar button.
   *
   * @param {Control} control the starting control
   * @returns {Table | undefined} the containing table, or `undefined`
   */
  function containingTable(control) {
    let current = control;
    while (current) {
      if (current instanceof Table) {
        return current;
      }
      current = current.getParent();
    }
    return undefined;
  }

  /**
   * Returns the OData list binding that manages the Entities table of the given
   * Share (the glance on the toolbar "add entity" button).
   *
   * @param {Table} table the nested Entities table
   * @returns {ODataListBinding | undefined} the items binding, or `undefined`
   */
  function entityListBinding(table) {
    return table.getBinding("items");
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
   * @param {Dialog} dialog the bound Shares dialog
   */
  function releaseDraftBinding(dialog) {
    try {
      dialog.unbindObject();
    } catch {
      // best effort; unbinding must not break the close flow
    }
  }

  // Watches the service model's `messageChange` event while the dialog is open so
  // rejected backend changes (e.g. duplicate-share validation) are shown and
  // reverted instead of being silently dropped or re-sent by the next submit.
  const rejectedGuard = createRejectedChangeGuard();

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
  const Shares = {
    onDialogBeforeOpen: function () {
      const view = Fragment.byId("Shares", "sharesDialog")?.getParent();
      const ui = view?.getModel("ui");
      ui?.setProperty("/newShare", {
        shareUser: "",
        entity: "1",
        permission: "1"
      });
    },
    /**
     * Creates a new Share row in the selected person's Shares collection.
     * The row is created inside the person draft (the dialog is bound to the
     * draft path), so it participates in the same draft as the whole tree.
     *
     * @param {Control} this the pressed add-share button
     */
    onAddShare: function () {
      const dialog = findSharesDialog(this);
      const view = dialog?.getParent();
      const ui = view?.getModel("ui");
      if (!dialog || !view || !ui) {
        return;
      }
      const user = ui.getProperty("/newShare/shareUser") ?? "";
      if (!user.trim()) {
        showWarning(view, "sharesUserRequired");
        return;
      }
      const sharesList = Fragment.byId("Shares", "sharesList");
      const binding = sharesList?.getBinding("items");
      if (!binding) {
        showWarning(view, "sharesLoadError");
        return;
      }
      try {
        const context = binding.create({
          User: user.trim()
        });
        trackCreate(binding, context, () => {
          ui.setProperty("/newShare/shareUser", "");
        });
      } catch (error) {
        handleActionError(view, error, "sharesAddShareError");
      }
    },
    onRemoveShare: function () {
      const dialog = findSharesDialog(this);
      const view = dialog?.getParent();
      const context = this.getBindingContext();
      if (!dialog || !view || !context) {
        return;
      }
      confirmAction(view, "sharesRemoveShareConfirm", "sharesRemoveShareTitle", () => {
        try {
          void context.delete().catch(error => handleActionError(view, error, "sharesRemoveShareError"));
        } catch (error) {
          handleActionError(view, error, "sharesRemoveShareError");
        }
      });
    },
    /**
     * Creates a new Entity row inside the Entities collection of the Share that
     * owns the pressed toolbar button.
     *
     * @param {Control} this the pressed add-entity button
     */
    onAddEntity: function () {
      const dialog = findSharesDialog(this);
      const view = dialog?.getParent();
      const ui = view?.getModel("ui");
      if (!dialog || !view || !ui) {
        return;
      }
      const table = containingTable(this);
      const binding = table ? entityListBinding(table) : undefined;
      if (!binding) {
        showWarning(view, "sharesLoadError");
        return;
      }
      try {
        const context = binding.create({
          Entity: Number(ui.getProperty("/newShare/entity") ?? 1),
          Permission: Number(ui.getProperty("/newShare/permission") ?? 1)
        });
        trackCreate(binding, context);
      } catch (error) {
        handleActionError(view, error, "sharesAddEntityError");
      }
    },
    onRemoveEntity: function () {
      const dialog = findSharesDialog(this);
      const view = dialog?.getParent();
      const context = this.getBindingContext();
      if (!dialog || !view || !context) {
        return;
      }
      confirmAction(view, "sharesRemoveEntityConfirm", "sharesRemoveEntityTitle", () => {
        try {
          void context.delete().catch(error => handleActionError(view, error, "sharesRemoveEntityError"));
        } catch (error) {
          handleActionError(view, error, "sharesRemoveEntityError");
        }
      });
    },
    /**
     * Publishes the Share/Entity changes by activating the person draft they
     * live in. Because Shares/Entities are compositions of the person, all the
     * tree changes are contained in that single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveShares: async function () {
      const dialog = findSharesDialog(this);
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
        await odata.prepareDraft("Persons", person.ID);
        await odata.activateDraft("Persons", person.ID);
        releaseDraftBinding(dialog);
        dialog.close();
        showToast(view, "sharesSaved");
      } catch (error) {
        handleActionError(view, error, "sharesSaveError");
      } finally {
        rejectedGuard.resume();
        view.getModel("ui").setProperty("/busy", false);
      }
    },
    onDiscardShares: function () {
      const dialog = findSharesDialog(this);
      const view = dialog?.getParent();
      if (!dialog || !view) {
        return;
      }
      confirmAction(view, "sharesDiscardConfirm", "sharesDiscardTitle", () => {
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
            showToast(view, "sharesDiscarded");
          } catch (error) {
            handleActionError(view, error, "sharesDiscardError");
          } finally {
            rejectedGuard.resume();
            view.getModel("ui").setProperty("/busy", false);
          }
        })();
      });
    },
    onCancelShares: function () {
      const dialog = findSharesDialog(this);
      if (!dialog) {
        return;
      }
      releaseDraftBinding(dialog);
      dialog.close();
    },
    onDialogAfterOpen: function () {
      rejectedGuard.attach(this, "sharesEditError", "sharesRejectedChanges");
    },
    onDialogAfterClose: function () {
      rejectedGuard.detach();
      releaseDraftBinding(this);
      const view = this.getParent();
      if (view) {
        void view.getController().reload();
      }
    }
  };
  return Shares;
});
//# sourceMappingURL=Shares-dbg.js.map

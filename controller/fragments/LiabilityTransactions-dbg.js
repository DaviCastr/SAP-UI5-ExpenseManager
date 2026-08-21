sap.ui.define(["sap/m/Dialog", "sap/ui/core/Fragment", "sap/m/CustomListItem", "sap/m/MessageBox", "../../service/ODataService", "../../util/i18n", "../../util/feedback", "../../util/rejectedChanges", "../../util/liabilityRules"], function (Dialog, Fragment, CustomListItem, MessageBox, ____service_ODataService, ____util_i18n, ____util_feedback, ____util_rejectedChanges, ____util_liabilityRules) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const getText = ____util_i18n["getText"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const createRejectedChangeGuard = ____util_rejectedChanges["createRejectedChangeGuard"];
  const TRANSACTION_TYPE_OPTIONS = ____util_liabilityRules["TRANSACTION_TYPE_OPTIONS"];
  /**
   * Finds the movements dialog that contains the given control by walking up the
   * parent chain (the footer buttons may be nested in an HBox).
   *
   * @param {Control} control the control inside the dialog
   * @returns {Dialog | undefined} the dialog, or `undefined` when not found
   */
  function findTransactionsDialog(control) {
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
   * `CustomListItem` found. Used to reach the transaction row of an inner button.
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
   * Confirms with the user and runs the given callback when confirmed.
   *
   * @param {XMLView} view the owning view
   * @param {string} confirmKey the confirmation message i18n key
   * @param {string} titleKey the confirmation title i18n key
   * @param {Function} onOk the callback executed on confirmation
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
   * @param {Dialog} dialog the bound movements dialog
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

  /**
   * Resets the "new transaction" form to its defaults.
   *
   * @param {JSONModel} ui the ui model
   */
  function resetNewTransaction(ui) {
    ui.setProperty("/newLiabilityTransaction", {
      type: "IN",
      description: "",
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      currency: "BRL"
    });
  }

  /**
   * Validates the "new transaction" form and builds the OData create payload.
   * Returns `undefined` when the required fields are missing or invalid.
   *
   * @param {Partial<NewLiabilityTransaction>} form the form values from the ui model
   * @returns {Record<string, unknown> | undefined} the create payload, or
   * `undefined` when the form is not valid
   */
  function buildTransactionPayload(form) {
    const type = form.type || "";
    const amount = Number(String(form.amount ?? "").replace(",", "."));
    const date = form.date || "";
    if (type !== "IN" && type !== "OUT" || !Number.isFinite(amount) || amount <= 0 || !date) {
      return undefined;
    }
    return {
      Type: type,
      Description: (form.description ?? "").trim() || undefined,
      Date: date,
      Amount: amount,
      // eslint-disable-next-line camelcase
      Currency_code: form.currency || "BRL"
    };
  }

  /**
   * Extracts the person ID from a draft path like
   * `/Persons(ID='x',IsActiveEntity=false)/Liabilities(ID='y')`. Used as a
   * fallback when the bound context does not expose `Person_ID` through its
   * `$select`.
   *
   * @param {string} path the binding path
   * @returns {string} the person ID, or an empty string
   */
  function personIdFromPath(path) {
    const match = path.match(/Persons\(ID='([^']+)'/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  // Watches the service model's `messageChange` event while the dialog is open so
  // rejected backend changes (e.g. field validation) are shown and reverted
  // instead of being silently dropped or re-sent by the next submit.
  const rejectedGuard = createRejectedChangeGuard();
  const LiabilityTransactions = {
    onDialogBeforeOpen: function () {
      const view = Fragment.byId("LiabilityTransactions", "liabilityTransactionsDialog")?.getParent();
      const ui = view?.getModel("ui");
      if (ui) {
        resetNewTransaction(ui);
        ui.setProperty("/liabilityTransactionEditId", "");
      }
    },
    /**
     * Creates a new LiabilityTransaction row inside the liability's
     * transactions collection. The row is created inside the person draft (the
     * dialog is bound to the liability inside the draft path), so it
     * participates in the same draft as the whole tree. The backend recalculates
     * the liability balance once the transaction is created.
     *
     * @param {Control} this the pressed add-transaction button
     */
    onAddTransaction: function () {
      const dialog = findTransactionsDialog(this);
      const view = dialog?.getParent();
      const ui = view?.getModel("ui");
      if (!dialog || !view || !ui) {
        return;
      }
      const form = ui.getProperty("/newLiabilityTransaction");
      const payload = buildTransactionPayload(form);
      if (!payload) {
        showWarning(view, "liabilityTransactionsFillFields");
        return;
      }
      const binding = Fragment.byId("LiabilityTransactions", "liabilityTransactionsList")?.getBinding("items");
      if (!binding) {
        showWarning(view, "liabilityTransactionsLoadError");
        return;
      }
      try {
        const context = binding.create(payload);
        trackCreate(binding, context, () => resetNewTransaction(ui));
      } catch (error) {
        handleActionError(view, error, "liabilityTransactionsAddError");
      }
    },
    /**
     * Toggles the read-only view and the editable form of the transaction row
     * that owns the pressed button.
     *
     * @param {Control} this the pressed edit/finish button
     */
    onToggleEdit: function () {
      const item = containingListItem(this);
      const context = item?.getBindingContext();
      const transaction = context?.getObject();
      const view = findTransactionsDialog(this)?.getParent();
      const ui = view?.getModel("ui");
      if (!ui || !transaction?.ID) {
        return;
      }
      const current = ui.getProperty("/liabilityTransactionEditId");
      ui.setProperty("/liabilityTransactionEditId", current === transaction.ID ? "" : transaction.ID);
    },
    onRemoveTransaction: function () {
      const dialog = findTransactionsDialog(this);
      const view = dialog?.getParent();
      const context = this.getBindingContext();
      if (!dialog || !view || !context) {
        return;
      }
      confirmAction(view, "liabilityTransactionsRemoveConfirm", "liabilityTransactionsRemoveTitle", () => {
        try {
          void context.delete().catch(error => handleActionError(view, error, "liabilityTransactionsRemoveError"));
        } catch (error) {
          handleActionError(view, error, "liabilityTransactionsRemoveError");
        }
      });
    },
    /**
     * Publishes the transaction changes by activating the person draft the
     * liability lives in. Because LiabilityTransactions are compositions of the
     * liability, all the tree changes are contained in that single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveTransactions: async function () {
      const dialog = findTransactionsDialog(this);
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
        const liability = context?.getObject();
        const personId = liability?.Person_ID || personIdFromPath(context?.getPath() || "");
        if (!personId) {
          showWarning(view, "errorMissingPerson");
          return;
        }
        const odata = new ODataService(context?.getModel());
        await odata.submitPending();
        await odata.prepareDraft("Persons", personId);
        await odata.activateDraft("Persons", personId);
        await view.getController().reopenLiabilitiesDialogDraft();
        releaseDraftBinding(dialog);
        dialog.close();
        showToast(view, "liabilityTransactionsSaved");
      } catch (error) {
        handleActionError(view, error, "liabilityTransactionsSaveError");
      } finally {
        rejectedGuard.resume();
        view.getModel("ui").setProperty("/busy", false);
      }
    },
    onDiscardTransactions: function () {
      const dialog = findTransactionsDialog(this);
      const view = dialog?.getParent();
      if (!dialog || !view) {
        return;
      }
      confirmAction(view, "liabilityTransactionsDiscardConfirm", "liabilityTransactionsDiscardTitle", () => {
        void (async () => {
          const context = dialog.getBindingContext();
          const liability = context?.getObject();
          const personId = liability?.Person_ID || personIdFromPath(context?.getPath() || "");
          if (!personId) {
            return;
          }
          try {
            view.getModel("ui").setProperty("/busy", true);
            const odata = new ODataService(context?.getModel());
            rejectedGuard.suspend();
            await odata.submitPending();
            await odata.discardDraft("Persons", personId);
            await view.getController().reopenLiabilitiesDialogDraft();
            releaseDraftBinding(dialog);
            dialog.close();
            showToast(view, "liabilityTransactionsDiscarded");
          } catch (error) {
            handleActionError(view, error, "liabilityTransactionsDiscardError");
          } finally {
            rejectedGuard.resume();
            view.getModel("ui").setProperty("/busy", false);
          }
        })();
      });
    },
    onCancelTransactions: function () {
      const dialog = findTransactionsDialog(this);
      if (!dialog) {
        return;
      }
      releaseDraftBinding(dialog);
      dialog.close();
    },
    onDialogAfterOpen: function () {
      const ui = this.getParent()?.getModel("ui");
      if (ui) {
        ui.setProperty("/liabilityTxTypeOptions", TRANSACTION_TYPE_OPTIONS);
        const currentType = ui.getProperty("/newLiabilityTransaction/type");
        if (!TRANSACTION_TYPE_OPTIONS.some(option => option.key === currentType)) {
          ui.setProperty("/newLiabilityTransaction/type", TRANSACTION_TYPE_OPTIONS[0].key);
        }
      }
      rejectedGuard.attach(this, "liabilityTransactionsEditError", "liabilityTransactionsRejectedChanges");
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
  return LiabilityTransactions;
});
//# sourceMappingURL=LiabilityTransactions-dbg.js.map

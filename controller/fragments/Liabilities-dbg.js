sap.ui.define(["sap/m/Dialog", "sap/ui/core/Fragment", "sap/m/CustomListItem", "sap/m/MessageBox", "../../service/ODataService", "../../util/i18n", "../../util/feedback", "../../util/rejectedChanges", "../../util/draftDialogFlow"], function (Dialog, Fragment, CustomListItem, MessageBox, ____service_ODataService, ____util_i18n, ____util_feedback, ____util_rejectedChanges, ____util_draftDialogFlow) {
  "use strict";

  const ODataService = ____service_ODataService["ODataService"];
  const getText = ____util_i18n["getText"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const createRejectedChangeGuard = ____util_rejectedChanges["createRejectedChangeGuard"];
  const deleteRowInDialogDraft = ____util_draftDialogFlow["deleteRowInDialogDraft"];
  const ensureDialogDraft = ____util_draftDialogFlow["ensureDialogDraft"];
  const runExclusiveDialogAction = ____util_draftDialogFlow["runExclusiveDialogAction"];
  const waitForDraftListBinding = ____util_draftDialogFlow["waitForDraftListBinding"];
  /**
   * Finds the Liabilities dialog that contains the given control by walking up
   * the parent chain (the footer buttons may be nested in an HBox).
   *
   * @param {Control} control the control inside the dialog
   * @returns {Dialog | undefined} the dialog, or `undefined` when not found
   */
  function findLiabilitiesDialog(control) {
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
   * `CustomListItem` found. Used to reach the liability row of an inner button.
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
   * @param {Dialog} dialog the bound Liabilities dialog
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
   * Resets the "new liability" form to its defaults.
   *
   * @param {JSONModel} ui the ui model
   */
  function resetNewLiability(ui) {
    ui.setProperty("/newLiability", {
      name: "",
      description: "",
      totalAmount: "",
      currency: "BRL",
      dueDay: String(new Date().getDate())
    });
  }

  /**
   * Validates the parsed "new liability" form values.
   *
   * @param {string} name the trimmed liability name
   * @param {number} totalAmount the parsed total amount
   * @returns {boolean} whether the form can be submitted
   */
  function isValidLiabilityForm(name, totalAmount, dueDay) {
    return !!name && Number.isFinite(totalAmount) && totalAmount > 0 && Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31;
  }

  /**
   * Validates the "new liability" form and builds the OData create payload.
   * Returns `undefined` when the required fields are missing or invalid.
   *
   * @param {Partial<NewLiability>} form the form values from the ui model
   * @returns {Record<string, unknown> | undefined} the create payload, or
   * `undefined` when the form is not valid
   */
  function buildLiabilityPayload(form) {
    const name = (form.name ?? "").trim();
    const totalAmount = Number(String(form.totalAmount ?? "").replace(",", "."));
    const dueDay = Number(form.dueDay);
    if (!isValidLiabilityForm(name, totalAmount, dueDay)) {
      return undefined;
    }
    return {
      Name: name,
      Description: (form.description ?? "").trim() || undefined,
      TotalAmount: totalAmount,
      // eslint-disable-next-line camelcase
      Currency_code: form.currency || "BRL",
      DueDay: dueDay
    };
  }

  // Watches the service model's `messageChange` event while the dialog is open so
  // rejected backend changes (e.g. field validation) are shown and reverted
  // instead of being silently dropped or re-sent by the next submit.
  const rejectedGuard = createRejectedChangeGuard();
  const Liabilities = {
    onDialogBeforeOpen: function () {
      const view = Fragment.byId("Liabilities", "liabilitiesDialog")?.getParent();
      const ui = view?.getModel("ui");
      if (ui) {
        resetNewLiability(ui);
        ui.setProperty("/liabilityEditId", "");
        ui.setProperty("/managerDialogInDraft", false);
      }
    },
    /**
     * Creates a new Liability row inside the selected person's Liabilities
     * collection. The dialog opens read-only bound to the active entity, so
     * the person draft is created (when none is open) and the dialog rebound
     * before the row is created inside it, keeping the change in the same
     * draft as the whole tree.
     *
     * @param {Control} this the pressed add-liability button
     */
    onAddLiability: async function () {
      const dialog = findLiabilitiesDialog(this);
      const view = dialog?.getParent();
      const ui = view?.getModel("ui");
      if (!dialog || !view || !ui) {
        return;
      }
      const form = ui.getProperty("/newLiability");
      const payload = buildLiabilityPayload(form);
      if (!payload) {
        showWarning(view, "liabilitiesFillFields");
        return;
      }
      await runExclusiveDialogAction(dialog, async () => {
        if (!(await ensureDialogDraft(view, dialog, "liabilitiesAddError"))) {
          return;
        }

        // Wait until the list binding points at the DRAFT: right after the
        // switch the previous binding (active collection) is still reachable
        // and creating through it fails, leaving a stuck transient row.
        let binding;
        try {
          binding = await waitForDraftListBinding(Fragment.byId("Liabilities", "liabilitiesList"));
        } catch (error) {
          handleActionError(view, error, "liabilitiesAddError");
          return;
        }
        if (!binding) {
          showWarning(view, "liabilitiesLoadError");
          return;
        }
        try {
          const context = binding.create(payload);
          trackCreate(binding, context, () => resetNewLiability(ui));
        } catch (error) {
          handleActionError(view, error, "liabilitiesAddError");
        }
      });
    },
    onRemoveLiability: function () {
      const dialog = findLiabilitiesDialog(this);
      const view = dialog?.getParent();
      const context = this.getBindingContext();
      const liability = context?.getObject();
      if (!dialog || !view || !liability?.ID) {
        return;
      }
      confirmAction(view, "liabilitiesRemoveConfirm", "liabilitiesRemoveTitle", () => {
        void runExclusiveDialogAction(dialog, async () => {
          await deleteRowInDialogDraft({
            view,
            dialog,
            list: Fragment.byId("Liabilities", "liabilitiesList"),
            rowId: liability.ID,
            errorKey: "liabilitiesRemoveError",
            missingRowKey: "liabilitiesLoadError"
          });
        });
      });
    },
    /**
     * Toggles the read-only view and the editable form of the liability row
     * that owns the pressed button. Entering edit mode first switches the
     * dialog to the person draft binding (the dialog opens read-only), so the
     * two-way bound fields PATCH the draft instead of the active entity.
     *
     * @param {Control} this the pressed edit/finish button
     */
    onToggleEdit: function () {
      const item = containingListItem(this);
      const context = item?.getBindingContext();
      const liability = context?.getObject();
      const dialog = findLiabilitiesDialog(this);
      const view = dialog?.getParent();
      const ui = view?.getModel("ui");
      if (!ui || !dialog || !view || !liability?.ID) {
        return;
      }
      const current = ui.getProperty("/liabilityEditId");
      if (current === liability.ID) {
        ui.setProperty("/liabilityEditId", "");
        return;
      }
      void runExclusiveDialogAction(dialog, async () => {
        if (await ensureDialogDraft(view, dialog, "liabilitiesEditError")) {
          ui.setProperty("/liabilityEditId", liability.ID);
        }
      });
    },
    /**
     * Opens the movements dialog for the liability that owns the pressed
     * button. Delegates to the Home controller, which owns the dialog cache and
     * the draft binding of the selected person.
     *
     * @param {Control} this the pressed movements button
     */
    onViewTransactions: function () {
      const dialog = findLiabilitiesDialog(this);
      const view = dialog?.getParent();
      const item = containingListItem(this);
      const context = item?.getBindingContext();
      const liability = context?.getObject();
      if (!view || !liability?.ID) {
        return;
      }
      void view.getController().openLiabilityTransactions(liability.ID).catch(error => handleActionError(view, error, "liabilityTransactionsOpenError"));
    },
    /**
     * Publishes the Liability changes by activating the person draft they live
     * in. Because Liabilities are compositions of the person, all the tree
     * changes are contained in that single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveLiabilities: async function () {
      const dialog = findLiabilitiesDialog(this);
      if (!dialog) {
        return;
      }
      const view = dialog.getParent();
      const context = dialog.getBindingContext();
      if (rejectedGuard.warnIfBlocked()) {
        return;
      }
      await runExclusiveDialogAction(dialog, async () => {
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
          showToast(view, "liabilitiesSaved");
        } catch (error) {
          handleActionError(view, error, "liabilitiesSaveError");
        } finally {
          rejectedGuard.resume();
          view.getModel("ui").setProperty("/busy", false);
        }
      });
    },
    onDiscardLiabilities: function () {
      const dialog = findLiabilitiesDialog(this);
      const view = dialog?.getParent();
      if (!dialog || !view) {
        return;
      }
      confirmAction(view, "liabilitiesDiscardConfirm", "liabilitiesDiscardTitle", () => {
        void runExclusiveDialogAction(dialog, async () => {
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
            showToast(view, "liabilitiesDiscarded");
          } catch (error) {
            handleActionError(view, error, "liabilitiesDiscardError");
          } finally {
            rejectedGuard.resume();
            view.getModel("ui").setProperty("/busy", false);
          }
        });
      });
    },
    onCancelLiabilities: function () {
      const dialog = findLiabilitiesDialog(this);
      if (!dialog) {
        return;
      }
      releaseDraftBinding(dialog);
      dialog.close();
    },
    onDialogAfterOpen: function () {
      rejectedGuard.attach(this, "liabilitiesEditError", "liabilitiesRejectedChanges");
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
  return Liabilities;
});
//# sourceMappingURL=Liabilities-dbg.js.map

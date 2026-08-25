sap.ui.define(["./feedback"], function (___feedback) {
  "use strict";

  const getBackendErrorMessage = ___feedback["getBackendErrorMessage"];
  const handleActionError = ___feedback["handleActionError"];
  const showWarning = ___feedback["showWarning"];
  /**
   * Shared flow for the manager dialogs that open in read-only mode (bound to
   * the active entity) and switch to the person draft only when the user acts
   * (add/edit/remove). Used today by the Liabilities and LiabilityTransactions
   * dialogs; meant to be reused by Cards, Categories and Shares.
   */

  const DRAFT_PATH_MARKER = "IsActiveEntity=false";
  function isDraftPath(path) {
    return !!path && path.includes(DRAFT_PATH_MARKER);
  }

  /**
   * Reports an action failure, except when the error carries a backend message:
   * every rejected request on the shared service model is already displayed by
   * the open dialog's rejected-change guard (`messageChange` listener), so
   * showing it here again would pop the same error twice. Only failures without
   * a backend message (e.g. binding timeouts) surface through this path.
   *
   * @param {XMLView} view the owning view
   * @param {unknown} error the caught error
   * @param {string} errorKey i18n key shown when no backend message exists
   */
  function reportActionFailure(view, error, errorKey) {
    if (!getBackendErrorMessage(error)) {
      handleActionError(view, error, errorKey);
    }
  }

  // Actions that switch the dialog to the draft (add/edit/remove/save) must not
  // run twice in parallel for the same dialog: double clicks before the current
  // processing ends would start a second draft switch and fail with
  // "a draft already exists" (or duplicate the created row).
  const busyDialogs = new WeakSet();

  /**
   * Runs an exclusive dialog action: while one action is still processing for
   * the given dialog, further invocations are ignored.
   *
   * @param {Dialog} dialog the manager dialog whose action is exclusive
   * @param {Function} action the action to run
   * @returns {Promise<T | undefined>} the action result, or `undefined` when
   * another action was already running for the dialog
   */
  async function runExclusiveDialogAction(dialog, action) {
    if (busyDialogs.has(dialog)) {
      return undefined;
    }
    busyDialogs.add(dialog);
    try {
      return await action();
    } finally {
      busyDialogs.delete(dialog);
    }
  }

  // Page-level actions (no dialog involved) follow the same rule: while one is
  // still processing, further invocations are ignored. Keyed by a string instead
  // of a dialog instance.
  const runningActions = new Set();

  /**
   * Runs an exclusive page-level action: while one invocation of the given key
   * is still processing, further invocations are ignored.
   *
   * @param {string} key identifier of the exclusive action (e.g. "sendInvoices")
   * @param {Function} action the action to run
   * @returns {Promise<T | undefined>} the action result, or `undefined` when
   * another invocation was already running
   */
  async function runExclusiveAction(key, action) {
    if (runningActions.has(key)) {
      return undefined;
    }
    runningActions.add(key);
    try {
      return await action();
    } finally {
      runningActions.delete(key);
    }
  }

  /**
   * Switches the dialog to the person draft binding (creating the draft when
   * none is open) and reports failures through the given i18n error key.
   *
   * @param {XMLView} view the owning view
   * @param {Dialog} dialog the manager dialog to switch
   * @param {string} errorKey i18n key shown when the switch fails
   * @param {string} [subPath] optional composition path appended to the draft
   * root (e.g. "/Liabilities(ID='x')" for the movements dialog)
   * @returns {Promise<boolean>} whether the dialog is now bound to the draft
   */
  async function ensureDialogDraft(view, dialog, errorKey, subPath) {
    try {
      await view.getController().enterDialogDraftMode(dialog, subPath);
      return true;
    } catch (error) {
      reportActionFailure(view, error, errorKey);
      return false;
    }
  }

  /**
   * Returns the items binding of the given list once it points at the person
   * draft. After the dialog switches from the active entity to the draft, the
   * rebinding of the list is asynchronous AND the previous binding (still
   * pointing at the active collection, with its header context already
   * resolved) remains reachable for a moment: creating or deleting through it
   * targets the wrong collection and leaves a stuck transient row behind.
   * Polls until the binding's header context belongs to the draft.
   *
   * @param {List | Table} list the dialog list (or nested entities table)
   * @param {number} [timeoutMs] how long to wait for the draft binding
   * @returns {Promise<ODataListBinding | undefined>} the draft binding, or
   * `undefined` when the list has no items binding
   * @throws {Error} when the binding does not point at the draft in time
   */
  async function waitForDraftListBinding(list, timeoutMs = 15000) {
    if (!list) {
      throw new Error("draft list binding timeout");
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const binding = list.getBinding("items");
      if (binding && isDraftPath(binding.getHeaderContext()?.getPath())) {
        return binding;
      }
      if (Date.now() > deadline) {
        throw new Error("draft list binding timeout");
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Waits once for the binding data and returns the context of the row with
   * the given ID. Needed because switching the dialog from the active entity
   * to the person draft re-creates every row context asynchronously.
   *
   * @param {ODataListBinding} binding the dialog list binding (draft)
   * @param {string} id the row ID to find
   * @returns {Promise<Context | undefined>} the fresh row context
   */
  async function findRowContextAfterLoad(binding, id) {
    if (!binding) {
      return undefined;
    }
    const findContext = () => binding.getContexts().find(candidate => candidate.getObject()?.ID === id);
    const immediate = findContext();
    if (immediate) {
      return immediate;
    }
    await new Promise(resolve => {
      const handler = () => {
        binding.detachDataReceived(handler);
        resolve();
      };
      binding.attachDataReceived(handler);
    });
    return findContext();
  }

  /**
   * Deletes a dialog row through the person draft: switches the dialog to its
   * draft binding, waits until the list points at the draft, then deletes the
   * fresh row context. Reports failures and missing rows through the given
   * i18n keys.
   *
   * @param {object} params the deletion parameters
   * @param {XMLView} params.view the owning view
   * @param {Dialog} params.dialog the manager dialog
   * @param {List | Table} [params.list] the dialog list holding the row
   * @param {string} params.rowId the ID of the row to delete
   * @param {string} params.errorKey i18n key shown when the deletion fails
   * @param {string} params.missingRowKey i18n key shown when the row context
   * cannot be found after the rebinding
   * @param {string} [params.subPath] optional composition path appended to the
   * draft root (see {@link ensureDialogDraft})
   * @returns {Promise<void>} resolves once the row is deleted or the failure is
   * reported
   */
  async function deleteRowInDialogDraft(params) {
    const {
      view,
      dialog,
      list,
      rowId,
      errorKey,
      missingRowKey,
      subPath
    } = params;
    if (!(await ensureDialogDraft(view, dialog, errorKey, subPath))) {
      return;
    }
    try {
      const binding = await waitForDraftListBinding(list);
      const rowContext = await findRowContextAfterLoad(binding, rowId);
      if (!rowContext) {
        showWarning(view, missingRowKey);
        return;
      }
      await rowContext.delete();
    } catch (error) {
      reportActionFailure(view, error, errorKey);
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.runExclusiveDialogAction = runExclusiveDialogAction;
  __exports.runExclusiveAction = runExclusiveAction;
  __exports.ensureDialogDraft = ensureDialogDraft;
  __exports.waitForDraftListBinding = waitForDraftListBinding;
  __exports.findRowContextAfterLoad = findRowContextAfterLoad;
  __exports.deleteRowInDialogDraft = deleteRowInDialogDraft;
  return __exports;
});
//# sourceMappingURL=draftDialogFlow-dbg.js.map

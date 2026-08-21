sap.ui.define(["sap/ui/core/message/MessageType", "./feedback"], function (MessageType, ___feedback) {
  "use strict";

  const handleActionError = ___feedback["handleActionError"];
  const showWarning = ___feedback["showWarning"];
  /**
   * Watches the OData V4 service model's `messageChange` event while a draft-bound
   * dialog is open and turns rejected backend changes into visible feedback:
   *
   * - the backend message (e.g. a validation error) is shown immediately;
   * - the rejected change is reverted (the model "parks" a failed PATCH to retry
   *   it, so it is re-sent by the next submitBatch and fails again - the revert is
   *   deferred until the retry has been registered);
   * - `warnIfBlocked` refuses the Save flow while a rejected change could not be
   *   reverted, so the draft is never activated with the failed change silently
   *   dropped.
   *
   * The `messageChange` event fires on the model itself: it is the message
   * processor of the UI5 messages it creates (`sap.ui.core.Messaging` forwards
   * every report to the affected processors, not to the Messaging singleton).
   */
  /**
   * Creates a rejected-change guard bound to one dialog session. Each dialog
   * keeps its own guard instance so handlers are not shared between screens.
   *
   * All dialogs share ONE service model, and stacked dialogs (e.g. movements on
   * top of liabilities) attach their guards to it simultaneously: without
   * coordination a single backend error would pop up once per open dialog.
   * Attached guards therefore form a stack where only the topmost one reacts;
   * closing the top dialog reactivates the one below.
   *
   * @returns {RejectedChangeGuard} the guard
   */
  const attachedGuardSessions = [];
  function refreshGuardSessionSuspension() {
    attachedGuardSessions.forEach((session, index) => {
      session.sessionSuspended = index !== attachedGuardSessions.length - 1;
    });
  }
  function createRejectedChangeGuard() {
    let messageChangeModel;
    let messageChangeListener;
    let view;
    let errorKey = "";
    let rejectedKey = "";
    let rejected = false;
    let suspended = false;
    const session = {
      sessionSuspended: false
    };

    // The failed PATCH is parked in "$parked.<group>" so it can be retried,
    // which is why it is re-sent by the next submitBatch (in Save) and fails
    // again. The revert is deferred so it runs after the model has registered
    // the parked retry; if it cannot be reverted, `rejected` stays set so Save
    // remains blocked instead of silently dropping the change.
    function revertRejectedChange(model) {
      void Promise.resolve().then(() => {
        try {
          model.resetChanges();
          rejected = false;
        } catch {
          // keep `rejected` so Save stays blocked
        }
      });
    }
    function onServiceMessageChange(event) {
      if (suspended || session.sessionSuspended) {
        return;
      }
      const newMessages = event.getParameters().newMessages;
      if (!Array.isArray(newMessages) || !newMessages.length || !view) {
        return;
      }
      const failure = newMessages.find(message => message.getType() === MessageType.Error);
      if (!failure) {
        return;
      }
      rejected = true;
      const detail = failure.getMessage();
      handleActionError(view, detail ? new Error(detail) : new Error(), errorKey);
      const model = failure.getMessageProcessor();
      if (model) {
        revertRejectedChange(model);
      }
    }
    return {
      attach(dialog, errorKeyParam, rejectedKeyParam) {
        if (messageChangeListener) {
          return;
        }
        const model = dialog.getBindingContext()?.getModel();
        if (!model) {
          return;
        }
        rejected = false;
        view = dialog.getParent();
        errorKey = errorKeyParam;
        rejectedKey = rejectedKeyParam;
        messageChangeListener = event => onServiceMessageChange(event);
        model.attachEvent("messageChange", messageChangeListener);
        messageChangeModel = model;
        attachedGuardSessions.push(session);
        refreshGuardSessionSuspension();
      },
      detach() {
        const sessionIndex = attachedGuardSessions.indexOf(session);
        if (sessionIndex >= 0) {
          attachedGuardSessions.splice(sessionIndex, 1);
          refreshGuardSessionSuspension();
        }
        if (messageChangeListener && messageChangeModel) {
          messageChangeModel.detachEvent("messageChange", messageChangeListener);
        }
        messageChangeModel = undefined;
        messageChangeListener = undefined;
        view = undefined;
      },
      isBlocked() {
        return rejected;
      },
      warnIfBlocked() {
        if (rejected && view && rejectedKey) {
          showWarning(view, rejectedKey);
        }
        return rejected;
      },
      suspend() {
        suspended = true;
      },
      resume() {
        suspended = false;
      },
      reset() {
        rejected = false;
      }
    };
  }
  var __exports = {
    __esModule: true
  };
  __exports.createRejectedChangeGuard = createRejectedChangeGuard;
  return __exports;
});
//# sourceMappingURL=rejectedChanges-dbg.js.map

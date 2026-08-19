sap.ui.define(["sap/m/Dialog", "../../util/rejectedChanges"], function (Dialog, ____util_rejectedChanges) {
  "use strict";

  const createRejectedChangeGuard = ____util_rejectedChanges["createRejectedChangeGuard"];
  /**
   * Finds the movements dialog that contains the given control by walking up the
   * parent chain.
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

  // The movements dialog is read-only, but the guard is attached anyway so a
  // backend message arriving while it is open (e.g. a concurrent save) is shown
  // and not silently dropped.
  const rejectedGuard = createRejectedChangeGuard();
  const LiabilityTransactions = {
    onClose: function () {
      const dialog = findTransactionsDialog(this);
      if (!dialog) {
        return;
      }
      try {
        dialog.unbindObject();
      } catch {
        // best effort; unbinding must not break the close flow
      }
      dialog.close();
    },
    onDialogAfterOpen: function () {
      rejectedGuard.attach(this, "liabilityTransactionsLoadError", "liabilitiesRejectedChanges");
    },
    onDialogAfterClose: function () {
      rejectedGuard.detach();
      try {
        this.unbindObject();
      } catch {
        // best effort; unbinding must not break the close flow
      }
      const view = this.getParent();
      if (view) {
        void view.getController().reload();
      }
    }
  };
  return LiabilityTransactions;
});
//# sourceMappingURL=LiabilityTransactions-dbg.js.map

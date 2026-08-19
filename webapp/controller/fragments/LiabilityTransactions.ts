import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import { createRejectedChangeGuard } from "../../util/rejectedChanges";
import type Home from "../../controller/Home.controller";

/**
 * Finds the movements dialog that contains the given control by walking up the
 * parent chain.
 *
 * @param {Control} control the control inside the dialog
 * @returns {Dialog | undefined} the dialog, or `undefined` when not found
 */
function findTransactionsDialog(control: Control): Dialog | undefined {
    let current: Control | undefined = control;
    while (current) {
        if (current instanceof Dialog) {
            return current;
        }
        current = current.getParent() as Control | undefined;
    }
    return undefined;
}

// The movements dialog is read-only, but the guard is attached anyway so a
// backend message arriving while it is open (e.g. a concurrent save) is shown
// and not silently dropped.
const rejectedGuard = createRejectedChangeGuard();

const LiabilityTransactions = {

    onClose: function (this: Control): void {
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

    onDialogAfterOpen: function (this: Dialog): void {
        rejectedGuard.attach(this, "liabilityTransactionsLoadError", "liabilitiesRejectedChanges");
    },

    onDialogAfterClose: function (this: Dialog): void {
        rejectedGuard.detach();
        try {
            this.unbindObject();
        } catch {
            // best effort; unbinding must not break the close flow
        }

        const view = this.getParent() as XMLView | undefined;
        if (view) {
            void (view.getController() as Home).reload();
        }
    }
};

export default LiabilityTransactions;

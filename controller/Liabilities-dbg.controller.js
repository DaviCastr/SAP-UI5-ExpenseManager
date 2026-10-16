sap.ui.define(["./CollectionTab", "../util/draftDialogFlow", "../util/feedback"], function (___CollectionTab, ___util_draftDialogFlow, ___util_feedback) {
  "use strict";

  const CollectionTab = ___CollectionTab["CollectionTab"];
  const runExclusiveDialogAction = ___util_draftDialogFlow["runExclusiveDialogAction"];
  const handleActionError = ___util_feedback["handleActionError"];
  const MIN_DAY = 1;
  const MAX_DAY = 31;

  /**
   * "Dívidas" tab: the debts of the selected person. Each debt is edited on its
   * own (edit button of the tile); its movements open in the shared dialog.
   */
  class Liabilities extends CollectionTab {
    config = {
      route: "Liabilities",
      pageId: "liabilitiesPage",
      listId: "liabilitiesList",
      entitySet: "Liabilities",
      texts: {
        addError: "liabilitiesAddError",
        editError: "liabilitiesEditError",
        removeError: "liabilitiesRemoveError",
        loadError: "liabilitiesLoadError",
        rejectedChanges: "liabilitiesRejectedChanges",
        imageFallback: "liabilitiesEditError",
        removeConfirm: "liabilitiesRemoveConfirm",
        removeTitle: "liabilitiesRemoveTitle"
      }
    };

    /**
     * Opens the edit form of the debt (entering the person draft first) or
     * closes it when it is already open.
     *
     * @param {Event} event the press event of the tile button
     */
    onToggleRowEdit(event) {
      const liability = event.getSource().getBindingContext()?.getObject();
      const ui = this.getUiModel();
      if (!liability?.ID) {
        return;
      }
      if (ui.getProperty("/liabilityEditId") === liability.ID) {
        ui.setProperty("/liabilityEditId", "");
        return;
      }
      void runExclusiveDialogAction(this.page(), async () => {
        if (await this.enterDraft("liabilitiesEditError")) {
          ui.setProperty("/liabilityEditId", liability.ID);
        }
      });
    }
    onViewTransactions(event) {
      const liability = event.getSource().getBindingContext()?.getObject();
      if (!liability?.ID) {
        return;
      }
      void this.workspace()?.openLiabilityTransactions(liability.ID).catch(error => handleActionError(this.getView(), error, "liabilityTransactionsOpenError"));
    }
    newEntry() {
      const form = this.getUiModel().getProperty("/newLiability");
      const name = (form.name ?? "").trim();
      const totalAmount = Number(String(form.totalAmount ?? "").replace(",", "."));
      const dueDay = Number(form.dueDay);
      if (!name || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(dueDay) || dueDay < MIN_DAY || dueDay > MAX_DAY) {
        this.warn("liabilitiesFillFields");
        return null;
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
    resetForm() {
      const ui = this.getUiModel();
      ui.setProperty("/liabilityEditId", "");
      ui.setProperty("/newLiability", {
        name: "",
        description: "",
        totalAmount: "",
        currency: "BRL",
        dueDay: String(new Date().getDate())
      });
    }
    onDraftClosing() {
      this.getUiModel().setProperty("/liabilityEditId", "");
      super.onDraftClosing();
    }
  }
  return Liabilities;
});
//# sourceMappingURL=Liabilities-dbg.controller.js.map

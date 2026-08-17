sap.ui.define(["sap/m/MessageBox", "sap/ui/core/Fragment", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../../util/invoiceWriter", "../../util/i18n", "../../util/feedback", "./Invoices"], function (MessageBox, Fragment, Filter, FilterOperator, ____util_invoiceWriter, ____util_i18n, ____util_feedback, ___Invoices) {
  "use strict";

  const deleteTransactionsViaBatch = ____util_invoiceWriter["deleteTransactionsViaBatch"];
  const getText = ____util_i18n["getText"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showToast = ____util_feedback["showToast"];
  const showWarning = ____util_feedback["showWarning"];
  const reloadInvoiceData = ___Invoices["reloadInvoiceData"];
  const uiOf = view => view.getModel("ui");

  /**
   * Builds the write targets of the selected rows. Rows without the
   * invoice/card coordinates (deep path) cannot be addressed and are skipped.
   *
   * @param {DeleteTransactionRow[]} rows the selected rows
   * @returns {TransactionWriteTarget[]} the addressable write targets
   */
  function buildTargets(rows) {
    const targets = [];
    for (const row of rows) {
      if (!row.Invoice?.ID || !row.Invoice.Card?.ID || !row.Identifier) {
        continue;
      }
      targets.push({
        ID: row.ID,
        cardId: row.Invoice.Card.ID,
        invoiceId: row.Invoice.ID,
        identifier: row.Identifier
      });
    }
    return targets;
  }

  /**
   * Selects (or clears) every transaction currently bound to the delete list,
   * keeping the "select all" checkbox in sync.
   *
   * @param {List} list the delete list
   * @param {XMLView} view the Home view
   * @param {boolean} selected whether to select or clear the rows
   * @returns {void}
   */
  function setAllItemsSelected(list, view, selected) {
    list.getItems().forEach(item => item.setSelected(selected));
    uiOf(view).setProperty("/deleteSelectAll", selected);
  }
  async function performDelete(dialog, view, personId, targets) {
    const ui = uiOf(view);
    ui.setProperty("/invoiceBusy", true);
    try {
      const published = await deleteTransactionsViaBatch(view.getModel(), personId, targets);
      if (!published) {
        showWarning(view, "deleteTransactionsError");
        return;
      }
      showToast(view, "deleteTransactionsDeleted", [String(targets.length)]);
      dialog.close();
      void reloadInvoiceData(view);
    } catch (error) {
      handleActionError(view, error, "deleteTransactionsError");
    } finally {
      ui.setProperty("/invoiceBusy", false);
    }
  }
  const DeleteTransactions = {
    onDialogBeforeOpen: function () {
      const view = this.getParent();
      const ui = uiOf(view);
      const personId = ui.getProperty("/selectedPersonId");
      const identifier = ui.getProperty("/invoiceSelectedIdentifier");
      const list = Fragment.byId("DeleteTransactions", "deleteTransactionList");
      const binding = list?.getBinding("items");
      if (!personId || !identifier || !binding) {
        ui.setProperty("/deleteTransactionsCount", 0);
        ui.setProperty("/deleteTransactionsCountText", "");
        setAllItemsSelected(list, view, false);
        return;
      }
      ui.setProperty("/invoiceBusy", true);
      void (async () => {
        try {
          binding.filter([new Filter({
            path: "Invoice/Card/Person/ID",
            operator: FilterOperator.EQ,
            value1: personId
          }), new Filter({
            path: "Identifier",
            operator: FilterOperator.EQ,
            value1: identifier
          })]);
          const contexts = await binding.requestContexts();
          ui.setProperty("/deleteTransactionsCount", contexts.length);
          ui.setProperty("/deleteTransactionsCountText", getText(view, "deleteTransactionsFound", [String(contexts.length)]));
          if (contexts.length === 0) {
            setAllItemsSelected(list, view, false);
          }
        } catch (error) {
          handleActionError(view, error, "deleteTransactionsError");
        } finally {
          ui.setProperty("/invoiceBusy", false);
        }
      })();
    },
    onDialogAfterOpen: function () {
      const view = this.getParent();
      const ui = uiOf(view);
      const list = Fragment.byId("DeleteTransactions", "deleteTransactionList");
      if (list && ui.getProperty("/deleteTransactionsCount") > 0) {
        setAllItemsSelected(list, view, true);
      }
    },
    onSelectAll: function () {
      const view = this.getParent();
      const list = Fragment.byId("DeleteTransactions", "deleteTransactionList");
      if (list) {
        setAllItemsSelected(list, view, this.getSelected());
      } else {
        uiOf(view).setProperty("/deleteSelectAll", this.getSelected());
      }
    },
    onDeleteConfirmed: function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const ui = uiOf(view);
      const personId = ui.getProperty("/selectedPersonId");
      const list = Fragment.byId("DeleteTransactions", "deleteTransactionList");
      const binding = list?.getBinding("items");
      if (!list || !binding) {
        showWarning(view, "deleteTransactionsError");
        return;
      }
      const selectedItems = list.getSelectedItems();
      if (selectedItems.length === 0) {
        showWarning(view, "deleteTransactionsNoSelection");
        return;
      }
      const selected = selectedItems.map(item => item.getBindingContext()?.getObject()).filter(row => Boolean(row));
      const targets = buildTargets(selected);
      if (targets.length === 0) {
        showWarning(view, "deleteTransactionsError");
        return;
      }
      MessageBox.confirm(getText(view, "deleteTransactionsConfirm", [String(targets.length)]), {
        title: getText(view, "deleteTransactionsConfirmTitle"),
        onClose: action => {
          if (action === MessageBox.Action.OK) {
            void performDelete(dialog, view, personId, targets);
          }
        }
      });
    },
    onCancelDelete: function () {
      this.getParent().close();
    }
  };
  return DeleteTransactions;
});
//# sourceMappingURL=DeleteTransactions-dbg.js.map

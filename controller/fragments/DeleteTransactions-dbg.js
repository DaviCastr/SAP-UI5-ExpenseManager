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
   * Whether the next list `updateFinished` should select every rendered row.
   * Set when the dialog opens so the OData binding has time to create the items
   * (they are not available in `afterOpen` yet).
   */
  let selectAllPending = false;

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
    uiOf(view).setProperty("/deleteTransactions/selectAll", selected);
  }

  /**
   * Tells whether every item currently bound to the delete list is selected.
   *
   * @param {List} list the delete list
   * @returns {boolean} whether the selection matches the "select all" state
   */
  function isAllItemsSelected(list) {
    const items = list.getItems();
    return items.length > 0 && items.every(item => item.getSelected());
  }
  async function performDelete(dialog, view, personId, targets) {
    const ui = uiOf(view);
    ui.setProperty("/busy", true);
    try {
      const result = await deleteTransactionsViaBatch(view.getModel(), personId, targets);
      if (result.Failed > 0) {
        showWarning(view, "deleteTransactionsPartial", [String(result.Deleted), String(result.Failed)]);
        return;
      }
      showToast(view, "deleteTransactionsDeleted", [String(targets.length)]);
      dialog.close();
      void reloadInvoiceData(view);
    } catch (error) {
      handleActionError(view, error, "deleteTransactionsError");
    } finally {
      ui.setProperty("/busy", false);
    }
  }
  const DeleteTransactions = {
    onDialogBeforeOpen: function () {
      const view = this.getParent();
      const ui = uiOf(view);
      const personId = ui.getProperty("/selectedPersonId");
      const identifier = ui.getProperty("/deleteTransactions/selectedIdentifier");
      const list = Fragment.byId("DeleteTransactions", "deleteTransactionList");
      const binding = list?.getBinding("items");
      selectAllPending = false;
      if (!personId || !identifier || !binding) {
        ui.setProperty("/deleteTransactions/count", 0);
        ui.setProperty("/deleteTransactions/countText", "");
        setAllItemsSelected(list, view, false);
        return;
      }
      selectAllPending = true;
      ui.setProperty("/busy", true);
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
          ui.setProperty("/deleteTransactions/count", contexts.length);
          ui.setProperty("/deleteTransactions/countText", getText(view, "deleteTransactionsFound", [String(contexts.length)]));
          if (contexts.length === 0) {
            selectAllPending = false;
            setAllItemsSelected(list, view, false);
          }
        } catch (error) {
          handleActionError(view, error, "deleteTransactionsError");
        } finally {
          ui.setProperty("/busy", false);
        }
      })();
    },
    onListUpdated: function () {
      if (!selectAllPending) {
        return;
      }
      selectAllPending = false;
      const hasItems = this.getItems().length > 0;
      this.getModel("ui").setProperty("/deleteTransactions/selectAll", hasItems);
      this.getItems().forEach(item => item.setSelected(hasItems));
    },
    onSelectionChanged: function () {
      this.getModel("ui").setProperty("/deleteTransactions/selectAll", isAllItemsSelected(this));
    },
    onSelectAll: function () {
      const view = this.getParent();
      const list = Fragment.byId("DeleteTransactions", "deleteTransactionList");
      if (list) {
        setAllItemsSelected(list, view, this.getSelected());
      } else {
        uiOf(view).setProperty("/deleteTransactions/selectAll", this.getSelected());
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
    },
    onDialogAfterClose: function () {
      const view = this.getParent();
      if (view) {
        view.getController().reload();
      }
    }
  };
  return DeleteTransactions;
});
//# sourceMappingURL=DeleteTransactions-dbg.js.map

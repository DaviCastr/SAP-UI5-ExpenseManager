sap.ui.define(["./http", "../service/ODataService"], function (___http, ___service_ODataService) {
  "use strict";

  const request = ___http["request"];
  const ODataService = ___service_ODataService["ODataService"];
  /**
   * A transaction that lives inside the person's tree. The deep draft path is
   * built from these parts, always rooted at the person draft (the service keeps
   * every change of cards/invoices/transactions inside the single person draft).
   */
  /**
   * Builds the OData path of a transaction inside the currently open person
   * draft. Addressing the deepest rows this way makes every PATCH/DELETE part of
   * the same person draft, so activating the draft publishes the whole tree.
   *
   * @param {string} personId the person that owns the card/invoice/transaction
   * @param {TransactionWriteTarget} target the transaction coordinates
   * @returns {string} the draft-relative entity path
   */
  function transactionDraftPath(personId, target) {
    const part = value => encodeURIComponent(value);
    return `Persons(ID='${part(personId)}',IsActiveEntity=false)/Cards(ID='${part(target.cardId)}',IsActiveEntity=false)/Invoices(ID='${part(target.invoiceId)}',IsActiveEntity=false)/Transactions(ID='${part(target.ID)}',IsActiveEntity=false)`;
  }

  /**
   * PATCHes a transaction draft row. The first write to a deep draft row also
   * materializes the whole path (the "idempotent touch" used by the Cards
   * dialog), so a single call both prepares and updates the row.
   *
   * @param {string} personId the person draft owner
   * @param {TransactionWriteTarget} target the transaction coordinates
   * @param {object} body the patch payload
   * @returns {Promise<boolean>} whether the backend accepted the change
   */
  async function patchTransactionDraft(personId, target, body) {
    const response = await request(transactionDraftPath(personId, target), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return response.ok;
  }

  /**
   * Sets a new category on every transaction of an identifier group and then
   * publishes the person draft. The deep draft rows are materialized first
   * (idempotent touch), then each row is bound, the Category navigation is set
   * through the model (`setProperty`) and everything is flushed together by
   * `submitPending` — so the whole group travels inside one `$batch` changeset.
   * Publish the person draft afterwards.
   *
   * @param {ODataModel} model the shared service model
   * @param {string} personId the person that owns the transactions
   * @param {TransactionWriteTarget[]} targets the identifier group
   * @param {string} categoryId the new category id
   * @returns {Promise<boolean>} whether every update succeeded and the draft was activated
   */
  async function applyCategoryToTransactions(model, personId, targets, categoryId) {
    const odata = new ODataService(model);
    await odata.enableDraftEdit("Persons", personId);
    let batchConstexts = [];
    let bindings = [];
    try {
      for (const target of targets) {
        const binding = model.bindContext(`/${transactionDraftPath(personId, target)}`);
        batchConstexts.push({
          binding,
          data: binding.requestObject()
        });
      }
      await Promise.all(batchConstexts.map(item => item.data));
      bindings = batchConstexts.map(item => item.binding);
      const batchChanges = [];
      for (const binding of bindings) {
        const context = binding.getBoundContext();
        if (context) {
          batchChanges.push(context.setProperty("Category_ID", categoryId));
        }
      }
      await Promise.all(batchChanges);
      await odata.submitPending();
    } catch {
      return false;
    } finally {
      for (const binding of bindings) {
        try {
          binding.destroy();
        } catch {
          // best effort; destroying a failed binding must not break the flow
        }
      }
    }
    await odata.prepareDraft("Persons", personId);
    await odata.activateDraft("Persons", personId);
    return true;
  }

  /**
   * Deletes the selected transactions via a single OData batch. The target draft
   * rows are materialized first (idempotent touch), then one DELETE per row is
   * queued on the `$auto` group and flushed together by `submitPending` — so the
   * whole exclusion travels inside one `$batch` changeset. Publish the person
   * draft afterwards.
   *
   * @param {ODataModel} model the shared service model
   * @param {string} personId the person that owns the transactions
   * @param {TransactionWriteTarget[]} targets the transactions to remove
   * @returns {Promise<boolean>} whether every delete succeeded and the draft was activated
   */
  async function deleteTransactionsViaBatch(model, personId, targets) {
    const odata = new ODataService(model);
    await odata.enableDraftEdit("Persons", personId);
    let batchConstexts = [];
    let bindings = [];
    try {
      for (const target of targets) {
        const binding = model.bindContext(`/${transactionDraftPath(personId, target)}`);
        batchConstexts.push({
          binding,
          data: binding.requestObject()
        });
      }
      await Promise.all(batchConstexts.map(item => item.data));
      bindings = batchConstexts.map(item => item.binding);
      let batchDelete = [];
      for (const binding of bindings) {
        const context = binding.getBoundContext();
        if (context) {
          batchDelete.push(context.delete().catch(() => undefined));
        }
      }
      await Promise.all(batchDelete);
      await odata.submitPending();
    } catch {
      return false;
    } finally {
      for (const binding of bindings) {
        try {
          binding.destroy();
        } catch {
          // best effort; destroying a failed binding must not break the flow
        }
      }
    }
    await odata.prepareDraft("Persons", personId);
    await odata.activateDraft("Persons", personId);
    return true;
  }
  var __exports = {
    __esModule: true
  };
  __exports.transactionDraftPath = transactionDraftPath;
  __exports.applyCategoryToTransactions = applyCategoryToTransactions;
  __exports.deleteTransactionsViaBatch = deleteTransactionsViaBatch;
  return __exports;
});
//# sourceMappingURL=invoiceWriter-dbg.js.map

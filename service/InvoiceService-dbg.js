sap.ui.define(["./ODataService", "sap/ui/model/Filter", "sap/ui/model/FilterOperator"], function (___ODataService, Filter, FilterOperator) {
  "use strict";

  const DRAFT_FILTER = ___ODataService["DRAFT_FILTER"];
  /**
   * Read model for the invoice-related functions of the ExpenseManager service.
   */
  class InvoiceService {
    constructor(odata) {
      this.odata = odata;
    }
    async getCompleteInvoice(personId, period) {
      return this.odata.requestFunction("/RetrieveCompleteInvoice", {
        PersonId: personId,
        Year: period.year,
        Month: period.month
      });
    }

    /**
     * Sends the full invoice of the given year/month through the unbound
     * SendInvoices CAP action. The backend resolves with a plain boolean
     * (true when the invoices were processed); failures reject.
     *
     * @param {Period} period the year/month whose invoices are sent
     * @returns {Promise<boolean>} whether the send succeeded
     */
    async sendInvoices(period) {
      return this.odata.requestFunction("/SendInvoices", {
        Year: period.year,
        Month: period.month
      });
    }

    /**
     * Finds the invoice of a single card for the given year/month. The Invoice
     * entity set is draft-aware, so the query includes active rows together
     * with drafts that have no active sibling.
     *
     * @param {string} personId unused by the query but kept for symmetry/clarity
     * @param {string} cardId the card whose invoice is looked up
     * @param {Period} period the year/month being shown
     * @returns {Promise<InvoiceQueryResult | undefined>} the matching invoice, if any
     */
    async findInvoice(personId, cardId, period) {
      void personId;
      const invoices = await this.odata.requestEntitySet("/Invoices", {
        filterExpression: `Card/ID eq '${cardId}' and Year eq ${period.year} and Month eq ${period.month} and ${DRAFT_FILTER}`,
        expand: "Currency"
      });
      return invoices[0];
    }

    /**
     * Lists every transaction of the person that shares the given Identifier
     * (installments of the same purchase). Used by the recategorization and
     * deletion dialogs, where changes must reach the whole identifier group.
     *
     * @param {string} personId the selected person
     * @param {string} identifier the shared Identifier value
     * @returns {Promise<IdentifierTransaction[]>} the matching transactions
     */
    async listTransactionsByIdentifier(personId, identifier) {
      return this.odata.requestEntitySet("Transactions", {
        filters: [new Filter({
          path: "Invoice/Card/Person/ID",
          operator: FilterOperator.EQ,
          value1: personId
        }), new Filter({
          path: "Identifier",
          operator: FilterOperator.EQ,
          value1: identifier
        })],
        filterExpression: DRAFT_FILTER,
        expand: "Invoice($select=ID,Card_ID,Year,Month),Category,Currency"
      });
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.InvoiceService = InvoiceService;
  return __exports;
});
//# sourceMappingURL=InvoiceService-dbg.js.map

sap.ui.define([], function () {
  "use strict";

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
  }
  var __exports = {
    __esModule: true
  };
  __exports.InvoiceService = InvoiceService;
  return __exports;
});
//# sourceMappingURL=InvoiceService-dbg.js.map

sap.ui.define([], function () {
  "use strict";

  /**
   * Frontend mirror of the debt rules of `@/domain/liability-rules` on the
   * backend. Both sides must be kept in sync: the backend enforces the rules,
   * this module only feeds the option lists used by the UI.
   *
   * A liability has exactly two statuses (OPEN/PAID) and its transactions are
   * either IN (reduces the outstanding balance) or OUT (increases it). The
   * outstanding balance, payment percentage and status are computed by the
   * backend from the persisted transactions.
   */

  const TRANSACTION_TYPE_OPTIONS = [{
    key: "IN",
    text: "Entrada"
  }, {
    key: "OUT",
    text: "Saída"
  }];
  const LIABILITY_STATUS_OPTIONS = [{
    key: "OPEN",
    text: "Em aberto"
  }, {
    key: "PAID",
    text: "Paga"
  }];
  var __exports = {
    __esModule: true
  };
  __exports.TRANSACTION_TYPE_OPTIONS = TRANSACTION_TYPE_OPTIONS;
  __exports.LIABILITY_STATUS_OPTIONS = LIABILITY_STATUS_OPTIONS;
  return __exports;
});
//# sourceMappingURL=liabilityRules-dbg.js.map

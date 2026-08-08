sap.ui.define(["../util/format"], function (___util_format) {
  "use strict";

  const formatMonth = ___util_format["formatMonth"];
  const PERIOD_OVERVIEW_LABEL = "Visão geral • ";

  /**
   * Pure period helpers used by the Home dashboard. Keeping them here removes
   * date arithmetic and label formatting from the controller so it only
   * orchestrates the view state.
   */
  class PeriodService {
    current() {
      const now = new Date();
      return {
        year: now.getFullYear(),
        month: now.getMonth() + 1
      };
    }
    currentOrDefault(period) {
      return period || this.current();
    }
    shift(period, delta) {
      const total = period.year * 12 + (period.month - 1) + delta;
      return {
        year: Math.floor(total / 12),
        month: total % 12 + 1
      };
    }
    label(year, month) {
      return `${PERIOD_OVERVIEW_LABEL}${formatMonth(year, month)}`;
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.PERIOD_OVERVIEW_LABEL = PERIOD_OVERVIEW_LABEL;
  __exports.PeriodService = PeriodService;
  return __exports;
});
//# sourceMappingURL=PeriodService-dbg.js.map

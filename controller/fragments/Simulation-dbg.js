sap.ui.define(["sap/m/MessageBox", "../../util/expenseApi", "../../util/http", "../../util/i18n"], function (MessageBox, ____util_expenseApi, ____util_http, ____util_i18n) {
  "use strict";

  const simulateExpenses = ____util_expenseApi["simulateExpenses"];
  const isSessionExpiredError = ____util_http["isSessionExpiredError"];
  const getText = ____util_i18n["getText"];
  const Simulation = {
    onCancelarSimulacao: function () {
      this.getParent().close();
    },
    onSimularGastos: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const uiModel = view.getModel("ui");
      const simulation = uiModel.getProperty("/simulation");
      const personId = uiModel.getProperty("/selectedPersonId");
      if (!personId) {
        MessageBox.warning(getText(view, "errorMissingPerson"));
        return;
      }
      const year = Number(simulation.year);
      const month = Number(simulation.month);
      if (!year || !month) {
        MessageBox.warning(getText(view, "errorInvalidMonthYear"));
        return;
      }
      uiModel.setProperty("/busy", true);
      try {
        const result = await simulateExpenses(view.getModel(), personId, year, month);
        uiModel.setProperty("/simulationResult", result);
      } catch (error) {
        if (isSessionExpiredError(error)) {
          return;
        }
        MessageBox.error(getText(view, "errorSimulate"));
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return Simulation;
});
//# sourceMappingURL=Simulation-dbg.js.map

sap.ui.define(["../../util/expenseApi", "../../util/feedback"], function (____util_expenseApi, ____util_feedback) {
  "use strict";

  const simulateExpenses = ____util_expenseApi["simulateExpenses"];
  const handleActionError = ____util_feedback["handleActionError"];
  const showWarning = ____util_feedback["showWarning"];
  const Simulation = {
    onCancelSimulation: function () {
      this.getParent().close();
    },
    onRunSimulation: async function () {
      const dialog = this.getParent();
      const view = dialog.getParent();
      const uiModel = view.getModel("ui");
      const simulation = uiModel.getProperty("/simulation");
      const personId = uiModel.getProperty("/selectedPersonId");
      if (!personId) {
        showWarning(view, "errorMissingPerson");
        return;
      }
      const year = Number(simulation.year);
      const month = Number(simulation.month);
      if (!year || !month) {
        showWarning(view, "errorInvalidMonthYear");
        return;
      }
      uiModel.setProperty("/busy", true);
      try {
        const result = await simulateExpenses(view.getModel(), personId, year, month);
        uiModel.setProperty("/simulationResult", result);
      } catch (error) {
        handleActionError(view, error, "errorSimulate");
      } finally {
        uiModel.setProperty("/busy", false);
      }
    }
  };
  return Simulation;
});
//# sourceMappingURL=Simulation-dbg.js.map

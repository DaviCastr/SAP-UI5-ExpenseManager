import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { simulateExpenses } from "../../util/expenseApi";
import { handleActionError, showWarning } from "../../util/feedback";
import type { UiSimulation } from "../../model/UiModel";

const Simulation = {
    onCancelarSimulacao: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onSimularGastos: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const simulation = uiModel.getProperty("/simulation") as UiSimulation;
        const personId = uiModel.getProperty("/selectedPersonId") as string;

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
            const result = await simulateExpenses(view.getModel() as ODataModel, personId, year, month);
            uiModel.setProperty("/simulationResult", result);
        } catch (error) {
            handleActionError(view, error, "errorSimulate");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default Simulation;

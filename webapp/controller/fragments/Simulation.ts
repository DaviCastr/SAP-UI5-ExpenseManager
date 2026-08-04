import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import { simulateExpenses } from "../../util/expenseApi";
import { isSessionExpiredError } from "../../util/http";
import { getText } from "../../util/i18n";

interface SimulationState {
    month: string;
    year: string;
}

const Simulation = {
    onCancelarSimulacao: function (this: Control): void {
        (this.getParent() as Dialog).close();
    },

    onSimularGastos: async function (this: Control): Promise<void> {
        const dialog = this.getParent() as Dialog;
        const view = dialog.getParent() as XMLView;
        const uiModel = view.getModel("ui") as JSONModel;

        const simulation = uiModel.getProperty("/simulation") as SimulationState;
        const person = uiModel.getProperty("/selectedPerson") as { ID: string } | undefined;

        if (!person?.ID) {
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
            const result = await simulateExpenses(view.getModel() as ODataModel, person.ID, year, month);
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

export default Simulation;

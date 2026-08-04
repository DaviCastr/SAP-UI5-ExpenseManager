import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import { simulateExpenses } from "../../util/expenseApi";

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
            MessageBox.warning("Selecione uma pessoa para simular os gastos.");
            return;
        }

        const year = Number(simulation.year);
        const month = Number(simulation.month);

        if (!year || !month) {
            MessageBox.warning("Informe um mês e um ano válidos.");
            return;
        }

        uiModel.setProperty("/busy", true);

        try {
            const result = await simulateExpenses(person.ID, year, month);
            uiModel.setProperty("/simulationResult", result);
        } catch (error) {
            MessageBox.error("Não foi possível simular os gastos. Verifique sua conexão.");
        } finally {
            uiModel.setProperty("/busy", false);
        }
    }
};

export default Simulation;

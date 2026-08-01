import BaseComponent from "sap/ui/core/UIComponent";
import { createDeviceModel } from "./model/models";
import { AuthenticationService } from "./auth/AuthenticationService";
import { AuthenticatedProviderFactory } from "./auth/providers/AuthenticatedProviderFactory";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace apps.dflc.expensemanager
 */
export default class Component extends BaseComponent {

    public static metadata = {
        manifest: "json",
        interfaces: [
            "sap.ui.core.IAsyncContentCreation"
        ]
    };

    public init(): void {
        // call the base component's init function
        super.init();

        AuthenticationService.initialize(
            AuthenticatedProviderFactory.create()
        );

        // set the device model
        this.setModel(createDeviceModel(), "device");
        this.setModel(new JSONModel({
            summary: {
                available: "5.420,00",
                income: "8.400,00",
                expenses: "2.980,00",
                savings: "1.250,00",
                trend: "12% melhor que no mês passado",
                expenseHint: "35% da receita planejada"
            },
            newExpense: {},
            newCard: {}
        }), "ui");

        // enable routing
        this.getRouter().initialize();
    }
}

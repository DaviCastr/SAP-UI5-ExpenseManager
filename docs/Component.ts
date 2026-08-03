import BaseComponent from "sap/ui/core/UIComponent";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { createDeviceModel } from "./model/models";
import { AuthenticationService } from "./auth/AuthenticationService";
import { AuthenticatedProviderFactory } from "./auth/providers/AuthenticatedProviderFactory";
import { XsuaaAuthHelper } from "./auth/providers/XsuaaAuthHelper";
import Environment, { EnvironmentType } from "./util/Environment";
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

        if (Environment.current() === EnvironmentType.GITHUB) {
            void this.prepareGithubServiceModel();
        }
    }

    private async prepareGithubServiceModel(): Promise<void> {
        const session = AuthenticationService.getSession();

        if (session && session.expiresAt > Date.now()) {
            this.setGithubServiceModel(session.accessToken);
            return;
        }

        try {
            const authenticated = await AuthenticationService.isAuthenticated();
            const updated = AuthenticationService.getSession();

            if (authenticated && updated && updated.accessToken) {
                this.setGithubServiceModel(updated.accessToken);
            }
        } catch (error) {
            // keeps the manifest model; the Login view handles the flow
        }
    }

    private setGithubServiceModel(accessToken: string): void {
        const config = XsuaaAuthHelper.getConfig();
        const model = new ODataModel({
            serviceUrl: config.odataService,
            httpHeaders: {
                Authorization: `Bearer ${accessToken}`
            },
            operationMode: "Server",
            autoExpandSelect: true,
            earlyRequests: true
        });

        this.setModel(model);
    }
}

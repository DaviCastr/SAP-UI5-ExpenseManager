import BaseComponent from "sap/ui/core/UIComponent";
import { createDeviceModel } from "./model/models";
import { AuthenticationService } from "./auth/AuthenticationService";
import { AuthenticatedProviderFactory } from "./auth/providers/AuthenticatedProviderFactory";

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

        // enable routing
        this.getRouter().initialize();
    }
}
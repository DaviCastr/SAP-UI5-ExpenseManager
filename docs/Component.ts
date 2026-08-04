import BaseComponent from "sap/ui/core/UIComponent";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { createDeviceModel } from "./model/models";
import { AuthenticationService } from "./auth/AuthenticationService";
import { AuthenticatedProviderFactory } from "./auth/providers/AuthenticatedProviderFactory";
import { XsuaaAuthHelper } from "./auth/providers/XsuaaAuthHelper";
import { SessionStorage } from "./auth/storage/SessionStorage";
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

    private _sessionExpiredShown = false;
    private _serviceModelReady: Promise<boolean>;
    private _resolveServiceModelReady?: (value: boolean) => void;

    public constructor() {
        super();
        this._serviceModelReady = new Promise((resolve) => {
            this._resolveServiceModelReady = resolve;
        });
    }

    public init(): void {
        // call the base component's init function
        super.init();

        AuthenticationService.initialize(
            AuthenticatedProviderFactory.create()
        );

        AuthenticationService.onSessionExpired(() => this.handleSessionExpired());

        // set the device model
        this.setModel(createDeviceModel(), "device");
        this.setModel(new JSONModel({
            summary: {
                available: "",
                income: "",
                expenses: "",
                savings: "",
                target: "",
                expenseHint: "",
                targetHint: "",
                trendText: "",
                trendIcon: "sap-icon://trend-up"
            },
            monthLabel: "",
            persons: [],
            personsEmpty: false,
            selectedPerson: { ID: "" },
            busy: false,
            newExpense: {},
            newCard: {}
        }), "ui");

        const environment = Environment.current();

        if (environment === EnvironmentType.GITHUB) {
            void this.bootstrapServiceModel();
        } else if (environment === EnvironmentType.LOCAL && XsuaaAuthHelper.getConfig().auth) {
            XsuaaAuthHelper.setLocalOverrides();
            void this.bootstrapServiceModel();
        } else {
            this.prepareStandaloneServiceModel();
        }

        // enable routing; view bindings to the default model are deferred and are
        // (re-)created once the service model is set on the component
        this.getRouter().initialize();
    }

    public getServiceModelReady(): Promise<boolean> {
        return this._serviceModelReady;
    }

    private applyManifestServiceUrl(): void {
        const manifest = this.getManifestObject() as { get?: (key: string) => unknown } | undefined;
        const uri = manifest?.get?.("/sap.app/dataSources/mainService/uri") as string | undefined;

        if (uri) {
            XsuaaAuthHelper.setServiceUrl(uri);
        }
    }

    private prepareStandaloneServiceModel(): void {
        if (!XsuaaAuthHelper.getConfig().odataService) {
            this.applyManifestServiceUrl();
        }
        this.setServiceModel("");
        this._resolveServiceModelReady?.(true);
    }

    private async bootstrapServiceModel(): Promise<void> {
        try {
            const session = AuthenticationService.getSession();

            if (session && session.expiresAt > Date.now()) {
                this.setServiceModel(session.accessToken);
                this._resolveServiceModelReady?.(true);
                return;
            }

            const authenticated = await AuthenticationService.isAuthenticated();
            const updated = AuthenticationService.getSession();

            if (authenticated && updated && updated.accessToken) {
                this.setServiceModel(updated.accessToken);
                this._resolveServiceModelReady?.(true);
                return;
            }

            this._resolveServiceModelReady?.(false);
            this.getRouter().navTo("Login");
        } catch (error) {
            this._resolveServiceModelReady?.(false);
            this.getRouter().navTo("Login");
        }
    }

    private setServiceModel(accessToken: string): void {
        const config = XsuaaAuthHelper.getConfig();
        const httpHeaders: Record<string, string> = {};

        if (accessToken) {
            httpHeaders.Authorization = `Bearer ${accessToken}`;
        }

        const model = new ODataModel({
            serviceUrl: config.odataService,
            httpHeaders,
            operationMode: "Server",
            autoExpandSelect: true,
            earlyRequests: true
        });

        model.attachSessionTimeout(() => AuthenticationService.notifySessionExpired());

        this.setModel(model);
    }

    private handleSessionExpired(): void {
        if (this._sessionExpiredShown) {
            return;
        }

        this._sessionExpiredShown = true;
        SessionStorage.clear();

        const bundle = (this.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle | undefined;
        const title = bundle?.getText("sessionExpiredTitle") ?? "Sessão expirada";
        const message = bundle?.getText("sessionExpiredMessage") ?? "Sua sessão expirou. Faça login novamente para continuar.";

        MessageBox.show(message, {
            title,
            icon: MessageBox.Icon.WARNING,
            onClose: () => {
                this._sessionExpiredShown = false;
                this.getRouter().navTo("Login");
            }
        });
    }
}

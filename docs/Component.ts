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

    public async init(): Promise<void> {
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
        let serviceReady = false;

        if (environment === EnvironmentType.GITHUB) {
            serviceReady = await this.prepareGithubServiceModel();
        } else if (environment === EnvironmentType.LOCAL && XsuaaAuthHelper.getConfig().auth) {
            XsuaaAuthHelper.setLocalOverrides();
            serviceReady = await this.prepareGithubServiceModel();
        } else if (!XsuaaAuthHelper.getConfig().odataService) {
            this.applyManifestServiceUrl();
            this._resolveServiceModelReady?.(true);
            serviceReady = true;
        } else {
            this._resolveServiceModelReady?.(true);
            serviceReady = true;
        }

        // enable routing only after the service model is ready, so that all
        // view bindings are created against the authenticated model
        this.getRouter().initialize();

        if (!serviceReady) {
            this.getRouter().navTo("Login");
        }
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

    private async prepareGithubServiceModel(): Promise<boolean> {
        const session = AuthenticationService.getSession();

        if (session && session.expiresAt > Date.now()) {
            this.setGithubServiceModel(session.accessToken);
            return true;
        }

        try {
            const authenticated = await AuthenticationService.isAuthenticated();
            const updated = AuthenticationService.getSession();

            if (authenticated && updated && updated.accessToken) {
                this.setGithubServiceModel(updated.accessToken);
                return true;
            }

            this._resolveServiceModelReady?.(false);
            return false;
        } catch (error) {
            this._resolveServiceModelReady?.(false);
            return false;
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

        this.attachODataModelSessionGuard(model);
        this.setModel(model);
        this._resolveServiceModelReady?.(true);
    }

    private attachODataModelSessionGuard(model: ODataModel): void {
        model.attachRequestFailed((event) => {
            const parameters = event.getParameters() as { response?: { statusCode?: number } };
            const statusCode = parameters?.response?.statusCode;

            if (statusCode === 401 || statusCode === 403) {
                this.handleSessionExpired();
            }
        });
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

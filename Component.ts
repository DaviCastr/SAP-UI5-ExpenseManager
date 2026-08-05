import BaseComponent from "sap/ui/core/UIComponent";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import type { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
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
    private _serviceModelPromise: Promise<ODataModel | null> | null = null;

    public async init(): Promise<void> {
        super.init();

        await XsuaaAuthHelper.loadRuntimeConfig();

        AuthenticationService.initialize(
            AuthenticatedProviderFactory.create()
        );

        AuthenticationService.onSessionExpired(() => this.handleSessionExpired());

        this.setModel(createDeviceModel(), "device");
        this.setModel(this.createUiModel(), "ui");

        const environment = Environment.current();

        if (environment === EnvironmentType.GITHUB) {
            // The service model is provisioned lazily by the route guard and the controllers.
        } else if (environment === EnvironmentType.LOCAL && XsuaaAuthHelper.getConfig().auth) {
            XsuaaAuthHelper.setLocalOverrides();
        } else {
            this.prepareStandaloneServiceModel();
        }

        this.getRouter().initialize();
        this.getRouter().attachBeforeRouteMatched((event) => this.handleBeforeRouteMatched(event));
    }

    /**
     * Resolves with the shared OData model once a valid session is available,
     * or with `null` when the user is not authenticated. The provisioning can
     * be retried after a login (the promise is re-armed when it fails).
     */
    public ensureServiceModel(): Promise<ODataModel | null> {
        const current = this.getModel() as ODataModel | undefined;

        if (current) {
            return Promise.resolve(current);
        }

        if (!this._serviceModelPromise) {
            this._serviceModelPromise = this.provisionServiceModel().then((model) => {
                if (!model) {
                    this._serviceModelPromise = null;
                }
                return model;
            });
        }

        return this._serviceModelPromise;
    }

    private async provisionServiceModel(): Promise<ODataModel | null> {
        const session = AuthenticationService.getSession();

        if (session?.accessToken && session.expiresAt > Date.now()) {
            this.setServiceModel(session.accessToken);
            return this.getModel() as ODataModel;
        }

        const authenticated = await AuthenticationService.isAuthenticated();
        const updated = AuthenticationService.getSession();

        if (authenticated && updated?.accessToken && updated.expiresAt > Date.now()) {
            this.setServiceModel(updated.accessToken);
            return this.getModel() as ODataModel;
        }

        return null;
    }

    private handleBeforeRouteMatched(event: Router$BeforeRouteMatchedEvent): void {
        if (!this.isAuthRequired()) {
            return;
        }

        const target = event.getParameter("name") ?? "";
        const session = AuthenticationService.getSession();
        const authenticated = !!session?.accessToken && session.expiresAt > Date.now();

        if (target === "Home" && !authenticated) {
            this.getRouter().navTo("Login");
        } else if (target === "Login" && authenticated) {
            this.getRouter().navTo("Home");
        }
    }

    private isAuthRequired(): boolean {
        const environment = Environment.current();

        if (environment === EnvironmentType.GITHUB) {
            return true;
        }

        if (environment === EnvironmentType.LOCAL && XsuaaAuthHelper.getConfig().auth) {
            return true;
        }

        return false;
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

    private prepareStandaloneServiceModel(): void {
        if (!XsuaaAuthHelper.getConfig().odataService) {
            this.applyManifestServiceUrl();
        }
        this.setServiceModel("");
    }

    private applyManifestServiceUrl(): void {
        const manifest = this.getManifestObject() as { get?: (key: string) => unknown } | undefined;
        const uri = manifest?.get?.("/sap.app/dataSources/mainService/uri") as string | undefined;

        if (uri) {
            XsuaaAuthHelper.setServiceUrl(uri);
        }
    }

    private createUiModel(): JSONModel {
        const now = new Date();

        return new JSONModel({
            period: { year: now.getFullYear(), month: now.getMonth() + 1 },
            monthLabel: "",
            selectedPerson: {},
            selectedPersonId: "",
            personsEmpty: false,
            busy: false,
            transactions: [],
            cards: [],
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
            categories: [],
            newExpense: {},
            newCard: {}
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

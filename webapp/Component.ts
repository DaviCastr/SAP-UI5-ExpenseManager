import BaseComponent from "sap/ui/core/UIComponent";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import type { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { createDeviceModel } from "./model/models";
import UiModel from "./model/UiModel";
import { AuthenticationService } from "./auth/AuthenticationService";
import { AuthenticatedProviderFactory } from "./auth/providers/AuthenticatedProviderFactory";
import { XsuaaAuthHelper } from "./auth/providers/XsuaaAuthHelper";
import { SessionStorage } from "./auth/storage/SessionStorage";
import Environment, { EnvironmentType } from "./util/Environment";
import { isSessionExpiredError, isBackendUnavailableError } from "./util/http";
import { getBackendErrorMessage } from "./util/feedback";
import { ensureThemeApplied } from "./util/theme";

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
    private _modelToken = "";
    private _unexpectedErrorShown = false;

    public async init(): Promise<void> {
        super.init();

        ensureThemeApplied();

        try {
            await XsuaaAuthHelper.loadRuntimeConfig();
        } catch (error) {
            console.error("[init] runtime-config.json", error);
        }

        this.registerGlobalErrorHandlers();

        AuthenticationService.initialize(
            AuthenticatedProviderFactory.create()
        );

        AuthenticationService.onSessionExpired(() => this.handleSessionExpired());
        AuthenticationService.onAuthError((message) => this.handleAuthError(message));

        this.setModel(createDeviceModel(), "device");
        this.setModel(new UiModel(), "ui");

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
     * Last-resort safety net: surfaces unexpected async failures and window
     * errors that escaped every local handler, so the user always sees a
     * message instead of a silent broken screen.
     */
    private registerGlobalErrorHandlers(): void {
        window.addEventListener("unhandledrejection", (event) => {
            event.preventDefault();
            this.handleUnexpectedError((event as PromiseRejectionEvent).reason);
        });
        window.addEventListener("error", (event) => {
            this.handleUnexpectedError((event as ErrorEvent).error);
        });
    }

    /**
     * Reports an unexpected error once per dialog cycle (deduplicated while the
     * MessageBox is open). Session/auth/backend-unavailability errors are
     * ignored because they already have dedicated handlers.
     *
     * @param {unknown} reason the uncaught error or rejection reason
     */
    public handleUnexpectedError(reason: unknown): void {
        if (!reason || isSessionExpiredError(reason) || isBackendUnavailableError(reason)) {
            return;
        }

        console.error("[unexpected]", reason);

        if (this._unexpectedErrorShown) {
            return;
        }
        this._unexpectedErrorShown = true;

        const bundle = (this.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle | undefined;
        const base = bundle?.getText("unexpectedError") ?? "Ocorreu um erro inesperado.";
        const detail = getBackendErrorMessage(reason);
        MessageBox.error(detail ? `${base}\n\n${detail}` : base, {
            onClose: () => {
                this._unexpectedErrorShown = false;
            }
        });
    }

    /**
     * Resolves with the shared OData model once a valid session is available,
     * or with `null` when the user is not authenticated. The provisioning can
     * be retried after a login (the promise is re-armed when it fails).
     *
     * @returns {Promise<ODataModel | null>} the shared service model, or null when not authenticated
     */
    public ensureServiceModel(): Promise<ODataModel | null> {
        const current = this.getModel() as ODataModel | undefined;

        if (current && this.isModelTokenCurrent()) {
            return Promise.resolve(current);
        }

        if (!this._serviceModelPromise) {
            this._serviceModelPromise = this.provisionServiceModel().then((model) => {
                if (!model) {
                    this._serviceModelPromise = null;
                }
                return model;
            }).catch((error) => {
                this._serviceModelPromise = null;
                throw error;
            });
        }

        return this._serviceModelPromise;
    }

    private isModelTokenCurrent(): boolean {
        const session = AuthenticationService.getSession();
        const token = session?.accessToken ?? "";

        if (token && (!session || session.expiresAt <= Date.now())) {
            return false;
        }

        return this._modelToken === token;
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
            if (!AuthenticationService.isAuthErrorPending()) {
                this.getRouter().navTo("Login");
            }
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
        const previous = this.getModel() as ODataModel | undefined;

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

        this._modelToken = accessToken;
        this.setModel(model);
        previous?.destroy();
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

    private handleSessionExpired(): void {
        if (this._sessionExpiredShown) {
            return;
        }

        this._sessionExpiredShown = true;
        SessionStorage.clear();
        this._serviceModelPromise = null;

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

    private handleAuthError(message: string): void {
        const bundle = (this.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle | undefined;
        const prefix = bundle?.getText("authErrorPrefix") ?? "Erro ao autenticar, motivo";

        this._sessionExpiredShown = true;
        MessageBox.error(`${prefix}: ${message}`, {
            onClose: () => {
                this._sessionExpiredShown = false;
                AuthenticationService.clearAuthError();
                this.getRouter().navTo("Login");
            }
        });
    }
}

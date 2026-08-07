sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/model/odata/v4/ODataModel", "sap/m/MessageBox", "./model/models", "./model/UiModel", "./auth/AuthenticationService", "./auth/providers/AuthenticatedProviderFactory", "./auth/providers/XsuaaAuthHelper", "./auth/storage/SessionStorage", "./util/Environment"], function (BaseComponent, ODataModel, MessageBox, ___model_models, __UiModel, ___auth_AuthenticationService, ___auth_providers_AuthenticatedProviderFactory, ___auth_providers_XsuaaAuthHelper, ___auth_storage_SessionStorage, __Environment) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const createDeviceModel = ___model_models["createDeviceModel"];
  const UiModel = _interopRequireDefault(__UiModel);
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const AuthenticatedProviderFactory = ___auth_providers_AuthenticatedProviderFactory["AuthenticatedProviderFactory"];
  const XsuaaAuthHelper = ___auth_providers_XsuaaAuthHelper["XsuaaAuthHelper"];
  const SessionStorage = ___auth_storage_SessionStorage["SessionStorage"];
  const Environment = _interopRequireDefault(__Environment);
  const EnvironmentType = __Environment["EnvironmentType"];
  /**
   * @namespace apps.dflc.expensemanager
   */
  const Component = BaseComponent.extend("apps.dflc.expensemanager.Component", {
    constructor: function constructor() {
      BaseComponent.prototype.constructor.apply(this, arguments);
      this._sessionExpiredShown = false;
      this._serviceModelPromise = null;
    },
    metadata: {
      manifest: "json",
      interfaces: ["sap.ui.core.IAsyncContentCreation"]
    },
    init: async function _init() {
      BaseComponent.prototype.init.call(this);
      await XsuaaAuthHelper.loadRuntimeConfig();
      AuthenticationService.initialize(AuthenticatedProviderFactory.create());
      AuthenticationService.onSessionExpired(() => this.handleSessionExpired());
      AuthenticationService.onAuthError(message => this.handleAuthError(message));
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
      this.getRouter().attachBeforeRouteMatched(event => this.handleBeforeRouteMatched(event));
    },
    /**
     * Resolves with the shared OData model once a valid session is available,
     * or with `null` when the user is not authenticated. The provisioning can
     * be retried after a login (the promise is re-armed when it fails).
     */
    ensureServiceModel: function _ensureServiceModel() {
      const current = this.getModel();
      if (current) {
        return Promise.resolve(current);
      }
      if (!this._serviceModelPromise) {
        this._serviceModelPromise = this.provisionServiceModel().then(model => {
          if (!model) {
            this._serviceModelPromise = null;
          }
          return model;
        });
      }
      return this._serviceModelPromise;
    },
    provisionServiceModel: async function _provisionServiceModel() {
      const session = AuthenticationService.getSession();
      if (session?.accessToken && session.expiresAt > Date.now()) {
        this.setServiceModel(session.accessToken);
        return this.getModel();
      }
      const authenticated = await AuthenticationService.isAuthenticated();
      const updated = AuthenticationService.getSession();
      if (authenticated && updated?.accessToken && updated.expiresAt > Date.now()) {
        this.setServiceModel(updated.accessToken);
        return this.getModel();
      }
      return null;
    },
    handleBeforeRouteMatched: function _handleBeforeRouteMatched(event) {
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
    },
    isAuthRequired: function _isAuthRequired() {
      const environment = Environment.current();
      if (environment === EnvironmentType.GITHUB) {
        return true;
      }
      if (environment === EnvironmentType.LOCAL && XsuaaAuthHelper.getConfig().auth) {
        return true;
      }
      return false;
    },
    setServiceModel: function _setServiceModel(accessToken) {
      const config = XsuaaAuthHelper.getConfig();
      const httpHeaders = {};
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
    },
    prepareStandaloneServiceModel: function _prepareStandaloneServiceModel() {
      if (!XsuaaAuthHelper.getConfig().odataService) {
        this.applyManifestServiceUrl();
      }
      this.setServiceModel("");
    },
    applyManifestServiceUrl: function _applyManifestServiceUrl() {
      const manifest = this.getManifestObject();
      const uri = manifest?.get?.("/sap.app/dataSources/mainService/uri");
      if (uri) {
        XsuaaAuthHelper.setServiceUrl(uri);
      }
    },
    handleSessionExpired: function _handleSessionExpired() {
      if (this._sessionExpiredShown) {
        return;
      }
      this._sessionExpiredShown = true;
      SessionStorage.clear();
      const bundle = this.getModel("i18n")?.getResourceBundle();
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
    },
    handleAuthError: function _handleAuthError(message) {
      const bundle = this.getModel("i18n")?.getResourceBundle();
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
  });
  return Component;
});
//# sourceMappingURL=Component-dbg.js.map

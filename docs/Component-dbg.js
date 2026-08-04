sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/model/odata/v4/ODataModel", "sap/m/MessageBox", "./model/models", "./auth/AuthenticationService", "./auth/providers/AuthenticatedProviderFactory", "./auth/providers/XsuaaAuthHelper", "./auth/storage/SessionStorage", "./util/Environment", "sap/ui/model/json/JSONModel"], function (BaseComponent, ODataModel, MessageBox, ___model_models, ___auth_AuthenticationService, ___auth_providers_AuthenticatedProviderFactory, ___auth_providers_XsuaaAuthHelper, ___auth_storage_SessionStorage, __Environment, JSONModel) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const createDeviceModel = ___model_models["createDeviceModel"];
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
    metadata: {
      manifest: "json",
      interfaces: ["sap.ui.core.IAsyncContentCreation"]
    },
    constructor: function _constructor() {
      BaseComponent.prototype.constructor.call(this);
      this._sessionExpiredShown = false;
      this._serviceModelReady = new Promise(resolve => {
        this._resolveServiceModelReady = resolve;
      });
    },
    init: async function _init() {
      // call the base component's init function
      BaseComponent.prototype.init.call(this);
      AuthenticationService.initialize(AuthenticatedProviderFactory.create());
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
        selectedPerson: {
          ID: ""
        },
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
    },
    getServiceModelReady: function _getServiceModelReady() {
      return this._serviceModelReady;
    },
    applyManifestServiceUrl: function _applyManifestServiceUrl() {
      const manifest = this.getManifestObject();
      const uri = manifest?.get?.("/sap.app/dataSources/mainService/uri");
      if (uri) {
        XsuaaAuthHelper.setServiceUrl(uri);
      }
    },
    prepareGithubServiceModel: async function _prepareGithubServiceModel() {
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
    },
    setGithubServiceModel: function _setGithubServiceModel(accessToken) {
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
    },
    attachODataModelSessionGuard: function _attachODataModelSessionGuard(model) {
      model.attachRequestFailed(event => {
        const parameters = event.getParameters();
        const statusCode = parameters?.response?.statusCode;
        if (statusCode === 401 || statusCode === 403) {
          this.handleSessionExpired();
        }
      });
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
    }
  });
  return Component;
});
//# sourceMappingURL=Component-dbg.js.map

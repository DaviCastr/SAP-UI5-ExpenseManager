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
    init: function _init() {
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
    prepareStandaloneServiceModel: function _prepareStandaloneServiceModel() {
      if (!XsuaaAuthHelper.getConfig().odataService) {
        this.applyManifestServiceUrl();
      }
      this.setServiceModel("");
      this._resolveServiceModelReady?.(true);
    },
    bootstrapServiceModel: async function _bootstrapServiceModel() {
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
      this.setModel(model);
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

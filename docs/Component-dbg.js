sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/model/odata/v4/ODataModel", "./model/models", "./auth/AuthenticationService", "./auth/providers/AuthenticatedProviderFactory", "./auth/providers/XsuaaAuthHelper", "./util/Environment", "sap/ui/model/json/JSONModel"], function (BaseComponent, ODataModel, ___model_models, ___auth_AuthenticationService, ___auth_providers_AuthenticatedProviderFactory, ___auth_providers_XsuaaAuthHelper, __Environment, JSONModel) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const createDeviceModel = ___model_models["createDeviceModel"];
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const AuthenticatedProviderFactory = ___auth_providers_AuthenticatedProviderFactory["AuthenticatedProviderFactory"];
  const XsuaaAuthHelper = ___auth_providers_XsuaaAuthHelper["XsuaaAuthHelper"];
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
    init: function _init() {
      // call the base component's init function
      BaseComponent.prototype.init.call(this);
      AuthenticationService.initialize(AuthenticatedProviderFactory.create());

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
    },
    prepareGithubServiceModel: async function _prepareGithubServiceModel() {
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
        } else {
          this.getRouter().navTo("Login");
        }
      } catch (error) {
        this.getRouter().navTo("Login");
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
      this.setModel(model);
    }
  });
  return Component;
});
//# sourceMappingURL=Component-dbg.js.map

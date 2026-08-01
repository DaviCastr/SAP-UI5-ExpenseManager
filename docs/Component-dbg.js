sap.ui.define(["sap/ui/core/UIComponent", "./model/models", "./auth/AuthenticationService", "./auth/providers/AuthenticatedProviderFactory"], function (BaseComponent, ___model_models, ___auth_AuthenticationService, ___auth_providers_AuthenticatedProviderFactory) {
  "use strict";

  const createDeviceModel = ___model_models["createDeviceModel"];
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const AuthenticatedProviderFactory = ___auth_providers_AuthenticatedProviderFactory["AuthenticatedProviderFactory"];
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

      // enable routing
      this.getRouter().initialize();
    }
  });
  return Component;
});
//# sourceMappingURL=Component-dbg.js.map

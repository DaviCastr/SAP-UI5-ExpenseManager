sap.ui.define(["./BaseController", "../auth/AuthenticationService", "../util/Environment", "sap/m/MessageToast", "sap/m/MessageBox"], function (___BaseController, ___auth_AuthenticationService, __Environment, MessageToast, MessageBox) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = ___BaseController["BaseController"];
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const Environment = _interopRequireDefault(__Environment);
  const EnvironmentType = __Environment["EnvironmentType"];
  class Login extends BaseController {
    onInit() {
      void AuthenticationService.isAuthenticated().then(authenticated => {
        if (authenticated) {
          this.navTo("Home");
        }
      }).catch(() => {
        this.showBackendUnavailable();
      });
    }
    async onLogin() {
      try {
        await AuthenticationService.login();
      } catch (error) {
        this.showBackendUnavailable();
        return;
      }
      if (Environment.current() === EnvironmentType.GITHUB || Environment.current() === EnvironmentType.LOCAL) {
        MessageToast.show(this.getText("loginRedirecting"));
        return;
      }
      MessageToast.show(this.getText("loginAwaitBtp"));
    }
    showBackendUnavailable() {
      if (Environment.current() === EnvironmentType.GITHUB) {
        MessageBox.error(this.getText("backendUnavailableLogin"));
      }
    }
  }
  return Login;
});
//# sourceMappingURL=Login-dbg.controller.js.map

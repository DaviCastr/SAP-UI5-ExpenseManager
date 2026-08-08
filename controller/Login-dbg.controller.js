sap.ui.define(["./BaseController", "../auth/AuthenticationService", "../util/Environment", "sap/m/MessageToast"], function (___BaseController, ___auth_AuthenticationService, __Environment, MessageToast) {
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
        this.showToastMessage("loginRedirecting");
        return;
      }
      this.showToastMessage("loginAwaitBtp");
    }

    /**
     * Surfaces backend unavailability on the Login page. Only meaningful in
     * the GitHub Pages demo environment, where the login depends on a live
     * backend.
     */
    showBackendUnavailable() {
      if (Environment.current() === EnvironmentType.GITHUB) {
        this.showErrorMessage("backendUnavailableLogin");
      }
    }
    showToastMessage(messageKey) {
      MessageToast.show(this.getText(messageKey));
    }
  }
  return Login;
});
//# sourceMappingURL=Login-dbg.controller.js.map

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
      });
    }
    async onLogin() {
      await AuthenticationService.login();
      if (Environment.current() === EnvironmentType.GITHUB) {
        MessageToast.show("Redirecionando para a autenticação do XSUAA...");
        return;
      }
      MessageToast.show("Aguarde a autenticação do BTP");
    }
    onSecondaryAction() {
      this.navTo("Home");
    }
  }
  return Login;
});
//# sourceMappingURL=Login-dbg.controller.js.map

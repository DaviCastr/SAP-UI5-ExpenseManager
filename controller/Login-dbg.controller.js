sap.ui.define(["sap/ui/model/json/JSONModel", "sap/m/MessageToast", "./BaseController", "../auth/AuthenticationService", "../auth/providers/XsuaaAuthHelper", "../auth/storage/LoginPreferences"], function (JSONModel, MessageToast, ___BaseController, ___auth_AuthenticationService, ___auth_providers_XsuaaAuthHelper, ___auth_storage_LoginPreferences) {
  "use strict";

  const BaseController = ___BaseController["BaseController"];
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const AuthRequestError = ___auth_providers_XsuaaAuthHelper["AuthRequestError"];
  const LoginPreferences = ___auth_storage_LoginPreferences["LoginPreferences"];
  const LOGIN_ERRORS = {
    invalid_credentials: "loginInvalidCredentials",
    too_many_attempts: "loginTooManyAttempts",
    missing_credentials: "loginRequired",
    backend_unavailable: "backendUnavailableLogin"
  };
  class Login extends BaseController {
    onInit() {
      this.loginModel = new JSONModel(this.initialState());
      this.getView()?.setModel(this.loginModel, "login");
      void AuthenticationService.isAuthenticated().then(authenticated => {
        if (authenticated) {
          this.navTo("Home");
        }
      }).catch(() => {
        this.showBackendUnavailable();
      });
    }
    onTogglePassword() {
      this.loginModel.setProperty("/showPassword", !this.loginModel.getProperty("/showPassword"));
    }

    /**
     * Signs in with the e-mail and password typed on the page, without leaving the app.
     */
    async onPasswordLogin() {
      const {
        email,
        password
      } = this.loginModel.getData();
      if (!this.validate(email, password)) {
        return;
      }
      this.loginModel.setProperty("/error", "");
      this.loginModel.setProperty("/busy", true);
      try {
        await AuthenticationService.loginWithPassword(email.trim(), password);
        LoginPreferences.saveEmail(email.trim());
        this.loginModel.setData(this.initialState());
        this.navTo("Home");
      } catch (error) {
        this.loginModel.setProperty("/password", "");
        this.loginModel.setProperty("/error", this.getText(this.errorKey(error)));
        this.byId("loginPassword")?.focus();
      } finally {
        this.loginModel.setProperty("/busy", false);
      }
    }

    /**
     * Alternative sign-in through the SAP login page (authorization code flow).
     */
    async onLogin() {
      try {
        await AuthenticationService.login();
      } catch (error) {
        this.showBackendUnavailable();
        return;
      }
      MessageToast.show(this.getText("loginRedirecting"));
    }
    validate(email, password) {
      const emailState = email.trim() ? "None" : "Error";
      const passwordState = password ? "None" : "Error";
      this.loginModel.setProperty("/emailState", emailState);
      this.loginModel.setProperty("/passwordState", passwordState);
      return emailState === "None" && passwordState === "None";
    }
    errorKey(error) {
      return error instanceof AuthRequestError ? LOGIN_ERRORS[error.code] ?? "loginFailed" : "loginFailed";
    }
    initialState() {
      return {
        email: LoginPreferences.loadEmail(),
        password: "",
        showPassword: false,
        emailState: "None",
        passwordState: "None",
        error: "",
        busy: false
      };
    }

    /**
     * Surfaces backend unavailability on the Login page.
     */
    showBackendUnavailable() {
      this.showErrorMessage("backendUnavailableLogin");
    }
  }
  return Login;
});
//# sourceMappingURL=Login-dbg.controller.js.map

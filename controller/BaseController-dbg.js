sap.ui.define(["sap/ui/core/mvc/Controller", "sap/ui/core/UIComponent", "sap/m/MessageBox", "../auth/storage/SessionStorage", "../util/http"], function (Controller, UIComponent, MessageBox, ___auth_storage_SessionStorage, ___util_http) {
  "use strict";

  const SessionStorage = ___auth_storage_SessionStorage["SessionStorage"];
  const isSessionExpiredError = ___util_http["isSessionExpiredError"];
  const isBackendUnavailableError = ___util_http["isBackendUnavailableError"];
  /**
   * Common behaviour for every application controller: model access, navigation
   * and a single, centralized way of turning failures into user feedback.
   */
  class BaseController extends Controller {
    _backendErrorShown = false;
    getRouter() {
      return UIComponent.getRouterFor(this);
    }
    navTo(route, parameters) {
      this.getRouter().navTo(route, parameters);
    }
    getResourceBundle() {
      return (this.getOwnerComponent()?.getModel("i18n")).getResourceBundle();
    }
    getText(key, parameters) {
      return this.getResourceBundle().getText(key, parameters) ?? key;
    }

    /**
     * Returns the shared `ui` JSON model of the component.
     *
     * @returns {JSONModel} the component ui model
     */
    getUiModel() {
      return this.getOwnerComponent()?.getModel("ui");
    }

    /**
     * Resolves with the shared OData model once a valid session is available,
     * or `null` when the user is not authenticated.
     *
     * @returns {Promise<ODataModel | null>} the shared service model, or null when not authenticated
     */
    async ensureServiceModel() {
      const component = this.getOwnerComponent();
      if (typeof component?.ensureServiceModel === "function") {
        return component.ensureServiceModel();
      }
      return component?.getModel() ?? null;
    }

    /**
     * Synchronous accessor used by actions that already run with the model in
     * place. Throws when the model is not available yet.
     *
     * @returns {ODataModel} the shared service model
     */
    getServiceModel() {
      const model = this.getOwnerComponent()?.getModel();
      if (!model) {
        throw new Error("O serviço financeiro não está disponível.");
      }
      return model;
    }

    /**
     * Shows a MessageBox for an i18n message key.
     *
     * @param {string} messageKey the i18n key shown in the MessageBox
     * @param {string[]} [parameters] optional parameters for the i18n text
     */
    showErrorMessage(messageKey, parameters) {
      MessageBox.error(this.getText(messageKey, parameters));
    }

    /**
     * Shows a warning MessageBox for an i18n message key.
     *
     * @param {string} messageKey the i18n key shown in the MessageBox
     * @param {string[]} [parameters] optional parameters for the i18n text
     */
    showWarningMessage(messageKey, parameters) {
      MessageBox.warning(this.getText(messageKey, parameters));
    }

    /**
     * Central failure handler. Session-expired errors are handled silently
     * (the global component handler navigates to the Login page); backend
     * unavailability shows the generic connectivity message; every other
     * failure is surfaced with the given i18n message.
     *
     * @param {unknown} error the caught error
     * @param {string} messageKey the i18n key describing the failed action
     * @returns {boolean} true when the error was handled (so callers can `return`)
     */
    handleError(error, messageKey) {
      if (isSessionExpiredError(error)) {
        return true;
      }
      if (isBackendUnavailableError(error)) {
        this.showErrorMessage("backendUnavailable");
        return true;
      }
      this.showErrorMessage(messageKey);
      return true;
    }

    /**
     * Shows the "backend unavailable" flow: it clears the stored session and
     * navigates to the Login page after the user dismisses the message. Guarded
     * so the flow only shows once until the dialog is closed.
     *
     * @param {string} messageKey the i18n key shown in the MessageBox
     */
    showBackendError(messageKey = "backendUnavailable") {
      if (this._backendErrorShown) {
        return;
      }
      this._backendErrorShown = true;
      SessionStorage.clear();
      MessageBox.error(this.getText(messageKey), {
        onClose: () => {
          this._backendErrorShown = false;
          this.navTo("Login");
        }
      });
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.BaseController = BaseController;
  return __exports;
});
//# sourceMappingURL=BaseController-dbg.js.map

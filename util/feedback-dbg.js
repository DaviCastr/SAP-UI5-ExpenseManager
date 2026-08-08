sap.ui.define(["sap/m/MessageBox", "sap/m/MessageToast", "./i18n", "./http"], function (MessageBox, MessageToast, ___i18n, ___http) {
  "use strict";

  const getText = ___i18n["getText"];
  const isSessionExpiredError = ___http["isSessionExpiredError"];
  const isBackendUnavailableError = ___http["isBackendUnavailableError"];
  /**
   * Centralized user feedback for fragment controllers (which are plain object
   * literals and therefore cannot extend BaseController). Keeps the repeated
   * `if (isSessionExpiredError) return; MessageBox.error(...)` blocks in one place.
   */
  function showWarning(view, messageKey) {
    MessageBox.warning(getText(view, messageKey));
  }
  function showToast(view, messageKey) {
    MessageToast.show(getText(view, messageKey));
  }

  /**
   * Handles a failure thrown by an async action:
   * - session-expired and backend-unavailable errors are handled silently
   *   (the app-level handlers own those flows);
   * - everything else is shown with the given i18n message.
   *
   * @param {XMLView} view the view that owns the i18n model
   * @param {unknown} error the caught error
   * @param {string} messageKey the i18n key describing the failed action
   * @returns {boolean} true when the error was handled (so callers can `return`)
   */
  function handleActionError(view, error, messageKey) {
    if (isSessionExpiredError(error) || isBackendUnavailableError(error)) {
      return true;
    }
    MessageBox.error(getText(view, messageKey));
    return true;
  }
  var __exports = {
    __esModule: true
  };
  __exports.showWarning = showWarning;
  __exports.showToast = showToast;
  __exports.handleActionError = handleActionError;
  return __exports;
});
//# sourceMappingURL=feedback-dbg.js.map

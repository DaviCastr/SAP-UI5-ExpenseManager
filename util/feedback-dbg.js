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
   * Extracts the human-readable error message returned by the backend from a
   * UI5 OData V4 model error. Walks the `cause` chain (e.g. errors raised from
   * within a `$batch`) and skips transport-level fallbacks such as
   * "Communication error" and "Network error".
   *
   * @param {unknown} error the caught error
   * @returns {string | undefined} the backend message, or `undefined` when none
   */
  function getBackendErrorMessage(error) {
    const GENERIC = /^(Communication error|Network error)/i;
    const visited = new Set();
    let current = error;
    while (current && !visited.has(current)) {
      visited.add(current);
      const cause = current;
      const parsed = cause.error?.message;
      if (typeof parsed === "string" && parsed.trim()) {
        return parsed;
      }
      if (typeof cause.message === "string" && cause.message.trim() && !GENERIC.test(cause.message)) {
        return cause.message;
      }
      current = cause.cause;
    }
    return undefined;
  }

  /**
   * Handles a failure thrown by an async action:
   * - session-expired and backend-unavailable errors are handled silently
   *   (the app-level handlers own those flows);
   * - everything else is shown with the given i18n message, followed by the
   *   error message returned by the backend (when one is available).
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
    const detail = getBackendErrorMessage(error);
    MessageBox.error(detail ? `${getText(view, messageKey)}\n\n${detail}` : getText(view, messageKey));
    return true;
  }
  var __exports = {
    __esModule: true
  };
  __exports.showWarning = showWarning;
  __exports.showToast = showToast;
  __exports.getBackendErrorMessage = getBackendErrorMessage;
  __exports.handleActionError = handleActionError;
  return __exports;
});
//# sourceMappingURL=feedback-dbg.js.map

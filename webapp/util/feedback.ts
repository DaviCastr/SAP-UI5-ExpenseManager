import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type XMLView from "sap/ui/core/mvc/XMLView";
import { getText } from "./i18n";
import { isSessionExpiredError, isBackendUnavailableError } from "./http";

/**
 * Centralized user feedback for fragment controllers (which are plain object
 * literals and therefore cannot extend BaseController). Keeps the repeated
 * `if (isSessionExpiredError) return; MessageBox.error(...)` blocks in one place.
 */

export function showWarning(view: XMLView, messageKey: string): void {
    MessageBox.warning(getText(view, messageKey));
}

export function showToast(view: XMLView, messageKey: string): void {
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
export function handleActionError(view: XMLView, error: unknown, messageKey: string): boolean {
    if (isSessionExpiredError(error) || isBackendUnavailableError(error)) {
        return true;
    }
    MessageBox.error(getText(view, messageKey));
    return true;
}
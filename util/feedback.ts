import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type XMLView from "sap/ui/core/mvc/XMLView";
import { getText } from "./i18n";
import { isSessionExpiredError, isBackendUnavailableError } from "./http";
import { DraftEditCancelledError, DraftLockedError } from "../service/ODataService";

/**
 * Centralized user feedback for fragment controllers (which are plain object
 * literals and therefore cannot extend BaseController). Keeps the repeated
 * `if (isSessionExpiredError) return; MessageBox.error(...)` blocks in one place.
 */

export function showWarning(view: XMLView, messageKey: string, parameters?: string[]): void {
    MessageBox.warning(getText(view, messageKey, parameters));
}

export function showToast(view: XMLView, messageKey: string, parameters?: string[]): void {
    MessageToast.show(getText(view, messageKey, parameters));
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
const MAX_DETAILS = 6;

interface ErrorDetail {
    message?: unknown;
    target?: unknown;
}

/**
 * Turns the OData error details (e.g. a "Multiple errors occurred" batch
 * answer) into readable lines: one per distinct message and field, so the
 * user sees what failed instead of only the generic summary.
 *
 * @param {ErrorDetail[]} details the `error.details` array of the response
 * @returns {string[]} the readable lines
 */
function describeDetails(details: ErrorDetail[]): string[] {
    const lines = new Set<string>();

    details.forEach((detail) => {
        if (typeof detail.message !== "string" || !detail.message.trim()) {
            return;
        }
        const segments = typeof detail.target === "string"
            ? detail.target.split("/").map((segment) => segment.replace(/\(.*\)$/, "")).filter((segment) => segment && segment !== "in")
            : [];
        const field = segments.slice(-2).join(" › ");
        lines.add(field ? `• ${detail.message} (${field})` : `• ${detail.message}`);
    });

    const all = Array.from(lines);
    return all.length > MAX_DETAILS ? [...all.slice(0, MAX_DETAILS), `• … +${all.length - MAX_DETAILS}`] : all;
}

export function getBackendErrorMessage(error: unknown): string | undefined {
    const GENERIC = /^(Communication error|Network error)/i;
    const visited = new Set<unknown>();
    let current: unknown = error;

    while (current && !visited.has(current)) {
        visited.add(current);
        const cause = current as {
            error?: { message?: unknown; details?: ErrorDetail[] };
            message?: unknown;
            responseText?: string;
            cause?: unknown;
        };

        const parsed = cause.error?.message;
        if (typeof parsed === "string" && parsed.trim()) {
            const details = describeDetails(cause.error?.details ?? []);
            return details.length ? [parsed, ...details].join("\n") : parsed;
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
export function handleActionError(view: XMLView, error: unknown, messageKey: string): boolean {
    if (isSessionExpiredError(error) || isBackendUnavailableError(error) || error instanceof DraftEditCancelledError) {
        return true;
    }

    if (error instanceof DraftLockedError) {
        MessageBox.warning(getText(view, "personLockedByOther", [error.user]));
        return true;
    }

    const detail = getBackendErrorMessage(error);
    MessageBox.error(detail ? `${getText(view, messageKey)}\n\n${detail}` : getText(view, messageKey));
    return true;
}
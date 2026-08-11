import type Event from "sap/ui/base/Event";
import Dialog from "sap/m/Dialog";
import type XMLView from "sap/ui/core/mvc/XMLView";
import type Message from "sap/ui/core/message/Message";
import MessageType from "sap/ui/core/message/MessageType";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { handleActionError, showWarning } from "./feedback";

/**
 * Watches the OData V4 service model's `messageChange` event while a draft-bound
 * dialog is open and turns rejected backend changes into visible feedback:
 *
 * - the backend message (e.g. a validation error) is shown immediately;
 * - the rejected change is reverted (the model "parks" a failed PATCH to retry
 *   it, so it is re-sent by the next submitBatch and fails again - the revert is
 *   deferred until the retry has been registered);
 * - `warnIfBlocked` refuses the Save flow while a rejected change could not be
 *   reverted, so the draft is never activated with the failed change silently
 *   dropped.
 *
 * The `messageChange` event fires on the model itself: it is the message
 * processor of the UI5 messages it creates (`sap.ui.core.Messaging` forwards
 * every report to the affected processors, not to the Messaging singleton).
 */
export interface RejectedChangeGuard {
    /**
     * Starts observing the model's `messageChange` event (idempotent) and resets
     * the rejected state for a new dialog session.
     *
     * @param {Dialog} dialog the draft-bound dialog whose model is observed
     * @param {string} errorKey i18n key shown together with the backend message
     * @param {string} rejectedKey i18n key shown when Save is blocked
     */
    attach(dialog: Dialog, errorKey: string, rejectedKey: string): void;

    /**
     * Stops observing the model; call when the dialog closes so re-opening it
     * does not accumulate handlers.
     */
    detach(): void;

    /**
     * Tells whether a change was rejected by the backend since the dialog was
     * opened and could not be reverted yet.
     *
     * @returns {boolean} whether Save must be blocked
     */
    isBlocked(): boolean;

    /**
     * Shows the blocked-Save warning and tells whether Save must be blocked.
     *
     * @returns {boolean} whether Save must be blocked
     */
    warnIfBlocked(): boolean;

    /**
     * Resets the rejected state (used when preparing a new dialog session or
     * after the rejection was resolved).
     */
    reset(): void;
}

/**
 * Creates a rejected-change guard bound to one dialog session. Each dialog
 * keeps its own guard instance so handlers are not shared between screens.
 *
 * @returns {RejectedChangeGuard} the guard
 */
export function createRejectedChangeGuard(): RejectedChangeGuard {
    let messageChangeModel: ODataModel | undefined;
    let messageChangeListener: ((event: Event) => void) | undefined;
    let view: XMLView | undefined;
    let errorKey = "";
    let rejectedKey = "";
    let rejected = false;

    // The failed PATCH is parked in "$parked.<group>" so it can be retried,
    // which is why it is re-sent by the next submitBatch (in Save) and fails
    // again. The revert is deferred so it runs after the model has registered
    // the parked retry; if it cannot be reverted, `rejected` stays set so Save
    // remains blocked instead of silently dropping the change.
    function revertRejectedChange(model: ODataModel): void {
        void Promise.resolve().then(() => {
            try {
                model.resetChanges();
                rejected = false;
            } catch {
                // keep `rejected` so Save stays blocked
            }
        });
    }

    function onServiceMessageChange(event: Event): void {
        const newMessages = (event.getParameters() as { newMessages?: Message[] }).newMessages;
        if (!Array.isArray(newMessages) || !newMessages.length || !view) {
            return;
        }
        const failure = newMessages.find((message) => message.getType() === MessageType.Error);
        if (!failure) {
            return;
        }
        rejected = true;
        const detail = failure.getMessage();
        handleActionError(view, detail ? new Error(detail) : new Error(), errorKey);
        const model = failure.getMessageProcessor() as ODataModel | undefined;
        if (model) {
            revertRejectedChange(model);
        }
    }

    return {
        attach(dialog, errorKeyParam, rejectedKeyParam) {
            if (messageChangeListener) {
                return;
            }
            const model = dialog.getBindingContext()?.getModel() as ODataModel | undefined;
            if (!model) {
                return;
            }
            rejected = false;
            view = dialog.getParent() as XMLView | undefined;
            errorKey = errorKeyParam;
            rejectedKey = rejectedKeyParam;
            messageChangeListener = (event: Event): void => onServiceMessageChange(event);
            model.attachEvent("messageChange", messageChangeListener);
            messageChangeModel = model;
        },
        detach() {
            if (messageChangeListener && messageChangeModel) {
                messageChangeModel.detachEvent("messageChange", messageChangeListener);
            }
            messageChangeModel = undefined;
            messageChangeListener = undefined;
            view = undefined;
        },
        isBlocked() {
            return rejected;
        },
        warnIfBlocked() {
            if (rejected && view && rejectedKey) {
                showWarning(view, rejectedKey);
            }
            return rejected;
        },
        reset() {
            rejected = false;
        }
    };
}
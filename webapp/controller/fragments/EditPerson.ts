import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import Event from "sap/ui/base/Event";
import FileUploader from "sap/ui/unified/FileUploader";
import Avatar from "sap/m/Avatar";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/Context";
import MessageBox from "sap/m/MessageBox";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { ODataService } from "../../service/ODataService";
import { uploadNow } from "../../util/fileUpload";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { createRejectedChangeGuard } from "../../util/rejectedChanges";
import { ensureDialogDraft, runExclusiveDialogAction } from "../../util/draftDialogFlow";
import type Home from "../../controller/Home.controller";

let personPhoto: File | null = null;

// The FileUploader upload started on photo selection. The save flow awaits it
// so activating the draft can never race a media PUT that is still in flight.
let inflightUpload: Promise<boolean> | null = null;

// Watches the service model's `messageChange` event while the dialog is open so
// rejected backend changes (e.g. field validation) are shown and reverted
// instead of being silently dropped or re-sent by the next submit.
const rejectedGuard = createRejectedChangeGuard();

/**
 * Returns the ID of the person the given dialog is currently bound to.
 *
 * @param {Dialog} dialog the bound edit dialog
 * @returns {string | undefined} the person ID, or `undefined` when unbound
 */
function boundPersonId(dialog: Dialog): string | undefined {
    const context = dialog.getBindingContext() as Context | undefined;
    return (context?.getObject() as { ID?: string } | undefined)?.ID;
}

/**
 * Finds the person edit dialog that contains the given control by walking up
 * the parent chain (the footer buttons may be nested in an HBox).
 *
 * @param {Control} control the control inside the dialog footer
 * @returns {Dialog | undefined} the dialog, or `undefined` when not found
 */
function findPersonDialog(control: Control): Dialog | undefined {
    let current: Control | undefined = control;
    while (current) {
        if (current instanceof Dialog) {
            return current;
        }
        current = current.getParent() as Control | undefined;
    }
    return undefined;
}

/**
 * Detaches the dialog from its OData draft binding (best effort). Called after
 * close/save/discard so a later model refresh does not re-read the draft entity
 * (which may already be activated or discarded) and fail with a 404.
 *
 * @param {Dialog} dialog the bound edit dialog
 */
function releaseDraftBinding(dialog: Dialog): void {
    try {
        dialog.unbindObject();
    } catch {
        // best effort; the binding cleanup must not break the close flow
    }
}

/**
 * Flushes the pending two-way-bound edits of the dialog into its draft (best
 * effort). Used on plain close so an abandoned edit keeps its typed values in
 * the still-open draft.
 *
 * @param {Dialog} dialog the bound edit dialog
 */
function flushPendingEdits(dialog: Dialog): void {
    try {
        void (dialog.getModel() as ODataModel).submitBatch("$auto").catch((error) => console.warn("[flushPendingEdits]", error));
    } catch (error) {
        console.warn("[flushPendingEdits]", error);
    }
}

/**
 * Discards the draft of the given person (after confirmation) and returns to
 * the Home screen. The pending edits are flushed first so no stale PATCH
 * remains queued after the draft is deleted.
 *
 * @param {XMLView} view the owning view
 * @param {Dialog} dialog the bound edit dialog
 * @param {string} id the person ID whose draft should be discarded
 * @returns {Promise<void>} resolves once the draft was discarded
 */
async function discardDraftAndClose(view: XMLView, dialog: Dialog, id: string): Promise<void> {
    // Exclusive so a double click on "Descartar" cannot run the discard twice
    // (the second run would fail on an already deleted draft).
    await runExclusiveDialogAction(dialog, async () => {
        const ui = view.getModel("ui") as JSONModel;
        ui.setProperty("/busy", true);

        try {
            const odata = new ODataService(dialog.getModel() as ODataModel);
            rejectedGuard.suspend();
            await odata.submitPending();
            await odata.discardDraft("Persons", id);

            releaseDraftBinding(dialog);
            dialog.close();
            showToast(view, "personDraftDiscarded");
        } catch (error) {
            handleActionError(view, error, "errorDiscardPersonDraft");
        } finally {
            rejectedGuard.resume();
            ui.setProperty("/busy", false);
        }
    });
}

/**
 * Flushes pending edits, finishes the photo upload and activates the person's
 * draft, closing the dialog on success. The draft is kept on failure so the
 * user can retry or cancel to discard it.
 *
 * @param {XMLView} view the owning view
 * @param {Dialog} dialog the bound edit dialog
 */
async function activatePersonDraft(view: XMLView, dialog: Dialog): Promise<void> {
    const context = dialog.getBindingContext() as Context | undefined;

    if (rejectedGuard.warnIfBlocked()) {
        return;
    }

    rejectedGuard.suspend();
    try {

        (view.getModel("ui") as JSONModel).setProperty("/busy", true);

        if (!context) {
            showWarning(view, "errorMissingPerson");
            return;
        }

        const person = context.getObject() as { ID: string; Name?: string };

        if (!person?.ID || !person.Name) {
            showWarning(view, "errorFillRequiredFields");
            return;
        }

        const odata = new ODataService(context.getModel() as ODataModel);

        // The dialog is bound to the draft entity, so every edited field is
        // already PATCHed to the draft by the two-way binding. Flush any
        // still pending change, finish a new photo upload (retrying it once
        // if the immediate attempt failed), then publish the draft.
        await odata.submitPending();

        const photoUploaded = inflightUpload
            ? await inflightUpload
            : true;
        if (!photoUploaded && personPhoto) {
            const uploader = Fragment.byId("PersonDetail", "editPersonFileUploader") as FileUploader;
            await uploadNow(uploader, odata.getMediaUrl(`Persons(ID='${encodeURIComponent(person.ID)}',IsActiveEntity=false)/Image`));
        }

        await odata.prepareDraft("Persons", person.ID);
        await odata.activateDraft("Persons", person.ID);

        releaseDraftBinding(dialog);
        dialog.close();
        showToast(view, "personUpdated");
    } catch (error) {
        // keep the draft so the user can retry or cancel to discard it
        handleActionError(view, error, "errorUpdatePerson");
    } finally {
        rejectedGuard.resume();
        (view.getModel("ui") as JSONModel).setProperty("/busy", false);
    }
}

const PersonDetail = {
    onDialogBeforeOpen: function (this: Dialog): void {
        personPhoto = null;
        inflightUpload = null;
        (Fragment.byId("PersonDetail", "editPersonFileUploader") as FileUploader)?.setValue("");

        // The dialog always opens in read-only view mode; editing starts only
        // through its own edit action.
        const view = this.getParent() as XMLView | undefined;
        (view?.getModel("ui") as JSONModel | undefined)?.setProperty("/managerDialogInDraft", false);
    },

    // Switches the read-only view into an editable session: the first press
    // creates the person's draft on demand, later presses reuse the open draft.
    onTogglePersonEdit: function (this: Control): void {
        const dialog = findPersonDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;

        if (!dialog || !view) {
            return;
        }

        void runExclusiveDialogAction(dialog, () => ensureDialogDraft(view, dialog, "personEditError"));
    },

    onPhotoChanged: function (event: Event): void {
        const parameters = event.getParameters() as { files?: File[] };
        const files = parameters.files;
        personPhoto = files && files.length > 0 ? files[0] : null;

        if (personPhoto) {
            const reader = new FileReader();
            reader.onload = () => {
                (Fragment.byId("PersonDetail", "editPersonAvatar") as Avatar)?.setSrc(reader.result as string);

                if (personPhoto) {
                    const dialog = findPersonDialog(event.getSource<Control>());
                    const context = dialog?.getBindingContext() as Context | undefined;
                    const personId = (context?.getObject() as { ID?: string } | undefined)?.ID ?? "";
                    const odata = new ODataService(context?.getModel() as ODataModel);

                    if (personId) {

                        // The FileUploader sends the photo itself (raw PUT with the
                        // session's Authorization header) into the person's draft row.
                        const uploader = Fragment.byId("PersonDetail", "editPersonFileUploader") as FileUploader;
                        const upload = uploadNow(uploader,  odata.getMediaUrl(`Persons(ID='${encodeURIComponent(personId)}',IsActiveEntity=false)/Image`));
                        inflightUpload = upload;
                        void upload.finally(() => {
                            if (inflightUpload === upload) {
                                inflightUpload = null;
                            }
                        });
                    }
                }
            };
            reader.readAsDataURL(personPhoto);
        }
    },

    // Cancel: only closes the popup. An open draft (with or without edits) is
    // preserved and kept in the list ("rascunho"), the user can discard it from
    // the popup or from the Home banner.
    onCancelEdit: function (this: Control): void {
        findPersonDialog(this)?.close();
    },

    onDiscardDraft: function (this: Control): void {
        const dialog = findPersonDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const id = dialog ? boundPersonId(dialog) : undefined;

        if (!id || !dialog) {
            return;
        }

        MessageBox.confirm(getText(view as XMLView, "personDraftDiscardConfirm"), {
            title: getText(view as XMLView, "personDraftDiscardTitle"),
            onClose: (action) => {
                if (action === MessageBox.Action.OK) {
                    void discardDraftAndClose(view as XMLView, dialog, id);
                }
            }
        });
    },

    // Runs when the dialog is fully closed (X, Escape, click-away, Cancel or
    // programmatic close). Keeps the draft but detaches the binding so a later
    // model refresh does not re-read a draft that may have been activated or
    // discarded meanwhile. The Home screen is then reloaded so the draft
    // indicator banner reflects the current state (a preserved draft is shown
    // after Cancel; a saved/discarded draft disappears).
    onDialogAfterOpen: function (this: Dialog): void {
        rejectedGuard.attach(this, "personEditError", "personRejectedChanges");
    },

    onDialogAfterClose: function (this: Dialog): void {
        rejectedGuard.detach();
        flushPendingEdits(this);
        releaseDraftBinding(this);

        const view = this.getParent() as XMLView | undefined;
        if (view) {
            void (view.getController() as Home).reload();
        }
    },

    onSavePerson: function (this: Control): void {
        const dialog = findPersonDialog(this);

        if (!dialog) {
            return;
        }

        const view = dialog.getParent() as XMLView;
        void runExclusiveDialogAction(dialog, () => activatePersonDraft(view, dialog));
    }
};

export default PersonDetail;
import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import List from "sap/m/List";
import Avatar from "sap/m/Avatar";
import MessageBox from "sap/m/MessageBox";
import CustomListItem from "sap/m/CustomListItem";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import type FileUploader from "sap/ui/unified/FileUploader";
import type Context from "sap/ui/model/odata/v4/Context";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { ODataService } from "../../service/ODataService";
import {
    deleteRowInDialogDraft,
    ensureDialogDraft,
    runExclusiveDialogAction,
    waitForDraftListBinding
} from "../../util/draftDialogFlow";
import { uploadNow } from "../../util/fileUpload";
import { request } from "../../util/http";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { createRejectedChangeGuard } from "../../util/rejectedChanges";
import type Home from "../../controller/Home.controller";
import type { NewCard } from "../../model/UiModel";

/**
 * Finds the Cards dialog that contains the given control by walking up the
 * parent chain (footer buttons may be nested in an HBox).
 *
 * @param {Control} control the control inside the dialog
 * @returns {Dialog | undefined} the dialog, or `undefined` when not found
 */
function findCardsDialog(control: Control): Dialog | undefined {
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
 * Walks up the parent chain of the given control and returns the first
 * `CustomListItem` found. Used to reach the row of a card from an inner
 * control (delete button, file uploader).
 *
 * @param {Control} control the starting control
 * @returns {CustomListItem | undefined} the containing list item, or `undefined`
 */
function containingListItem(control: Control): CustomListItem | undefined {
    let current: Control | undefined = control;
    while (current) {
        if (current instanceof CustomListItem) {
            return current;
        }
        current = current.getParent() as Control | undefined;
    }
    return undefined;
}

/**
 * Finds the first `Avatar` nested inside the given list item (the row preview).
 *
 * @param {CustomListItem} listItem the card row
 * @returns {Avatar | undefined} the preview avatar, or `undefined`
 */
function findAvatar(listItem: CustomListItem): Avatar | undefined {
    const scan = (control: Control): Avatar | undefined => {
        if (control instanceof Avatar) {
            return control;
        }
        const concrete = control as { getContent?: () => Control[]; getItems?: () => Control[] };
        const children = concrete.getContent?.() ?? concrete.getItems?.() ?? [];
        for (const child of children) {
            const found = scan(child);
            if (found) {
                return found;
            }
        }
        return undefined;
    };
    return scan(listItem);
}

/**
 * Confirms with the user and runs the given callback when confirmed.
 *
 * @param {XMLView} view the owning view
 * @param {string} confirmKey the confirmation message i18n key
 * @param {string} titleKey the confirmation title i18n key
 * @param {CoreFunction} onOk the callback executed on confirmation
 */
function confirmAction(view: XMLView, confirmKey: string, titleKey: string, onOk: () => void): void {
    MessageBox.confirm(getText(view, confirmKey), {
        title: getText(view, titleKey),
        onClose: (action) => {
            if (action === MessageBox.Action.OK) {
                onOk();
            }
        }
    });
}

/**
 * Detaches the dialog from its OData draft binding (best effort). Called after
 * close/save/discard so a later model refresh does not re-read a draft that
 * may already have been activated or discarded (404).
 *
 * @param {Dialog} dialog the bound Cards dialog
 */
function releaseDraftBinding(dialog: Dialog): void {
    try {
        dialog.unbindObject();
    } catch {
        // best effort; unbinding must not break the close flow
    }
}

/**
 * Resets the "new card" form to its defaults.
 *
 * @param {JSONModel} ui the ui model
 */
function resetNewCard(ui: JSONModel): void {
    ui.setProperty("/newCard", { name: "", limit: "", currency: "BRL", closingDay: "3", dueDay: "10" });
}

/**
 * Shows the chosen card photo on the Home dashboard and dialog rows during the
 * draft session. The image only exists locally until the draft is activated, so
 * it is mirrored into the ui model maps that Home binds its avatars to.
 *
 * @param {JSONModel} ui the ui model
 * @param {string} id the card ID
 * @param {string} dataUrl the base64 preview
 */
function previewImageOnHome(ui: JSONModel, id: string, dataUrl: string): void {
    ui.setProperty(`/cardImages/${id}`, dataUrl);
    ui.setProperty(`/dialogCardImages/${id}`, dataUrl);
}

/**
 * Tracks the result of a created entity through the binding's `createCompleted`
 * event. On failure the created context is deleted so the OData V4 model does
 * not keep retrying the rejected create; the backend error message itself is
 * shown by the dialog's `messageChange` listener.
 *
 * @param {ODataListBinding} binding the list binding the entity was created on
 * @param {Context} context the context returned by `create`
 * @param {Function} [onSuccess] optional callback on successful creation
 */
function trackCreate(
    binding: ODataListBinding,
    context: Context,
    onSuccess?: () => void
): void {
    const handler = (event: Event): void => {
        const params = event.getParameters() as { context?: Context; success?: boolean };
        if (params.context !== context) {
            return;
        }
        binding.detachCreateCompleted(handler);
        if (params.success) {
            onSuccess?.();
            return;
        }
        void context.delete().catch(() => undefined);
    };
    binding.attachCreateCompleted(handler);
}

// Watches the service model's `messageChange` event while the dialog is open so
// rejected backend changes (e.g. field validation) are shown and reverted
// instead of being silently dropped or re-sent by the next submit.
const rejectedGuard = createRejectedChangeGuard();

// Photos chosen for rows. They key off the row's OData context and hold the row
// FileUploader (which keeps the chosen file). The photo is uploaded into the
// card's DRAFT row (`IsActiveEntity = false`) as soon as the row has a
// resolvable ID: immediately when an existing row's photo is picked, or on Save
// for rows created in this dialog. Keeping the media inside the draft gives it
// the same semantics as the rest of the tree (a discard reverts the photo too),
// and CAP moves the `cds.LargeBinary` draft data to the active row during
// `draftActivate` (`cds.fiori.move_media_data_in_db`).
const pendingPhotos = new Map<Context, FileUploader>();

// Immediate uploads started on photo selection. The Save flow waits for them so
// activating the draft can never race a media PUT that is still in flight.
const inflightPhotos = new Map<Context, Promise<boolean>>();

/**
 * Uploads one chosen photo into the card's DRAFT row. The draft row is
 * materialized upfront with an idempotent touch (a containment PATCH mimicking
 * the model's draft edits). The image bytes are then sent by the row's
 * FileUploader itself (raw PUT with the session's Authorization header). Rows
 * without a server-side ID yet (created in this dialog) defer the upload to
 * Save.
 *
 * @param {string} personId the ID of the person whose draft owns the cards
 * @param {Context} context the card's OData context
 * @param {FileUploader} uploader the row's file uploader holding the chosen file
 * @param {string} entitySet the entity set holding the card, defaults to "Cards"
 * @returns {Promise<boolean>} whether the photo was uploaded now
 */
async function uploadRowPhoto(personId: string, context: Context, uploader: FileUploader, entitySet = "Cards"): Promise<boolean> {
    let id: string | undefined;
    let name: string | undefined;
    try {
        const obj = context.getObject() as { ID?: string; Name?: string } | undefined;
        id = obj?.ID;
        name = obj?.Name;
    } catch {
        id = undefined;
    }
    if (!id) {
        return false;
    }

    try {
        await request(`Persons(ID='${encodeURIComponent(personId)}',IsActiveEntity=false)/${entitySet}(ID='${encodeURIComponent(id)}')`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Name: name })
        });

        const odata = new ODataService(context.getModel() as ODataModel);
        const uploaded = await uploadNow(uploader, odata.getMediaUrl(`${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`));
        if (uploaded) {
            pendingPhotos.delete(context);
        }
        return uploaded;
    } catch {
        return false;
    }
}

/**
 * Uploads every remaining pending row photo into the card's DRAFT row. Run on
 * Save for the rows that were not uploaded immediately (newly created rows, or
 * rows whose immediate upload failed). If a photo still cannot be uploaded the
 * Save completes anyway and reports the fallback.
 *
 * @param {string} personId the ID of the person whose draft owns the cards
 * @returns {Promise<boolean>} whether at least one photo could not be uploaded
 */
async function uploadPendingPhotos(personId: string): Promise<boolean> {
    let failed = false;
    for (const [context, uploader] of Array.from(pendingPhotos.entries())) {
        const uploaded = await uploadRowPhoto(personId, context, uploader);
        if (!uploaded) {
            failed = true;
        }
    }
    return failed;
}

/**
 * Loads the current photo of every listed card into `ui>/dialogCardImages`
 * (keyed by ID) so the dialog rows show the existing thumbnails. Best effort:
 * when an image cannot be loaded the row falls back to its initials.
 *
 * @param {Dialog} dialog the bound Cards dialog
 * @returns {Promise<void>} resolves once the images were resolved
 */
async function loadRowImages(dialog: Dialog): Promise<void> {
    const binding = (Fragment.byId("Cards", "cardsList") as List | undefined)
        ?.getBinding("items") as ODataListBinding | undefined;
    const view = dialog.getParent() as XMLView;
    const ui = view.getModel("ui") as JSONModel | undefined;

    if (!binding || !ui) {
        return;
    }

    try {
        const contexts = await binding.requestContexts();
        const odata = new ODataService(dialog.getModel() as ODataModel);
        const images: Record<string, string> = {};

        await Promise.all(
            contexts.map(async (context) => {
                const id = (context.getObject() as { ID?: string } | undefined)?.ID;
                if (!id) {
                    return;
                }
                // The dialog is bound to the person draft, so the draft media
                // (IsActiveEntity=false) has precedence, falling back to the
                // active image when the card has no draft media (yet).
                const base64 = await odata.getMediaAsBase64(
                    `Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`
                ) ?? await odata.getMediaAsBase64(
                    `Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=true)/Image`
                );
                if (base64) {
                    images[id] = base64;
                }
            })
        );

        ui.setProperty("/dialogCardImages", images);
    } catch {
        // keep initials; image loading must not break the dialog
    }
}

const Cards = {

    onDialogBeforeOpen: function (): void {
        pendingPhotos.clear();
        inflightPhotos.clear();
        const view = Fragment.byId("Cards", "cardsDialog")?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;
        if (ui) {
            resetNewCard(ui);
            ui.setProperty("/dialogCardImages", {});
            ui.setProperty("/managerDialogInDraft", false);
        }
    },

    /**
     * Adds a new Card row into the selected person's Cards collection. The
     * dialog opens read-only bound to the person's current state, so the
     * person draft is created (when none is open) and the dialog rebound to
     * the draft before the row is created inside it, keeping the change in
     * the same draft as the whole tree.
     *
     * @param {Control} this the pressed add-card button
     */
    onAddCard: async function (this: Control): Promise<void> {
        const dialog = findCardsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;

        if (!dialog || !view || !ui) {
            return;
        }

        const form = ui.getProperty("/newCard") as Partial<NewCard>;
        const name = (form.name ?? "").trim();
        const limit = Number(String(form.limit ?? "").replace(",", "."));
        const closingDay = Number(form.closingDay);
        const dueDay = Number(form.dueDay);

        if (!name || !Number.isFinite(limit) || limit <= 0
            || !Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31
            || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
            showWarning(view, "cardsFillFields");
            return;
        }

        await runExclusiveDialogAction(dialog, async () => {
            if (!(await ensureDialogDraft(view, dialog, "cardsAddError"))) {
                return;
            }

            // Wait until the list binding points at the DRAFT: right after the
            // switch the previous binding (active collection) is still reachable
            // and creating through it fails, leaving a stuck transient row.
            let binding: ODataListBinding | undefined;
            try {
                binding = await waitForDraftListBinding(
                    Fragment.byId("Cards", "cardsList") as List | undefined
                );
            } catch (error) {
                handleActionError(view, error, "cardsAddError");
                return;
            }
            if (!binding) {
                showWarning(view, "cardsLoadError");
                return;
            }

            try {
                const context = binding.create({
                    Name: name,
                    Limit: limit,
                    // eslint-disable-next-line camelcase
                    Currency_code: form.currency,
                    ClosingDay: closingDay,
                    DueDay: dueDay
                });
                trackCreate(binding, context, () => resetNewCard(ui));
            } catch (error) {
                handleActionError(view, error, "cardsAddError");
            }
        });
    },

    /**
     * Enters edit mode: switches the dialog to the person draft binding, which
     * enables the inline editors of every card row (they stay disabled while
     * read-only so no change can hit the active entity).
     *
     * @param {Control} this the pressed edit button
     */
    onToggleCardsEdit: async function (this: Control): Promise<void> {
        const dialog = findCardsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;

        if (!dialog || !view) {
            return;
        }

        await runExclusiveDialogAction(dialog, async () => {
            await ensureDialogDraft(view, dialog, "cardsEditError");
        });
    },

    onRemoveCard: function (this: Control): void {
        const dialog = findCardsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const context = this.getBindingContext() as Context | undefined;
        const card = context?.getObject() as { ID?: string } | undefined;

        if (!dialog || !view || !card?.ID) {
            return;
        }

        if (context) {
            pendingPhotos.delete(context);
            inflightPhotos.delete(context);
        }

        confirmAction(view, "cardsRemoveConfirm", "cardsRemoveTitle", () => {
            void runExclusiveDialogAction(dialog, async () => {
                await deleteRowInDialogDraft({
                    view,
                    dialog,
                    list: Fragment.byId("Cards", "cardsList") as List | undefined,
                    rowId: card.ID as string,
                    errorKey: "cardsRemoveError",
                    missingRowKey: "cardsLoadError"
                });
            });
        });
    },

    /**
     * Shows the chosen photo as a row preview, mirrors it into the ui model so
     * the Home dashboard reflects it during the draft, and uploads it into the
     * card's DRAFT row immediately (for existing rows). Rows created in this
     * dialog have no server-side ID yet, so their photo is deferred to Save.
     * `draftActivate` later moves the media to the active row together with the
     * rest of the draft.
     *
     * @param {Control} this the row's file uploader
     * @param {Event} event the `change` event
     */
    onCardPhotoChanged: function (this: Control, event: Event): void {
        const files = event.getParameters() as { files?: File[] };
        const file = files.files && files.files.length > 0 ? files.files[0] : null;
        if (!file) {
            return;
        }

        const item = containingListItem(this);
        const context = item?.getBindingContext() as Context | undefined;
        if (!item || !context) {
            return;
        }

        pendingPhotos.set(context, this as FileUploader);

        const dialog = findCardsDialog(this);
        const person = dialog?.getBindingContext()?.getObject() as { ID?: string } | undefined;
        if (person?.ID) {
            const upload = uploadRowPhoto(person.ID, context, this as FileUploader);
            inflightPhotos.set(context, upload);
            void upload
                .catch(() => undefined)
                .finally(() => {
                    if (inflightPhotos.get(context) === upload) {
                        inflightPhotos.delete(context);
                    }
                });
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            findAvatar(item)?.setSrc(dataUrl);

            const id = (context.getObject() as { ID?: string } | undefined)?.ID;
            if (!id) {
                return;
            }
            const ui = (dialog?.getParent() as XMLView | undefined)?.getModel("ui") as JSONModel | undefined;
            if (ui) {
                previewImageOnHome(ui, id, dataUrl);
            }
        };
        reader.readAsDataURL(file);
    },

    /**
     * Publishes the Card changes by activating the person draft they live in.
     * The chosen photos are written into the card draft rows first (they share
     * the draft with the field changes), so `draftActivate` moves both the data
     * and the `cds.LargeBinary` media to the active rows. Because Cards are
     * compositions of the person, all the tree changes are contained in that
     * single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveCards: async function (this: Control): Promise<void> {
        const dialog = findCardsDialog(this);

        if (!dialog) {
            return;
        }

        const view = dialog.getParent() as XMLView;
        const context = dialog.getBindingContext() as Context | undefined;

        if (rejectedGuard.warnIfBlocked()) {
            return;
        }

        await runExclusiveDialogAction(dialog, async () => {
            rejectedGuard.suspend();
            try {
                (view.getModel("ui") as JSONModel).setProperty("/busy", true);

                const person = context?.getObject() as { ID?: string } | undefined;
                if (!person?.ID) {
                    showWarning(view, "errorMissingPerson");
                    return;
                }

                const odata = new ODataService(context?.getModel() as ODataModel);
                await odata.submitPending();
                await Promise.allSettled(Array.from(inflightPhotos.values()));
                inflightPhotos.clear();
                const imageFailed = await uploadPendingPhotos(person.ID);
                await odata.prepareDraft("Persons", person.ID);
                await odata.activateDraft("Persons", person.ID);

                releaseDraftBinding(dialog);
                dialog.close();
                showToast(view, "cardsSaved");
                if (imageFailed) {
                    showToast(view, "cardsImageFallback");
                }
            } catch (error) {
                handleActionError(view, error, "cardsSaveError");
            } finally {
                rejectedGuard.resume();
                (view.getModel("ui") as JSONModel).setProperty("/busy", false);
            }
        });
    },

    onDiscardCards: function (this: Control): void {
        const dialog = findCardsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;

        if (!dialog || !view) {
            return;
        }

        confirmAction(view, "cardsDiscardConfirm", "cardsDiscardTitle", () => {
            void runExclusiveDialogAction(dialog, async () => {
                const context = dialog.getBindingContext() as Context | undefined;
                const person = context?.getObject() as { ID?: string } | undefined;
                if (!person?.ID) {
                    showWarning(view, "errorMissingPerson");
                    return;
                }

                try {
                    (view.getModel("ui") as JSONModel).setProperty("/busy", true);
                    const odata = new ODataService(context?.getModel() as ODataModel);
                    rejectedGuard.suspend();
                    await odata.submitPending();
                    await odata.discardDraft("Persons", person.ID);
                    releaseDraftBinding(dialog);
                    dialog.close();
                    showToast(view, "cardsDiscarded");
                } catch (error) {
                    handleActionError(view, error, "cardsDiscardError");
                } finally {
                    rejectedGuard.resume();
                    (view.getModel("ui") as JSONModel).setProperty("/busy", false);
                }
            });
        });
    },

    onCancelCards: function (this: Control): void {
        const dialog = findCardsDialog(this);
        if (!dialog) {
            return;
        }
        releaseDraftBinding(dialog);
        dialog.close();
    },

    onDialogAfterOpen: function (this: Dialog): void {
        rejectedGuard.attach(this, "cardsEditError", "cardsRejectedChanges");
        void loadRowImages(this);
    },

    onDialogAfterClose: function (this: Dialog): void {
        rejectedGuard.detach();
        pendingPhotos.clear();
        inflightPhotos.clear();
        releaseDraftBinding(this);

        const view = this.getParent() as XMLView | undefined;
        if (view) {
            void (view.getController() as Home).reload();
        }
    }
};

export default Cards;
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
import type Context from "sap/ui/model/odata/v4/Context";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { ODataService } from "../../service/ODataService";
import { uploadEntityImage } from "../../util/entityApi";
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

// Photos chosen for rows that do not have a server-side ID yet (new cards are
// only POSTed on Save). They key off the row's OData context, whose ID becomes
// available after `submitPending`, and are uploaded into the draft right before
// the draft is activated.
const pendingPhotos = new Map<Context, File>();

/**
 * Uploads every pending row photo into the card's draft row (`IsActiveEntity =
 * false`). Run after `submitPending` so newly created cards already exist on the
 * backend before their image is PUT.
 *
 * @param {ODataService} odata the service wrapper (used for error propagation)
 * @returns {Promise<void>} resolves once all pending photos were uploaded
 */
async function uploadPendingPhotos(): Promise<void> {
    for (const [context, file] of Array.from(pendingPhotos.entries())) {
        const id = (context.getObject() as { ID?: string } | undefined)?.ID;
        if (!id) {
            continue;
        }
        await uploadEntityImage("Cards", id, false, file);
        pendingPhotos.delete(context);
    }
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
                const base64 = await odata.getMediaAsBase64(
                    `Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`
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
        const view = Fragment.byId("Cards", "cardsDialog")?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;
        if (ui) {
            resetNewCard(ui);
            ui.setProperty("/dialogCardImages", {});
        }
    },

    /**
     * Adds a new Card row into the selected person's Cards collection. The row
     * is created inside the person draft (the dialog is bound to the draft
     * path), so it participates in the same draft as the whole tree.
     *
     * @param {Control} this the pressed add-card button
     */
    onAddCard: function (this: Control): void {
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

        const binding = (Fragment.byId("Cards", "cardsList") as List | undefined)
            ?.getBinding("items") as ODataListBinding | undefined;
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
    },

    onRemoveCard: function (this: Control): void {
        const dialog = findCardsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const context = this.getBindingContext() as Context | undefined;

        if (!dialog || !view || !context) {
            return;
        }

        confirmAction(view, "cardsRemoveConfirm", "cardsRemoveTitle", () => {
            try {
                void context.delete().catch((error) => handleActionError(view, error, "cardsRemoveError"));
            } catch (error) {
                handleActionError(view, error, "cardsRemoveError");
            }
        });
    },

    /**
     * Shows the chosen photo as a row preview and uploads it into the card's
     * draft row. Rows that already have an ID are uploaded immediately; rows
     * created in this session are kept pending and uploaded on Save (their ID
     * only exists after `submitPending`).
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

        pendingPhotos.set(context, file);

        const reader = new FileReader();
        reader.onload = () => {
            findAvatar(item)?.setSrc(reader.result as string);

            const id = (context.getObject() as { ID?: string } | undefined)?.ID;
            if (!id) {
                return;
            }
            void uploadEntityImage("Cards", id, false, file)
                .then(() => {
                    if (pendingPhotos.get(context) === file) {
                        pendingPhotos.delete(context);
                    }
                })
                .catch(() => {
                    // keep the photo pending so Save retries the upload
                });
        };
        reader.readAsDataURL(file);
    },

    /**
     * Publishes the Card changes by activating the person draft they live in.
     * Because Cards are compositions of the person, all the tree changes are
     * contained in that single draft.
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
            await uploadPendingPhotos();
            await odata.prepareDraft("Persons", person.ID);
            await odata.activateDraft("Persons", person.ID);

            releaseDraftBinding(dialog);
            dialog.close();
            showToast(view, "cardsSaved");
        } catch (error) {
            handleActionError(view, error, "cardsSaveError");
        } finally {
            rejectedGuard.resume();
            (view.getModel("ui") as JSONModel).setProperty("/busy", false);
        }
    },

    onDiscardCards: function (this: Control): void {
        const dialog = findCardsDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;

        if (!dialog || !view) {
            return;
        }

        confirmAction(view, "cardsDiscardConfirm", "cardsDiscardTitle", () => {
            void (async () => {
                const context = dialog.getBindingContext() as Context | undefined;
                const person = context?.getObject() as { ID?: string } | undefined;
                if (!person?.ID) {
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
            })();
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
        releaseDraftBinding(this);

        const view = this.getParent() as XMLView | undefined;
        if (view) {
            void (view.getController() as Home).reload();
        }
    }
};

export default Cards;
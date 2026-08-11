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
import { request } from "../../util/http";
import { getText } from "../../util/i18n";
import { handleActionError, showToast, showWarning } from "../../util/feedback";
import { createRejectedChangeGuard } from "../../util/rejectedChanges";
import type Home from "../../controller/Home.controller";

/**
 * Finds the Categories dialog that contains the given control by walking up
 * the parent chain (footer buttons may be nested in an HBox).
 *
 * @param {Control} control the control inside the dialog
 * @returns {Dialog | undefined} the dialog, or `undefined` when not found
 */
function findCategoriesDialog(control: Control): Dialog | undefined {
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
 * `CustomListItem` found. Used to reach the row of a category from an inner
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
 * @param {CustomListItem} listItem the category row
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
 * @param {Dialog} dialog the bound Categories dialog
 */
function releaseDraftBinding(dialog: Dialog): void {
    try {
        dialog.unbindObject();
    } catch {
        // best effort; unbinding must not break the close flow
    }
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

// Photos chosen for rows. They key off the row's OData context and are uploaded
// into the category's DRAFT row (`IsActiveEntity = false`) as soon as the row
// has a resolvable ID: immediately when an existing row's photo is picked, or on
// Save for rows created in this dialog. Keeping the media inside the draft gives
// it the same semantics as the rest of the tree (a discard reverts the photo
// too), and CAP moves the `cds.LargeBinary` draft data to the active row during
// `draftActivate` (`cds.fiori.move_media_data_in_db`).
const pendingPhotos = new Map<Context, File>();

// Immediate uploads started on photo selection. The Save flow waits for them so
// activating the draft can never race a media PUT that is still in flight.
const inflightPhotos = new Map<Context, Promise<boolean>>();

/**
 * Uploads one chosen photo into the category's DRAFT row. The draft row is
 * materialized upfront with an idempotent touch (a containment PATCH mimicking
 * the model's draft edits). Rows without a server-side ID yet (created in this
 * dialog) defer the upload to Save.
 *
 * @param {string} personId the ID of the person whose draft owns the categories
 * @param {Context} context the category's OData context
 * @param {File} file the chosen image file
 * @param {string} entitySet the entity set holding the category, defaults to "Categories"
 * @returns {Promise<boolean>} whether the photo was uploaded now
 */
async function uploadRowPhoto(personId: string, context: Context, file: File, entitySet = "Categories"): Promise<boolean> {
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

        await uploadEntityImage(entitySet, id, false, file);
        pendingPhotos.delete(context);
        return true;
    } catch {
        return false;
    }
}

/**
 * Uploads every remaining pending row photo into the category's DRAFT row. Run
 * on Save for the rows that were not uploaded immediately (newly created rows,
 * or rows whose immediate upload failed). If a photo still cannot be uploaded
 * the Save completes anyway and reports the fallback.
 *
 * @param {string} personId the ID of the person whose draft owns the categories
 * @returns {Promise<boolean>} whether at least one photo could not be uploaded
 */
async function uploadPendingPhotos(personId: string): Promise<boolean> {
    let failed = false;
    for (const [context, file] of Array.from(pendingPhotos.entries())) {
        const uploaded = await uploadRowPhoto(personId, context, file);
        if (!uploaded) {
            failed = true;
        }
    }
    return failed;
}

/**
 * Loads the current photo of every listed category into `ui>/dialogCategoryImages`
 * (keyed by ID) so the dialog rows show the existing thumbnails. Best effort:
 * when an image cannot be loaded the row falls back to its initials.
 *
 * @param {Dialog} dialog the bound Categories dialog
 * @returns {Promise<void>} resolves once the images were resolved
 */
async function loadRowImages(dialog: Dialog): Promise<void> {
    const binding = (Fragment.byId("Categories", "categoriesList") as List | undefined)
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
                // active image when the category has no draft media (yet).
                const base64 = await odata.getMediaAsBase64(
                    `Categories(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`
                ) ?? await odata.getMediaAsBase64(
                    `Categories(ID='${encodeURIComponent(id)}',IsActiveEntity=true)/Image`
                );
                if (base64) {
                    images[id] = base64;
                }
            })
        );

        ui.setProperty("/dialogCategoryImages", images);
    } catch {
        // keep initials; image loading must not break the dialog
    }
}

/**
 * Shows the chosen category photo on the Home dashboard during the draft
 * session. The image only exists locally until the draft is activated, so it is
 * mirrored into the ui model entries that Home binds its category/transaction
 * avatars to.
 *
 * @param {JSONModel} ui the ui model
 * @param {string} id the category ID
 * @param {string} dataUrl the base64 preview
 */
function previewCategoryOnHome(ui: JSONModel, id: string, dataUrl: string): void {
    ui.setProperty(`/dialogCategoryImages/${id}`, dataUrl);

    const categories = (ui.getProperty("/categories") as { ID?: string }[] | undefined) || [];
    const index = categories.findIndex((category) => category.ID === id);
    if (index >= 0) {
        ui.setProperty(`/categories/${index}/CategoryImageBase64`, dataUrl);
    }

    const transactions = (ui.getProperty("/transactions") as { Category?: { ID?: string } }[] | undefined) || [];
    transactions.forEach((transaction, txIndex) => {
        if (transaction.Category?.ID === id) {
            ui.setProperty(`/transactions/${txIndex}/Category/ImageBase64`, dataUrl);
        }
    });
}

const Categories = {

    onDialogBeforeOpen: function (): void {
        pendingPhotos.clear();
        inflightPhotos.clear();
        const view = Fragment.byId("Categories", "categoriesDialog")?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;
        if (ui) {
            ui.setProperty("/newCategory", { name: "" });
            ui.setProperty("/dialogCategoryImages", {});
        }
    },

    /**
     * Adds a new Category row into the selected person's Categories collection.
     * The row is created inside the person draft (the dialog is bound to the
     * draft path), so it participates in the same draft as the whole tree.
     *
     * @param {Control} this the pressed add-category button
     */
    onAddCategory: function (this: Control): void {
        const dialog = findCategoriesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const ui = view?.getModel("ui") as JSONModel | undefined;

        if (!dialog || !view || !ui) {
            return;
        }

        const name = ((ui.getProperty("/newCategory") as { name?: string } | undefined)?.name ?? "").trim();
        if (!name) {
            showWarning(view, "categoriesFillFields");
            return;
        }

        const binding = (Fragment.byId("Categories", "categoriesList") as List | undefined)
            ?.getBinding("items") as ODataListBinding | undefined;
        if (!binding) {
            showWarning(view, "categoriesLoadError");
            return;
        }

        try {
            const context = binding.create({ Name: name });
            trackCreate(binding, context, () => {
                ui.setProperty("/newCategory", { name: "" });
            });
        } catch (error) {
            handleActionError(view, error, "categoriesAddError");
        }
    },

    onRemoveCategory: function (this: Control): void {
        const dialog = findCategoriesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const context = this.getBindingContext() as Context | undefined;

        if (!dialog || !view || !context) {
            return;
        }

        confirmAction(view, "categoriesRemoveConfirm", "categoriesRemoveTitle", () => {
            try {
                void context.delete().catch((error) => handleActionError(view, error, "categoriesRemoveError"));
            } catch (error) {
                handleActionError(view, error, "categoriesRemoveError");
            }
        });
    },

    /**
     * Shows the chosen photo as a row preview, mirrors it into the ui model so
     * the Home dashboard reflects it during the draft, and uploads it into the
     * category's DRAFT row immediately (for existing rows). Rows created in this
     * dialog have no server-side ID yet, so their photo is deferred to Save.
     * `draftActivate` later moves the media to the active row together with the
     * rest of the draft.
     *
     * @param {Control} this the row's file uploader
     * @param {Event} event the `change` event
     */
    onCategoryPhotoChanged: function (this: Control, event: Event): void {
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

        const dialog = findCategoriesDialog(this);
        const person = dialog?.getBindingContext()?.getObject() as { ID?: string } | undefined;
        if (person?.ID) {
            const upload = uploadRowPhoto(person.ID, context, file);
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
            const dialog = findCategoriesDialog(this);
            const ui = (dialog?.getParent() as XMLView | undefined)?.getModel("ui") as JSONModel | undefined;
            if (ui) {
                previewCategoryOnHome(ui, id, dataUrl);
            }
        };
        reader.readAsDataURL(file);
    },

    /**
     * Publishes the Category changes by activating the person draft they live
     * in. The chosen photos are written into the category draft rows first
     * (they share the draft with the field changes), so `draftActivate` moves
     * both the data and the `cds.LargeBinary` media to the active rows.
     * Because Categories are compositions of the person, all the tree changes
     * are contained in that single draft.
     *
     * @param {Control} this the pressed save button
     */
    onSaveCategories: async function (this: Control): Promise<void> {
        const dialog = findCategoriesDialog(this);

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
            await Promise.allSettled(Array.from(inflightPhotos.values()));
            inflightPhotos.clear();
            const imageFailed = await uploadPendingPhotos(person.ID);
            await odata.prepareDraft("Persons", person.ID);
            await odata.activateDraft("Persons", person.ID);

            releaseDraftBinding(dialog);
            dialog.close();
            showToast(view, "categoriesSaved");
            if (imageFailed) {
                showToast(view, "categoriesImageFallback");
            }
        } catch (error) {
            handleActionError(view, error, "categoriesSaveError");
        } finally {
            rejectedGuard.resume();
            (view.getModel("ui") as JSONModel).setProperty("/busy", false);
        }
    },

    onDiscardCategories: function (this: Control): void {
        const dialog = findCategoriesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;

        if (!dialog || !view) {
            return;
        }

        confirmAction(view, "categoriesDiscardConfirm", "categoriesDiscardTitle", () => {
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
                    showToast(view, "categoriesDiscarded");
                } catch (error) {
                    handleActionError(view, error, "categoriesDiscardError");
                } finally {
                    rejectedGuard.resume();
                    (view.getModel("ui") as JSONModel).setProperty("/busy", false);
                }
            })();
        });
    },

    onCancelCategories: function (this: Control): void {
        const dialog = findCategoriesDialog(this);
        if (!dialog) {
            return;
        }
        releaseDraftBinding(dialog);
        dialog.close();
    },

    onDialogAfterOpen: function (this: Dialog): void {
        rejectedGuard.attach(this, "categoriesEditError", "categoriesRejectedChanges");
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

export default Categories;
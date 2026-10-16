import Control from "sap/ui/core/Control";
import List from "sap/m/List";
import Avatar from "sap/m/Avatar";
import MessageBox from "sap/m/MessageBox";
import CustomListItem from "sap/m/CustomListItem";
import Event from "sap/ui/base/Event";
import type FileUploader from "sap/ui/unified/FileUploader";
import type XMLView from "sap/ui/core/mvc/XMLView";
import type Context from "sap/ui/model/odata/v4/Context";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { PersonTab } from "./PersonTab";
import { ODataService } from "../service/ODataService";
import {
    deleteRowInDialogDraft,
    ensureDialogDraft,
    runExclusiveDialogAction,
    waitForDraftListBinding
} from "../util/draftDialogFlow";
import { uploadNow } from "../util/fileUpload";
import { request } from "../util/http";
import { handleActionError, showWarning } from "../util/feedback";
import { createRejectedChangeGuard } from "../util/rejectedChanges";

export interface CollectionTabTexts {
    addError: string;
    editError: string;
    removeError: string;
    loadError: string;
    rejectedChanges: string;
    imageFallback: string;
    removeConfirm: string;
    removeTitle: string;
}

export interface CollectionTabConfig {
    route: string;
    pageId: string;
    listId: string;
    entitySet: string;
    imagesPath?: string;
    texts: CollectionTabTexts;
}

/**
 * Base of the tabs that manage a collection of the selected person (cards,
 * categories…). The tab is bound to the person's current state (the draft
 * when one is open); editing switches it to the person draft, and the changes
 * are saved or discarded with the rest of the draft from the workspace footer.
 * Subclasses describe the collection and build the entry of the "add" form.
 */
export abstract class CollectionTab extends PersonTab {

    protected abstract readonly config: CollectionTabConfig;

    private readonly rejectedGuard = createRejectedChangeGuard();

    protected get tabRoute(): string {
        return this.config.route;
    }

    /**
     * Adds the entry of the "add" form to the collection inside the person
     * draft (created when none is open).
     */
    public async onAdd(): Promise<void> {
        const entry = this.newEntry();

        if (!entry) {
            return;
        }

        const view = this.getView() as XMLView;

        await runExclusiveDialogAction(this.page(), async () => {
            if (!(await this.enterDraft(this.config.texts.addError))) {
                return;
            }

            try {
                const binding = await waitForDraftListBinding(this.list());
                if (!binding) {
                    showWarning(view, this.config.texts.loadError);
                    return;
                }

                this.trackCreate(binding, binding.create(entry));
            } catch (error) {
                handleActionError(view, error, this.config.texts.addError);
            }
        });
    }

    /**
     * Switches the tab to the person draft, which enables the inline editors.
     */
    public async onToggleEdit(): Promise<void> {
        await runExclusiveDialogAction(this.page(), () => this.enterDraft(this.config.texts.editError));
    }

    public onRemove(event: Event): void {
        const context = event.getSource<Control>().getBindingContext() as Context | undefined;
        const row = context?.getObject() as { ID?: string } | undefined;

        if (!row?.ID) {
            return;
        }

        MessageBox.confirm(this.getText(this.config.texts.removeConfirm), {
            title: this.getText(this.config.texts.removeTitle),
            onClose: (action) => {
                if (action !== MessageBox.Action.OK) {
                    return;
                }
                void runExclusiveDialogAction(this.page(), () => deleteRowInDialogDraft({
                    view: this.getView() as XMLView,
                    dialog: this.page(),
                    list: this.list(),
                    rowId: row.ID as string,
                    errorKey: this.config.texts.removeError,
                    missingRowKey: this.config.texts.loadError
                }));
            }
        });
    }

    /**
     * Previews the chosen photo and uploads it into the row's DRAFT entry; the
     * photo becomes active together with the rest of the draft on save.
     *
     * @param {Event} event the file uploader `change` event
     */
    public onPhotoChanged(event: Event): void {
        const uploader = event.getSource<FileUploader>();
        const file = (event.getParameters() as { files?: File[] }).files?.[0];
        const item = this.containingListItem(uploader);
        const context = item?.getBindingContext() as Context | undefined;
        const row = context?.getObject() as { ID?: string; Name?: string } | undefined;

        if (!file || !item || !context || !row?.ID) {
            return;
        }

        const id = row.ID;

        void this.uploadPhoto(id, row.Name, context, uploader).then((uploaded) => {
            if (!uploaded) {
                showWarning(this.getView() as XMLView, this.config.texts.imageFallback);
            }
        });

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            this.findAvatar(item)?.setSrc(dataUrl);
            if (this.config.imagesPath) {
                this.getUiModel().setProperty(`${this.config.imagesPath}/${id}`, dataUrl);
            }
            this.previewPhoto(id, dataUrl);
        };
        reader.readAsDataURL(file);
    }

    /**
     * Validates the "add" form and returns the entry to create, or null after
     * warning the user about missing data.
     */
    protected abstract newEntry(): Record<string, unknown> | null;

    protected abstract resetForm(): void;

    /**
     * Mirrors a newly chosen photo into other parts of the app while the draft
     * is open (optional).
     *
     * @param {string} id the row ID
     * @param {string} dataUrl the photo preview
     */
    protected previewPhoto(id: string, dataUrl: string): void {
        void id;
        void dataUrl;
    }

    protected warn(key: string): void {
        showWarning(this.getView() as XMLView, key);
    }

    protected onTabInit(): void {
        this.resetForm();
    }

    protected onTabActivated(): void {
        this.rejectedGuard.attach(this.page(), this.config.texts.editError, this.config.texts.rejectedChanges);
    }

    protected onTabDeactivated(): void {
        this.rejectedGuard.detach();
    }

    protected showPerson(personId: string): void {
        const workspace = this.workspace();

        if (!personId || !workspace) {
            this.page().unbindObject();
            return;
        }

        this.page().setModel(this.getServiceModel());
        this.page().bindObject(workspace.currentPersonPathFor(personId));
        void this.loadRowImages();
    }

    protected onDraftClosing(): void {
        this.page().unbindObject();
    }

    protected async enterDraft(errorKey: string): Promise<boolean> {
        return ensureDialogDraft(this.getView() as XMLView, this.page(), errorKey);
    }

    /**
     * Resets the "add" form once the row was created; on failure the created
     * context is deleted so the model does not keep retrying it (the backend
     * message is shown by the rejected-change guard).
     *
     * @param {ODataListBinding} binding the list binding the row was created on
     * @param {Context} context the created context
     */
    private trackCreate(binding: ODataListBinding, context: Context): void {
        const handler = (event: Event): void => {
            const params = event.getParameters() as { context?: Context; success?: boolean };
            if (params.context !== context) {
                return;
            }
            binding.detachCreateCompleted(handler);
            if (params.success) {
                this.resetForm();
                return;
            }
            void context.delete().catch(() => undefined);
        };
        binding.attachCreateCompleted(handler);
    }

    /**
     * Uploads the photo into the row's DRAFT entry. The draft row is touched
     * first (containment PATCH) so it exists before the media PUT.
     *
     * @param {string} id the row ID
     * @param {string | undefined} name the row name, sent by the touch PATCH
     * @param {Context} context the row context
     * @param {FileUploader} uploader the row uploader holding the file
     * @returns {Promise<boolean>} whether the photo was uploaded
     */
    private async uploadPhoto(id: string, name: string | undefined, context: Context, uploader: FileUploader): Promise<boolean> {
        const { entitySet } = this.config;
        const personId = this.selectedPersonId();

        try {
            await request(`Persons(ID='${encodeURIComponent(personId)}',IsActiveEntity=false)/${entitySet}(ID='${encodeURIComponent(id)}')`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ Name: name })
            });

            const odata = new ODataService(context.getModel() as ODataModel);
            return await uploadNow(uploader, odata.getMediaUrl(`${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`));
        } catch {
            return false;
        }
    }

    /**
     * Loads the photo of every listed row into the images map of the ui model
     * (draft media first, then the active one). Best effort: rows without a
     * photo keep their initials.
     */
    private async loadRowImages(): Promise<void> {
        const binding = this.list()?.getBinding("items") as ODataListBinding | undefined;
        const { entitySet, imagesPath } = this.config;

        if (!binding || !imagesPath) {
            return;
        }

        try {
            const contexts = await binding.requestContexts();
            const odata = new ODataService(this.getServiceModel());
            const images: Record<string, string> = {};

            await Promise.all(contexts.map(async (context) => {
                const id = (context.getObject() as { ID?: string } | undefined)?.ID;
                if (!id) {
                    return;
                }
                const base64 = await odata.getMediaAsBase64(`${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`)
                    ?? await odata.getMediaAsBase64(`${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=true)/Image`);
                if (base64) {
                    images[id] = base64;
                }
            }));

            this.getUiModel().setProperty(imagesPath, images);
        } catch {
            // keep initials; image loading must not break the tab
        }
    }

    private containingListItem(control: Control): CustomListItem | undefined {
        let current: Control | undefined = control;
        while (current && !(current instanceof CustomListItem)) {
            current = current.getParent() as Control | undefined;
        }
        return current;
    }

    private findAvatar(control: Control): Avatar | undefined {
        if (control instanceof Avatar) {
            return control;
        }
        const container = control as { getContent?: () => Control[]; getItems?: () => Control[] };
        for (const child of container.getContent?.() ?? container.getItems?.() ?? []) {
            const avatar = this.findAvatar(child);
            if (avatar) {
                return avatar;
            }
        }
        return undefined;
    }

    protected page(): Control {
        return this.byId(this.config.pageId) as Control;
    }

    private list(): List | undefined {
        return this.byId(this.config.listId) as List | undefined;
    }

}

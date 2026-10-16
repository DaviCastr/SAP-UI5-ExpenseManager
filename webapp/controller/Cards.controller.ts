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
import { BaseController } from "./BaseController";
import type Home from "./Home.controller";
import type Component from "../Component";
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
import { PERSON_CHANNEL, PERSON_DRAFT_CLOSING, PERSON_SELECTED } from "../util/personEvents";
import type { NewCard } from "../model/UiModel";

/**
 * "Cartões" tab: lists the cards of the selected person and edits them inline
 * inside the person draft. The tab is bound to the person's current state (the
 * draft when one is open); editing switches it to the draft, and the changes
 * are saved or discarded with the rest of the draft from the workspace footer.
 */
export default class Cards extends BaseController {

    private readonly rejectedGuard = createRejectedChangeGuard();

    private active = false;

    public onInit(): void {
        const eventBus = this.getOwnerComponent()?.getEventBus();
        eventBus?.subscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
        eventBus?.subscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
        this.getRouter().attachRouteMatched((event) => this.onRouteMatched(event.getParameter("name") === "Cards"));
        this.onRouteMatched(this.getRouter().getRouteInfoByHash(this.getRouter().getHashChanger().getHash())?.name === "Cards");
        this.resetNewCard();
    }

    public onExit(): void {
        const eventBus = this.getOwnerComponent()?.getEventBus();
        eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
        eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
        this.rejectedGuard.detach();
    }

    /**
     * Adds a new card to the person's Cards collection inside the person draft
     * (created when none is open).
     */
    public async onAddCard(): Promise<void> {
        const page = this.page();
        const view = this.getView() as XMLView;
        const form = this.getUiModel().getProperty("/newCard") as Partial<NewCard>;
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

        await runExclusiveDialogAction(page, async () => {
            if (!(await this.enterDraft("cardsAddError"))) {
                return;
            }

            try {
                const binding = await waitForDraftListBinding(this.byId("cardsList") as List | undefined);
                if (!binding) {
                    showWarning(view, "cardsLoadError");
                    return;
                }

                const context = binding.create({
                    Name: name,
                    Limit: limit,
                    // eslint-disable-next-line camelcase
                    Currency_code: form.currency,
                    ClosingDay: closingDay,
                    DueDay: dueDay
                });
                this.trackCreate(binding, context);
            } catch (error) {
                handleActionError(view, error, "cardsAddError");
            }
        });
    }

    /**
     * Switches the tab to the person draft, which enables the inline editors.
     */
    public async onToggleCardsEdit(): Promise<void> {
        await runExclusiveDialogAction(this.page(), () => this.enterDraft("cardsEditError"));
    }

    public onRemoveCard(event: Event): void {
        const view = this.getView() as XMLView;
        const context = event.getSource<Control>().getBindingContext() as Context | undefined;
        const card = context?.getObject() as { ID?: string } | undefined;

        if (!card?.ID) {
            return;
        }

        MessageBox.confirm(this.getText("cardsRemoveConfirm"), {
            title: this.getText("cardsRemoveTitle"),
            onClose: (action) => {
                if (action !== MessageBox.Action.OK) {
                    return;
                }
                void runExclusiveDialogAction(this.page(), () => deleteRowInDialogDraft({
                    view,
                    dialog: this.page(),
                    list: this.byId("cardsList") as List | undefined,
                    rowId: card.ID as string,
                    errorKey: "cardsRemoveError",
                    missingRowKey: "cardsLoadError"
                }));
            }
        });
    }

    /**
     * Previews the chosen photo and uploads it into the card's DRAFT row; the
     * photo becomes active together with the rest of the draft on save.
     *
     * @param {Event} event the file uploader `change` event
     */
    public onCardPhotoChanged(event: Event): void {
        const uploader = event.getSource<FileUploader>();
        const file = (event.getParameters() as { files?: File[] }).files?.[0];
        const item = this.containingListItem(uploader);
        const context = item?.getBindingContext() as Context | undefined;
        const card = context?.getObject() as { ID?: string; Name?: string } | undefined;

        if (!file || !item || !context || !card?.ID) {
            return;
        }

        void this.uploadPhoto(card.ID, card.Name, context, uploader).then((uploaded) => {
            if (!uploaded) {
                showWarning(this.getView() as XMLView, "cardsImageFallback");
            }
        });

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            this.findAvatar(item)?.setSrc(dataUrl);
            this.getUiModel().setProperty(`/cardImages/${card.ID}`, dataUrl);
            this.getUiModel().setProperty(`/dialogCardImages/${card.ID}`, dataUrl);
        };
        reader.readAsDataURL(file);
    }

    private onRouteMatched(active: boolean): void {
        this.active = active;

        if (!active) {
            this.rejectedGuard.detach();
            return;
        }

        this.onPersonSelected();
        this.rejectedGuard.attach(this.page(), "cardsEditError", "cardsRejectedChanges");
    }

    private readonly onPersonSelected = (): void => {
        const personId = this.selectedPersonId();
        const workspace = this.workspace();

        if (!this.active) {
            return;
        }

        if (!personId || !workspace) {
            this.page().unbindObject();
            return;
        }

        this.page().setModel(this.getServiceModel());
        this.page().bindObject(workspace.currentPersonPathFor(personId));
        void this.loadRowImages();
    };

    private readonly onDraftClosing = (): void => {
        this.page().unbindObject();
    };

    private async enterDraft(errorKey: string): Promise<boolean> {
        return ensureDialogDraft(this.getView() as XMLView, this.page(), errorKey);
    }

    /**
     * Resets the "new card" form once the row was created; on failure the
     * created context is deleted so the model does not keep retrying it (the
     * backend message is shown by the rejected-change guard).
     *
     * @param {ODataListBinding} binding the list binding the card was created on
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
                this.resetNewCard();
                return;
            }
            void context.delete().catch(() => undefined);
        };
        binding.attachCreateCompleted(handler);
    }

    /**
     * Uploads the photo into the card's DRAFT row. The draft row is touched
     * first (containment PATCH) so it exists before the media PUT.
     *
     * @param {string} id the card ID
     * @param {string | undefined} name the card name, sent by the touch PATCH
     * @param {Context} context the card context
     * @param {FileUploader} uploader the row uploader holding the file
     * @returns {Promise<boolean>} whether the photo was uploaded
     */
    private async uploadPhoto(id: string, name: string | undefined, context: Context, uploader: FileUploader): Promise<boolean> {
        const personId = this.selectedPersonId();

        try {
            await request(`Persons(ID='${encodeURIComponent(personId)}',IsActiveEntity=false)/Cards(ID='${encodeURIComponent(id)}')`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ Name: name })
            });

            const odata = new ODataService(context.getModel() as ODataModel);
            return await uploadNow(uploader, odata.getMediaUrl(`Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`));
        } catch {
            return false;
        }
    }

    /**
     * Loads the photo of every listed card into `ui>/dialogCardImages` (draft
     * media first, then the active one). Best effort: rows without a photo
     * keep their initials.
     */
    private async loadRowImages(): Promise<void> {
        const binding = (this.byId("cardsList") as List | undefined)?.getBinding("items") as ODataListBinding | undefined;

        if (!binding) {
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
                const base64 = await odata.getMediaAsBase64(`Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=false)/Image`)
                    ?? await odata.getMediaAsBase64(`Cards(ID='${encodeURIComponent(id)}',IsActiveEntity=true)/Image`);
                if (base64) {
                    images[id] = base64;
                }
            }));

            this.getUiModel().setProperty("/dialogCardImages", images);
        } catch {
            // keep initials; image loading must not break the tab
        }
    }

    private resetNewCard(): void {
        this.getUiModel().setProperty("/newCard", { name: "", limit: "", currency: "BRL", closingDay: "3", dueDay: "10" });
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

    private page(): Control {
        return this.byId("cardsPage") as Control;
    }

    private selectedPersonId(): string {
        return (this.getUiModel().getProperty("/selectedPersonId") as string) || "";
    }

    private workspace(): Home | undefined {
        return (this.getOwnerComponent() as unknown as Component | undefined)?.getWorkspace();
    }
}

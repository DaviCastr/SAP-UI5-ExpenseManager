import Control from "sap/ui/core/Control";
import CustomListItem from "sap/m/CustomListItem";
import List from "sap/m/List";
import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import type XMLView from "sap/ui/core/mvc/XMLView";
import { CollectionTab, type CollectionTabConfig } from "./CollectionTab";
import { deleteRowInDialogDraft, runExclusiveDialogAction, waitForDraftListBinding } from "../util/draftDialogFlow";
import { handleActionError } from "../util/feedback";

interface Option {
    key: string;
    text: string;
}

/**
 * "Compartilhar" tab: users the selected person's data is shared with and,
 * for each one, which entities they can see or change.
 */
export default class Shares extends CollectionTab {

    protected readonly config: CollectionTabConfig = {
        route: "Shares",
        pageId: "sharesPage",
        listId: "sharesList",
        entitySet: "Shares",
        texts: {
            addError: "sharesAddShareError",
            editError: "sharesEditError",
            removeError: "sharesRemoveShareError",
            loadError: "sharesLoadError",
            rejectedChanges: "sharesRejectedChanges",
            imageFallback: "sharesEditError",
            removeConfirm: "sharesRemoveShareConfirm",
            removeTitle: "sharesRemoveShareTitle"
        }
    };

    public optionText(key: number | string | null | undefined, options: Option[] | undefined): string {
        return options?.find((option) => option.key === String(key))?.text ?? "";
    }

    /**
     * Adds the entity/permission chosen below the share to that share, inside
     * the person draft (created when none is open).
     *
     * @param {Event} event the press event of the share's add button
     */
    public async onAddEntity(event: Event): Promise<void> {
        const shareId = this.shareIdOf(event.getSource<Control>());
        const ui = this.getUiModel();
        const view = this.getView() as XMLView;

        await runExclusiveDialogAction(this.page(), async () => {
            if (!(await this.enterDraft("sharesAddEntityError"))) {
                return;
            }

            try {
                const binding = await waitForDraftListBinding(() => this.entitiesListOf(shareId));
                if (!binding) {
                    this.warn("sharesLoadError");
                    return;
                }

                this.trackCreate(binding, binding.create({
                    Entity: Number(ui.getProperty("/newShare/entity") ?? 1),
                    Permission: Number(ui.getProperty("/newShare/permission") ?? 1)
                }), () => undefined);
            } catch (error) {
                handleActionError(view, error, "sharesAddEntityError");
            }
        });
    }

    public onRemoveEntity(event: Event): void {
        const source = event.getSource<Control>();
        const entity = source.getBindingContext()?.getObject() as { ID?: string } | undefined;
        const shareId = this.shareIdOf(source);

        if (!entity?.ID) {
            return;
        }

        MessageBox.confirm(this.getText("sharesRemoveEntityConfirm"), {
            title: this.getText("sharesRemoveEntityTitle"),
            onClose: (action) => {
                if (action !== MessageBox.Action.OK) {
                    return;
                }
                void runExclusiveDialogAction(this.page(), () => deleteRowInDialogDraft({
                    view: this.getView() as XMLView,
                    dialog: this.page(),
                    list: () => this.entitiesListOf(shareId),
                    rowId: entity.ID as string,
                    errorKey: "sharesRemoveEntityError",
                    missingRowKey: "sharesLoadError"
                }));
            }
        });
    }

    protected newEntry(): Record<string, unknown> | null {
        const user = ((this.getUiModel().getProperty("/newShare/shareUser") as string | undefined) ?? "").trim();

        if (!user) {
            this.warn("sharesUserRequired");
            return null;
        }

        return { User: user };
    }

    protected resetForm(): void {
        this.getUiModel().setProperty("/newShare", { shareUser: "", entity: "1", permission: "1" });
    }

    /**
     * Returns the ID of the share whose tile contains the control.
     *
     * @param {Control} control a control inside a share tile
     * @returns {string | undefined} the share ID
     */
    private shareIdOf(control: Control): string | undefined {
        let current: Control | undefined = control;

        while (current) {
            if (current instanceof CustomListItem && current.getParent() === this.list()) {
                return (current.getBindingContext()?.getObject() as { ID?: string } | undefined)?.ID;
            }
            current = current.getParent() as Control | undefined;
        }

        return undefined;
    }

    /**
     * Resolves the LIVE entities list of the share: switching to the draft
     * recreates the tiles, so it must be looked up again on every poll.
     *
     * @param {string | undefined} shareId the share ID
     * @returns {List | undefined} the entities list of that share
     */
    private entitiesListOf(shareId: string | undefined): List | undefined {
        const tile = this.list()?.getItems().find((item) =>
            (item.getBindingContext()?.getObject() as { ID?: string } | undefined)?.ID === shareId);

        return tile?.findAggregatedObjects(true).find((control): control is List => control instanceof List);
    }
}

import { BaseController } from "./BaseController";
import type Home from "./Home.controller";
import type Component from "../Component";
import { PERSON_CHANNEL, PERSON_DRAFT_CLOSING, PERSON_SELECTED } from "../util/personEvents";

/**
 * Base of the tab views that show data of the person selected in the
 * workspace (Home). The tab only loads while its route is active, reloads
 * whenever the workspace announces a new selection (or a reload), and is told
 * when the person draft is about to be saved or discarded.
 */
export abstract class PersonTab extends BaseController {

    protected abstract readonly tabRoute: string;

    private active = false;

    public onInit(): void {
        const eventBus = this.getOwnerComponent()?.getEventBus();
        eventBus?.subscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
        eventBus?.subscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosingEvent);

        this.onTabInit();

        const router = this.getRouter();
        router.attachRouteMatched((event) => this.setActive(event.getParameter("name") === this.tabRoute));
        this.setActive(router.getRouteInfoByHash(router.getHashChanger().getHash())?.name === this.tabRoute);
    }

    public onExit(): void {
        const eventBus = this.getOwnerComponent()?.getEventBus();
        eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
        eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosingEvent);
        this.onTabDeactivated();
    }

    /**
     * Loads the tab for the selected person (empty when none is selected).
     */
    protected abstract showPerson(personId: string): void;

    protected onTabInit(): void {
        // optional hook
    }

    protected onTabActivated(): void {
        // optional hook
    }

    protected onTabDeactivated(): void {
        // optional hook
    }

    protected onDraftClosing(): void {
        // optional hook
    }

    protected selectedPersonId(): string {
        return (this.getUiModel().getProperty("/selectedPersonId") as string) || "";
    }

    protected workspace(): Home | undefined {
        return (this.getOwnerComponent() as unknown as Component | undefined)?.getWorkspace();
    }

    private setActive(active: boolean): void {
        if (this.active === active && !active) {
            return;
        }

        this.active = active;

        if (!active) {
            this.onTabDeactivated();
            return;
        }

        this.onPersonSelected();
        this.onTabActivated();
    }

    private readonly onPersonSelected = (): void => {
        if (this.active) {
            this.showPerson(this.selectedPersonId());
        }
    };

    private readonly onDraftClosingEvent = (): void => {
        this.onDraftClosing();
    };
}

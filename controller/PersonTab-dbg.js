sap.ui.define(["./BaseController", "../util/personEvents"], function (___BaseController, ___util_personEvents) {
  "use strict";

  const BaseController = ___BaseController["BaseController"];
  const PERSON_CHANNEL = ___util_personEvents["PERSON_CHANNEL"];
  const PERSON_DRAFT_CLOSING = ___util_personEvents["PERSON_DRAFT_CLOSING"];
  const PERSON_SELECTED = ___util_personEvents["PERSON_SELECTED"];
  /**
   * Base of the tab views that show data of the person selected in the
   * workspace (Home). The tab only loads while its route is active, reloads
   * whenever the workspace announces a new selection (or a reload), and is told
   * when the person draft is about to be saved or discarded.
   */
  class PersonTab extends BaseController {
    active = false;
    onInit() {
      const eventBus = this.getOwnerComponent()?.getEventBus();
      eventBus?.subscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
      eventBus?.subscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosingEvent);
      this.onTabInit();
      const router = this.getRouter();
      router.attachRouteMatched(event => this.setActive(event.getParameter("name") === this.tabRoute));
      this.setActive(router.getRouteInfoByHash(router.getHashChanger().getHash())?.name === this.tabRoute);
    }
    onExit() {
      const eventBus = this.getOwnerComponent()?.getEventBus();
      eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
      eventBus?.unsubscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosingEvent);
      this.onTabDeactivated();
    }

    /**
     * Loads the tab for the selected person (empty when none is selected).
     */

    onTabInit() {
      // optional hook
    }
    onTabActivated() {
      // optional hook
    }
    onTabDeactivated() {
      // optional hook
    }
    onDraftClosing() {
      // optional hook
    }
    selectedPersonId() {
      return this.getUiModel().getProperty("/selectedPersonId") || "";
    }
    workspace() {
      return this.getOwnerComponent()?.getWorkspace();
    }
    setActive(active) {
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
    onPersonSelected = () => {
      if (this.active) {
        this.showPerson(this.selectedPersonId());
      }
    };
    onDraftClosingEvent = () => {
      this.onDraftClosing();
    };
  }
  var __exports = {
    __esModule: true
  };
  __exports.PersonTab = PersonTab;
  return __exports;
});
//# sourceMappingURL=PersonTab-dbg.js.map

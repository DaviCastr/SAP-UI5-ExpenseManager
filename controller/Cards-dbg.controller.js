sap.ui.define(["./CollectionTab"], function (___CollectionTab) {
  "use strict";

  const CollectionTab = ___CollectionTab["CollectionTab"];
  const MIN_DAY = 1;
  const MAX_DAY = 31;

  /**
   * "Cartões" tab: the cards of the selected person.
   */
  class Cards extends CollectionTab {
    config = {
      route: "Cards",
      pageId: "cardsPage",
      listId: "cardsList",
      entitySet: "Cards",
      imagesPath: "/dialogCardImages",
      texts: {
        addError: "cardsAddError",
        editError: "cardsEditError",
        removeError: "cardsRemoveError",
        loadError: "cardsLoadError",
        rejectedChanges: "cardsRejectedChanges",
        imageFallback: "cardsImageFallback",
        removeConfirm: "cardsRemoveConfirm",
        removeTitle: "cardsRemoveTitle"
      }
    };
    newEntry() {
      const form = this.getUiModel().getProperty("/newCard");
      const name = (form.name ?? "").trim();
      const limit = Number(String(form.limit ?? "").replace(",", "."));
      const closingDay = Number(form.closingDay);
      const dueDay = Number(form.dueDay);
      if (!name || !Number.isFinite(limit) || limit <= 0 || !this.isDay(closingDay) || !this.isDay(dueDay)) {
        this.warn("cardsFillFields");
        return null;
      }
      return {
        Name: name,
        Limit: limit,
        // eslint-disable-next-line camelcase
        Currency_code: form.currency,
        ClosingDay: closingDay,
        DueDay: dueDay
      };
    }
    resetForm() {
      this.getUiModel().setProperty("/newCard", {
        name: "",
        limit: "",
        currency: "BRL",
        closingDay: "3",
        dueDay: "10"
      });
    }
    previewPhoto(id, dataUrl) {
      this.getUiModel().setProperty(`/cardImages/${id}`, dataUrl);
    }
    isDay(day) {
      return Number.isInteger(day) && day >= MIN_DAY && day <= MAX_DAY;
    }
  }
  return Cards;
});
//# sourceMappingURL=Cards-dbg.controller.js.map

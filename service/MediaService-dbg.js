sap.ui.define(["../util/http"], function (___util_http) {
  "use strict";

  const buildHeaders = ___util_http["buildHeaders"];
  const getOdataServiceUrl = ___util_http["getOdataServiceUrl"];
  /**
   * Loads the entity images and stores them as data/base64 URLs in the `ui`
   * model. The images are requested through the authenticated OData model (or a
   * fetch with the session token) so the Avatar controls render them without a
   * browser request that would lack the Authorization header.
   */
  class MediaService {
    constructor(odata, ui) {
      this.odata = odata;
      this.ui = ui;
    }

    /**
     * Resolves the image of each distinct category and stores its base64
     * representation both in the transaction rows and in the categories list.
     *
     * @param {TransactionRow[]} transactions the transactions whose Category/ImagePath is resolved
     */
    async resolveCategoryImages(transactions) {
      const byId = new Map();
      transactions.forEach((transaction, index) => {
        const category = transaction.Category;
        if (!category) {
          return;
        }
        const entry = byId.get(category.ID) || {
          path: category.ImagePath,
          txIndexes: []
        };
        entry.txIndexes.push(index);
        byId.set(category.ID, entry);
      });
      const categories = this.ui.getProperty("/categories") || [];
      const catIndex = new Map();
      categories.forEach((category, index) => catIndex.set(category.ID, index));
      await Promise.all(Array.from(byId.entries()).map(async ([categoryId, entry]) => {
        const base64 = await this.odata.getMediaAsBase64(entry.path);
        if (!base64) {
          return;
        }
        for (const txIndex of entry.txIndexes) {
          this.ui.setProperty(`/transactions/${txIndex}/Category/ImageBase64`, base64);
        }
        const index = catIndex.get(categoryId);
        if (index !== undefined) {
          this.ui.setProperty(`/categories/${index}/CategoryImageBase64`, base64);
        }
      }));
    }

    /**
     * Resolves the image of each card and stores its base64 representation in
     * the `ui>/cardImages` map (keyed by card ID).
     *
     * @param {CardMediaSource[]} cards the cards whose images are resolved
     */
    async resolveCardImages(cards) {
      const images = {};
      await Promise.all(cards.map(async card => {
        const mediaPath = `Cards(ID='${encodeURIComponent(card.ID)}',IsActiveEntity=true)/Image`;
        const base64 = await this.odata.getMediaAsBase64(mediaPath);
        if (base64) {
          images[card.ID] = base64;
        }
      }));
      this.ui.setProperty("/cardImages", images);
    }

    /**
     * Resolves the avatar of the currently selected person to an object URL.
     *
     * When `preferDraft` is set, the draft media (`IsActiveEntity=false`) is
     * tried first — this is what the edit dialog shows — falling back to the
     * active entity image when the draft has not been given its own photo yet.
     *
     * @param {UiPersonMedia} person the selected person metadata
     * @param {boolean} [preferDraft] try the draft image before the active one
     */
    async resolvePersonImage(person, preferDraft = false) {
      if (!person?.ID || !person.ImageType) {
        this.ui.setProperty("/selectedPersonImage", "");
        return;
      }
      const states = preferDraft ? [false, true] : [true];
      for (const isActiveEntity of states) {
        try {
          const url = `${getOdataServiceUrl()}Persons(ID='${encodeURIComponent(person.ID)}',IsActiveEntity=${isActiveEntity})/Image`;
          const response = await fetch(url, {
            headers: buildHeaders({})
          });
          if (!response.ok) {
            continue;
          }
          const blob = await response.blob();
          this.ui.setProperty("/selectedPersonImage", URL.createObjectURL(blob));
          return;
        } catch {
          // try the next state / leave the initials in place
        }
      }
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.MediaService = MediaService;
  return __exports;
});
//# sourceMappingURL=MediaService-dbg.js.map

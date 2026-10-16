sap.ui.define(["./CollectionTab"], function (___CollectionTab) {
  "use strict";

  const CollectionTab = ___CollectionTab["CollectionTab"];
  /**
   * "Categorias" tab: the spending categories of the selected person.
   */
  class Categories extends CollectionTab {
    config = {
      route: "Categories",
      pageId: "categoriesPage",
      listId: "categoriesList",
      entitySet: "Categories",
      imagesPath: "/dialogCategoryImages",
      texts: {
        addError: "categoriesAddError",
        editError: "categoriesEditError",
        removeError: "categoriesRemoveError",
        loadError: "categoriesLoadError",
        rejectedChanges: "categoriesRejectedChanges",
        imageFallback: "categoriesImageFallback",
        removeConfirm: "categoriesRemoveConfirm",
        removeTitle: "categoriesRemoveTitle"
      }
    };
    newEntry() {
      const name = (this.getUiModel().getProperty("/newCategory")?.name ?? "").trim();
      if (!name) {
        this.warn("categoriesFillFields");
        return null;
      }
      return {
        Name: name
      };
    }
    resetForm() {
      this.getUiModel().setProperty("/newCategory", {
        name: ""
      });
    }

    /**
     * Shows the new photo on the overview (categories breakdown and movements)
     * while the draft is open.
     *
     * @param {string} id the category ID
     * @param {string} dataUrl the photo preview
     */
    previewPhoto(id, dataUrl) {
      const ui = this.getUiModel();
      const categories = ui.getProperty("/categories") ?? [];
      const index = categories.findIndex(category => category.ID === id);
      if (index >= 0) {
        ui.setProperty(`/categories/${index}/CategoryImageBase64`, dataUrl);
      }
      const transactions = ui.getProperty("/transactions") ?? [];
      transactions.forEach((transaction, txIndex) => {
        if (transaction.Category?.ID === id) {
          ui.setProperty(`/transactions/${txIndex}/Category/ImageBase64`, dataUrl);
        }
      });
    }
  }
  return Categories;
});
//# sourceMappingURL=Categories-dbg.controller.js.map

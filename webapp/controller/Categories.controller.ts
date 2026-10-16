import { CollectionTab, type CollectionTabConfig } from "./CollectionTab";

/**
 * "Categorias" tab: the spending categories of the selected person.
 */
export default class Categories extends CollectionTab {

    protected readonly config: CollectionTabConfig = {
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

    protected newEntry(): Record<string, unknown> | null {
        const name = ((this.getUiModel().getProperty("/newCategory") as { name?: string } | undefined)?.name ?? "").trim();

        if (!name) {
            this.warn("categoriesFillFields");
            return null;
        }

        return { Name: name };
    }

    protected resetForm(): void {
        this.getUiModel().setProperty("/newCategory", { name: "" });
    }

    /**
     * Shows the new photo on the overview (categories breakdown and movements)
     * while the draft is open.
     *
     * @param {string} id the category ID
     * @param {string} dataUrl the photo preview
     */
    protected previewPhoto(id: string, dataUrl: string): void {
        const ui = this.getUiModel();
        const categories = (ui.getProperty("/categories") as { ID?: string }[] | undefined) ?? [];
        const index = categories.findIndex((category) => category.ID === id);

        if (index >= 0) {
            ui.setProperty(`/categories/${index}/CategoryImageBase64`, dataUrl);
        }

        const transactions = (ui.getProperty("/transactions") as { Category?: { ID?: string } }[] | undefined) ?? [];
        transactions.forEach((transaction, txIndex) => {
            if (transaction.Category?.ID === id) {
                ui.setProperty(`/transactions/${txIndex}/Category/ImageBase64`, dataUrl);
            }
        });
    }
}

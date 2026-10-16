import { CollectionTab, type CollectionTabConfig } from "./CollectionTab";
import type { NewCard } from "../model/UiModel";

const MIN_DAY = 1;
const MAX_DAY = 31;

/**
 * "Cartões" tab: the cards of the selected person.
 */
export default class Cards extends CollectionTab {

    protected readonly config: CollectionTabConfig = {
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

    protected newEntry(): Record<string, unknown> | null {
        const form = this.getUiModel().getProperty("/newCard") as Partial<NewCard>;
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

    protected resetForm(): void {
        this.getUiModel().setProperty("/newCard", { name: "", limit: "", currency: "BRL", closingDay: "3", dueDay: "10" });
    }

    protected previewPhoto(id: string, dataUrl: string): void {
        this.getUiModel().setProperty(`/cardImages/${id}`, dataUrl);
    }

    private isDay(day: number): boolean {
        return Number.isInteger(day) && day >= MIN_DAY && day <= MAX_DAY;
    }
}

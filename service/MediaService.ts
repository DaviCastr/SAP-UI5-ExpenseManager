import JSONModel from "sap/ui/model/json/JSONModel";
import { ODataService } from "./ODataService";
import { buildHeaders, getOdataServiceUrl } from "../util/http";

export interface TransactionMediaSource {
    Category?: { ID: string; Name: string; ImagePath?: string };
}

export interface CardMediaSource {
    ID: string;
    Name: string;
}

export interface UiPersonMedia {
    ID: string;
    ImageType?: string;
}

interface CategoryImageEntry {
    path?: string;
    txIndexes: number[];
}

/**
 * Loads the entity images and stores them as data/base64 URLs in the `ui`
 * model. The images are requested through the authenticated OData model (or a
 * fetch with the session token) so the Avatar controls render them without a
 * browser request that would lack the Authorization header.
 */
export class MediaService {

    private readonly odata: ODataService;
    private readonly ui: JSONModel;

    public constructor(odata: ODataService, ui: JSONModel) {
        this.odata = odata;
        this.ui = ui;
    }

    /**
     * Resolves the image of each distinct category and stores its base64
     * representation both in the transaction rows and in the categories list.
     *
     * @param {TransactionRow[]} transactions the transactions whose Category/ImagePath is resolved
     */
    public async resolveCategoryImages(transactions: { Category?: { ID: string; Name: string; ImagePath?: string } }[]): Promise<void> {
        const byId = new Map<string, CategoryImageEntry>();

        transactions.forEach((transaction, index) => {
            const category = transaction.Category;
            if (!category) {
                return;
            }
            const entry = byId.get(category.ID) || { path: category.ImagePath, txIndexes: [] };
            entry.txIndexes.push(index);
            byId.set(category.ID, entry);
        });

        const categories = (this.ui.getProperty("/categories") as { ID: string }[] | undefined) || [];
        const catIndex = new Map<string, number>();
        categories.forEach((category, index) => catIndex.set(category.ID, index));

        await Promise.all(
            Array.from(byId.entries()).map(async ([categoryId, entry]) => {
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
            })
        );
    }

    /**
     * Resolves the image of each card and stores its base64 representation in
     * the `ui>/cardImages` map (keyed by card ID).
     *
     * @param {CardMediaSource[]} cards the cards whose images are resolved
     */
    public async resolveCardImages(cards: CardMediaSource[]): Promise<void> {
        const images: Record<string, string> = {};

        await Promise.all(
            cards.map(async (card) => {
                const mediaPath = `Cards(ID='${encodeURIComponent(card.ID)}',IsActiveEntity=true)/Image`;
                const base64 = await this.odata.getMediaAsBase64(mediaPath);
                if (base64) {
                    images[card.ID] = base64;
                }
            })
        );

        this.ui.setProperty("/cardImages", images);
    }

    /**
     * Resolves the avatar of the currently selected person to an object URL.
     *
     * @param {UiPersonMedia} person the selected person metadata
     */
    public async resolvePersonImage(person: UiPersonMedia): Promise<void> {
        if (!person?.ID || !person.ImageType) {
            this.ui.setProperty("/selectedPersonImage", "");
            return;
        }

        try {
            const url = `${getOdataServiceUrl()}Persons(ID='${encodeURIComponent(person.ID)}',IsActiveEntity=true)/Image`;
            const response = await fetch(url, { headers: buildHeaders({}) });

            if (!response.ok) {
                return;
            }

            const blob = await response.blob();
            this.ui.setProperty("/selectedPersonImage", URL.createObjectURL(blob));
        } catch {
            // avatar stays with initials when the image cannot be loaded
        }
    }
}
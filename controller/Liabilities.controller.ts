import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import type XMLView from "sap/ui/core/mvc/XMLView";
import { CollectionTab, type CollectionTabConfig } from "./CollectionTab";
import { runExclusiveDialogAction } from "../util/draftDialogFlow";
import { handleActionError } from "../util/feedback";
import type { NewLiability } from "../model/UiModel";

const MIN_DAY = 1;
const MAX_DAY = 31;

/**
 * "Dívidas" tab: the debts of the selected person. Each debt is edited on its
 * own (edit button of the tile); its movements open in the shared dialog.
 */
export default class Liabilities extends CollectionTab {

    protected readonly config: CollectionTabConfig = {
        route: "Liabilities",
        pageId: "liabilitiesPage",
        listId: "liabilitiesList",
        entitySet: "Liabilities",
        texts: {
            addError: "liabilitiesAddError",
            editError: "liabilitiesEditError",
            removeError: "liabilitiesRemoveError",
            loadError: "liabilitiesLoadError",
            rejectedChanges: "liabilitiesRejectedChanges",
            imageFallback: "liabilitiesEditError",
            removeConfirm: "liabilitiesRemoveConfirm",
            removeTitle: "liabilitiesRemoveTitle"
        }
    };

    /**
     * Opens the edit form of the debt (entering the person draft first) or
     * closes it when it is already open.
     *
     * @param {Event} event the press event of the tile button
     */
    public onToggleRowEdit(event: Event): void {
        const liability = event.getSource<Control>().getBindingContext()?.getObject() as { ID?: string } | undefined;
        const ui = this.getUiModel();

        if (!liability?.ID) {
            return;
        }

        if (ui.getProperty("/liabilityEditId") === liability.ID) {
            ui.setProperty("/liabilityEditId", "");
            return;
        }

        void runExclusiveDialogAction(this.page(), async () => {
            if (await this.enterDraft("liabilitiesEditError")) {
                ui.setProperty("/liabilityEditId", liability.ID as string);
            }
        });
    }

    public onViewTransactions(event: Event): void {
        const liability = event.getSource<Control>().getBindingContext()?.getObject() as { ID?: string } | undefined;

        if (!liability?.ID) {
            return;
        }

        void this.workspace()?.openLiabilityTransactions(liability.ID)
            .catch((error) => handleActionError(this.getView() as XMLView, error, "liabilityTransactionsOpenError"));
    }

    protected newEntry(): Record<string, unknown> | null {
        const form = this.getUiModel().getProperty("/newLiability") as Partial<NewLiability>;
        const name = (form.name ?? "").trim();
        const totalAmount = Number(String(form.totalAmount ?? "").replace(",", "."));
        const dueDay = Number(form.dueDay);

        if (!name || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(dueDay) || dueDay < MIN_DAY || dueDay > MAX_DAY) {
            this.warn("liabilitiesFillFields");
            return null;
        }

        return {
            Name: name,
            Description: (form.description ?? "").trim() || undefined,
            TotalAmount: totalAmount,
            // eslint-disable-next-line camelcase
            Currency_code: form.currency || "BRL",
            DueDay: dueDay
        };
    }

    protected resetForm(): void {
        const ui = this.getUiModel();
        ui.setProperty("/liabilityEditId", "");
        ui.setProperty("/newLiability", {
            name: "",
            description: "",
            totalAmount: "",
            currency: "BRL",
            dueDay: String(new Date().getDate())
        });
    }

    protected onDraftClosing(): void {
        this.getUiModel().setProperty("/liabilityEditId", "");
        super.onDraftClosing();
    }
}

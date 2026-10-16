import Control from "sap/ui/core/Control";
import List from "sap/m/List";
import SearchField from "sap/m/SearchField";
import Event from "sap/ui/base/Event";
import Localization from "sap/base/i18n/Localization";
import type XMLView from "sap/ui/core/mvc/XMLView";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { PersonTab } from "./PersonTab";
import { ODataService, DRAFT_FILTER, DRAFT_EXPAND } from "../service/ODataService";
import { InvoiceService, type Period } from "../service/InvoiceService";
import { formatMonth } from "../util/format";
import { handleActionError } from "../util/feedback";

const YEARS_BEFORE = 4;
const YEARS_AFTER = 1;
const MONTHS = 12;

interface InvoiceCardRow {
    ID: string;
    Name: string;
    Limit?: number | string;
    Currency_code?: string;
    ImageBase64: string;
}

interface InvoiceTransaction {
    Identifier?: string;
    Category?: { ID: string; Name?: string } | null;
}

/**
 * "Faturas" tab: invoice of the chosen card and month with its transactions.
 * Recategorizing and excluding transactions open the shared dialogs of the
 * workspace, which publish the person draft and reload the workspace; this tab
 * then reloads through the person selection event.
 */
export default class Invoices extends PersonTab {

    protected readonly tabRoute = "Invoices";

    public onCardChanged(event: Event): void {
        const row = event.getSource<List>().getSelectedItem()?.getBindingContext("ui")?.getObject() as InvoiceCardRow | undefined;

        if (row?.ID) {
            this.getUiModel().setProperty("/invoice/cardId", row.ID);
            void this.loadInvoice();
        }
    }

    public onPeriodChange(): void {
        void this.loadInvoice();
    }

    public onPreviousPeriod(): void {
        this.shiftPeriod(-1);
    }

    public onNextPeriod(): void {
        this.shiftPeriod(1);
    }

    /**
     * Filters the transactions by description or by a typed date (dd/mm/yyyy).
     */
    public onTransactionSearch(): void {
        const binding = this.transactionsBinding();
        const query = (this.byId("invoiceTransactionSearch") as SearchField | undefined)?.getValue()?.trim() || "";

        if (!binding) {
            return;
        }

        const filters: Filter[] = [];
        const isoDate = this.parseDateFilter(query);

        if (query) {
            filters.push(new Filter({ path: "Description", operator: FilterOperator.Contains, value1: query }));
        }
        if (isoDate) {
            filters.push(new Filter({ path: "Date", operator: FilterOperator.EQ, value1: isoDate }));
        }

        binding.filter(filters.length > 1 ? [new Filter({ filters, and: false })] : filters);
    }

    public onEditCategoryPress(event: Event): void {
        const transaction = event.getSource<Control>().getBindingContext()?.getObject() as InvoiceTransaction | undefined;

        if (!transaction?.Identifier) {
            return;
        }

        const ui = this.getUiModel();
        ui.setProperty("/transactionCategory/selectedIdentifier", transaction.Identifier);
        ui.setProperty("/transactionCategory/currentCategoryId", transaction.Category?.ID || "");
        ui.setProperty("/transactionCategory/currentCategoryName", transaction.Category?.Name || "");
        this.workspace()?.openTransactionCategoryDialog();
    }

    public onDeletePress(event: Event): void {
        const transaction = event.getSource<Control>().getBindingContext()?.getObject() as InvoiceTransaction | undefined;

        if (!transaction?.Identifier) {
            return;
        }

        this.getUiModel().setProperty("/deleteTransactions/selectedIdentifier", transaction.Identifier);
        this.workspace()?.openDeleteTransactionsDialog();
    }

    protected onTabInit(): void {
        const ui = this.getUiModel();
        const period = (ui.getProperty("/period") as Period | undefined) ?? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        const currentYear = new Date().getFullYear();
        const locale = Localization.getLanguage();

        ui.setProperty("/invoice/yearOptions", Array.from({ length: YEARS_BEFORE + YEARS_AFTER + 1 }, (_, offset) => {
            const year = String(currentYear - YEARS_BEFORE + offset);
            return { key: year, text: year };
        }));
        ui.setProperty("/invoice/monthOptions", Array.from({ length: MONTHS }, (_, index) => {
            const name = new Date(currentYear, index, 1).toLocaleDateString(locale, { month: "long" });
            return { key: String(index + 1), text: name.charAt(0).toUpperCase() + name.slice(1) };
        }));
        ui.setProperty("/invoice/year", String(period.year));
        ui.setProperty("/invoice/month", String(period.month));
        ui.setProperty("/invoice/cardId", "");
        ui.setProperty("/invoice/loaded", false);
        ui.setProperty("/invoice/header", {});
        ui.setProperty("/invoice/transactionImages", {});
    }

    protected showPerson(personId: string): void {
        void this.loadCards(personId).then(() => this.loadInvoice());
    }

    protected onDraftClosing(): void {
        this.details().unbindObject();
    }

    /**
     * Loads the person's cards (with thumbnails) and keeps the selected card
     * valid; the first card is selected by default.
     *
     * @param {string} personId the selected person
     */
    private async loadCards(personId: string): Promise<void> {
        const ui = this.getUiModel();

        if (!personId) {
            ui.setProperty("/invoice/cards", []);
            ui.setProperty("/invoice/cardsEmpty", false);
            ui.setProperty("/invoice/cardId", "");
            return;
        }

        const odata = new ODataService(this.getServiceModel());

        ui.setProperty("/busy", true);
        try {
            const cards = await odata.requestEntitySet<InvoiceCardRow & { IsActiveEntity?: boolean }>("Cards", {
                select: ["ID", "Name", "Limit", "Currency_code"],
                filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
                filterExpression: DRAFT_FILTER,
                expand: DRAFT_EXPAND
            });

            const rows: InvoiceCardRow[] = await Promise.all(cards.map(async (card) => ({
                ID: card.ID,
                Name: card.Name,
                Limit: card.Limit,
                // eslint-disable-next-line camelcase
                Currency_code: card.Currency_code,
                ImageBase64: await odata.getMediaAsBase64(`Cards(ID='${encodeURIComponent(card.ID)}',IsActiveEntity=true)/Image`) ?? ""
            })));

            ui.setProperty("/invoice/cards", rows);
            ui.setProperty("/invoice/cardsEmpty", rows.length === 0);

            const current = ui.getProperty("/invoice/cardId") as string;
            const selected = rows.some((card) => card.ID === current) ? current : rows[0]?.ID ?? "";
            ui.setProperty("/invoice/cardId", selected);
            this.selectCardItem(selected);
        } catch (error) {
            handleActionError(this.getView() as XMLView, error, "invoicesCardsLoadError");
        } finally {
            ui.setProperty("/busy", false);
        }
    }

    /**
     * Loads the invoice of the selected card and month and binds its
     * transactions; shows the empty state when there is no invoice.
     */
    private async loadInvoice(): Promise<void> {
        const ui = this.getUiModel();
        const personId = this.selectedPersonId();
        const cardId = ui.getProperty("/invoice/cardId") as string;
        const year = Number(ui.getProperty("/invoice/year"));
        const month = Number(ui.getProperty("/invoice/month"));

        this.resetTransactionSearch();

        if (!personId || !cardId || !year || !month) {
            ui.setProperty("/invoice/loaded", false);
            ui.setProperty("/invoice/header", {});
            return;
        }

        const label = formatMonth(year, month)?.trim() ?? "";
        ui.setProperty("/invoice/periodLabel", label ? label.charAt(0).toUpperCase() + label.slice(1) : "");
        ui.setProperty("/busy", true);

        try {
            const invoice = await new InvoiceService(new ODataService(this.getServiceModel())).findInvoice(personId, cardId, { year, month });

            if (!invoice) {
                ui.setProperty("/invoice/loaded", false);
                ui.setProperty("/invoice/header", {});
                this.details().unbindObject();
                return;
            }

            const isDraft = invoice.IsActiveEntity === false;

            ui.setProperty("/invoice/isDraft", isDraft);
            ui.setProperty("/invoice/header", {
                TotalAmount: Number(invoice.TotalAmount) || 0,
                CurrencyCode: invoice.Currency?.code || invoice.Currency_code || "BRL",
                InvoiceSent: invoice.InvoiceSent === true
            });

            this.details().setModel(this.getServiceModel());
            this.details().bindObject(`/Invoices(ID='${encodeURIComponent(invoice.ID)}',IsActiveEntity=${isDraft ? "false" : "true"})`);
            ui.setProperty("/invoice/loaded", true);
            await this.resolveCategoryImages(isDraft);
        } catch (error) {
            ui.setProperty("/invoice/loaded", false);
            handleActionError(this.getView() as XMLView, error, "invoicesLoadError");
        } finally {
            ui.setProperty("/busy", false);
        }
    }

    /**
     * Resolves the thumbnail of every category used by the shown transactions
     * (draft media first when the invoice is a draft). Best effort.
     *
     * @param {boolean} preferDraft whether the invoice being shown is a draft
     */
    private async resolveCategoryImages(preferDraft: boolean): Promise<void> {
        const binding = this.transactionsBinding();

        if (!binding) {
            return;
        }

        try {
            const contexts = await binding.requestContexts();
            const categoryIds = new Set(contexts
                .map((context) => (context.getObject() as InvoiceTransaction | undefined)?.Category?.ID)
                .filter((id): id is string => !!id));
            const odata = new ODataService(this.getServiceModel());
            const images: Record<string, string> = {};

            await Promise.all(Array.from(categoryIds).map(async (categoryId) => {
                for (const isActiveEntity of preferDraft ? [false, true] : [true]) {
                    const base64 = await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(categoryId)}',IsActiveEntity=${isActiveEntity})/Image`);
                    if (base64) {
                        images[categoryId] = base64;
                        return;
                    }
                }
            }));

            this.getUiModel().setProperty("/invoice/transactionImages", images);
        } catch {
            // keep initials; image loading must not break the tab
        }
    }

    private shiftPeriod(delta: number): void {
        const ui = this.getUiModel();
        const year = Number(ui.getProperty("/invoice/year"));
        const month = Number(ui.getProperty("/invoice/month"));

        if (!year || !month) {
            return;
        }

        const total = year * MONTHS + (month - 1) + delta;
        ui.setProperty("/invoice/year", String(Math.floor(total / MONTHS)));
        ui.setProperty("/invoice/month", String((total % MONTHS) + 1));
        void this.loadInvoice();
    }

    private selectCardItem(cardId: string): void {
        const list = this.byId("invoiceCardList") as List | undefined;
        const item = list?.getItems().find((candidate) =>
            (candidate.getBindingContext("ui")?.getObject() as InvoiceCardRow | undefined)?.ID === cardId);

        if (item) {
            list?.setSelectedItem(item, true);
        }
    }

    private resetTransactionSearch(): void {
        (this.byId("invoiceTransactionSearch") as SearchField | undefined)?.setValue("");
        this.transactionsBinding()?.filter([]);
    }

    /**
     * Parses a typed date (dd/mm/yyyy, with "/", "." or "-") into the Edm.Date
     * notation of the service (yyyy-mm-dd).
     *
     * @param {string} value the typed filter value
     * @returns {string | undefined} the ISO date, or undefined when not a date
     */
    private parseDateFilter(value: string): string | undefined {
        const match = value.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);

        if (!match) {
            return undefined;
        }

        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]) < 100 ? Number(match[3]) + 2000 : Number(match[3]);

        if (month < 1 || month > MONTHS || day < 1 || day > 31) {
            return undefined;
        }

        return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    private transactionsBinding(): ODataListBinding | undefined {
        return (this.byId("invoiceTransactionList") as List | undefined)?.getBinding("items") as ODataListBinding | undefined;
    }

    private details(): Control {
        return this.byId("invoiceDetails") as Control;
    }
}

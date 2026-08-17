import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import List from "sap/m/List";
import Select from "sap/m/Select";
import SearchField from "sap/m/SearchField";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { ODataService, DRAFT_FILTER, DRAFT_EXPAND } from "../../service/ODataService";
import { InvoiceService } from "../../service/InvoiceService";
import { formatMonth } from "../../util/format";
import { handleActionError } from "../../util/feedback";
import type Home from "../../controller/Home.controller";

const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

interface InvoiceCardRow {
    ID: string;
    Name: string;
    Limit?: number | string;
    Currency_code?: string;
    ImageBase64: string;
}

interface InvoiceTransaction {
    ID: string;
    Identifier?: string;
    Description?: string;
    Amount?: number | string;
    TotalAmount?: number | string;
    Date?: string;
    Category?: { ID: string; Name?: string } | null;
    Currency?: { code?: string } | null;
}

/**
 * Finds the Invoices dialog that contains the given control by walking up the
 * parent chain (footer buttons may be nested in an HBox).
 *
 * @param {Control} control the control inside the dialog
 * @returns {Dialog | undefined} the dialog, or `undefined` when not found
 */
function findInvoicesDialog(control: Control): Dialog | undefined {
    let current: Control | undefined = control;
    while (current) {
        if (current instanceof Dialog) {
            return current;
        }
        current = current.getParent() as Control | undefined;
    }
    return undefined;
}

const uiOf = (view: XMLView): JSONModel => view.getModel("ui") as JSONModel;

/**
 * Parses a date typed by the user (`dd/mm/yyyy` with `.` or `-` separators)
 * into the `Edm.Date` notation used by the OData service (`yyyy-mm-dd`).
 *
 * @param {string} value the typed filter value
 * @returns {string | undefined} the ISO date, or `undefined` when not a date
 */
function parseDateFilter(value: string): string | undefined {
    const match = value.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!match) {
        return undefined;
    }
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) {
        year += 2000;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return undefined;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Moves the invoice period forward/backward by one month, wrapping years, and
 * reloads the invoice.
 *
 * @param {XMLView} view the Home view
 * @param {number} delta the month offset (−1 previous, +1 next)
 * @returns {void}
 */
function shiftPeriod(view: XMLView, delta: number): void {
    const ui = uiOf(view);
    let year = Number(ui.getProperty("/invoice/year"));
    let month = Number(ui.getProperty("/invoice/month"));
    if (!year || !month) {
        return;
    }
    const total = year * 12 + (month - 1) + delta;
    year = Math.floor(total / 12);
    month = (total % 12) + 1;
    ui.setProperty("/invoice/year", String(year));
    ui.setProperty("/invoice/month", String(month));
    void loadInvoice(view);
}

/**
 * Loads the person's cards into the ui model (`invoice/cards`) together with
 * their thumbnails and keeps `invoice/cardId` pointing at a valid card.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the cards are loaded
 */
async function loadCards(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const odata = new ODataService(view.getModel() as ODataModel);

    if (!personId) {
        ui.setProperty("/invoice/cards", []);
        ui.setProperty("/invoice/cardsEmpty", false);
        ui.setProperty("/invoice/cardId", "");
        return;
    }

    ui.setProperty("/busy", true);
    try {
        const cards = await odata.requestEntitySet<InvoiceCardRow & { IsActiveEntity?: boolean }>("Cards", {
            select: ["ID", "Name", "Limit", "Currency_code"],
            filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
            filterExpression: DRAFT_FILTER,
            expand: DRAFT_EXPAND
        });

        const images: Record<string, string> = {};
        await Promise.all(
            cards.map(async (card) => {
                const base64 = await odata.getMediaAsBase64(`Cards(ID='${encodeURIComponent(card.ID)}',IsActiveEntity=true)/Image`);
                if (base64) {
                    images[card.ID] = base64;
                }
            })
        );

        const rows: InvoiceCardRow[] = cards.map((card) => ({
            ID: card.ID,
            Name: card.Name,
            Limit: card.Limit,
            Currency_code: card.Currency_code,
            ImageBase64: images[card.ID] || ""
        }));

        ui.setProperty("/invoice/cards", rows);
        ui.setProperty("/invoice/cardsEmpty", rows.length === 0);

        const current = ui.getProperty("/invoice/cardId") as string;
        if (!current || !rows.some((card) => card.ID === current)) {
            ui.setProperty("/invoice/cardId", rows[0]?.ID || "");
        }
    } catch (error) {
        handleActionError(view, error, "invoicesCardsLoadError");
    } finally {
        ui.setProperty("/busy", false);
    }
}


/**
 * Clears the transaction search field and removes the filters applied to the
 * transaction list. Used whenever the invoice being shown changes, so a stale
 * query does not leak into the newly bound list.
 *
 * @returns {void}
 */
function resetTransactionSearch(): void {
    const search = Fragment.byId("Invoices", "invoiceTransactionSearch") as SearchField | undefined;
    const list = Fragment.byId("Invoices", "invoiceTransactionList") as List | undefined;
    const binding = list?.getBinding("items") as ODataListBinding | undefined;
    if (search) {
        search.setValue("");
    }
    binding?.filter([]);
}

/**
 * Detaches the Invoices dialog from its invoice binding. Used when no invoice
 * exists for the selected card/period so the transaction list shows its empty
 * text instead of stale rows.
 *
 * @returns {void}
 */
function unbindTransactionList(): void {
    const dialog = Fragment.byId("Invoices", "invoicesDialog") as Dialog | undefined;
    resetTransactionSearch();
    dialog?.unbindObject();
}


/**
 * Binds the invoice transaction list to the transactions navigation of the
 * resolved invoice. The path uses the invoice key and its active/draft state,
 * so the OData V4 model reads exactly the transactions of the entity being
 * shown. `$orderby` (descending date) runs on the server.
 *
 * @param {XMLView} view the Home view
 * @param {string} invoiceId the resolved invoice ID
 * @param {boolean} isDraft whether the invoice is being shown as a draft
 * @returns {void}
 */
function bindTransactionList(view: XMLView, invoiceId: string, isDraft: boolean): void {
    const dialog = Fragment.byId("Invoices", "invoicesDialog") as Dialog | undefined;
    resetTransactionSearch();
    if (!dialog) {
        return;
    }

    const path = `/Invoices(ID='${encodeURIComponent(invoiceId)}',IsActiveEntity=${isDraft ? "false" : "true"})`;
    dialog.unbindObject();
    dialog.bindObject(path);
}


/**
 * Resolves the thumbnail of every distinct category used by the bound invoice
 * transactions and mirrors it into `ui>/invoice/transactionImages` (keyed by
 * category ID). When the invoice being shown is a draft, the draft media is
 * tried first, falling back to the active category image. Best effort.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the images were resolved
 */
async function resolveTransactionCategoryImages(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const odata = new ODataService(view.getModel() as ODataModel);
    const list = Fragment.byId("Invoices", "invoiceTransactionList") as List | undefined;
    const binding = list?.getBinding("items") as ODataListBinding | undefined;

    if (!binding) {
        return;
    }

    try {
        const contexts = await binding.requestContexts();
        const byId = new Set<string>();

        contexts.forEach((context) => {
            const transaction = context.getObject() as InvoiceTransaction | undefined;
            const categoryId = transaction?.Category?.ID;
            if (categoryId) {
                byId.add(categoryId);
            }
        });

        if (byId.size === 0) {
            return;
        }

        const images: Record<string, string> = {};
        await Promise.all(
            Array.from(byId).map(async (categoryId) => {
                const states: boolean[] = invoiceShowsDraft(view) ? [false, true] : [true];
                for (const isActiveEntity of states) {
                    const base64 = await odata.getMediaAsBase64(
                        `Categories(ID='${encodeURIComponent(categoryId)}',IsActiveEntity=${isActiveEntity})/Image`
                    );
                    if (base64) {
                        images[categoryId] = base64;
                        return;
                    }
                }
            })
        );

        ui.setProperty("/invoice/transactionImages", images);
    } catch {
        // keep initials; image loading must not break the dialog
    }
}


/**
 * Loads the invoice of the currently selected card/period into the ui model
 * (`invoice/header`) and binds the transaction list to the resolved invoice.
 * The transaction ordering (date desc) and the draft/active resolution happen
 * server-side via the OData V4 binding.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the invoice data is ready
 */
export async function loadInvoice(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const cardId = ui.getProperty("/invoice/cardId") as string;
    const year = Number(ui.getProperty("/invoice/year"));
    const month = Number(ui.getProperty("/invoice/month"));

    if (!personId || !cardId || !year || !month) {
        ui.setProperty("/invoice/loaded", false);
        ui.setProperty("/invoice/header", {});
        return;
    }

    const odata = new ODataService(view.getModel() as ODataModel);
    const service = new InvoiceService(odata);

    ui.setProperty("/busy", true);
    try {
        const invoice = await service.findInvoice(personId, cardId, { year, month });
        const label = formatMonth(year, month)?.trim();
        ui.setProperty("/invoice/periodLabel", label ? label.charAt(0).toUpperCase() + label.slice(1) : "");

        if (!invoice) {
            ui.setProperty("/invoice/id", "");
            ui.setProperty("/invoice/isDraft", false);
            ui.setProperty("/invoice/loaded", false);
            ui.setProperty("/invoice/header", {});
            unbindTransactionList();
            return;
        }

        const isDraft = invoice.IsActiveEntity === false;
        const currency = invoice.Currency?.code || invoice.Currency_code || "BRL";

        ui.setProperty("/invoice/id", invoice.ID);
        ui.setProperty("/invoice/isDraft", isDraft);
        ui.setProperty("/invoice/header", {
            Description: invoice.Description || "",
            TotalAmount: Number(invoice.TotalAmount) || 0,
            CurrencyCode: currency,
            InvoiceSent: invoice.InvoiceSent === true
        });

        bindTransactionList(view, invoice.ID, isDraft);
        await resolveTransactionCategoryImages(view);
        ui.setProperty("/invoice/loaded", true);
    } catch (error) {
        ui.setProperty("/invoice/loaded", false);
        handleActionError(view, error, "invoicesLoadError");
    } finally {
        ui.setProperty("/busy", false);
    }
}


/**
 * Tells whether the transaction list is currently showing a draft invoice.
 *
 * @param {XMLView} view the Home view
 * @returns {boolean} whether the draft media should be preferred
 */
function invoiceShowsDraft(view: XMLView): boolean {
    return uiOf(view).getProperty("/invoice/isDraft") === true;
}

/**
 * Reloads the whole invoice dialog state. Called after a transaction write
 * (recategorization/exclusion) so the open dialog reflects the published data.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the data is reloaded
 */
export async function reloadInvoiceData(view: XMLView): Promise<void> {
    await loadCards(view);
    if (uiOf(view).getProperty("/invoice/cardId")) {
        await loadInvoice(view);
    }
}

const Invoices = {

    onDialogBeforeOpen: function (): void {
        const view = Fragment.byId("Invoices", "invoicesDialog")?.getParent() as XMLView | undefined;
        if (!view) {
            return;
        }
        const ui = uiOf(view);
        const now = new Date();
        const currentYear = now.getFullYear();

        ui.setProperty("/invoice/yearOptions", Array.from({ length: 6 }, (_, offset) => {
            const year = currentYear - 4 + offset;
            return { key: String(year), text: String(year) };
        }));
        ui.setProperty("/invoice/monthOptions", MONTH_NAMES.map((name, index) => ({
            key: String(index + 1),
            text: name
        })));
        ui.setProperty("/invoice/year", String(currentYear));
        ui.setProperty("/invoice/month", String(now.getMonth() + 1));
        ui.setProperty("/invoice/cardId", "");
        ui.setProperty("/invoice/id", "");
        ui.setProperty("/invoice/isDraft", false);
        ui.setProperty("/invoice/loaded", false);
        ui.setProperty("/invoice/header", {});
        ui.setProperty("/invoice/transactionImages", {});

        void reloadInvoiceData(view);
    },

    onDialogAfterOpen: function (this: Dialog): void {
        const list = Fragment.byId("Invoices", "invoiceCardList") as List | undefined;
        const view = this.getParent() as XMLView;
        const id = uiOf(view).getProperty("/invoice/cardId") as string | undefined;

        if (!list || !id) {
            return;
        }

        list.getItems().some((item) => {
            const row = item.getBindingContext("ui")?.getObject() as InvoiceCardRow | undefined;
            if (row?.ID === id) {
                list.setSelectedItem(item, true);
                return true;
            }
            return false;
        });
    },

    onCardChanged: function (this: List): void {
        const row = this.getSelectedItem()?.getBindingContext("ui")?.getObject() as InvoiceCardRow | undefined;
        if (!row?.ID) {
            return;
        }
        const view = this.getParent() as XMLView;
        uiOf(view).setProperty("/invoice/cardId", row.ID);
        void loadInvoice(view);
    },

    onYearChange: function (this: Select): void {
        const view = this.getParent() as XMLView;
        uiOf(view).setProperty("/invoice/year", this.getSelectedKey());
        void loadInvoice(view);
    },

    onMonthChange: function (this: Select): void {
        const view = this.getParent() as XMLView;
        uiOf(view).setProperty("/invoice/month", this.getSelectedKey());
        void loadInvoice(view);
    },

    onTransactionSearch: function (this: SearchField): void {
        const view = Fragment.byId("Invoices", "invoicesDialog")?.getParent() as XMLView | undefined;
        const list = Fragment.byId("Invoices", "invoiceTransactionList") as List | undefined;
        const binding = list?.getBinding("items") as ODataListBinding | undefined;
        if (!view || !binding) {
            return;
        }

        const query = this.getValue()?.trim() || "";
        const filters: Filter[] = [];
        const isoDate = parseDateFilter(query);
        if (query) {
            filters.push(new Filter({ path: "Description", operator: FilterOperator.Contains, value1: query }));
        }
        if (isoDate) {
            filters.push(new Filter({ path: "Date", operator: FilterOperator.EQ, value1: isoDate }));
        }

        const applied = filters.length > 1
            ? [new Filter({ filters, and: false })]
            : filters;
        binding.filter(applied);
    },

    onPreviousPeriod: function (this: Control): void {
        const dialog = findInvoicesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        if (view) {
            shiftPeriod(view, -1);
        }
    },

    onNextPeriod: function (this: Control): void {
        const dialog = findInvoicesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        if (view) {
            shiftPeriod(view, 1);
        }
    },

    onEditCategoryPress: function (this: Control): void {
        const dialog = findInvoicesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const transaction = this.getBindingContext()?.getObject() as InvoiceTransaction | undefined;

        if (!view || !transaction?.Identifier) {
            return;
        }

        const ui = uiOf(view);
        ui.setProperty("/transactionCategory/selectedIdentifier", transaction.Identifier);
        ui.setProperty("/transactionCategory/currentCategoryId", transaction.Category?.ID || "");
        ui.setProperty("/transactionCategory/currentCategoryName", transaction.Category?.Name || "");
        (view.getController() as Home).openTransactionCategoryDialog();
    },

    onDeletePress: function (this: Control): void {
        const dialog = findInvoicesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const transaction = this.getBindingContext()?.getObject() as InvoiceTransaction | undefined;

        if (!view || !transaction?.Identifier) {
            return;
        }

        uiOf(view).setProperty("/deleteTransactions/selectedIdentifier", transaction.Identifier);
        (view.getController() as Home).openDeleteTransactionsDialog();
    },

    onCloseInvoice: function (this: Control): void {
        const dialog = findInvoicesDialog(this);
        dialog?.close();
    },

    onDialogAfterClose: function (this: Dialog): void {
        const view = this.getParent() as XMLView | undefined;
        if (view) {
            void (view.getController() as Home).reload();
        }
    }
};

export default Invoices;
import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import List from "sap/m/List";
import Select from "sap/m/Select";
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
 * Moves the invoice period forward/backward by one month, wrapping years, and
 * reloads the invoice.
 *
 * @param {XMLView} view the Home view
 * @param {number} delta the month offset (−1 previous, +1 next)
 * @returns {void}
 */
function shiftPeriod(view: XMLView, delta: number): void {
    const ui = uiOf(view);
    let year = Number(ui.getProperty("/invoiceYear"));
    let month = Number(ui.getProperty("/invoiceMonth"));
    if (!year || !month) {
        return;
    }
    const total = year * 12 + (month - 1) + delta;
    year = Math.floor(total / 12);
    month = (total % 12) + 1;
    ui.setProperty("/invoiceYear", String(year));
    ui.setProperty("/invoiceMonth", String(month));
    void loadInvoice(view);
}

/**
 * Loads the person's cards into the ui model (`invoiceCards`) together with
 * their thumbnails and keeps `invoiceCardId` pointing at a valid card.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the cards are loaded
 */
async function loadCards(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const odata = new ODataService(view.getModel() as ODataModel);

    if (!personId) {
        ui.setProperty("/invoiceCards", []);
        ui.setProperty("/invoiceCardsEmpty", false);
        ui.setProperty("/invoiceCardId", "");
        return;
    }

    ui.setProperty("/invoiceBusy", true);
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

        ui.setProperty("/invoiceCards", rows);
        ui.setProperty("/invoiceCardsEmpty", rows.length === 0);

        const current = ui.getProperty("/invoiceCardId") as string;
        if (!current || !rows.some((card) => card.ID === current)) {
            ui.setProperty("/invoiceCardId", rows[0]?.ID || "");
        }
    } catch (error) {
        handleActionError(view, error, "invoicesCardsLoadError");
    } finally {
        ui.setProperty("/invoiceBusy", false);
    }
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
    if (!dialog) {
        return;
    }

    const path = `/Invoices(ID='${encodeURIComponent(invoiceId)}',IsActiveEntity=${isDraft ? "false" : "true"})`;
    dialog.unbindObject();
    dialog.bindObject(path);
}


/**
 * Resolves the thumbnail of every distinct category used by the bound invoice
 * transactions and mirrors it into `ui>/invoiceTransactionImages` (keyed by
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

        ui.setProperty("/invoiceTransactionImages", images);
    } catch {
        // keep initials; image loading must not break the dialog
    }
}


/**
 * Loads the invoice of the currently selected card/period into the ui model
 * (`invoiceHeader`) and binds the transaction list to the resolved invoice.
 * The transaction ordering (date desc) and the draft/active resolution happen
 * server-side via the OData V4 binding.
 *
 * @param {XMLView} view the Home view
 * @returns {Promise<void>} resolves once the invoice data is ready
 */
export async function loadInvoice(view: XMLView): Promise<void> {
    const ui = uiOf(view);
    const personId = ui.getProperty("/selectedPersonId") as string;
    const cardId = ui.getProperty("/invoiceCardId") as string;
    const year = Number(ui.getProperty("/invoiceYear"));
    const month = Number(ui.getProperty("/invoiceMonth"));

    if (!personId || !cardId || !year || !month) {
        ui.setProperty("/invoiceLoaded", false);
        ui.setProperty("/invoiceHeader", {});
        return;
    }

    const odata = new ODataService(view.getModel() as ODataModel);
    const service = new InvoiceService(odata);

    ui.setProperty("/invoiceBusy", true);
    try {
        const invoice = await service.findInvoice(personId, cardId, { year, month });
        const label = formatMonth(year, month)?.trim();
        ui.setProperty("/invoicePeriodLabel", label ? label.charAt(0).toUpperCase() + label.slice(1) : "");

        if (!invoice) {
            ui.setProperty("/invoiceId", "");
            ui.setProperty("/invoiceIsDraft", false);
            ui.setProperty("/invoiceLoaded", false);
            ui.setProperty("/invoiceHeader", {});
            unbindTransactionList();
            return;
        }

        const isDraft = invoice.IsActiveEntity === false;
        const currency = invoice.Currency?.code || invoice.Currency_code || "BRL";

        ui.setProperty("/invoiceId", invoice.ID);
        ui.setProperty("/invoiceIsDraft", isDraft);
        ui.setProperty("/invoiceHeader", {
            Description: invoice.Description || "",
            TotalAmount: Number(invoice.TotalAmount) || 0,
            CurrencyCode: currency,
            InvoiceSent: invoice.InvoiceSent === true
        });

        bindTransactionList(view, invoice.ID, isDraft);
        await resolveTransactionCategoryImages(view);
        ui.setProperty("/invoiceLoaded", true);
    } catch (error) {
        ui.setProperty("/invoiceLoaded", false);
        handleActionError(view, error, "invoicesLoadError");
    } finally {
        ui.setProperty("/invoiceBusy", false);
    }
}


/**
 * Tells whether the transaction list is currently showing a draft invoice.
 *
 * @param {XMLView} view the Home view
 * @returns {boolean} whether the draft media should be preferred
 */
function invoiceShowsDraft(view: XMLView): boolean {
    return uiOf(view).getProperty("/invoiceIsDraft") === true;
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
    if (uiOf(view).getProperty("/invoiceCardId")) {
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

        ui.setProperty("/invoiceYearOptions", Array.from({ length: 6 }, (_, offset) => {
            const year = currentYear - 4 + offset;
            return { key: String(year), text: String(year) };
        }));
        ui.setProperty("/invoiceMonthOptions", MONTH_NAMES.map((name, index) => ({
            key: String(index + 1),
            text: name
        })));
        ui.setProperty("/invoiceYear", String(currentYear));
        ui.setProperty("/invoiceMonth", String(now.getMonth() + 1));
        ui.setProperty("/invoiceCardId", "");
        ui.setProperty("/invoiceId", "");
        ui.setProperty("/invoiceIsDraft", false);
        ui.setProperty("/invoiceLoaded", false);
        ui.setProperty("/invoiceHeader", {});
        ui.setProperty("/invoiceTransactionImages", {});

        void reloadInvoiceData(view);
    },

    onDialogAfterOpen: function (this: Dialog): void {
        const list = Fragment.byId("Invoices", "invoiceCardList") as List | undefined;
        const view = this.getParent() as XMLView;
        const id = uiOf(view).getProperty("/invoiceCardId") as string | undefined;

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
        uiOf(view).setProperty("/invoiceCardId", row.ID);
        void loadInvoice(view);
    },

    onYearChange: function (this: Select): void {
        const view = this.getParent() as XMLView;
        uiOf(view).setProperty("/invoiceYear", this.getSelectedKey());
        void loadInvoice(view);
    },

    onMonthChange: function (this: Select): void {
        const view = this.getParent() as XMLView;
        uiOf(view).setProperty("/invoiceMonth", this.getSelectedKey());
        void loadInvoice(view);
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
        ui.setProperty("/invoiceSelectedIdentifier", transaction.Identifier);
        ui.setProperty("/invoiceCurrentCategoryId", transaction.Category?.ID || "");
        ui.setProperty("/invoiceCurrentCategoryName", transaction.Category?.Name || "");
        (view.getController() as Home).openTransactionCategoryDialog();
    },

    onDeletePress: function (this: Control): void {
        const dialog = findInvoicesDialog(this);
        const view = dialog?.getParent() as XMLView | undefined;
        const transaction = this.getBindingContext()?.getObject() as InvoiceTransaction | undefined;

        if (!view || !transaction?.Identifier) {
            return;
        }

        uiOf(view).setProperty("/invoiceSelectedIdentifier", transaction.Identifier);
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
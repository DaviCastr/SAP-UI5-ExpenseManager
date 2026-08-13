import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import XMLView from "sap/ui/core/mvc/XMLView";
import Fragment from "sap/ui/core/Fragment";
import List from "sap/m/List";
import Select from "sap/m/Select";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { ODataService, DRAFT_FILTER, DRAFT_EXPAND } from "../../service/ODataService";
import { InvoiceService, type InvoiceQueryTransaction } from "../../service/InvoiceService";
import { formatDate, formatMonth } from "../../util/format";
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

interface InvoiceTransactionRow extends InvoiceQueryTransaction {
    CurrencyCode?: string;
    Subtitle?: string;
    DateText?: string;
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
 * Builds the subtitle of an invoice transaction row: date plus installments
 * information when the purchase was paid in more than one installment.
 *
 * @param {InvoiceQueryTransaction} transaction the raw transaction
 * @returns {string} the human readable subtitle
 */
function buildSubtitle(transaction: InvoiceQueryTransaction): string {
    const date = formatDate(transaction.Date);
    const installments = Number(transaction.TotalInstallments) || 0;
    if (installments > 1) {
        const current = Number(transaction.Installment) || 1;
        return `${date} • Parcela ${current} de ${installments}`;
    }
    return date;
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
 * Loads the invoice of the currently selected card/period into the ui model
 * (`invoiceHeader`, `invoiceTransactions`) and resolves the category images of
 * every shown transaction.
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
        ui.setProperty("/invoiceTransactions", []);
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
            ui.setProperty("/invoiceLoaded", false);
            ui.setProperty("/invoiceHeader", {});
            ui.setProperty("/invoiceTransactions", []);
            return;
        }

        const currency = invoice.Currency?.code || invoice.Currency_code || "BRL";

        ui.setProperty("/invoiceId", invoice.ID);
        ui.setProperty("/invoiceHeader", {
            Description: invoice.Description || "",
            TotalAmount: Number(invoice.TotalAmount) || 0,
            CurrencyCode: currency,
            InvoiceSent: invoice.InvoiceSent === true
        });

        const rows: InvoiceTransactionRow[] = (invoice.Transactions || []).map((transaction) => ({
            ...transaction,
            CurrencyCode: transaction.Currency?.code || currency,
            DateText: formatDate(transaction.Date),
            Subtitle: buildSubtitle(transaction)
        }));
        ui.setProperty("/invoiceTransactions", rows);

        await resolveTransactionCategoryImages(view, rows);
        ui.setProperty("/invoiceLoaded", true);
    } catch (error) {
        ui.setProperty("/invoiceLoaded", false);
        handleActionError(view, error, "invoicesLoadError");
    } finally {
        ui.setProperty("/invoiceBusy", false);
    }
}

/**
 * Resolves the thumbnail of every distinct category used by the shown invoice
 * transactions and stores it back into the ui model rows.
 *
 * @param {XMLView} view the Home view
 * @param {InvoiceTransactionRow[]} rows the transaction rows
 * @returns {Promise<void>} resolves once the images were resolved (best effort)
 */
async function resolveTransactionCategoryImages(view: XMLView, rows: InvoiceTransactionRow[]): Promise<void> {
    const ui = uiOf(view);
    const odata = new ODataService(view.getModel() as ODataModel);

    const byId = new Map<string, number[]>();
    rows.forEach((row, index) => {
        const categoryId = row.Category?.ID;
        if (categoryId) {
            const indexes = byId.get(categoryId) || [];
            indexes.push(index);
            byId.set(categoryId, indexes);
        }
    });

    await Promise.all(
        Array.from(byId.entries()).map(async ([categoryId, indexes]) => {
            const base64 = await odata.getMediaAsBase64(`Categories(ID='${encodeURIComponent(categoryId)}',IsActiveEntity=true)/Image`);
            if (!base64) {
                return;
            }
            for (const index of indexes) {
                ui.setProperty(`/invoiceTransactions/${index}/Category/ImageBase64`, base64);
            }
        })
    );
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
        ui.setProperty("/invoiceLoaded", false);
        ui.setProperty("/invoiceHeader", {});
        ui.setProperty("/invoiceTransactions", []);

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
        const transaction = this.getBindingContext("ui")?.getObject() as InvoiceTransactionRow | undefined;

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
        const transaction = this.getBindingContext("ui")?.getObject() as InvoiceTransactionRow | undefined;

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
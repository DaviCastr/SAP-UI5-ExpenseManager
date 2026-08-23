import { ODataService, DRAFT_FILTER } from "./ODataService";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";

export interface CompleteInvoiceTransaction {
    ID: string;
    Identifier?: string;
    Date?: string;
    Description?: string;
    Amount: number;
    TotalAmount: number;
    Installment?: number;
    TotalInstallments?: number;
    Card: {
        ID: string;
        Name: string;
        ImagePath?: string;
    };
    Category?: {
        ID: string;
        Name: string;
        ImagePath?: string;
    };
    Invoice: {
        ID: string;
    };
}

export interface CompleteInvoice {
    Year: number;
    Month: number;
    Description: string;
    Currency: { code: string };
    TotalAmount: number;
    TotalExpenses?: number;
    MonthExpenses?: number;
    MonthExpensesToPay?: number;
    MonthExpensesClosed?: number;
    MonthExpensesPayed?: number;
    MonthCriticallity?: number;
    CriticallityToPay?: number;
    KPIs: {
        TotalTransactions: number;
        TotalCards: number;
        TotalCategories: number;
    };
    Transactions: CompleteInvoiceTransaction[];
}

export interface Period {
    year: number;
    month: number;
}

export interface InvoiceQueryTransaction {
    ID: string;
    Identifier?: string;
    Date?: string;
    Description?: string;
    Amount?: number | string;
    TotalAmount?: number | string;
    Installment?: number;
    TotalInstallments?: number;
    Currency: { code?: string };
    Invoice_ID?: string;
    Category_ID?: string;
    Category?: { ID: string; Name?: string } | null;
}

export interface InvoiceQueryResult {
    ID: string;
    Year: number;
    Month: number;
    Description?: string;
    TotalAmount?: number | string;
    Currency_code?: string;
    Currency?: { code?: string };
    InvoiceSent?: boolean;
    IsActiveEntity?: boolean;
    Card?: { ID?: string };
    Transactions?: InvoiceQueryTransaction[];
}

export interface IdentifierTransaction {
    ID: string;
    Identifier: string;
    Date?: string;
    Description?: string;
    Amount?: number | string;
    TotalAmount?: number | string;
    Installment?: number;
    TotalInstallments?: number;
    Currency?: { code?: string };
    Category?: { ID: string; Name?: string } | null;
    Invoice: {
        ID: string;
        Card?: { ID?: string };
        Year?: number;
        Month?: number;
    };
}

/**
 * Read model for the invoice-related functions of the ExpenseManager service.
 */
export class InvoiceService {

    private readonly odata: ODataService;

    public constructor(odata: ODataService) {
        this.odata = odata;
    }

    public async getCompleteInvoice(personId: string, period: Period): Promise<CompleteInvoice> {
        return this.odata.requestFunction<CompleteInvoice>("/RetrieveCompleteInvoice", {
            PersonId: personId,
            Year: period.year,
            Month: period.month
        });
    }

    /**
     * Sends the full invoice of the given year/month through the unbound
     * SendInvoices CAP action. The backend resolves with a plain boolean
     * (true when the invoices were processed); failures reject.
     *
     * @param {Period} period the year/month whose invoices are sent
     * @returns {Promise<boolean>} whether the send succeeded
     */
    public async sendInvoices(period: Period): Promise<boolean> {
        return this.odata.requestFunction<boolean>("/SendInvoices", {
            Year: period.year,
            Month: period.month
        });
    }

    /**
     * Finds the invoice of a single card for the given year/month. The Invoice
     * entity set is draft-aware, so the query includes active rows together
     * with drafts that have no active sibling.
     *
     * @param {string} personId unused by the query but kept for symmetry/clarity
     * @param {string} cardId the card whose invoice is looked up
     * @param {Period} period the year/month being shown
     * @returns {Promise<InvoiceQueryResult | undefined>} the matching invoice, if any
     */
    public async findInvoice(personId: string, cardId: string, period: Period): Promise<InvoiceQueryResult | undefined> {
        void personId;
        const invoices = await this.odata.requestEntitySet<InvoiceQueryResult>("/Invoices", {
            filterExpression: `Card/ID eq '${cardId}' and Year eq ${period.year} and Month eq ${period.month} and ${DRAFT_FILTER}`,
            expand: "Currency"
        });
        return invoices[0];
    }

    /**
     * Lists every transaction of the person that shares the given Identifier
     * (installments of the same purchase). Used by the recategorization and
     * deletion dialogs, where changes must reach the whole identifier group.
     *
     * @param {string} personId the selected person
     * @param {string} identifier the shared Identifier value
     * @returns {Promise<IdentifierTransaction[]>} the matching transactions
     */
    public async listTransactionsByIdentifier(personId: string, identifier: string): Promise<IdentifierTransaction[]> {
        return this.odata.requestEntitySet<IdentifierTransaction>("Transactions", {
            filters: [
                new Filter({ path: "Invoice/Card/Person/ID", operator: FilterOperator.EQ, value1: personId }),
                new Filter({ path: "Identifier", operator: FilterOperator.EQ, value1: identifier })
            ],
            filterExpression: DRAFT_FILTER,
            expand: "Invoice($select=ID,Card_ID,Year,Month),Category,Currency"
        });
    }
}

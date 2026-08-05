import { ODataService } from "./ODataService";

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
}

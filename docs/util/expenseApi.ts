import { request } from "./http";

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

export interface CompleteInvoiceReturnProperties {
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

export interface CategoryTransactionItemReturn {
    ID: string;
    Identifier?: string;
    Date?: string;
    Description?: string;
    Installment?: number;
    TotalInstallments?: number;
    Amount: number;
    Currency?: { code: string };
}

export interface CategoryInvoiceReturn {
    ID: string;
    Year: number;
    Month: number;
    Description?: string;
    TotalAmount: number;
    Transactions: CategoryTransactionItemReturn[];
}

export interface CategoryCardReturn {
    ID: string;
    Name: string;
    ImagePath?: string;
    TotalAmount: number;
    Invoices: CategoryInvoiceReturn[];
}

export interface CategoryTransactionsProperties {
    ID: string;
    Name: string;
    ImagePath?: string;
    Currency: { code: string };
    TotalAmount: number;
    Cards: CategoryCardReturn[];
}

export interface CategoryBreakdownItem {
    ID: string;
    Name: string;
    CategoryImagePath?: string;
    Total: number;
    Percent: number;
    CurrencyCode: string;
}

export interface SimulateExpenseReturnProperties {
    TotalAmount: number;
    TotalMonth: number;
    AmountSaving: number;
    Currency: { code: string };
}

interface ApiEnvelope<T> {
    status?: number;
    data?: T | string;
}

async function unwrap<T>(response: Response, label: string): Promise<T> {
    if (!response.ok) {
        throw new Error(`Erro ao ${label} (${response.status})`);
    }

    const payload = (await response.json()) as ApiEnvelope<T>;
    let data = payload.data;

    if (typeof data === "string") {
        try {
            data = JSON.parse(data) as T;
        } catch (error) {
            throw new Error(`Resposta inválida ao ${label}`);
        }
    }

    if (data === undefined || data === null) {
        throw new Error(`Resposta vazia ao ${label}`);
    }

    return data as T;
}

export async function getCompleteInvoice(
    personId: string,
    year: number,
    month: number
): Promise<CompleteInvoiceReturnProperties> {
    const response = await request(
        `RetrieveCompleteInvoice(PersonId=${personId},Year=${year},Month=${month})`
    );

    return unwrap<CompleteInvoiceReturnProperties>(response, "buscar a fatura");
}

export async function getTransactionsByCategory(
    personId: string,
    categoryId: string,
    total: boolean,
    year: number,
    month: number
): Promise<CategoryTransactionsProperties> {
    const response = await request(
        `RetrieveTransactionsByCategory(PersonId=${personId},CategoryId=${categoryId},Total=${total},Year=${year},Month=${month})`
    );

    return unwrap<CategoryTransactionsProperties>(response, "buscar as transações da categoria");
}

export async function simulateExpenses(
    personId: string,
    year: number,
    month: number
): Promise<SimulateExpenseReturnProperties> {
    const response = await request("SimulateExpenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ PersonId: personId, Year: year, Month: month })
    });

    return unwrap<SimulateExpenseReturnProperties>(response, "simular os gastos");
}

export async function addCardExpense(payload: {
    CardId: string;
    CategoryId: string;
    Description: string;
    Value: number;
    Currency: string;
    TransactionDate: string;
    Installments: number;
    FixedExpense: boolean;
}): Promise<void> {
    const response = await request("AddCardExpense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Erro ao registrar o gasto (${response.status})`);
    }
}

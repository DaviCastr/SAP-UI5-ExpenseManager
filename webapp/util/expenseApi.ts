import type ODataModel from "sap/ui/model/odata/v4/ODataModel";

/**
 * CAP controllers reply with a `{ data, status }` envelope (BaseControllerResponse).
 * Unwraps the payload so callers receive the actual function/action result.
 *
 * @param {unknown} value the raw value returned by the OData model
 * @returns {unknown} the unwrapped payload (or the original value when not an envelope)
 */
function unwrapControllerResult(value: unknown): unknown {
    if (value && typeof value === "object" && "data" in value && "status" in value) {
        return (value as { data?: unknown }).data;
    }
    return value;
}

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
    CategoryImageBase64?: string;
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

export async function getCompleteInvoice(
    model: ODataModel,
    personId: string,
    year: number,
    month: number
): Promise<CompleteInvoiceReturnProperties> {
    const binding = model.bindContext("/RetrieveCompleteInvoice(...)");

    binding.setParameter("PersonId", personId);
    binding.setParameter("Year", year);
    binding.setParameter("Month", month);

    await binding.invoke();

    return unwrapControllerResult(binding.getBoundContext()?.getObject()) as CompleteInvoiceReturnProperties;
}

export async function getTransactionsByCategory(
    model: ODataModel,
    personId: string,
    categoryId: string,
    total: boolean,
    year: number,
    month: number
): Promise<CategoryTransactionsProperties> {
    const binding = model.bindContext("/RetrieveTransactionsByCategory(...)");

    binding.setParameter("PersonId", personId);
    binding.setParameter("CategoryId", categoryId);
    binding.setParameter("Total", total);
    binding.setParameter("Year", year);
    binding.setParameter("Month", month);

    await binding.invoke();

    return unwrapControllerResult(binding.getBoundContext()?.getObject()) as CategoryTransactionsProperties;
}

export async function simulateExpenses(
    model: ODataModel,
    personId: string,
    year: number,
    month: number
): Promise<SimulateExpenseReturnProperties> {
    const binding = model.bindContext("/SimulateExpenses(...)");

    binding.setParameter("PersonId", personId);
    binding.setParameter("Year", year);
    binding.setParameter("Month", month);

    await binding.invoke();

    return unwrapControllerResult(binding.getBoundContext()?.getObject()) as SimulateExpenseReturnProperties;
}

export async function addCardExpense(
    model: ODataModel,
    payload: {
        CardId: string;
        CategoryId: string;
        Description: string;
        Value: number;
        Currency: string;
        TransactionDate: string;
        Installments: number;
        FixedExpense: boolean;
    }
): Promise<void> {
    const binding = model.bindContext("/AddCardExpense(...)");

    binding.setParameter("CardId", payload.CardId);
    binding.setParameter("CategoryId", payload.CategoryId);
    binding.setParameter("Description", payload.Description);
    binding.setParameter("Value", payload.Value);
    binding.setParameter("Currency", payload.Currency);
    binding.setParameter("TransactionDate", payload.TransactionDate);
    binding.setParameter("Installments", payload.Installments);
    binding.setParameter("FixedExpense", payload.FixedExpense);

    await binding.invoke();
}

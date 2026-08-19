import JSONModel from "sap/ui/model/json/JSONModel";

export interface UiPerson {
    ID: string;
    Name: string;
    Income?: number;
    ExpenseTarget?: number;
    Currency?: { code?: string | undefined };
    ImageType?: string;
    IsActiveEntity?: boolean;
    hasDraft?: boolean;
}

export interface UiPeriod {
    year: number;
    month: number;
}

export interface UiOption {
    key: string;
    text: string;
}

export interface UiSummary {
    available: string | number;
    expenses: string | number;
    savings: string | number;
    expenseHint: string;
    targetHint: string;
    trendText: string;
    trendIcon: string;
}

export interface NewExpense {
    description: string;
    amount: string;
    installments: number;
    fixedExpense: boolean;
    transactionDate: string;
}

export interface NewPerson {
    name: string;
    email: string;
    phone: string;
    income: string;
    currency: string;
    target: string;
}

export interface NewCard {
    name: string;
    limit: string;
    currency: string;
    closingDay: string;
    dueDay: string;
}

export interface NewCategory {
    name: string;
}

export interface UiEntityOption {
    key: string;
    text: string;
}

export interface UiNewShare {
    shareUser: string;
    entity: string;
    permission: string;
}

export interface NewLiability {
    name: string;
    creditor: string;
    description: string;
    type: string;
    originalAmount: string;
    currency: string;
    interestMode: string;
    interestRate: string;
    installments: string;
    startDate: string;
    firstDueDate: string;
    externalReference: string;
}

export interface NewLiabilityTransaction {
    type: string;
    description: string;
    movementDate: string;
    installment: string;
    totalInstallments: string;
    amount: string;
    currency: string;
    externalReference: string;
}

export interface UiSimulation {
    month: string;
    year: string;
}

export interface IUiState {
    period: UiPeriod;
    periodSelector: {
        year: string;
        month: string;
        yearOptions: UiOption[];
        monthOptions: UiOption[];
    };
    monthLabel: string;
    selectedPerson: UiPerson;
    selectedPersonId: string;
    selectedPersonImage: string;
    selectedPersonDraft: boolean;
    personsEmpty: boolean;
    busy: boolean;
    transactions: unknown[];
    categories: unknown[];
    categoryDetail: unknown;
    summary: UiSummary;
    newExpense: NewExpense;
    newPerson: NewPerson;
    newCard: NewCard;
    newCategory: NewCategory;
    newShare: UiNewShare;
    newLiability: NewLiability;
    liabilityEditId: string;
    newLiabilityTransaction: NewLiabilityTransaction;
    liabilityTransactionEditId: string;
    liabilityTypeOptions: UiEntityOption[];
    liabilityStatusOptions: UiEntityOption[];
    liabilityInterestModeOptions: UiEntityOption[];
    liabilityTxTypeOptions: UiEntityOption[];
    entityOptions: UiEntityOption[];
    permissionOptions: UiEntityOption[];
    simulation: UiSimulation;
    simulationMonthOptions: UiOption[];
    simulationResult: unknown;
    invoice: {
        cards: unknown[];
        cardsEmpty: boolean;
        yearOptions: unknown[];
        monthOptions: unknown[];
        year: string;
        month: string;
        periodLabel: string;
        cardId: string;
        id: string;
        isDraft: boolean;
        loaded: boolean;
        header: unknown;
        transactionImages: Record<string, string>;
    };
    transactionCategory: {
        selectedIdentifier: string;
        currentCategoryId: string;
        currentCategoryName: string;
        selectedCategoryId: string;
        affectedText: string;
        categoryImages: Record<string, string>;
    };
    deleteTransactions: {
        selectedIdentifier: string;
        count: number;
        countText: string;
        selectAll: boolean;
    };
}

export default class UiModel extends JSONModel {

    constructor() {

        const now = new Date();

        const data: IUiState = {

            period: {
                year: now.getFullYear(),
                month: now.getMonth() + 1
            },

            periodSelector: {
                year: String(now.getFullYear()),
                month: String(now.getMonth() + 1),
                yearOptions: Array.from({ length: 6 }, (_, offset) => {
                    const year = now.getFullYear() - 4 + offset;
                    return { key: String(year), text: String(year) };
                }),
                monthOptions: Array.from({ length: 12 }, (_, index) => ({
                    key: String(index + 1),
                    text: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][index]
                }))
            },

            monthLabel: "",

            selectedPerson: {
                ID: "",
                Name: ""
            },

            selectedPersonId: "",

            selectedPersonImage: "",

            selectedPersonDraft: false,

            personsEmpty: false,

            busy: false,

            transactions: [],

            categories: [],

            categoryDetail: null,

            summary: {
                available: "",
                expenses: "",
                savings: "",
                expenseHint: "",
                targetHint: "",
                trendText: "",
                trendIcon: "sap-icon://trend-up"
            },

            newExpense: {
                description: "",
                amount: "",
                installments: 1,
                fixedExpense: false,
                transactionDate: new Date().toISOString().slice(0, 10)
            },

            newPerson: {
                name: "",
                email: "",
                phone: "",
                income: "",
                currency: "BRL",
                target: ""
            },

            newCard: {
                name: "",
                limit: "",
                currency: "BRL",
                closingDay: "3",
                dueDay: "10"
            },

            newCategory: {
                name: ""
            },

            newShare: {
                shareUser: "",
                entity: "1",
                permission: "1"
            },

            newLiability: {
                name: "",
                creditor: "",
                description: "",
                type: "GENERAL",
                originalAmount: "",
                currency: "BRL",
                interestMode: "MANUAL",
                interestRate: "",
                installments: "1",
                startDate: new Date().toISOString().slice(0, 10),
                firstDueDate: "",
                externalReference: ""
            },

            liabilityEditId: "",

            newLiabilityTransaction: {
                type: "PAYMENT",
                description: "",
                movementDate: new Date().toISOString().slice(0, 10),
                installment: "1",
                totalInstallments: "1",
                amount: "",
                currency: "BRL",
                externalReference: ""
            },

            liabilityTransactionEditId: "",

            liabilityTypeOptions: [
                { key: "GENERAL", text: "Genérica" },
                { key: "PERSONAL_LOAN", text: "Empréstimo pessoal" },
                { key: "FAMILY", text: "Familiar" },
                { key: "BANK", text: "Banco" },
                { key: "STORE", text: "Loja / Carnê" },
                { key: "TAX", text: "Imposto" },
                { key: "LEGAL", text: "Judicial" },
                { key: "CREDIT_LINE", text: "Limite / cheque especial" },
                { key: "OTHER", text: "Outros" }
            ],

            liabilityStatusOptions: [
                { key: "OPEN", text: "Em aberto" },
                { key: "PAID", text: "Paga" },
                { key: "CANCELLED", text: "Cancelada" },
                { key: "RENEGOTIATED", text: "Renegociada" },
                { key: "OVERDUE", text: "Vencida" }
            ],

            liabilityInterestModeOptions: [
                { key: "MANUAL", text: "Manual" },
                { key: "SIMPLE", text: "Simples" },
                { key: "COMPOUND", text: "Composto" }
            ],

            liabilityTxTypeOptions: [
                { key: "OPENING", text: "Abertura" },
                { key: "PAYMENT", text: "Pagamento" },
                { key: "INTEREST", text: "Juros" },
                { key: "FEE", text: "Taxa" },
                { key: "DISCOUNT", text: "Desconto" },
                { key: "AMORTIZATION", text: "Amortização" },
                { key: "RENEGOTIATION", text: "Renegociação" },
                { key: "REVERSAL", text: "Estorno" }
            ],

            entityOptions: [
                { key: "1", text: "Persons" },
                { key: "2", text: "Shares" },
                { key: "3", text: "Entities" },
                { key: "4", text: "Categories" },
                { key: "5", text: "Cards" },
                { key: "6", text: "Invoices" },
                { key: "7", text: "Transactions" },
                { key: "8", text: "Backups" },
                { key: "9", text: "Liabilities" },
                { key: "10", text: "LiabilityTransactions" },
                { key: "11", text: "Financings" },
                { key: "12", text: "FinancingInstallments" }
            ],

            permissionOptions: [
                { key: "1", text: "Viewer" },
                { key: "2", text: "Creator" },
                { key: "3", text: "Modifier" },
                { key: "4", text: "Deleter" }
            ],

            simulation: {
                month: "",
                year: ""
            },

            simulationMonthOptions: [],

            simulationResult: null,

            invoice: {
                cards: [],
                cardsEmpty: false,
                yearOptions: [],
                monthOptions: [],
                year: String(now.getFullYear()),
                month: String(now.getMonth() + 1),
                periodLabel: "",
                cardId: "",
                id: "",
                isDraft: false,
                loaded: false,
                header: {},
                transactionImages: {}
            },

            transactionCategory: {
                selectedIdentifier: "",
                currentCategoryId: "",
                currentCategoryName: "",
                selectedCategoryId: "",
                affectedText: "",
                categoryImages: {}
            },

            deleteTransactions: {
                selectedIdentifier: "",
                count: 0,
                countText: "",
                selectAll: false
            }

        };

        super(data);

    }

}
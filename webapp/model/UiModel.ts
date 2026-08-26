import JSONModel from "sap/ui/model/json/JSONModel";
import { TRANSACTION_TYPE_OPTIONS } from "../util/liabilityRules";

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
    description: string;
    totalAmount: string;
    currency: string;
    dueDay: string;
}

export interface NewLiabilityTransaction {
    type: string;
    description: string;
    date: string;
    amount: string;
    currency: string;
}

export interface UiSimulation {
    month: string;
    year: string;
}

export interface IUiState {

    busy: boolean;

    managerDialogInDraft: boolean;

    period: UiPeriod;

    periodTotals: {
        TotalExpenses: number;
        MonthExpenses: number;
        MonthLiabilitiesExpenses: number;
        MonthTotalExpenses: number;
        MonthExpensesToPay: number;
        MonthExpensesClosed: number;
        MonthExpensesPayed: number;
        MonthCriticallity: number;
        CriticallityToPay: number;
        CurrencyCode: string;
    };

    periodSelector: {
        year: string;
        month: string;
        yearOptions: UiOption[];
        monthOptions: UiOption[];
    };

    monthLabel: string;

    personsEmpty: boolean;

    selectedPerson: UiPerson;

    selectedPersonId: string;

    selectedPersonImage: string;

    selectedPersonDraft: boolean;

    summary: UiSummary;

    transactions: unknown[];

    categories: unknown[];

    categoryDetail: unknown;

    cardImages: Record<string, string>;

    newExpense: NewExpense;

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

    newPerson: NewPerson;

    newCard: NewCard;

    dialogCardImages: Record<string, string>;

    newCategory: NewCategory;

    dialogCategoryImages: Record<string, string>;

    newShare: UiNewShare;

    entityOptions: UiEntityOption[];

    permissionOptions: UiEntityOption[];

    newLiability: NewLiability;

    liabilityEditId: string;

    newLiabilityTransaction: NewLiabilityTransaction;

    liabilityTransactionEditId: string;

    liabilityTxTypeOptions: UiEntityOption[];

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
}

export default class UiModel extends JSONModel {

    constructor() {

        const now = new Date();
        const today = new Date().toISOString().slice(0, 10);

        const data: IUiState = {

            busy: false,

            managerDialogInDraft: false,

            period: {
                year: now.getFullYear(),
                month: now.getMonth() + 1
            },

            periodTotals: {
                TotalExpenses: 0,
                MonthExpenses: 0,
                MonthLiabilitiesExpenses: 0,
                MonthTotalExpenses: 0,
                MonthExpensesToPay: 0,
                MonthExpensesClosed: 0,
                MonthExpensesPayed: 0,
                MonthCriticallity: 0,
                CriticallityToPay: 0,
                CurrencyCode: ""
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

            personsEmpty: false,

            selectedPerson: {
                ID: "",
                Name: ""
            },

            selectedPersonId: "",

            selectedPersonImage: "",

            selectedPersonDraft: false,

            summary: {
                available: "",
                expenses: "",
                savings: "",
                expenseHint: "",
                targetHint: "",
                trendText: "",
                trendIcon: "sap-icon://trend-up"
            },

            transactions: [],

            categories: [],

            categoryDetail: null,

            cardImages: {},

            newExpense: {
                description: "",
                amount: "",
                installments: 1,
                fixedExpense: false,
                transactionDate: today
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

            dialogCardImages: {},

            newCategory: {
                name: ""
            },

            dialogCategoryImages: {},

            newShare: {
                shareUser: "",
                entity: "1",
                permission: "1"
            },

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
            ],

            permissionOptions: [
                { key: "1", text: "Viewer" },
                { key: "2", text: "Creator" },
                { key: "3", text: "Modifier" },
                { key: "4", text: "Deleter" }
            ],

            newLiability: {
                name: "",
                description: "",
                totalAmount: "",
                currency: "BRL",
                dueDay: String(new Date().getDate())
            },

            liabilityEditId: "",

            newLiabilityTransaction: {
                type: "IN",
                description: "",
                date: today,
                amount: "",
                currency: "BRL"
            },

            liabilityTransactionEditId: "",

            liabilityTxTypeOptions: TRANSACTION_TYPE_OPTIONS,

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
            }

        };

        super(data);

    }

}

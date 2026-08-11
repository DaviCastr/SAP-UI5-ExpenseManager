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

export interface UiSimulation {
    month: string;
    year: string;
}

export interface IUiState {
    period: UiPeriod;
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
    entityOptions: UiEntityOption[];
    permissionOptions: UiEntityOption[];
    simulation: UiSimulation;
    simulationMonthOptions: UiOption[];
    simulationResult: unknown;
}

export default class UiModel extends JSONModel {

    constructor() {

        const now = new Date();

        const data: IUiState = {

            period: {
                year: now.getFullYear(),
                month: now.getMonth() + 1
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
                currency: "BRL"
            },

            newCategory: {
                name: ""
            },

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

            simulationResult: null

        };

        super(data);

    }

}
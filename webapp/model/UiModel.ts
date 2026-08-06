import JSONModel from "sap/ui/model/json/JSONModel";

export interface UiPerson {
    ID: string;
    Name: string;
    Income?: number;
    ExpenseTarget?: number;
    Currency?: string | { code?: string };
    ImageType?: string;
}

export interface UiPeriod {
    year: number;
    month: number;
}

export interface UiOption {
    key: string;
    text: string;
    isDraft?: boolean;
}

export interface UiSummary {
    available: string;
    income: string;
    expenses: string;
    savings: string;
    target: string;
    expenseHint: string;
    targetHint: string;
    trendText: string;
    trendIcon: string;
}

export interface NewExpense {
    description: string;
    amount: string;
    cardId: string;
    categoryId: string;
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
    personsEmpty: boolean;
    busy: boolean;
    transactions: unknown[];
    cards: unknown[];
    categories: unknown[];
    categoryDetail: unknown;
    summary: UiSummary;
    expenseCardOptions: UiOption[];
    expenseCategoryOptions: UiOption[];
    newExpense: NewExpense;
    newPerson: NewPerson;
    newCard: NewCard;
    newCategory: NewCategory;
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

            personsEmpty: false,

            busy: false,

            transactions: [],

            cards: [],

            categories: [],

            categoryDetail: null,

            summary: {
                available: "",
                income: "",
                expenses: "",
                savings: "",
                target: "",
                expenseHint: "",
                targetHint: "",
                trendText: "",
                trendIcon: "sap-icon://trend-up"
            },

            expenseCardOptions: [],

            expenseCategoryOptions: [],

            newExpense: {
                description: "",
                amount: "",
                cardId: "",
                categoryId: "",
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
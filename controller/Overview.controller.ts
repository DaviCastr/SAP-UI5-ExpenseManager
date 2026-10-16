import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import List from "sap/m/List";
import SearchField from "sap/m/SearchField";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import Context from "sap/ui/model/Context";
import type ListBinding from "sap/ui/model/ListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { BaseController } from "./BaseController";
import type Home from "./Home.controller";
import type Component from "../Component";
import { ODataService, DRAFT_FILTER, DRAFT_EXPAND } from "../service/ODataService";
import { InvoiceService, type Period } from "../service/InvoiceService";
import { PeriodService } from "../service/PeriodService";
import { MediaService } from "../service/MediaService";
import { DashboardRenderer } from "../service/DashboardRenderer";
import {
    getTransactionsByCategory,
    type CategoryTransactionsProperties,
    type CategoryBreakdownItem
} from "../util/expenseApi";
import { isSessionExpiredError, isBackendUnavailableError } from "../util/http";
import { getBackendErrorMessage } from "../util/feedback";
import { runExclusiveAction } from "../util/draftDialogFlow";
import { PERSON_CHANNEL, PERSON_DRAFT_CLOSING, PERSON_SELECTED } from "../util/personEvents";
import type { UiPerson } from "../model/UiModel";

interface CardRow {
    ID: string;
    Name: string;
}

/**
 * "Visão geral" tab: period navigation, metrics, movements, spending by
 * category, cards and debts of the person selected in the workspace (Home).
 * Reloads whenever the workspace announces a new selection or a reload.
 */
export default class Overview extends BaseController {
    private _odata?: ODataService;
    private _invoiceService?: InvoiceService;
    private _mediaService?: MediaService;
    private _renderer?: DashboardRenderer;
    private _serviceModelRef?: ODataModel;

    private readonly periodService = new PeriodService();

    public onInit(): void {
        this.getOwnerComponent()?.getEventBus().subscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
        this.getOwnerComponent()?.getEventBus().subscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);

        if (this.getSelectedPersonId()) {
            this.onPersonSelected();
        }
    }

    public onExit(): void {
        this.getOwnerComponent()?.getEventBus().unsubscribe(PERSON_CHANNEL, PERSON_SELECTED, this.onPersonSelected);
        this.getOwnerComponent()?.getEventBus().unsubscribe(PERSON_CHANNEL, PERSON_DRAFT_CLOSING, this.onDraftClosing);
    }

    public onOpenExpenseDialog(): void {
        this.workspace()?.onOpenExpenseDialog();
    }

    public onOpenCardManagerDialog(): void {
        this.navTo("Cards");
    }

    public onOpenCategoryManagerDialog(): void {
        this.navTo("Categories");
    }

    public onOpenInvoicesDialog(): void {
        this.workspace()?.onOpenInvoicesDialog();
    }

    public onOpenLiabilitiesDialog(): void {
        this.workspace()?.onOpenLiabilitiesDialog();
    }

    public onOpenLiabilityTransactions(oEvent: Event): void {
        this.workspace()?.onOpenLiabilityTransactions(oEvent);
    }

    public onRestoreBackup(): void {
        this.workspace()?.onRestoreBackup();
    }

    public onPreviousMonth(): void {
        this.navigateMonth(-1);
    }

    public onNextMonth(): void {
        this.navigateMonth(1);
    }

    public onThisMonth(): void {
        const period = this.periodService.current();
        this.getUiModel().setProperty("/period", period);
        this.applyPeriodData();
    }

    public onHomeYearChanged(): void {
        const ui = this.getUiModel();
        const period = this.currentPeriod();
        period.year = Number(ui.getProperty("/periodSelector/year")) || period.year;
        ui.setProperty("/period", period);
        this.applyPeriodData();
    }

    public onHomeMonthChanged(): void {
        const ui = this.getUiModel();
        const period = this.currentPeriod();
        period.month = Number(ui.getProperty("/periodSelector/month")) || period.month;
        ui.setProperty("/period", period);
        this.applyPeriodData();
    }

    public async onSendInvoices(): Promise<void> {
        await runExclusiveAction("sendInvoices", async () => {
            const period = this.currentPeriod();

            if (!this._invoiceService) {
                return;
            }

            const ui = this.getUiModel();
            ui.setProperty("/busy", true);

            try {
                const sent = await this._invoiceService.sendInvoices(this.getSelectedPersonId(), period);
                if (sent) {
                    MessageToast.show(this.getText("sendInvoicesSuccess"));
                } else {
                    MessageBox.error(this.getText("sendInvoicesNoData"));
                }
            } catch (error) {
                if (!isSessionExpiredError(error) && !isBackendUnavailableError(error)) {
                    const detail = getBackendErrorMessage(error);
                    MessageBox.error(
                        detail ? `${this.getText("sendInvoicesError")}\n\n${detail}` : this.getText("sendInvoicesError")
                    );
                }
            } finally {
                ui.setProperty("/busy", false);
            }
        });
    }

    /**
     * Filters the local (JSON) transaction list by date, description, category
     * or card. The search text is matched against `SearchText` (description +
     * category + card + formatted date) assembled by the DashboardRenderer, so a
     * query such as "mercado", "Nubank" or "15/08" finds the matching rows client-side.
     *
     * @returns {void}
     */
    public onTransactionSearch(): void {
        const search = this.byId("transactionsSearch") as SearchField | undefined;
        const list = this.byId("transactionsList") as List | undefined;
        const binding = list?.getBinding("items") as ListBinding | undefined;
        const query = search?.getValue()?.trim() || "";

        if (!binding) {
            return;
        }

        if (!query) {
            binding.filter([]);
            return;
        }

        binding.filter([new Filter({ path: "SearchText", operator: FilterOperator.Contains, value1: query })]);
    }

    public onCategoryPress(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const bindingContext = source?.getBindingContext("ui") as Context | undefined;
        const category = bindingContext?.getObject() as CategoryBreakdownItem | undefined;

        if (!category) {
            return;
        }

        const ui = this.getUiModel();
        const period = this.currentPeriod();

        ui.setProperty("/busy", true);

        void getTransactionsByCategory(this.getServiceModel(), this.getSelectedPersonId(), category.ID, false, period.year, period.month)
            .then((result: CategoryTransactionsProperties) => {
                ui.setProperty("/categoryDetail", result);
                return this.workspace()?.openCategoryDetailDialog();
            })
            .catch((error) => this.handleError(error, "errorLoadCategoryDetail"))
            .finally(() => ui.setProperty("/busy", false));
    }

    /**
     * Opens the category picker for the transaction whose action button was
     * pressed, mirroring the selected Identifier and its current category into
     * the ui model (same contract used by the invoice dialog).
     *
     * @param {Event} oEvent the press event
     * @returns {void}
     */
    public onTransactionCategoryPress(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const transaction = source?.getBindingContext("ui")?.getObject() as
            | { Identifier?: string; Category?: { ID?: string; Name?: string } | null }
            | undefined;

        if (!transaction?.Identifier) {
            return;
        }

        const ui = this.getUiModel();
        ui.setProperty("/transactionCategory/selectedIdentifier", transaction.Identifier);
        ui.setProperty("/transactionCategory/currentCategoryId", transaction.Category?.ID || "");
        ui.setProperty("/transactionCategory/currentCategoryName", transaction.Category?.Name || "");
        this.workspace()?.openTransactionCategoryDialog();
    }

    /**
     * Opens the batch-exclusion dialog for the transaction whose action button
     * was pressed, mirroring the selected Identifier into the ui model (same
     * contract used by the invoice dialog).
     *
     * @param {Event} oEvent the press event
     * @returns {void}
     */
    public onTransactionDeletePress(oEvent: Event): void {
        const source = oEvent.getSource<Control>();
        const transaction = source?.getBindingContext("ui")?.getObject() as
            | { Identifier?: string }
            | undefined;

        if (!transaction?.Identifier) {
            return;
        }

        this.getUiModel().setProperty("/deleteTransactions/selectedIdentifier", transaction.Identifier);
        this.workspace()?.openDeleteTransactionsDialog();
    }

    /**
     * Rebinds the person-scoped sections and reloads the dashboard for the
     * person currently selected in the workspace.
     */
    private readonly onPersonSelected = (): void => {
        void this.ensureServices().then((ready) => {
            if (!ready) {
                return;
            }

            this.bindPersonContext(this.getSelectedPersonId());

            if (this.getSelectedPersonId()) {
                this.applyPeriodData();
            }
        });
    };

    private readonly onDraftClosing = (): void => {
        ["personDetails", "cardsList", "metricsGrid", "liabilitiesList"].forEach((id) => this.byId(id)?.unbindObject());
    };

    private async ensureServices(): Promise<boolean> {
        const model = await this.ensureServiceModel();

        if (!model) {
            return false;
        }

        if (!this._odata || this._serviceModelRef !== model) {
            this._odata = new ODataService(model);
            this._invoiceService = new InvoiceService(this._odata);
            this._mediaService = new MediaService(this._odata, this.getUiModel());
            this._renderer = new DashboardRenderer(this._invoiceService, this.getUiModel(), (key, parameters) => this.getText(key, parameters));
            this._serviceModelRef = model;
        }

        return true;
    }

    /**
     * Binds the person-scoped sections (`personDetails`, `cardsList`,
     * `metricsGrid`, `liabilitiesList`) to the path of the selected person
     * (its draft when one is open, otherwise the active entity).
     *
     * @param {string} id the person id; empty when the selection is cleared
     */
    private bindPersonContext(id: string): void {
        const path = this.workspace()?.personPathFor(id) ?? "";
        this.byId("personDetails")?.setModel(this.getView()?.getModel() as ODataModel);
        this.byId("personDetails")?.bindObject(path);
        this.byId("cardsList")?.bindObject(path);
        this.byId("metricsGrid")?.bindObject(path);
        this.byId("liabilitiesList")?.bindObject(path);
    }

    private applyPeriodData(): void {
        const ui = this.getUiModel();
        const period = this.currentPeriod();
        ui.setProperty("/period", period);
        ui.setProperty("/monthLabel", this.periodService.label(period.year, period.month));
        ui.setProperty("/periodSelector/year", String(period.year));
        ui.setProperty("/periodSelector/month", String(period.month));
        this.resetTransactionSearch();
        void this.loadDashboard();
    }

    /**
     * Clears the local transaction search field and removes the filter applied
     * to the JSON transaction list. Called whenever the period or person
     * changes, so a stale query does not hide the freshly loaded rows.
     *
     * @returns {void}
     */
    private resetTransactionSearch(): void {
        const search = this.byId("transactionsSearch") as SearchField | undefined;
        const list = this.byId("transactionsList") as List | undefined;
        const binding = list?.getBinding("items") as ListBinding | undefined;
        if (search) {
            search.setValue("");
        }
        binding?.filter([]);
    }

    private navigateMonth(delta: number): void {
        const period = this.currentPeriod();
        this.getUiModel().setProperty("/period", this.periodService.shift(period, delta));
        this.applyPeriodData();
    }

    private currentPeriod(): Period {
        return this.periodService.currentOrDefault(
            this.getUiModel().getProperty("/period") as Period | undefined
        );
    }

    private async loadDashboard(): Promise<void> {
        const ui = this.getUiModel();
        const personId = this.getSelectedPersonId();
        const period = this.currentPeriod();
        const invoiceService = this._invoiceService;
        const renderer = this._renderer;

        if (!personId || !invoiceService || !renderer) {
            return;
        }

        ui.setProperty("/busy", true);

        try {
            const invoice = await invoiceService.getCompleteInvoice(personId, period);
            const expenses = Number(invoice.TotalAmount) || 0;
            const transactions = renderer.renderInvoice(invoice, this.selectedPerson());

            const preferDraft = ui.getProperty("/selectedPersonDraft") === true;

            void this._mediaService?.resolveCategoryImages(transactions, preferDraft);
            void renderer.loadTrend(personId, period, expenses);

            // The person-scoped metrics (Income, ExpenseTarget, TotalExpenses*)
            // are bound directly to the OData V4 model via metricsGrid.
            const cards = await this._odata?.requestEntitySet<CardRow & { IsActiveEntity?: boolean }>("Cards", {
                select: ["ID", "Name"],
                filters: [new Filter({ path: "Person/ID", operator: FilterOperator.EQ, value1: personId })],
                filterExpression: DRAFT_FILTER,
                expand: DRAFT_EXPAND
            });
            if (cards) {
                void this._mediaService?.resolveCardImages(cards, preferDraft);
            }
        } catch (error) {
            this.handleLoadError(error, "backendUnavailableLogin");
        } finally {
            ui.setProperty("/busy", false);
        }
    }

    private selectedPerson(): { Income?: number; ExpenseTarget?: number; Currency?: unknown } {
        return (this.getUiModel().getProperty("/selectedPerson") as UiPerson) || {};
    }

    private getSelectedPersonId(): string {
        return (this.getUiModel().getProperty("/selectedPersonId") as string) || "";
    }

    private workspace(): Home | undefined {
        return (this.getOwnerComponent() as unknown as Component | undefined)?.getWorkspace();
    }
}

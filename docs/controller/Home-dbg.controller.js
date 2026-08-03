sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator", "sap/m/MessageBox", "sap/m/MessageToast", "./BaseController", "../auth/AuthenticationService", "../util/Environment", "../util/format"], function (Filter, FilterOperator, MessageBox, MessageToast, ___BaseController, ___auth_AuthenticationService, __Environment, ___util_format) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = ___BaseController["BaseController"];
  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const Environment = _interopRequireDefault(__Environment);
  const EnvironmentType = __Environment["EnvironmentType"];
  const formatCurrency = ___util_format["formatCurrency"];
  class Home extends BaseController {
    get uiModel() {
      return this.getOwnerComponent()?.getModel("ui");
    }
    onInit() {
      void this.bootstrap();
    }
    async bootstrap() {
      const model = await this.waitForServiceModel();
      if (!model) {
        if (Environment.current() !== EnvironmentType.GITHUB) {
          MessageBox.error("Não foi possível conectar ao serviço financeiro.");
        }
        return;
      }
      await this.loadPersons(model);
    }
    onPersonChange() {
      const ui = this.uiModel;
      const personId = ui.getProperty("/selectedPerson/ID");
      const persons = ui.getProperty("/persons");
      const person = persons.find(item => item.ID === personId);
      if (person) {
        const model = this.getOwnerComponent()?.getModel();
        void this.loadPersonData(model, person);
      }
    }
    async onLogout() {
      await AuthenticationService.logout();
      this.navTo("Login");
    }
    onOpenExpenseDialog() {
      this.uiModel.setProperty("/newExpense", {
        description: "",
        amount: "",
        cardId: "",
        categoryId: ""
      });
      this.byId("expenseDialog").open();
    }
    onCloseExpenseDialog() {
      this.byId("expenseDialog").close();
    }
    async onCreateExpense() {
      const expense = this.uiModel.getProperty("/newExpense");
      if (!expense.description || !expense.amount || !expense.cardId || !expense.categoryId) {
        MessageBox.warning("Preencha descrição, valor, cartão e categoria para continuar.");
        return;
      }
      const model = this.getServiceModel();
      const action = model.bindContext("/AddCardExpense(...)");
      action.setParameter("CardId", expense.cardId);
      action.setParameter("CategoryId", expense.categoryId);
      action.setParameter("Description", expense.description);
      action.setParameter("Value", Number(expense.amount.replace(",", ".")));
      action.setParameter("Currency", "BRL");
      action.setParameter("TransactionDate", new Date().toISOString().slice(0, 10));
      action.setParameter("Installments", 1);
      action.setParameter("FixedExpense", false);
      try {
        await action.invoke();
        this.byId("expenseDialog").close();
        MessageToast.show("Gasto registrado com sucesso.");
      } catch (error) {
        MessageBox.error("Não foi possível registrar o gasto. Verifique sua conexão e tente novamente.");
      }
    }
    onOpenCardDialog() {
      this.uiModel.setProperty("/newCard", {
        name: "",
        limit: "",
        currency: "BRL"
      });
      this.byId("cardDialog").open();
    }
    onCloseCardDialog() {
      this.byId("cardDialog").close();
    }
    async onCreateCardDraft() {
      const card = this.uiModel.getProperty("/newCard");
      if (!card.name || !card.limit) {
        MessageBox.warning("Informe o nome e o limite do cartão.");
        return;
      }
      const model = this.getServiceModel();
      const binding = model.bindList("/Cards", undefined, undefined, undefined, {
        $$updateGroupId: "draft"
      });
      binding.create({
        Name: card.name,
        Limit: Number(card.limit.replace(",", ".")),
        AvailableLimit: Number(card.limit.replace(",", ".")),
        Currency_code: card.currency,
        DueDay: 10,
        ClosingDay: 3
      });
      try {
        await model.submitBatch("draft");
        this.byId("cardDialog").close();
        MessageToast.show("Cartão salvo como rascunho. Revise-o antes de publicar.");
      } catch (error) {
        MessageBox.error("Não foi possível salvar o rascunho do cartão.");
      }
    }
    async waitForServiceModel() {
      const environment = Environment.current();
      for (let attempt = 0; attempt < 40; attempt++) {
        const model = this.getOwnerComponent()?.getModel();
        if (model) {
          const serviceUrl = typeof model.getServiceUrl === "function" ? model.getServiceUrl() : "";
          if (environment === EnvironmentType.GITHUB) {
            if (serviceUrl && serviceUrl.indexOf("/api/") !== 0) {
              return model;
            }
          } else {
            return model;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return null;
    }
    async loadPersons(model) {
      try {
        const binding = model.bindList("/Persons", undefined, undefined, undefined, {
          $select: "ID,Name,Income,ExpenseTarget,Currency"
        });
        const contexts = await binding.requestContexts();
        const persons = contexts.map(context => context.getObject());
        const ui = this.uiModel;
        ui.setProperty("/persons", persons);
        const currentId = ui.getProperty("/selectedPerson/ID");
        const selected = persons.find(person => person.ID === currentId) || persons[0];
        ui.setProperty("/selectedPerson", selected || {
          ID: ""
        });
        if (selected) {
          await this.loadPersonData(model, selected);
        } else {
          ui.setProperty("/monthLabel", this.currentMonthLabel());
        }
      } catch (error) {
        MessageBox.error("Não foi possível carregar suas pessoas. Verifique sua conexão.");
      }
    }
    async loadPersonData(model, person) {
      const ui = this.uiModel;
      ui.setProperty("/busy", true);
      try {
        const now = new Date();
        const startPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
        const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const toIso = date => date.toISOString().slice(0, 10);
        const filters = [new Filter({
          path: "Invoice/Card/Person/ID",
          operator: FilterOperator.EQ,
          value1: person.ID
        }), new Filter({
          path: "Date",
          operator: FilterOperator.GE,
          value1: toIso(startPrevious)
        }), new Filter({
          path: "Date",
          operator: FilterOperator.LT,
          value1: toIso(startNext)
        })];
        const binding = model.bindList("/Transactions", undefined, undefined, filters, {
          $select: "Amount,Date,Currency"
        });
        const contexts = await binding.requestContexts();
        let currentExpenses = 0;
        let previousExpenses = 0;
        contexts.forEach(context => {
          const transaction = context.getObject();
          const amount = Number(transaction.Amount) || 0;
          const date = new Date(transaction.Date);
          if (date >= startCurrent && date < startNext) {
            currentExpenses += amount;
          } else if (date >= startPrevious && date < startCurrent) {
            previousExpenses += amount;
          }
        });
        const income = Number(person.Income) || 0;
        const target = Number(person.ExpenseTarget) || 0;
        const available = income - currentExpenses;
        const savings = income - currentExpenses;
        const currency = person.Currency || "BRL";
        const trend = previousExpenses > 0 ? (currentExpenses - previousExpenses) / previousExpenses * 100 : currentExpenses > 0 ? 100 : 0;
        const trendText = previousExpenses > 0 ? `${Math.abs(Math.round(trend))}% ${trend <= 0 ? "menos" : "mais"} que o mês anterior` : currentExpenses > 0 ? "Sem comparação com o mês anterior" : "Sem gastos registrados este mês";
        const trendIcon = trend > 0 ? "sap-icon://trend-down" : "sap-icon://trend-up";
        const targetPercent = target > 0 ? Math.round(currentExpenses / target * 100) : 0;
        ui.setProperty("/summary", {
          available: formatCurrency(available, currency),
          income: formatCurrency(income, currency),
          expenses: formatCurrency(currentExpenses, currency),
          savings: formatCurrency(savings, currency),
          target: formatCurrency(target, currency),
          expenseHint: target > 0 ? `${targetPercent}% da meta utilizada` : `${Math.round(currentExpenses)} de gastos no mês`,
          targetHint: target > 0 ? "Meta planejada para o mês" : "Defina uma meta de gasto",
          trendText,
          trendIcon
        });
        ui.setProperty("/monthLabel", this.currentMonthLabel());
      } catch (error) {
        MessageBox.error("Não foi possível carregar os dados desta pessoa.");
      } finally {
        ui.setProperty("/busy", false);
      }
    }
    currentMonthLabel() {
      const label = new Date().toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric"
      });
      return `Visão geral • ${label}`;
    }
    getServiceModel() {
      const model = this.getOwnerComponent()?.getModel();
      if (!model) {
        throw new Error("O serviço financeiro não está disponível.");
      }
      return model;
    }
  }
  return Home;
});
//# sourceMappingURL=Home-dbg.controller.js.map

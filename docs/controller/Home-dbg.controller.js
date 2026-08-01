sap.ui.define(["sap/m/MessageBox", "sap/m/MessageToast", "./BaseController"], function (MessageBox, MessageToast, ___BaseController) {
  "use strict";

  const BaseController = ___BaseController["BaseController"];
  class Home extends BaseController {
    get uiModel() {
      return this.getOwnerComponent()?.getModel("ui");
    }
    onOpenInsights() {
      MessageToast.show("O planejamento detalhado será a próxima área do seu painel.");
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
        await action.execute();
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

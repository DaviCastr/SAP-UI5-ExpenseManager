# Meu Fluxo — Expense Manager

Aplicativo financeiro responsivo construído em SAPUI5 Freestyle e TypeScript. A interface foi pensada primeiro para uso diário: saldo, gastos, cartões e ações frequentes ficam no mesmo painel, com adaptação para celular, tablet e desktop.

## O que já está pronto

- Dashboard financeiro responsivo e com visual próprio.
- Listas conectadas às entidades OData `Transactions`, `Cards` e `Categories` do CAP.
- Registro de gastos pela action `AddCardExpense` do serviço.
- Criação de cartão usando OData V4 Draft: o registro é enviado como rascunho para revisão antes da ativação.
- Build estático para GitHub Pages e pacote HTML5 para SAP BTP.

## Executar e validar

```sh
npm run start-mock
npm run ts-typecheck
npm run build
npm run build:github-pages
```

O build do GitHub Pages é publicado na pasta `docs/`.

## Integração com CAP e BTP

No BTP, o app chama o serviço por `/api/service/ExpenseManager/`. A rota `/api` é encaminhada pelo destination `ExpenseManager` e protegida por XSUAA em `xs-app.json`; o HTML5 Application Router cuida do redirecionamento de login. Não há token, senha ou segredo no navegador.

Para desenvolvimento local, `ui5-local.yaml` encaminha a mesma rota `/api` ao serviço CAP remoto. Se o serviço exigir login, execute-o através de um approuter local ou use o mock durante o desenvolvimento visual.

## GitHub Pages: limite de autenticação

GitHub Pages hospeda apenas arquivos estáticos. Portanto, ele é adequado para a demonstração pública da interface, mas não pode guardar um client secret nem atuar como proxy seguro para um CAP protegido por XSUAA.

Para usar dados reais no GitHub Pages, é necessário um componente de servidor sob seu controle (por exemplo, um approuter/BFF no BTP) que faça a autenticação e exponha uma API com CORS controlado. A alternativa é configurar no provedor de identidade um cliente SPA público com PKCE, redirect URI do GitHub Pages e CORS permitido — isso depende da configuração de segurança do seu tenant e não deve reutilizar o client confidencial do CAP.

## Publicação no BTP

Os dois projetos devem ser publicados no mesmo space. Primeiro publique o CAP, pois ele cria a instância XSUAA compartilhada; depois publique este projeto UI5. O MTA UI5 referencia a instância existente `ExpenseManager-uaa`.

```sh
# no projeto CAP
npm run build
cf deploy mta_archives/ExpenseManager.mtar

# neste projeto UI5
npm run build:mta
cf deploy mta_archives/*.mtar
```

O `mta.yaml` declara a instância XSUAA do CAP como serviço existente e o destination com `HTML5.ForwardAuthToken: true`. Portanto, o token do usuário autenticado é encaminhado ao CAP e reconhecido pelo mesmo provedor de identidade.

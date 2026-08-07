# Ambiente LOCAL — Por proxy local

Quando você roda o desenvolvimento em `http://localhost:8087` com autenticação, o app usa a **URL relativa** `/api/service/ExpenseManager/`, e quem fala com o backend real é o **proxy local** (`custom-proxy/`). Esse é o ponto mais difícil da arquitetura; aqui vai o passo a passo.

## Como rodar

```bash
npm run start          # = fiori run --config ./ui5-local.yaml --open "index.html"
npm run start-local    # idem
```

## Por que um proxy?

O navegador aplica a **Same-Origin Policy (CORS)**. Se o `ODataModel` apontasse direto para o CAP na BTP (`https://...-srv.cfapps...`), o navegador faria requisições **cross-origin** de `localhost` e o CORS as bloquearia — porque o `server.ts` do CAP somente libera a origem `https://davicastro.github.io`.

O proxy faz tudo ficar **na mesma origem**:

- O navegador só fala com `http://localhost:8087` (mesma origem).
- O proxy (Node, do lado do servidor) conversa com a BTP. Servidor não sofre CORS.

## Qual URL o modelo usa?

Arquivo: `webapp/Component.ts`, que chama `XsuaaAuthHelper.setLocalOverrides()` (`webapp/auth/providers/XsuaaAuthHelper.ts`):

```ts
runtimeConfig.odataService = "/api/service/ExpenseManager/";   // relativa
```

O `ODataModel` recebe essa URL relativa:

```ts
new ODataModel({ serviceUrl: "/api/service/ExpenseManager/", ... });
```

## Onde está a URL real?

A URL real **não fica no modelo nem no código TS do app**. Ela está somente no `ui5-local.yaml`:

```yaml
server:
  customMiddleware:
    - name: expense-manager-local-proxy
      configuration:
        backend: https://orgname-dev-expensemanager-srv.cfapps.us10-003.hana.ondemand.com
```

O `name` é o pacote npm `expense-manager-local-proxy` (declarado em `package.json` como `"file:./custom-proxy"`), cujo `custom-proxy/package.json` aponta `"main": "index.js"`. Portanto **não existe comando separado para ligar o proxy** — ele sobe automaticamente quando o `fiori` lê o `ui5-local.yaml`.

## Papel do proxy (`custom-proxy/index.js`)

1. Se o path não começa com `/api/` nem `/auth/`, responde direto com `next()`.
2. Se começa com `/api`, remove o prefixo:

   ```
   /api/service/ExpenseManager/Person   →   /service/ExpenseManager/Person
   ```

   (o CAP serve o OData em `/service/...`, sem o `/api`.)
3. `/auth/...` é repassado como está (login/refresh de troca de código).
4. Encaminha para a `backend` (URL real) mantendo o `Authorization: Bearer`.

## Fluxo OAuth no LOCAL

1. `GithubPagesAuthenticationProvider.login()` → `XsuaaAuthHelper.createAuthorizationFlow()`.
2. Navegador vai ao XSUAA e volta com `?code=...&state=...`.
3. `isAuthenticated()` troca o `code` por token via `/auth/login` (através do proxy).
4. Token salvo em `sessionStorage` e usado em todas as chamadas.

> `tokenEndpoint` e `refreshEndpoint` tornam-se relativos (`/auth/login`, `/auth/refresh`) em `setLocalOverrides()`; o proxy os encaminha ao CAP real. O **client secret nunca chega ao navegador**.

## Testando com o backend desligado

Se o serviço CAP estiver fora do ar, as chamadas ao proxy falham. O frontend trata isso: mostra um popup de erro e redireciona para a tela de login — ver `webapp/controller/Home.controller.ts` → `showBackendError()`.

## Links

- [Visão geral da autenticação](./auth-overview.md)
- [Ambiente GITHUB Pages (direto, sem proxy)](./auth-github-pages.md)
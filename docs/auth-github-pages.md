# Ambiente GITHUB Pages — OAuth direto, sem proxy

No GitHub Pages **não existe proxy**. O app publicado em `https://davicastr.github.io/SAP-UI5-ExpenseManager/` fala **direto** com o CAP na BTP, usando a URL real. Por isso este ambiente é onde o **CORS** e o **client secret protegido no servidor** importam de verdade.

## Detecção

O hostname contém `github.io` → `EnvironmentType.GITHUB` (`webapp/util/Environment.ts`).

## Qual URL o modelo usa?

O fluxo GITHUB **não** chama `setLocalOverrides()`. O `odataService` permanece o valor **real** vindo de `webapp/config/runtime-config.json`:

```json
{
  "odataService": "https://orgname-dev-expensemanager-srv.cfapps.us10-003.hana.ondemand.com/service/ExpenseManager/"
}
```

Logo, o `ODataModel` recebe essa URL **absoluta**:

```ts
new ODataModel({ serviceUrl: "https://...-srv.cfapps.../service/ExpenseManager/", ... });
```

Como é absoluta e de outro domínio, o navegador faz requisições **cross-origin** → precisa dos headers CORS que o `server.ts` do CAP retorna para a origem `https://davicastro.github.io`.

## Fluxo de autenticação (Authorization Code direto)

Provider: `webapp/auth/providers/GithubPagesAuthenticationProvider.ts`

1. **`login()`** → `XsuaaAuthHelper.createAuthorizationFlow()` monta a URL do XSUAA com `client_id`, `redirect_uri`, `scope`, `state`; o navegador é redirecionado para o XSUAA.
2. De volta com `?code=...&state=...` na URL.
3. **`isAuthenticated()`** valida o `state` e troca o `code` por token chamando o endpoint **do CAP** (`/auth/login`), que repassa ao XSUAA (o client secret fica só no servidor CAP).
4. Token salvo em `SessionStorage`; as chamadas ao CAP usam `Authorization: Bearer <token>`.

## Diferenças em relação ao LOCAL

| Aspecto | LOCAL (proxy) | GITHUB Pages |
|---|---|---|
| `serviceUrl` no modelo | `/api/service/ExpenseManager/` (relativa) | URL real (absoluta, `https://...`) |
| Quem fala com o CAP | `custom-proxy` (server-side) | o navegador direto |
| CORS | irrelevante (mesma origem) | essencial (origens cruzadas) |
| Token no header | `Authorization` (através do proxy) | `Authorization` (direto) |

## Limite: GitHub Pages é estático

GitHub Pages hospeda **apenas arquivos estáticos**. Portanto:

- O **client secret** do XSUAA **não pode** viver aqui (não há servidor para guardá-lo com segurança).
- Não existe proxy próprio — por isso usamos o CAP como "mediador": é o CAP que guarda o secret e troca o `code` pelo token (endpoints `/auth/login` e `/auth/refresh` do `server.ts`).
- O frontend NÃO precisa do secret: ele só recebe o `code` (via redirect) e o CAP o troca.

Isso só é possível porque o `server.ts` do CAP implementa os endpoints `/auth/*` que fazem a troca (ver CAP: `srv/auth/` e `srv/middlewares/cors.ts`).

## Links

- [Visão geral da autenticação](./auth-overview.md)
- [Ambiente LOCAL (com proxy)](./auth-local.md)
- [Ambiente BTP (APP Router)](./auth-btp.md)
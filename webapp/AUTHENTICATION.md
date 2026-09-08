# Autenticação — GitHub Pages e BTP

Este documento explica **como o login funciona** nos dois ambientes em que o app é publicado:

- **GitHub Pages** — o app faz o OAuth ele mesmo (Authorization Code via XSUAA, mediado pelo CAP).
- **BTP (Launchpad / managed app router)** — a plataforma autentica o usuário e encaminha o token ao backend; o app **não** faz o redirect.

O mesmo código de frontend roda nos dois ambientes; o que muda é o **provedor de autenticação** e a **URL usada para o serviço OData**.

## Visão geral

| | GitHub Pages | BTP (Launchpad) |
|---|---|---|
| Hostname | `davicastr.github.io` | `*.launchpad.cfapps...` |
| Detecção (`Environment.ts`) | contém `github.io` | contém `cfapps` |
| Provider | `GithubPagesAuthenticationProvider` | `BtpAuthenticationProvider` |
| Quem autentica o usuário | O app (OAuth Authorization Code) | O managed app router (plataforma) |
| URL do serviço OData | **Absoluta** (do `runtime-config.json`) | **Relativa**, com o contexto do app no launchpad |
| Quem adiciona o `Authorization` | O app (`Bearer <token>`) | O managed app router (`ForwardAuthToken`) |

## 1. Detecção do ambiente

`webapp/util/Environment.ts` decide o ambiente pelo hostname da página:

```ts
if (host.includes("github.io")) return EnvironmentType.GITHUB;
if (host.includes("cfapps"))    return EnvironmentType.BTP;
return EnvironmentType.LOCAL;
```

Com base nisso, `webapp/auth/providers/AuthenticatedProviderFactory.ts` escolhe o provider e o `webapp/Component.ts` (`init()`) decide **qual URL** o `ODataModel` deve usar.

---

## 2. GitHub Pages — OAuth direto, sem proxy

GitHub Pages hospeda **somente arquivos estáticos**. Não há servidor para guardar um `client secret`, então o fluxo usa o **CAP como mediador** (é o CAP que guarda o secret e troca o `code` pelo token).

### URL do serviço

O `ODataModel` usa a URL **absoluta** do `webapp/config/runtime-config.json`:

```json
{
  "odataService": "https://orgname-dev-expensemanager-srv.cfapps.us10-003.hana.ondemand.com/service/ExpenseManager/"
}
```

Como é cross-origin (outro domínio), o navegador depende dos headers **CORS** que o `server.ts` do CAP retorna para a origem `https://davicastro.github.io`.

### Fluxo de login (Authorization Code)

Provider: `webapp/auth/providers/GithubPagesAuthenticationProvider.ts`

1. `login()` → `XsuaaAuthHelper.createAuthorizationFlow()` monta a URL de autorização do XSUAA (`client_id`, `redirect_uri`, `scope`, `state`) e redireciona o navegador.
2. O XSUAA redireciona de volta com `?code=...&state=...` na URL.
3. `isAuthenticated()` valida o `state` e troca o `code` por token chamando o **CAP** (`/auth/login`), que repassa ao XSUAA — o secret fica só no servidor.
4. O token é salvo no `SessionStorage`; todas as chamadas ao CAP usam `Authorization: Bearer <token>`.

> O `GithubPagesAuthenticationProvider` também é usado em **LOCAL com `auth`** configurado — por isso o mesmo fluxo OAuth roda no localhost (através do `custom-proxy`).

---

## 3. BTP — managed app router (Launchpad)

No BTP o app fica no **HTML5 Application Repository** e é servido pelo **managed app router** (Launchpad) em uma URL com o **contexto do app**:

```
https://6v1gtwf6slgjhkbs.launchpad.cfapps.us10.hana.ondemand.com/
    4677264c-...appsdflcexpensemanager.appsdflcexpensemanager-0.0.2/
    index.html
```

O login é **delegado à plataforma**: o managed app router autentica o usuário via XSUAA antes de liberar o app. O app não faz redirect nem troca de `code`.

### URL do serviço (a chave do 404)

No BTP o app **não** usa a URL absoluta do `runtime-config.json`. O `Component.ts` monta uma URL **relativa ao launchpad, incluindo o contexto do app**:

```ts
private getLaunchpadAppBasePath(): string {
    const pathname = window.location.pathname;
    return pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "");
}

private prepareBtpServiceModel(): void {
    XsuaaAuthHelper.setServiceUrl(`${this.getLaunchpadAppBasePath()}/api/service/ExpenseManager/`);
    this.setServiceModel("");
}
```

Resultado: as chamadas vão para `/<contexto-do-app>/api/service/ExpenseManager/...`.

**Por que sem o contexto dava 404?** Antes o app chamava `/api/service/ExpenseManager/$metadata` na **raiz** do launchpad. O managed app router não sabe de qual app é uma chamada sem contexto → **404**. Com o prefixo `/<contexto>/`, o router identifica o app e aplica o roteamento dele.

### O caminho da requisição

Quando o app pede `/<contexto>/api/service/ExpenseManager/$metadata`:

1. O managed app router **identifica o app** pelo contexto e remove o prefixo.
2. Aplica o `xs-app.json` **do app** na parte restante (`/api/service/ExpenseManager/$metadata`).
3. A rota casa:

   ```json
   {
     "source": "^/api/service/ExpenseManager/(.*)$",
     "target": "/service/ExpenseManager/$1",
     "destination": "ExpenseManager",
     "authenticationType": "xsuaa",
     "csrfProtection": false
   }
   ```

4. Encaminha para o **destination** `ExpenseManager` (definido no `mta.yaml`) → `https://orgname-dev-expensemanager-srv.../service/ExpenseManager/$metadata`.
5. Como o destination tem `HTML5.ForwardAuthToken: true`, o managed app router **anexa o token do usuário logado**; o CAP autentica e responde.

```
Browser ──> launchpad/<contexto>/api/service/ExpenseManager/$metadata
        1. router identifica o app pelo contexto
        2. remove o prefixo ──> /api/service/ExpenseManager/$metadata
        3. aplica xs-app.json ──> casa a rota ^/api/service/ExpenseManager/
        4. destination "ExpenseManager" ──> ...-srv/service/ExpenseManager/$metadata
        5. ForwardAuthToken ──> CAP responde 200
```

> **Versionamento foi decisivo:** o fix de contexto só carrega quando o **JS novo** está no ar. Bumpar a versão do MTA (ex.: `0.0.1` → `0.0.2`) gera um novo contexto de URL no launchpad, forçando o navegador a baixar os recursos novos (sem cache).

### Por que o app nem sempre adiciona o `Authorization` no BTP

- O `ODataModel` é criado com `httpHeaders` **vazio** (`setServiceModel("")`).
- Quem injeta o token é o managed app router, pelo `HTML5.ForwardAuthToken: true` do destination.
- No GitHub Pages o mesmo modelo é criado com `Authorization: Bearer <token real>` porque lá não existe router intermediário.

---

## 4. Comparação rápida das duas rotas no `Component.ts`

| Etapa | GitHub Pages | BTP |
|---|---|---|
| `init()` | não configura URL (modelo criado lazy após login) | `prepareBtpServiceModel()` |
| `serviceUrl` | absoluta (`runtime-config.json`) | `/<contexto>/api/service/ExpenseManager/` |
| Token no `ODataModel` | `Bearer <token>` real | nenhum (plataforma injeta) |
| Requisições `fetch` (`http.ts`) | `Authorization: Bearer <token>` | `Authorization: Bearer <token>` (sobreposto pelo router) |
| Falha típica | CORS / 401 por token | 404 sem contexto / 401 por role |

## Arquivos-chave

- `webapp/util/Environment.ts` — detecção do ambiente por hostname.
- `webapp/auth/providers/AuthenticatedProviderFactory.ts` — escolhe o provider por ambiente.
- `webapp/auth/providers/BtpAuthenticationProvider.ts` — provider BTP (sessão da plataforma).
- `webapp/auth/providers/GithubPagesAuthenticationProvider.ts` — provider GitHub Pages (OAuth direto).
- `webapp/auth/providers/XsuaaAuthHelper.ts` — config de runtime e montagem da URL de autorização.
- `webapp/util/http.ts` — chamadas `fetch` autenticadas (CSRF, headers).
- `webapp/Component.ts` — `getLaunchpadAppBasePath()` / `prepareBtpServiceModel()` (BTP) e criação do modelo.
- `webapp/config/runtime-config.json` — URL absoluta do serviço e endpoints OAuth.
- `xs-app.json` — rotas do app para o managed app router (BTP).
- `mta.yaml` — destination `ExpenseManager` + `HTML5.ForwardAuthToken`.
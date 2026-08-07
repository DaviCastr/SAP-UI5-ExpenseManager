# Documentação — Expense Manager

Documentação técnica do aplicativo **SAPUI5 Freestyle + TypeScript** (frontend) e sua integração com o **CAP + XSUAA** e o **SAP BTP**.

> Os guias de autenticação explicam **como o login funciona em cada ambiente**, qual provedor é usado e como as requisições chegam ao backend.

## Índice

### Autenticação e ambientes

| Documento | O que cobre |
|---|---|
| [**Visão geral da autenticação**](./auth-overview.md) | Arquitetura dos providers, o fluxo OAuth/XSUAA e como o ambiente é detectado. |
| [**Ambiente LOCAL**](./auth-local.md) | `npm run start` / `start-local` — URL relativa + proxy local (`custom-proxy/`). |
| [**Ambiente GITHUB Pages**](./auth-github-pages.md) | `davicastr.github.io` — URL real, OAuth direto, sem proxy. |
| [**Ambiente BTP**](./auth-btp.md) | `*.cfapps...` — autenticação via APP Router / HTML5 ForwardAuthToken. |
| [**Ambiente MOCK**](./auth-mock.md) | `npm run start-mock` — dados falsos e autenticação simulada. |

## Como ler

Comece pela **[Visão geral da autenticação](./auth-overview.md)** para entender a peça comum, e depois abra o guia específico do ambiente com que você está trabalhando.

## Caminhos relevantes

- `webapp/util/Environment.ts` — detecção de ambiente pelo hostname.
- `webapp/auth/providers/AuthenticatedProviderFactory.ts` — escolhe o provider por ambiente.
- `webapp/auth/AuthenticationService.ts` — camada comum de sessão/erro.
- `webapp/auth/providers/XsuaaAuthHelper.ts` — config de runtime e fluxo OAuth.
- `webapp/util/http.ts` — chamadas `fetch` autenticadas (Backend/Session/CSRF).
- `webapp/Component.ts` — criação do `ODataModel` e `setLocalOverrides`.
- `custom-proxy/index.js` — proxy **local apenas** (fora do pipeline TS).
- `ui5-local.yaml` — configura o backend real do proxy.
- `webapp/config/runtime-config.json` — URL real do serviço e endpoints OAuth.
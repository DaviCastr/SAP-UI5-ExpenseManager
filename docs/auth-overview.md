# Visão geral da autenticação

O aplicativo usa **OAuth 2.0 Authorization Code** contra o **XSUAA** (SAP Cloud Identity Services) para obter um token de acesso. O token é enviado ao backend **CAP** por meio do header `Authorization: Bearer <token>`.

O mesmo código de frontend roda em **quatro ambientes**, e somente a forma de **se autenticar** e de **chegar ao backend** muda. Tudo começa pela detecção do ambiente.

## 1. Detecção do ambiente

Arquivo: `webapp/util/Environment.ts`

O ambiente é decidido pelo **hostname** da página carregada:

```ts
if (host.includes("github.io")) return EnvironmentType.GITHUB;
if (host.includes("cfapps"))    return EnvironmentType.BTP;
return EnvironmentType.LOCAL;
```

Cada valor (LOCAL / GITHUB / BTP) altera dois pontos:

1. **Qual provider de autenticação** é instanciado.
2. **Qual URL** o `ODataModel` usa (relativa via proxy, ou absoluta/direta).

## 2. Escolha do provider

Arquivo: `webapp/auth/providers/AuthenticatedProviderFactory.ts`

```ts
switch (Environment.current()) {
  case EnvironmentType.BTP:    return new BtpAuthenticationProvider();
  case EnvironmentType.GITHUB: return new GithubPagesAuthenticationProvider();
  case EnvironmentType.LOCAL:  return XsuaaAuthHelper.getConfig().auth
      ? new GithubPagesAuthenticationProvider()
      : new MockAuthenticationProvider();
  default:                     return new MockAuthenticationProvider();
}
```

| Provider | Usado em | Como autentica |
|---|---|---|
| `GithubPagesAuthenticationProvider` | GITHUB, e LOCAL **com** `auth` configurado | OAuth XSUAA direto (redirect + code exchange) |
| `BtpAuthenticationProvider` | BTP | Sessão já cuidada pelo APP Router / forwarder externo |
| `MockAuthenticationProvider` | LOCAL **sem** `auth`, e default | Sem login real (token fictício) |

> O `GithubPagesAuthenticationProvider` também é usado em **LOCAL com `auth`** — ou seja, o mesmo fluxo OAuth que o GitHub Pages também roda no localhost (mas através do proxy).

## 3. Camada comum: `AuthenticationService`

Arquivo: `webapp/auth/AuthenticationService.ts`

Independente do provider, o serviço centraliza:

- `login()` / `logout()` — delega ao provider.
- `getSession()` / `isAuthenticated()` — sessão salva em `SessionStorage`.
- `notifySessionExpired()` — dispara "sessão expirada" (popup e volta ao Login).
- `notifyAuthError(message)` / `isAuthErrorPending()` — erro de login (popup e volta ao Login).

## 4. O token nas requisições

Arquivo: `webapp/util/http.ts`

Toda chamada `fetch` autenticada passa por `buildHeaders()`, que adiciona:

```ts
headers.set("Authorization", `Bearer ${token}`);
```

E o `ODataModel` criado no `Component.ts` também recebe o token via `httpHeaders`. Assim, requisições OData (`$batch`, `$filter`, etc.) e chamadas `fetch` avulsas usam o mesmo token.

## Próximo passo

Leia o guia específico do ambiente em que você está rodando:

- [Ambiente LOCAL (com proxy)](./auth-local.md)
- [Ambiente GITHUB Pages (direto)](./auth-github-pages.md)
- [Ambiente BTP (APP Router)](./auth-btp.md)
- [Ambiente MOCK (`start-mock`)](./auth-mock.md)
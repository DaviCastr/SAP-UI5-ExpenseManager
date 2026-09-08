# Ambiente BTP — Autenticação via APP Router / HTML5 ForwardAuthToken

Quando o app é publicado no SAP BTP (hostname `*.cfapps...`), a autenticação é **delegada à plataforma** — a camada de HTML5 Application Router / forwarder cuida do login. O app **não** faz o redirect nem a troca de `code` ele mesmo.

## Detecção

O hostname contém `cfapps` → `EnvironmentType.BTP` (`webapp/util/Environment.ts`).

## Quem autentica

Provider: `webapp/auth/providers/BtpAuthenticationProvider.ts`

```ts
public async isAuthenticated(): Promise<boolean> {
    const session = AuthenticationService.getSession();
    return !!session && session.expiresAt > Date.now();
}
```

- O **APP Router / HTML5 forwarder** intercepta o acesso antes de o app carregar, autentica o usuário via XSUAA e só libera o app quando há sessão válida.
- O app não faz redirect manual: ele já entra com o usuário logado.
- O token do usuário é **encaminhado ao CAP** porque o destination do MTA usa `HTML5.ForwardAuthToken: true` — ver `mta.yaml` deste projeto.

## Fluxo (resumido)

1. Usuário acessa a URL do app no BTP.
2. O APP Router autentica (XSUAA) e estabelece sessão.
3. O app carrega; `BtpAuthenticationProvider.isAuthenticated()` retorna `true` (sessão válida).
4. Requisições OData ao CAP levam o token encaminhado (`ForwardAuthToken`).

## Logout

O `logout()` redireciona para `/{origin}/logout?redirect=...`:

```ts
window.location.assign(`${window.location.origin}/logout?redirect=${redirectTarget}`);
```

Isso encerra a sessão no APP Router e devolve o usuário ao app (fazendo novo login no próximo acesso).

## URL do serviço

**Diferente do GitHub Pages**, o `odataService` **não** usa a URL absoluta do `webapp/config/runtime-config.json` neste ambiente. O `Component.ts` monta uma URL **relativa ao launchpad, com o contexto do app**:

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

Chamadas vão para `/<contexto-do-app>/api/service/ExpenseManager/...`. O managed app router identifica o app pelo contexto, remove o prefixo, aplica o `xs-app.json` (rota `^/api/service/ExpenseManager/(.*)$` → destination `ExpenseManager`) e encaminha ao CAP com `HTML5.ForwardAuthToken: true`.

> **Por que dava 404:** sem o prefixo do contexto (`/api/service/...` na raiz do launchpad), o managed app router não sabe de qual app é a chamada → 404. Com o contexto, o roteamento funciona.

## Links

- [Visão geral da autenticação](./auth-overview.md)
- [Ambiente LOCAL (com proxy)](./auth-local.md)
- [Ambiente GITHUB Pages (direto)](./auth-github-pages.md)
- [Guia completo no app](./../webapp/AUTHENTICATION.md)
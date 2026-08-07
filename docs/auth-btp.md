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

Assim como no GitHub Pages, o `odataService` vem de `webapp/config/runtime-config.json` (URL real absoluta).

## Links

- [Visão geral da autenticação](./auth-overview.md)
- [Ambiente LOCAL (com proxy)](./auth-local.md)
- [Ambiente GITHUB Pages (direto)](./auth-github-pages.md)
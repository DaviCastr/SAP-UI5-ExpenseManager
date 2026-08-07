# Ambiente MOCK — `npm run start-mock`

Para desenvolvimento **visual** sem tocar no backend nem no XSUAA, existe o ambiente MOCK, que usa dados falsos e autenticação simulada.

## Como rodar

```bash
npm run start-mock    # fiori run --config ./ui5-mock.yaml --open "test/flp.html#app-preview"
```

## Detecção

Diferente dos demais ambientes, o MOCK é escolhido **pela ausência de configuração**, não pelo hostname:

- Se `Environment.current() === LOCAL` (host `localhost`)
- **E** `XsuaaAuthHelper.getConfig().auth` estiver **vazio** (sem `auth` no `runtime-config.json`)

...então o `AuthenticatedProviderFactory` usa o `MockAuthenticationProvider` (default no `switch` também):

```ts
case EnvironmentType.LOCAL:
    return XsuaaAuthHelper.getConfig().auth
        ? new GithubPagesAuthenticationProvider()
        : new MockAuthenticationProvider();
```

## Como autentica

Provider: `webapp/auth/providers/MockAuthenticationProvider.ts`

```ts
login(): token fictício ("mock-token"), usuário "Davi", 1h de validade.
```

Não há XSUAA, não há redirect, não há token real — só uma sessão local "falsa" para a UI funcionar.

## Qual URL usa

No MOCK, o `ODataModel` é alimentado por **mockserver** (`ui5-mock.yaml`), não por um serviço real. Os dados são servidos localmente pelo UI5 mock server.

## Quando usar

- Prototipagem / ajustes de visual sem o CAP online.
- Rodar os testes (`unit-test`, `int-test`) que usam `ui5-mock.yaml`.

## Quando NÃO usar

- Quando você precisa validar o fluxo real de autenticação (XSUAA) ou dados reais — nesse caso use `npm run start` (LOCAL com proxy) ou publique no GitHub Pages/BTP.

## Links

- [Visão geral da autenticação](./auth-overview.md)
- [Ambiente LOCAL (com proxy)](./auth-local.md)
- [Ambiente GITHUB Pages (direto)](./auth-github-pages.md)
- [Ambiente BTP (APP Router)](./auth-btp.md)
# Projeto de testes (Playwright)

Este repositório contém testes E2E usando **Playwright** em **TypeScript**.

--------------------------------
## Requisitos

- Node.js 18+ (recomendado 20+)
- Instalar o Codex (extensão no VS Code 'Codex – OpenAI’s coding agent' ou 'aplicativo Codex na Microsoft Store do Windows')

## arquivo .env
 - Crie um arquivo .env na raiz do projeto com o conteúdo abaixo informando as credenciais. Exemplo: exemplo_arquivo_env.md

--------------------------------
## Como iniciar

1) Instalar dependências:

```bash
npm install
```

2) Instalar browsers do Playwright:

```bash
npx playwright install
```
--------------------------------
## VariÃ¡veis de ambiente (login)

Para subir o repo no GitHub sem expor credenciais, os usuÃ¡rios e senhas sÃ£o lidos de variÃ¡veis de ambiente (as URLs ficam nos requests/config).

- Crie um `.env` a partir do exemplo:
  - `Copy-Item .env.example .env` (PowerShell)
- VariÃ¡veis usadas:
  - TopSaude (UI): `TOPSAUDE_USUARIO`, `TOPSAUDE_SENHA`
  - API (Token/Bearer): `API_TOKEN_USUARIO`, `API_TOKEN_SENHA`
  - API (Basic): `API_BASIC_USERNAME`, `API_BASIC_PASSWORD`

--------------------------------
## Como rodar

- Rodar tudo:

```bash
npm test
```

- Rodar em modo headed:

```bash
npm run test:headed
```

- Rodar um arquivo específico:

```bash
npx playwright test "menu-identificadores/menu-identificadores.spec.ts"

cmd /c npx playwright test "tests/sac-166839-vcom.spec.ts" --headed
```

- Ver o relatório HTML:

```bash
npm run report
```
--------------------------------
## Teste de API (SaÃºde)

- Rodar o cenÃ¡rio baseado em `requests_ia/request_api_saude.json`:

```bash
npx playwright test "tests/api/api-saude.spec.ts"
```

- Opcional: sobrescrever o contrato via variÃ¡vel de ambiente:

```bash
$env:NUMERO_CONTRATO="19940533"; npx playwright test "tests/api/api-saude.spec.ts"
```
--------------------------------
## Teste E2E (Top SaÃƒÂºde)

- Rodar o cenÃƒÂ¡rio baseado em `requests_ia/request_top_saude.json`:

```bash
npx playwright test "tests/SAC_166839/sac-166839-vcom-from-request-top-saude.spec.ts"
```
--------------------------------
## Teste E2E (SAC_166839)

- Rodar o cenÃƒÆ’Ã‚Â¡rio baseado em `requests_ia/SAC_166839/request_SAC_166839.json`:

```bash
npx playwright test "tests/SAC_166839/sac-166839-vcom-from-request-sac166839.spec.ts"
```
--------------------------------
## Teste API (SAC_166839)

- Rodar o cenÃƒÆ’Ã‚Â¡rio baseado em `requests_ia/SAC_166839/request_api_saude_SAC_166839.json`:

```bash
npx playwright test "tests/SAC_166839/api-saude-sac166839.spec.ts"
```

- Rodar com "UI" (janela headed com logs dos passos da API):

```bash
npx playwright test "tests/SAC_166839/api-saude-sac166839-visual.spec.ts" --headed --workers=1 --reporter=line
```
--------------------------------
## Estrutura

- `playwright.config.ts`: configuração padrão do runner.
- `tests/`: exemplos/smoke tests.
- Pastas como `menu-identificadores/` e `SAC_166839/`: testes existentes do projeto.

--------------------------------
## Como fazer uma solicitação eficiente (checklist)

Escolha 1 dono: diga explicitamente qual skill deve assumir (prompt-router, swagger-rest-requests, top-saude-sac-tests, sac-request-authoring, menu-references, success-guided-spec).
Dê objetivo em 1 frase + critério de sucesso (status/validações esperadas, ou o que deve aparecer na UI).
Inclua artefatos fonte de verdade (paths do repo): requests_ia/...json, spec existente em tests/...spec.ts, e/ou playwright-report/ / log de falha.
Forneça passo a passo numerado (o repo converte isso em test.step(...)).
Defina escopo (um cenário por vez): “criar spec”, “ajustar spec que falhou”, “gerar request JSON”, “extrair menu”.
Informe dados mínimos (sem inventar): URL base/Swagger, endpoint(s), como autentica, e campos-chave do response; ou menu data_modulo_funcao, frame_url_hint, ids/seletores.
Se já falhou, mande o erro exato + qual comando rodou; para correção rápida, peça success-guided-spec.
Templates prontos (copie e cole)

--------------------------------
## API (Swagger) — agente dono: swagger-rest-requests

“Use swagger-rest-requests. Swagger: <url>. Login: endpoint <path>, payload {...}, token vem em $.<campo>. Depois chamar <método> <path> com <params/body>. Validar: status <code> e campos <x,y>. Se possível, gerar requests_ia/<SAC>/request_api_<nome>.json e tests/<SAC>/api-<nome>.spec.ts.”

--------------------------------
## UI (SAC/TopSaúde) — agente dono: top-saude-sac-tests (e, se faltar menu, menu-references)

“Use top-saude-sac-tests. Request base: requests_ia/request_<SAC>. Menu leaf: data_modulo_funcao=<...>. Tela principal fica no frame com frame_url_hint=<...>; campo contrato #<id>; botão continuar #<id>. Passos: (1)… (2)… Sucesso quando: <texto/elemento>. Se não souber data_modulo_funcao, use menu-references para achar.”

--------------------------------
## Ajuste pós-falha — agente dono: success-guided-spec

“Use success-guided-spec para corrigir tests/<SAC>/<spec>.spec.ts. Aqui está o output da falha: <cole o trecho>. Objetivo: menor correção possível e reexecutar o mesmo spec.”

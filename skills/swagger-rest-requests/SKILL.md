---
name: swagger-rest-requests
description: Criar e executar testes automatizados de API REST (Swagger) com Playwright `APIRequestContext`, seguindo um passo a passo do usuário e opcionalmente dirigidos por um JSON em `requests_ia/`.
---

# Swagger REST Requests (API tests)

## Objetivo

Transformar um **passo a passo** (humano) + uma **URL do Swagger** em um teste Playwright (TypeScript) que:

- autentica (quando necessário) e extrai token
- executa requests REST (GET/POST/PUT/DELETE) conforme os passos
- valida status code e campos críticos do response
- permite override de dados via variáveis de ambiente quando útil

## Modo “time de agentes”

Siga o padrão do repo em `skills/AGENT_TEAMS.md`:

- Mantenha 1 “dono” do pedido (este skill) e faça handoffs explícitos só quando necessário.
- Separe o trabalho em entregas verificáveis:
  1) request JSON em `requests_ia/...` (quando data-driven ou quando o usuário pedir “gerar request”)
  2) spec Playwright em `tests/<SAC>/...spec.ts`
  3) execução visual (`--headed`) + evidência de resultado
- Se o teste falhar após gerar/alterar spec, acione `$success-guided-spec` com o output da falha para aplicar a menor correção possível e reexecutar.

## Entrada recomendada (contrato)

O agente pode trabalhar de duas formas:

1) **Somente passos do usuário** (o agente faz perguntas mínimas e gera o spec).
2) **Data-driven** usando um JSON em `requests_ia/` (fonte de verdade).

Template sugerido: `skills/swagger-rest-requests/assets/request.api.template.json`.

## Linguagem natural -> request JSON

Quando o usuÃ¡rio escrever o cenÃ¡rio em linguagem natural, converta para um request JSON seguindo `skills/swagger-rest-requests/assets/request.api.template.json`.

Mapeamento sugerido:

- **URL do Swagger** -> `env.base_url`
- **Credenciais** -> `env.usuario` e `env.senha`
  - Se o usuÃ¡rio solicitar "logar na api" e nÃ£o informar dados de login, usar `config-app.json` em `login.api` como padrÃ£o (URL + credenciais).
  - Para API, respeitar o tipo de autenticaÃ§Ã£o indicado pelo usuÃ¡rio e escolher as credenciais correspondentes em `config-app.json`:
    - Token/Bearer: `login.api.apiTipoToken` (usuario/senha) + `Authorization: Bearer <token>`
    - Basic: `login.api.apiTipoBasic` (Username/Password) + header `Authorization: Basic ...`
- **Endpoints** -> `entrada.request_login`, `entrada.request_contrato`, `entrada.request_consulta_contrato` (e outros que o usuÃ¡rio citar)
- **Arquivo de payload** -> `entrada.json_contrato` (ex.: `json_api_request.json`)
- **Passo a passo** -> `passos` (sempre numerado e na ordem)
- **CritÃ©rio de sucesso** -> `sucesso_quando`
- **PadrÃµes visuais** (sempre) -> `execucao`:
  - `delay_entre_passos_ms=2000`
  - `timeout_por_passo_ms=2000`
  - `modo_visual=true`
  - `sempre_mostrar_cliques=true`
  - `sempre_logar_clique_fill_read=true`

Quando faltar informaÃ§Ã£o, pergunte apenas o essencial para montar o JSON (ex.: qual endpoint faz login? qual campo do response Ã© o token? qual path do GET?).

## Entradas do cenário (não é só contrato)

O request pode ter diferentes tipos de entrada (ex.: **contrato**, **associado**, **pedido**, **CPF**, **CNPJ**) e às vezes **mais de um tipo ao mesmo tempo**.

Regras:

- Não assuma que o teste será feito “exclusivamente por contrato”.
- Prefira representar entradas em `entrada.entradas[]` com `{ tipo, valores[] }`.
- Mantenha compatibilidade: se existir `entrada.contratos[]`, trate como alias de `entrada.entradas` do tipo `contrato`.
- Ao montar requests com placeholders (ex.: `.../{numeroContrato}` ou `.../{cpf}`), substitua com base no placeholder:
  - `{numeroContrato}` → entrada do tipo `contrato` (ou `entrada.contratos[]` se existir)
  - `{cpf}` → entrada do tipo `cpf`
  - `{cnpj}` → entrada do tipo `cnpj`
  - outros placeholders → pergunte ao usuário qual campo/tipo deve preencher (ou defina um nome de tipo coerente em `entrada.entradas`).

## Convenções

### Base URL

Se o usuário fornecer o Swagger:

- `.../swagger/index.html`  → base API = `...` (remove o sufixo)
- `.../swagger/`            → base API = `...` (remove `/swagger`)

### Autenticação

Preferir:

- `Authorization: Bearer <token>`

Como o schema de login varia, o spec deve:

- tentar 2–3 payloads comuns (ex.: `{ login, senha }`, `{ usuario, senha }`, `{ username, password }`)
- extrair token procurando por chaves comuns (`token`, `accessToken`, `access_token`, `jwt`, `id_token`) em profundidade
- em falha, logar status + trecho do body para diagnóstico

### Execução

- `timeout_por_passo_ms` e `delay_entre_passos_ms` vêm do request quando existirem.
- Para rodar “visual”, use:
  - `cmd /c npx playwright test "<spec>" --ui --workers=1`
  - (Recomendado) `cmd /c npx playwright test "<spec>" --headed --workers=1 --reporter=line`

## Modo visual (Swagger UI) e evidencia de cliques

Este skill assume que voce quer acompanhar o passo a passo no Swagger UI:

- O spec deve abrir o Swagger UI no inicio do teste.
- Cada passo deve estar dentro de `test.step(...)`.
- Antes de cada `click/fill/execute` no Swagger UI, o elemento deve ser destacado (outline) para o usuario ver onde esta sendo clicado.
- Sempre tente manter o alvo no meio da tela (scroll + `scrollIntoView({ block: "center" })`) antes de destacar e clicar.
- Deve haver delay fixo de 2s entre passos (por padrao `delay_entre_passos_ms=2000`). Para testes de API, nao usar esperas extras (ex.: 10s).

No modo visual, o fluxo deve ser "100% observavel" na UI:

- Abrir o endpoint na UI (expandir opblock).
- Clicar em `Try it out`.
- Preencher body/params na UI.
- Clicar em `Execute`.
- Aguardar o response e, quando for login, extrair token do response e preencher `Authorize` com `Bearer {token}`.

## Auto-ajuste de payload (ex.: CNPJ)

Alguns endpoints de implantação/criação retornam erro por **dados já existentes** (ex.: *CNPJ já integrado*).

Quando isso acontecer, o spec pode aplicar um “fix-up” antes de reenviar:

- Detecta mensagem de erro contendo `CNPJ` + sinal de duplicidade (ex.: “já foi integrado” / “já existe”).
- Gera um **CNPJ válido** (com dígitos verificadores).
- Atualiza o campo `empresaContratante.cnpj` (ou o primeiro campo `cnpj` encontrado) no payload.
- **Persiste a alteração no arquivo `json_contrato`** (ex.: `requests_ia/json_api_request.json`) e tenta novamente.

Regra adicional (padrão do projeto):

- Quando o `json_contrato` for `json_api_request.json`, sempre gerar um CNPJ sem pontuação preferencialmente via `https://www.4devs.com.br/gerador_de_cnpj` e atualizar o campo `cnpj` antes de enviar o POST.

## Exemplo no projeto

Este repo já tem um exemplo de teste de API gerado a partir de request:

- `requests_ia/SAC_166839/request_api_saude_SAC_166839.json`
- `tests/SAC_166839/api-saude-sac166839.spec.ts`

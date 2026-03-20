---
name: sac-request-authoring
description: Criar e evoluir arquivos JSON de request de SAC em `requests_ia/` (ex.: `requests_ia/request_SAC_166839`) para dirigir testes Playwright. Use quando precisar: (1) criar um novo request JSON a partir de um SAC novo, (2) atualizar um request existente para novas telas/funções/frames/menus, (3) padronizar/evoluir o “schema” do request mantendo compatibilidade, (4) capturar learnings de novas variações de requests.
---

# SAC Request Authoring (requests_ia/*)

## Objetivo

Transformar conhecimento de “como testar” (menus/telas/regras/frames) em um JSON de request que seja:

- completo o suficiente para gerar/ajustar um spec
- minimalista (sem duplicar hardcode que já existe em outras fontes)
- evolutivo (suportar variações sem quebrar requests antigos)

## Workflow (criar um request novo)

1) Criar o arquivo `requests_ia/request_<SAC>` a partir do template:
   - use `skills/sac-request-authoring/assets/request.template.json`
   - ou rode `skills/sac-request-authoring/scripts/new-request.ps1`
2) Preencher `env`:
   - `base_url`, `usuario`, `senha` (e `base_db_preferida` se a aplicação tiver seleção de base)
3) Preencher `menu` com identificadores estáveis:
   - preferir `data_modulo_funcao` (ex.: `80.CB10.4`) em vez de texto (risco de mojibake / alteração visual)
   - se precisar descobrir, use `tests/menu-identificadores/menu-identificadores.json` (ou regenere com o spec de menu)
4) Mapear `telas`:
   - para cada tela relevante: `frame_url_hint` + ids/seletores de campos/botões/ações
   - preferir ids (`campo_*_id`) e selectors simples; evitar XPath
5) Escrever `regras` (o que é específico do cenário):
   - derivação de dados (ex.: “ler digits de `input.value`”)
   - proibições (ex.: “nunca preencher campo X com número do contrato”)
   - condições de pular fluxo (ex.: “se grupo vazio, pular tela Y”)
6) Configurar `execucao`:
   - `timeout_por_passo_ms`, `delay_entre_passos_ms`, `modo_visual`, flags de logging
7) Documentar `passos` (lista humana, numerada) e `sucesso_quando` (critério observável)
8) Validar o request:
   - rode `skills/sac-request-authoring/scripts/validate-request.ps1 -Path requests_ia/request_<SAC>`

## Linguagem natural -> request JSON

Quando o usuÃ¡rio escrever o cenÃ¡rio em linguagem natural, converta para um request JSON seguindo `skills/sac-request-authoring/assets/request.template.json`.

Mapeamento sugerido:

- **URL / sistema** -> `env.base_url` (URL de login ou home da Ã¡rea logada)
- **Credenciais** -> `env.usuario`, `env.senha` (e `env.base_db_preferida` se existir)
- **Entradas do cenário** -> `entrada.*` (ex.: `entrada.entradas[]` com `{ tipo, valores[] }`; manter `entrada.contratos[]` como compat/alias quando o identificador for contrato; `entrada.aguardar_contrato_carregar_s`)
- **Menus citados** -> `menu.<chave> = { data_modulo_funcao, texto? }`
- **Telas/frames citados** -> `telas.<chave>.frame_url_hint` + campos/ids/seletores
- **Regras do cenÃ¡rio** (derivaÃ§Ã£o de dados / proibiÃ§Ãµes / pulo de fluxo) -> `regras.*`
- **Passo a passo** -> `passos` (sempre numerado, na ordem)
- **CritÃ©rio de sucesso** -> `sucesso_quando` (curto e verificÃ¡vel)

Defaults recomendados:

- `execucao.delay_entre_passos_ms=2000`
- `execucao.timeout_por_passo_ms=30000`
- `execucao.modo_visual=true`
- `execucao.sempre_mostrar_cliques=true`
- `execucao.sempre_logar_clique_fill_read=true`

Quando faltar informaÃ§Ã£o, pergunte apenas o essencial (ex.: qual `data_modulo_funcao` do menu? qual `frame_url_hint` da tela? qual id do campo?).

## Workflow (evoluir requests sem quebrar os antigos)

- Tratar o request como “schema evolutivo”:
  - adicionar novos campos como opcionais (com fallback em código)
  - evitar renomear/remover chaves existentes; quando inevitável, manter compatibilidade (ler os dois nomes)
- Quando surgir uma nova variação de request (nova tela/novo padrão):
  - registrar um exemplo mínimo no `passos` e o porquê em `LEARNINGS.md`
  - preferir generalizar em “telas” (por chave) do que criar flags soltas
- Evitar misturar responsabilidades:
  - request descreve *o que fazer* e *onde* (menu/telas/campos/regras)
  - spec contém *como fazer* (helpers Playwright, frame-safe actions, evidências visuais)

## Convenções recomendadas

- `menu.*.data_modulo_funcao`: fonte de verdade para navegação (mais estável)
- `telas.*.frame_url_hint`: sempre que possível (fallback para localizar frame)
- `*_id`: usar quando o alvo é um elemento com `id` (campo/botão)
- `*_selector`: usar quando não há `id` (ex.: fechar janela)
- `passos`: manter numerado (1-4, 5-6…) para bater com o entendimento humano
- `sucesso_quando`: texto curto, verificável na UI

# Times de agentes (padrão do repo)

Este repo usa **skills** como “agentes especialistas” e incentiva trabalhar em **time** (como no conceito de *agent teams*): um agente **líder/orquestrador** quebra o problema, define artefatos e passa handoffs para especialistas com responsabilidade clara.

## Conceito (o que muda na prática)

- Evite “um agente faz tudo”: para tarefas complexas, separe em papéis.
- O líder mantém **o objetivo, o critério de sucesso e os artefatos** (arquivos) como fonte de verdade.
- Especialistas operam em **escopos pequenos** e entregam algo verificável (arquivo alterado, comando para executar, evidência de execução).

## Papéis recomendados

- **Líder (Router/Orquestrador)**: classifica e escolhe 1 “dono” do pedido (anti-overlap).
  - Skill sugerido: `$prompt-router`.
- **Especialista API (Swagger/REST)**: transforma passo a passo + Swagger em request JSON + spec Playwright.
  - Skill sugerido: `$swagger-rest-requests`.
- **Especialista UI (TopSaude/SAC)**: escreve specs de UI com navegação por menu e ações frame-safe.
  - Skill sugerido: `$top-saude-sac-tests`.
- **Especialista de evidências/robustez (após falha)**: ajusta spec com base no que já passou (success base).
  - Skill sugerido: `$success-guided-spec`.
- **Especialista de insumos (menu/locators)**: extrai/gera referências de menu para navegação estável.
  - Skill sugerido: `$menu-references`.

## Artefatos compartilhados (fonte de verdade)

- Requests (data-driven):
  - API: `requests_ia/<SAC>/request_api_<nome>.json` (ver template em `skills/swagger-rest-requests/assets/request.api.template.json`)
  - UI: `requests_ia/request_<SAC>/...` (ver template em `skills/sac-request-authoring/assets/request.template.json`)
- Specs Playwright:
  - API: `tests/<SAC>/*.spec.ts`
  - UI: `tests/<SAC>/*.spec.ts`
- Learnings:
  - API: `skills/swagger-rest-requests/LEARNINGS.md`
  - UI/menu: `skills/menu-references/LEARNINGS.md` e/ou `skills/sac-request-authoring/LEARNINGS.md`

## Regras de colaboração (anti-overlap)

- Sempre tenha **1 dono** do pedido (um skill “principal”).
- Quando precisar de outro especialista, faça **handoff explícito** e mantenha o contexto:
  - “Use `$success-guided-spec` com o output da falha X…”
  - “Use `$menu-references` para descobrir o `data_modulo_funcao` do menu Y…”
- O líder evita misturar duas soluções paralelas no mesmo passo (roteamento → execução).

## Regra global: problemas de encoding (mojibake)

Se qualquer agente observar textos quebrados como `BeneficiÃ¡rios`, `ReferÃªncia`, `AÃ§Ã£o` (ou padrões como `Â `), **corrigir imediatamente** convertendo o(s) arquivo(s) para **Western (Windows 1252)** exatamente no padrão já adotado neste repo:

- Use o script: `scripts/convert-mojibake-to-windows1252.ps1` (cria backup automático em `out/encoding-backup-YYYYMMDD-HHMMSS/` e só altera arquivos com padrão de mojibake).
- Escopo padrão: `out/` (pode passar `-Roots <pasta>` se o arquivo estiver fora).
- Após converter, valide que não restou `Ã`/`Â` no arquivo (ignorando o diretório de backup).
- Se o VS Code continuar exibindo errado, use `Reopen with Encoding` → `Western (Windows 1252)` (ou `Save with Encoding` para fixar).

## Exemplo rápido (API Swagger)

1) `$prompt-router` decide: “Use `$swagger-rest-requests`…”
2) `$swagger-rest-requests` entrega:
   - request JSON em `requests_ia/<SAC>/request_api_<nome>.json`
   - spec em `tests/<SAC>/api-<nome>.spec.ts`
   - comando de execução (padrão visual): `cmd /c npx playwright test "tests/<SAC>/api-<nome>.spec.ts" --headed --workers=1 --reporter=line`
3) Se falhar: `$success-guided-spec` usa a falha + `tests/src/success_base/success_base.json` e aplica a menor correção possível, depois reexecuta.

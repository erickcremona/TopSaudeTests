# Times de agentes (padrao do repo)

Este repo usa skills como agentes especialistas e incentiva trabalhar em time: um agente lider ou orquestrador quebra o problema, define artefatos e passa handoffs para especialistas com responsabilidade clara.

## Conceito

- Evite "um agente faz tudo": para tarefas complexas, separe em papeis.
- O lider mantem o objetivo, o criterio de sucesso e os artefatos como fonte de verdade.
- Especialistas operam em escopos pequenos e entregam algo verificavel (arquivo alterado, comando para executar, evidencia de execucao).

## Papeis recomendados

- Lider (Router/Orquestrador): classifica e escolhe 1 dono do pedido.
  - Skill sugerido: `$prompt-router`.
- Especialista API (Swagger/REST): transforma passo a passo + Swagger em request JSON + spec Playwright.
  - Skill sugerido: `$swagger-rest-requests`.
- Especialista UI (TopSaude/SAC): escreve specs de UI com navegacao por menu e acoes frame-safe.
  - Skill sugerido: `$top-saude-sac-tests`.
- Especialista de evidencias/robustez (apos falha): ajusta spec com base no que ja passou.
  - Skill sugerido: `$success-guided-spec`.
- Especialista de insumos (menu/locators): extrai e gera referencias de menu para navegacao estavel.
  - Skill sugerido: `$menu-references`.

## Artefatos compartilhados

- Requests (data-driven):
  - API: `requests_ia/<SAC>/request_api_<nome>.json`
  - UI: `requests_ia/request_<SAC>/...`
- Specs Playwright:
  - API: `tests/<SAC>/*.spec.ts`
  - UI: `tests/<SAC>/*.spec.ts`
  - Evidencias de sucesso UI: `tests/<SAC>/videos/*.webm`
- Learnings:
  - API: `skills/swagger-rest-requests/LEARNINGS.md`
  - UI/menu: `skills/menu-references/LEARNINGS.md` e/ou `skills/sac-request-authoring/LEARNINGS.md`

## Regra global: resolver login via `config-app.json`

- Sempre que o usuario pedir um teste, login ou execucao relacionada a um sistema, o agent dono deve consultar `config-app.json`.
- O arquivo deve ser lido pelo array `login[]`.
- Cada objeto de `login[]` deve ser identificado pelo seu primeiro campo de negocio.
- Exemplo atual de chaves primarias: `TopSaude`, `ApiProxyMovimentacao`, `ApiCoreMovimentacao`.
- O agent deve comparar o texto do usuario com esse primeiro campo e com a descricao associada a ele.
- Exemplo obrigatorio: `logar no topsaude` deve ser interpretado como o objeto cujo primeiro campo e `TopSaude`.
- Depois de localizar o objeto correto, usar esse objeto como fonte padrao de URL e credenciais/envs.
- Se o objeto tiver campo `payload`, o agent deve informar esse arquivo no payload ou handoff da solicitacao.
- Quando houver ambiguidade real entre dois objetos, fazer no maximo 1 pergunta curta; caso contrario, assumir o melhor match automaticamente.

## Regras de colaboracao

- Sempre tenha 1 dono do pedido (um skill principal).
- Quando precisar de outro especialista, faca handoff explicito e mantenha o contexto.
- O lider evita misturar duas solucoes paralelas no mesmo passo.
- Em cenarios UI/SAC, o dono do pedido deve garantir que o video do teste bem-sucedido fique persistido em `tests/<SAC>/videos/`.

## Regra global: problemas de encoding

- Se qualquer agente observar textos quebrados como mojibake, corrigir imediatamente convertendo o arquivo para o padrao do repo.
- Use o script `scripts/convert-mojibake-to-windows1252.ps1`.
- Depois de converter, valide que nao restou `Ã` ou `Â` no arquivo fora do diretorio de backup.

## Exemplo rapido (API Swagger)

1) `$prompt-router` decide: "Use `$swagger-rest-requests`..."
2) `$swagger-rest-requests` entrega:
   - request JSON em `requests_ia/<SAC>/request_api_<nome>.json`
   - spec em `tests/<SAC>/api-<nome>.spec.ts`
   - comando de execucao visual
3) Se falhar, `$success-guided-spec` usa a falha + `tests/src/success_base/success_base.json` e aplica a menor correcao possivel, depois reexecuta.

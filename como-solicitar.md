Como fazer uma solicitação eficiente (checklist)

Escolha 1 dono: diga explicitamente qual skill deve assumir (prompt-router, swagger-rest-requests, top-saude-sac-tests, sac-request-authoring, menu-references, success-guided-spec).
Dê objetivo em 1 frase + critério de sucesso (status/validações esperadas, ou o que deve aparecer na UI).
Inclua artefatos fonte de verdade (paths do repo): requests_ia/...json, spec existente em tests/...spec.ts, e/ou playwright-report/ / log de falha.
Forneça passo a passo numerado (o repo converte isso em test.step(...)).
Defina escopo (um cenário por vez): “criar spec”, “ajustar spec que falhou”, “gerar request JSON”, “extrair menu”.
Informe dados mínimos (sem inventar): URL base/Swagger, endpoint(s), como autentica, e campos-chave do response; ou menu data_modulo_funcao, frame_url_hint, ids/seletores.
Se já falhou, mande o erro exato + qual comando rodou; para correção rápida, peça success-guided-spec.
Se voce nao informar a URL, os agents devem usar `config-app.json` como fonte padrao:
- TopSaude UI: `login.topSaude.url`
- API/Swagger: `login.api.url`
Templates prontos (copie e cole)

--------------------------------
API (Swagger) — dono: swagger-rest-requests
“Use swagger-rest-requests. Swagger: <url>. Login: endpoint <path>, payload {...}, token vem em $.<campo>. Depois chamar <método> <path> com <params/body>. Validar: status <code> e campos <x,y>. Se possível, gerar requests_ia/<SAC>/request_api_<nome>.json e tests/<SAC>/api-<nome>.spec.ts.”

--------------------------------
UI (SAC/TopSaúde) — dono: top-saude-sac-tests (e, se faltar menu, menu-references)
“Use top-saude-sac-tests. Request base: requests_ia/request_<SAC>. Menu leaf: data_modulo_funcao=<...>. Tela principal fica no frame com frame_url_hint=<...>; campo contrato #<id>; botão continuar #<id>. Passos: (1)… (2)… Sucesso quando: <texto/elemento>. Se não souber data_modulo_funcao, use menu-references para achar.”

--------------------------------
Ajuste pós-falha — dono: success-guided-spec
“Use success-guided-spec para corrigir tests/<SAC>/<spec>.spec.ts. Aqui está o output da falha: <cole o trecho>. Objetivo: menor correção possível e reexecutar o mesmo spec.”

Regra adicional de login via `config-app.json`
Se o pedido mencionar login, sistema ou ambiente, os agents devem consultar `config-app.json` no array `login[]`, identificar o alvo pelo primeiro campo de cada objeto e usar esse objeto como fonte padrao. Exemplo: `logar no topsaude` -> objeto `TopSaude`. Se o objeto encontrado tiver `payload`, esse arquivo deve ser informado no payload/handoff da solicitacao.

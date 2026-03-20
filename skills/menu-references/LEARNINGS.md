# Learnings - Menu References

## 2026-03-11

- Para criar cenarios de teste baseados no menu, use `menu-identificadores/menu-identificadores.json` como fonte de verdade e prefira `attrs["data-modulo-funcao"]` quando existir (ex.: `80.CB10.4`, `80.CB10.10`).
- Alguns itens do menu podem vir como `visible=false` no JSON porque dependem de expandir um item pai (ex.: `Contratos e Beneficiarios`); no teste, primeiro garanta a expansao e depois clique no item-funcao.
- Quando `locatorSuggested` estiver no formato `page.locator('...')`, extraia o seletor e gere `page.locator(selector)` no teste para manter a navegacao derivada do `menu-identificadores.json` (evita hardcode paralelo).
- Para evidenciar interacoes em modo visual, injete um visualizador de clique via `page.addInitScript` e sempre centralize o alvo com `scrollIntoView({ block: 'center' })` antes de clicar.
- O `menu-identificadores/menu-identificadores.json` agora inclui `level`, `path` e `pathText` para ajudar a entender/automatizar a hierarquia (ex.: `Contratos e Beneficiarios > Contratos Pessoa JurÃƒÂ­dica > AlteraÃ§Ã£o`).
- Textos no JSON podem conter mojibake (ex.: `AlteraÃƒÂ§ÃƒÂ£o`); quando possivel, use `data-modulo-funcao` para evitar dependencia de string.
- Se o runner do `@playwright/test` falhar com `spawn EPERM` ao tentar `child_process.fork` (stdio com `ipc`), isso indica restricao do ambiente para processos com IPC; nesse caso, rode os testes em um ambiente sem essa restricao.

## 2026-03-12

- Rodando `npx playwright test "menu-identificadores/menu-identificadores.spec.ts"`, o mapeamento confirma que o menu e hierarquico (niveis `level` de 0 ate 4) e que o breadcrumb em `path/pathText` e a forma mais direta de chegar em qualquer sub-menu.
- A distincao pratica entre **frame** (container/expansor) e **tela** (alvo navegavel) aparece em `attrs["data-tipo-link"]`: tipicamente `menu` para expansores e `link` para telas (as telas quase sempre tem `attrs["data-href"]`).
- Para abrir uma **tela** a partir do JSON: expanda os ancestrais do `path` (clicando os itens do tipo `menu`/expansores) ate o item ficar visivel e so entao clique no seletor estavel `attrs["data-modulo-funcao"]` (ex.: `page.locator('[data-modulo-funcao=\"...\"]')`).
- Em geral, o click do menu nao muda a URL principal; a navegacao ocorre dentro de um frame/iframe. Para sincronizar, use `attrs["data-href"]` como destino esperado e espere algum `page.frame()` navegar para `BASE_ORIGIN + data-href` (a maioria dos alvos usa `/ace/mvcToAsp.asp?...`).
- No cenario `SAC_166839 (VCOM)`, as telas de `80.CB10.4` (Alteração) e `80.CB10.10` (Registra Grupo Contrato) abrem em iframes aninhados; nem sempre existe `id` estavel para os campos. Fallback robusto: localizar a linha por role/nome (ex.: row contendo `Contrato` / `Grupo Contrato`) e usar o primeiro `textbox` daquela linha.
- Para validar sucesso em `Registra Grupo Contrato`, o indicador mais estavel observado foi a presenca de elementos/textos da tela (ex.: `Adicionar Contrato`, cabecalhos de tabela como `Nome do Contratante`), e nao necessariamente a aparicao imediata do numero do contrato.
- Quando a criacao do cenario precisar ser **offline** (sem execucao), mantenha o mapeamento do menu como dependencia de projeto (`tests/menu-identificadores/menu-identificadores.json`) e concentre o spec final em `tests/SAC_166839/sac-166839-vcom.spec.ts`.

## 2026-03-20

- Quando o usuario pedir para abrir uma tela via breadcrumb (ex.: `Contratos e Beneficiarios > Movimentacao Operadora > Adaptacao - RN 254`), a navegacao deve expandir e **exibir cada nivel do menu** (segmento a segmento).
- Quando o usuario fornecer apenas `data-modulo-funcao` (ex.: `80.CB11.91`), a navegacao ainda deve usar o `pathText` completo do JSON para expandir os ancestrais e **logar o breadcrumb** (ex.: `[MENU] PATH: ...`) antes de clicar no leaf.

# Learnings - TopSaude SAC Tests

## 2026-03-12

- O spec de referencia para SAC (TopSaude) esta em `tests/SAC_166839/sac-166839-vcom.spec.ts` e consolida: (1) 1 teste por contrato para video, (2) navegacao por `data-modulo-funcao` do JSON, (3) leitura estrita de `input.value` + digits-only, (4) evidencias visuais (centralizar + highlight) e logging por passo, (5) deteccao robusta de frames/iframes por DOM com fallback por URL.
- O request em `requests_ia/request_top_saude` (JSON) e a especificacao mais concisa para gerar specs: parametros de ambiente, contratos, hints de frame e regras de derivacao do grupo.

## 2026-03-13

- O spec `tests/SAC_166839/sac-166839-vcom.spec.ts` foi ajustado para reutilizar `tests/src/funcoes_acesso_menu.ts` (`FuncoesAcessoMenu`) na abertura de menus por `data-modulo-funcao`/identificador `k_*`, removendo implementacao local de navegação por menu.

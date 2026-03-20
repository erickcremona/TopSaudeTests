# Learnings - TopSaude SAC Tests

## 2026-03-12

- O spec de referencia para SAC (TopSaude) esta em `tests/SAC_166839/sac-166839-vcom.spec.ts` e consolida: (1) 1 teste por contrato para video, (2) navegacao por `data-modulo-funcao` do JSON, (3) leitura estrita de `input.value` + digits-only, (4) evidencias visuais (centralizar + highlight) e logging por passo, (5) deteccao robusta de frames/iframes por DOM com fallback por URL.
- O request em `requests_ia/request_top_saude` (JSON) e a especificacao mais concisa para gerar specs: parametros de ambiente, contratos, hints de frame e regras de derivacao do grupo.

## 2026-03-13

- O spec `tests/SAC_166839/sac-166839-vcom.spec.ts` foi ajustado para reutilizar `tests/src/funcoes_acesso_menu.ts` (`FuncoesAcessoMenu`) na abertura de menus por `data-modulo-funcao`/identificador `k_*`, removendo implementacao local de navegacao por menu.

## 2026-03-20

- No cenario `SAC_167226` (`Contratos e Beneficiarios > Contratos Pessoa Juridica > Alteracao`), o comportamento real da tela mostrou que o passo descrito como "clicar em Continuar" na pratica acontece ao remover o foco do campo `#num_contrato`.
- Para esse padrao, os agents devem preferir: preencher `#num_contrato` -> retirar foco (`Tab`, `blur()` e/ou clique fora do campo) -> aguardar carregamento da tela de detalhes.
- Nao assumir que existe um botao `Continuar` funcional nesse ponto do fluxo; validar primeiro se o carregamento ocorre por blur do campo.

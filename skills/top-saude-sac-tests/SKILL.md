---
name: top-saude-sac-tests
description: Criar/ajustar testes E2E Playwright de SAC (TopSaude) a partir de um arquivo de request em `requests_ia/*` (ex.: `requests_ia/request_top_saude`), seguindo passos numerados, com navegacao por menu via `tests/menu-identificadores/menu-identificadores.json`, tratamento robusto de frames/iframes, evidencias visuais de cliques (highlight + centralizacao), timeouts por passo e derivacao de dados (ex.: ler apenas numeros de `#nome_grupo_empresa.value` e preencher `#cod_grupo_empresa`). Use quando precisar gerar novos specs em `tests/{SAC}/` mantendo o mesmo padrao do exemplo `tests/SAC_166839/sac-166839-vcom.spec.ts`.
---

# TopSaude SAC Tests

## Fonte de verdade

- Use o request (ex.: `requests_ia/request_top_saude`) como **contrato** do teste: dados, menus, telas/frames, ids e regras.
- Use `tests/menu-identificadores/menu-identificadores.json` (+ `tests/menu-identificadores/MENU_IDENTIFICADORES.md`) para navegar no menu; evite hardcode paralelo.
- Use `tests/SAC_166839/sac-166839-vcom.spec.ts` como **implementacao de referencia** (helpers, estrutura do spec, logging e evidencias).
- Sempre consultar a base de codigo bem-sucedida (`tests/src/success_base/success_base.json`) antes de gerar novos testes, reutilizando padroes e evitando regressao.

## Como ler o request e transformar em codigo

1) Abrir o arquivo de request e parsear como JSON.
2) Normalizar variaveis:
   - `sac.numero`, `sac.nome`
   - `env.base_url`, `env.usuario`, `env.senha`, `env.base_db_preferida` (se existir combobox)
     - Se o usuario nao informar a URL, usar `config-app.json` em `login.topSaude.url` como padrao.
     - Se o usuÃ¡rio solicitar "logar no TopSaude" e nÃ£o informar dados de login, usar os valores de `config-app.json` em `login.topSaude` como padrÃ£o (URL/usuÃ¡rio/senha).
   - Entradas do cenário (não assumir só contrato):
     - Preferir `entrada.entradas[]` com `{ tipo, valores[] }` (ex.: contrato, associado, pedido, cpf, cnpj; pode haver mais de um tipo)
     - Compat: se existir `entrada.contratos[]`, tratar como alias de `entrada.entradas` do tipo `contrato`
     - `entrada.aguardar_contrato_carregar_s` (quando aplicável ao fluxo)
   - `menu.*.data_modulo_funcao` (preferir isso ao texto por risco de mojibake)
   - `telas.*.frame_url_hint` e ids/seletores de campos/botoes
   - `execucao.delay_entre_passos_ms` e `execucao.timeout_por_passo_ms`
   - `regras.*` (principalmente derivacao do grupo e proibicoes)
3) Criar o spec em `tests/{SAC}/` seguindo o mesmo padrao do exemplo:
   - `test.describe.serial(...)`
   - Estruture os testes por item de entrada principal do fluxo (ex.: por contrato quando o fluxo for por contrato). Não fixe “por contrato” se a entrada do cenário for outro tipo.
   - `test.use({ video: 'on' })` no **top-level** do arquivo (Playwright nao permite dentro de `describe`).
4) Alimentar a base de codigo bem-sucedida:
   - Sempre executar `node scripts/seed_success_base.js` para registrar o estado atual dos codigos.
   - Se houver testes que passaram, garantir que a base foi atualizada pelo reporter (`tests/src/success_base/reporter.ts`).
   - Se nao for possivel rodar, registrar explicitamente o motivo.

## Estrutura recomendada do spec (padrao do exemplo)

- **Helpers de passo**:
  - `step(page, nome, fn, timeoutMs?)`: envolve `test.step`, aplica timeout por passo e faz `delay_entre_passos_ms` ao final.
  - Regra: se uma atividade tende a passar de 30s (scroll, waits, leitura), quebre em varios `step(...)`.
- **Evidencia visual**:
  - `installClickHighlighter(page)` via `page.addInitScript` (marca o local do click).
  - `flashElement(locator, label)` para destacar alvos em tela.
  - `clickCentered(locator)` e `showCentered(locator)` sempre centralizam o alvo (`scrollIntoView({ block: 'center' })`) e logam a descricao do elemento.
  - Regra: se o request disser “somente mostrar” (ex.: `#ind_administradora`), use `showCentered` e **nao clique**.
- **Navegacao por menu (JSON)**:
  - Carregar `menu-identificadores.json` e obter o item por `attrs["data-modulo-funcao"]`.
  - Expandir os ancestrais via `path`/`pathText` e clicar o leaf com seletor estavel: `[data-modulo-funcao="..."]`.
  - Quando o usuÃ¡rio informar o caminho em texto (breadcrumb) no pedido, por exemplo: `Contratos e Beneficiarios > MovimentaÃ§Ã£o Operadora > AdaptaÃ§Ã£o - RN 254`, o spec deve navegar **exibindo cada nÃ­vel** do menu (expandir segmento a segmento).
  - Mesmo quando o usuÃ¡rio informar apenas `data-modulo-funcao` (ex.: `80.CB11.91`), o spec deve navegar pelo `pathText` completo do JSON e **logar/exibir o breadcrumb** antes de abrir o leaf (ex.: linha `[MENU] PATH: ...` + expansÃ£o nÃ­vel a nÃ­vel).
  - Se textos tiverem encoding ruim, use `data-modulo-funcao` como preferencia.
  - Preferir reutilizar a classe `tests/src/funcoes_acesso_menu.ts` para padronizar acesso ao menu por identificador (alias) ou por `data-modulo-funcao`.
- **Frames/iframes (robusto)**:
  - Nunca assumir 1 frame unico; localizar por DOM (ex.: “frame que contem `#nome_grupo_empresa`”) e ter fallback por `url includes frame_url_hint`.
  - Helpers do exemplo: `waitForFrameByUrlPart`, `waitForContratoDetalhesFrame`, `waitForFrameWithSelector`, `findFirstInFrames`.
- **Leitura/derivacao de dados**:
  - Se a regra exigir “somente numeros do `value`”, use leitura estrita de `element.value` (nao `textContent`) e aplique `replace(/\\D+/g,'')`.
  - Propagar o dado derivado para passos seguintes (ex.: grupo lido do contrato -> tela “Registra Grupo Contrato”).
  - Adicionar *assertions* para evitar erro silencioso (ex.: impedir preencher `#cod_grupo_empresa` com numero do contrato).
- **Fechar telas (Kendo Window)**:
  - Preferir `a.k-window-action.k-link` visivel (topmost), com fallback para `Escape`.
- **Login (janela de aviso)**:
  - Se houver janela/modal de aviso antes do login, fechar primeiro (botao `x` da janela Kendo ou `Fechar`), depois preencher usuario/senha.
- **Relatorio e videos**:
  - Gerar um `.md` por SAC (ex.: `{numero_sac}_report.md`) e anexar 1 linha por contrato com status.
  - Quando houver video por item, copiar `video.webm` para um path estável (ex.: `tests/{SAC}/videos/{valor}.webm`) no `afterEach`.
  - Ancorar paths em `__dirname` para evitar variacao de CWD entre workers.

## Mapeamento dos passos (exemplo request_top_saude)

- Passos 1–4: `page.goto(base_url)`, preencher usuario/senha, clicar entrar, validar area logada.
- Passos 7–10: abrir menu por `data-modulo-funcao` (Alteracao), focar `#num_contrato`, preencher com fallback (cola -> digitar), retirar foco.
- Passos 11–15: esperar carregar frame do contrato (DOM-first, url fallback), scroll ate fim, **mostrar** `#ind_administradora` (nao clicar), ler grupo de `#nome_grupo_empresa.value` (digits), scroll ao inicio.
- Passo 16: clicar Limpar e fechar janela do contrato.
- Passo 17: se grupo vazio, pular 18–20.
- Passos 18–20: abrir “Registra Grupo Contrato”, preencher `#cod_grupo_empresa` com **grupo digits**, clicar Continuar, validar sucesso por textos/elementos da tela, fechar janela.

## Checklist de qualidade

- Mostrar/registrar TODO click/fill/read (com nome do passo).
- Centralizar alvos antes de clicar; destacar visualmente.
- Timeout por passo respeitado; quebrar passos longos.
- Nunca clicar em campos marcados como “somente mostrar”.
- Qualquer dado derivado deve ter validacao (ex.: grupo != contrato).
- Registrar novos padroes estaveis de menu/frame em `skills/menu-references/LEARNINGS.md` quando surgir algo reutilizavel.
- Base de codigo sempre alimentada: rodar `node scripts/seed_success_base.js` e/ou confirmar atualizacao automatica via reporter.
- Fechar janela/modal antes do login quando existir (especialmente avisos de senha).


## Regra adicional

- Em telas de Alteracao de contrato, quando o usuario disser "clicar em Continuar" logo apos preencher `#num_contrato`, valide primeiro se o carregamento real acontece ao remover o foco do campo (`Tab`, `blur()` ou clique fora).
- Se esse comportamento existir, prefira reproduzir o blur em vez de procurar um botao `Continuar`.
- Em fluxos como `Contratos Pessoa Juridica > Alteracao`, o "Continuar" pode ser implicito: retirar o foco de `#num_contrato` pode disparar o carregamento da tela seguinte sem clique adicional.

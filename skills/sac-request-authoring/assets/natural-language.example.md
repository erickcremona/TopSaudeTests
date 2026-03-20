# Exemplo: linguagem natural -> request.template.json (SAC)

Entrada do usuÃ¡rio (exemplo):

1. Abrir a aplicaÃ§Ã£o em `http://10.130.113.19/TSNMVC/Account/Login`
2. Logar com usuÃ¡rio `$TOPSAUDE_USUARIO` e senha `$TOPSAUDE_SENHA` (variÃ¡veis de ambiente) e selecionar base `DES8`
3. Para cada contrato `19940533`, abrir o menu **AlteraÃ§Ã£o** (data-modulo-funcao `80.CB10.4`)
4. Na tela `ass0086a.asp`, preencher o campo `num_contrato` com o contrato e tirar o foco
5. Aguardar carregar a tela do contrato `ass0045a.asp`, ler o grupo de `nome_grupo_empresa` (somente dÃ­gitos)
6. Clicar em Limpar (`idAcaoLimpar`) e fechar a janela (`a.k-window-action.k-link`)
7. Se grupo estiver vazio, pular para o prÃ³ximo contrato
8. Abrir o menu **Registra Grupo Contrato** (data-modulo-funcao `80.CB10.10`)
9. Na tela `ass0094a.asp`, preencher `cod_grupo_empresa` com o grupo e clicar em `Continuar`
10. Sucesso quando a tela de contratos do grupo for exibida

SaÃ­da esperada do agent:

- Um JSON seguindo `skills/sac-request-authoring/assets/request.template.json` preenchido com:
  - `env.*`, `entrada.*`
  - `menu.*` com `data_modulo_funcao`
  - `telas.*` com `frame_url_hint` + ids/seletores
  - `regras.*` para derivaÃ§Ã£o/pulo de fluxo
  - `execucao.*` com defaults do projeto (visual + 2s)
  - `passos` e `sucesso_quando`

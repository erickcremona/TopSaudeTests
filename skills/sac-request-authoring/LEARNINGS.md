# Learnings - SAC Request Authoring

## 2026-03-13

- Criar requests como "contrato" do teste: `env`, `menu`, `telas`, `regras`, `execucao`, `passos`, `sucesso_quando`.
- Evoluir o schema de forma compativel: adicionar campos opcionais e manter fallback no codigo (evitar breaking changes).
- O agent pode receber o cenario em linguagem natural e converter para um request JSON usando `skills/sac-request-authoring/assets/request.template.json`.

## 2026-03-20

- Quando o usuario descrever um passo como "clicar em Continuar" logo apos informar o contrato em telas de Alteracao de contrato do TopSaude, o request pode precisar refletir o comportamento real da UI: "remover o foco do campo contrato".
- Se o carregamento da tela seguinte ocorrer por blur de `#num_contrato`, documentar isso nos `passos` e evitar forcar no request a existencia de uma acao/botao `Continuar` que nao participa do fluxo real.

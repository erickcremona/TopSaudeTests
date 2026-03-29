---
name: prompt-router
description: Roteia qualquer prompt do usuario para o skill ou agent correto (API Swagger vs UI TopSaude vs authoring) e decide se e solicitacao de teste.
---

# Prompt Router

## Objetivo

Servir como "agente de entrada" para decidir:

1) se o usuario esta pedindo teste automatizado (criar, ajustar ou executar spec) ou nao;
2) qual skill deve assumir a conversa e a execucao.

## Skills alvo

- API / Swagger / REST: `swagger-rest-requests`
- UI / tela / menu / data-modulo-funcao: `top-saude-sac-tests`
- Criar/evoluir request JSON (`requests_ia`): `sac-request-authoring`
- Acoes HTML indexadas: `funcoes-elementos-html`
- Extrair/gerar locators do menu: `menu-references`

## Regras

- Encaminhar somente quando for claramente uma solicitacao de teste.
- Em caso de ambiguidade, fazer 1 pergunta curta para classificar (API vs UI).
- Nao inventar detalhes: quando faltar endpoint, URL ou campos, pedir o minimo essencial.
- Anti-overlap: sempre eleger um unico "dono" (um skill) por solicitacao de teste e finalizar com handoff claro.

## Regra obrigatoria de login via `config-app.json`

- Sempre que o pedido mencionar login, sistema, ambiente ou execucao de teste, consultar `config-app.json`.
- Ler o array `login[]`.
- Cada objeto deve ser identificado pelo seu primeiro campo de negocio.
- Exemplo atual de chaves primarias: `TopSaude`, `ApiProxyMovimentacao`, `ApiCoreMovimentacao`.
- O roteador deve comparar o texto do usuario com esse primeiro campo e com a descricao humana armazenada nesse mesmo objeto.
- Exemplo obrigatorio: `logar no topsaude` deve ser interpretado como o objeto cujo primeiro campo e `TopSaude`.
- Depois de localizar o objeto correto, usar esse objeto como fonte padrao para URL e credenciais/envs.
- Se o objeto localizado tiver campo `payload`, esse arquivo deve ser informado no payload ou handoff da solicitacao.
- So fazer pergunta quando houver ambiguidade real entre dois objetos.

## Observacao

O roteamento automatico depende da capacidade do runner de invocar skills implicitamente. Este skill foi feito para ter descricao ampla e `allow_implicit_invocation=true` para maximizar a chance de ser chamado.

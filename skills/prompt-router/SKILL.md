---
name: prompt-router
description: Roteia qualquer prompt do usuário para o skill/agent correto (API Swagger vs UI TopSaude vs authoring) e decide se é solicitação de teste.
---

# Prompt Router

## Objetivo

Servir como "agente de entrada" para decidir:

1) se o usuário está pedindo **teste automatizado** (criar/ajustar/executar spec) ou não;
2) qual skill deve assumir a conversa/execução.

## Skills alvo

- API / Swagger / REST: `swagger-rest-requests`
- UI / tela / menu / data-modulo-funcao: `top-saude-sac-tests`
- Criar/evoluir request JSON (requests_ia): `sac-request-authoring`
- Ações HTML indexadas: `funcoes-elementos-html`
- Extrair/gerar locators do menu: `menu-references`

## Regras

- Encaminhar somente quando for claramente uma solicitação de teste.
- Em caso de ambiguidade, fazer **1 pergunta** curta para classificar (API vs UI).
- Não inventar detalhes: quando faltar endpoint/URL/campos, pedir o mínimo essencial.
- Exceção para login: se o usuário pedir "logar no TopSaude" ou "logar na api" e não informar dados de login, usar `config-app.json` (objeto `login`) como padrão e apenas confirmar o tipo de autenticação quando for relevante (token/bearer vs basic).
- Anti-overlap: sempre eleger um único "dono" (um skill) por solicitação de teste e finalizar com handoff claro.

## Observação

O roteamento automático depende da capacidade do runner de invocar skills implicitamente. Este skill foi feito para ter descrição ampla e `allow_implicit_invocation=true` para maximizar a chance de ser chamado.

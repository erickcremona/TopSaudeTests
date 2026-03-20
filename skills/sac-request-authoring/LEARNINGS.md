# Learnings - SAC Request Authoring

## 2026-03-13

- Criar requests como “contrato” do teste: `env`, `menu`, `telas`, `regras`, `execucao`, `passos`, `sucesso_quando`.
- Evoluir o schema de forma compatível: adicionar campos opcionais e manter fallback no código (evitar breaking changes).
- O agent pode receber o cenário em linguagem natural e converter para um request JSON usando `skills/sac-request-authoring/assets/request.template.json`.

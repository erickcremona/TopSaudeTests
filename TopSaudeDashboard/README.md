# TopSaudeDashboard (ASPNET Core)

Dashboard local para **criar, buscar e executar** testes Playwright deste repo, sem banco de dados (somente estrutura de pastas/arquivos).

## Rodar

```powershell
cd TopSaudeDashboard
dotnet run
```

Abra a URL exibida no console.

## Funcionalidades

- **Criar teste**: solicita ao Codex CLI (usando os *skills/agents* do repo) para gerar `requests_ia/<SAC>/...json` e `tests/<SAC>/*.spec.ts`.
- **Buscar testes**: lista `tests/{SAC_XXXXXX}` e executa `.spec.ts` em modo visual (`--headed` ou `--ui`).
- **Rodar vídeo**: lista `tests/{SAC_XXXXXX}/videos/*.webm` e reproduz no browser.
- **Configuração**: edita `config-app.json` e `.env` e exibe `como-solicitar.md`.

## Codex (API Key x free)

- Se existir `OPENAI_API_KEY` (ou `CODEX_API_KEY`) no ambiente ou no `.env` da raiz do repo, o dashboard exporta essa chave para o processo `codex`.
- Se **não** existir, o dashboard tenta executar com `codex --oss` (provider local: LM Studio/Ollama).

## Observações

- Executar specs depende de Node/Playwright já instalados no repo (`npm install`, `npx playwright install`).
- O servidor roda no mesmo PC do usuário, então `--headed` abre o browser do Playwright na máquina do usuário.

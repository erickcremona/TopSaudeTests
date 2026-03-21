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
- Se **não** existir, o dashboard so executa com `codex --oss` quando houver provider local ja configurado no Codex CLI, como `lmstudio` ou `ollama`.
- Se nao houver chave nem provider OSS configurado, o dashboard interrompe a geracao e mostra a orientacao para configurar um dos dois.

### Exemplo de provider OSS

Arquivo: `%USERPROFILE%\.codex\config.toml`

Exemplo com `ollama`:

```toml
model = "gpt-5.4"
model_reasoning_effort = "medium"
oss_provider = "ollama"
```

Exemplo com `lmstudio`:

```toml
model = "gpt-5.4"
model_reasoning_effort = "medium"
oss_provider = "lmstudio"
```

Depois de salvar, deixe o provider local em execucao e use o botao `Testar Codex` na tela de configuracao.

## Observações

- Executar specs depende de Node/Playwright já instalados no repo (`npm install`, `npx playwright install`).
- O servidor roda no mesmo PC do usuário, então `--headed` abre o browser do Playwright na máquina do usuário.

## Exemplo solicitação de teste

objetivo: criar/ajustar cenario de teste para verificar Contrato Administradora para o SAC_167226
dados_entrada: contrato 22994063273
passa_quando: O teste é considerado sucesso quando o não for possivel deixa checked os campos ind_administradora e ind_guarda_chuva ao mesmo tempo, quando clicar em um o outro deve ficar desabilitado.
passos: 
1 - logar no TopSaude
2 - acessar no menu Contratos e Beneficiarios > Contratos Pessoa Jurídica > Alteração
3 - informar o contrato 22994063273
4 - remova o foco do campo contrato
5 - clicar no checked ind_guarda_chuva para deixar marcado e depois desmarcar o checked
6 - clicar no checked ind_administradora e clicar em OK no alert
7 - verificar se não é possivel deixar os dois campos checked

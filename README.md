# TopSaudeTests
Projeto para efetuar testes no TopSaúde utilizando o framework Playwright (TypeScript).

## Requisitos
- Node.js 18+ (recomendado 20+)

## Configuração (`.env`)
- Crie um arquivo `.env` na raiz do projeto com as credenciais (exemplo em `exemplo_arquivo_env.md`).
- O `.env` está no `.gitignore` e não deve ser commitado.

### Variáveis de ambiente usadas
- TopSaúde (UI): `TOPSAUDE_USUARIO`, `TOPSAUDE_SENHA`
- API (Token/Bearer): `API_TOKEN_USUARIO`, `API_TOKEN_SENHA`
- API (Basic): `API_BASIC_USERNAME`, `API_BASIC_PASSWORD`

## Instalação
```bash
npm install
npx playwright install
```

## Como rodar
- Rodar tudo:
```bash
npm test
```

- Rodar em modo headed:
```bash
npm run test:headed
```

- Rodar um arquivo específico:
```bash
npx playwright test "tests/smoke.spec.ts"
```

- Ver o relatório HTML:
```bash
npm run report
```

## Estrutura
- `playwright.config.ts`: configuração do runner.
- `tests/`: cenários e utilitários do projeto.
- `requests_ia/`: exemplos de requests usados por alguns testes.

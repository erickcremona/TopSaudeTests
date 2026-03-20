# Learnings: Swagger REST Requests

- Prefira inferir a base da API removendo `/swagger/index.html` da URL fornecida.
- Quando o schema do login é desconhecido, implemente 2–3 tentativas de body e extração profunda de token (com logs claros em falha).
- Validações de response devem ser simples e objetivas (status code + presença de campos críticos).
- Para erros de duplicidade (ex.: “CNPJ já foi integrado”), gere um CNPJ válido, atualize o payload e reenvie; se o payload vier de arquivo, persista a alteração.
- Para `json_api_request.json`, gerar CNPJ sem pontuação preferencialmente via `https://www.4devs.com.br/gerador_de_cnpj` (fallback para gerador local se indisponível).
- Para novos cenários, o agent pode receber o passo a passo em linguagem natural e converter para um request JSON usando `skills/swagger-rest-requests/assets/request.api.template.json`.
- Nao assumir que a entrada do cenario sera sempre `entrada.contratos`: pode ser associado/pedido/CPF/CNPJ etc (e pode haver mais de um tipo). Preferir `entrada.entradas[]` e tratar `entrada.contratos[]` como compat/alias.
- Para acompanhamento do usuário, abra o Swagger UI durante o teste, execute cada ação dentro de `test.step(...)`, destaque o alvo antes de clicar, e use delay de 2s entre passos.
- Para "modo visual", o usuário espera ver o fluxo completo na UI do Swagger: abrir endpoint -> `Try it out` -> preencher body/params -> `Execute` -> ler response -> `Authorize` com `Bearer {token}` -> seguir próximos endpoints.
- Não colapsar/fechar o opblock do endpoint durante o fluxo visual; só expandir quando necessário e manter o endpoint aberto até clicar em `Execute`.
- Em modo visual, aplicar delay de ~2s entre subações na UI (abrir endpoint, Try it out, preencher, Execute) além do delay entre `test.step(...)`.
- Sempre logar o response (status + body) para cada endpoint; redigir token/JWT/Authorization antes de imprimir.
- No Swagger UI, após `Execute`, centralizar e rolar o bloco do response até o fim para mostrar o JSON completo ao usuário.
- Quando o response for muito grande e o runner truncar o console, salvar o response redigido em `out/api-responses/<SAC>/...json` e imprimir o path.
- Padrão para API: `timeout_por_passo_ms=2000` e `delay_entre_passos_ms=2000`.

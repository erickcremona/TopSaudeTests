# Exemplo: linguagem natural -> request JSON (API Swagger)

Entrada do usuÃ¡rio (exemplo):

1. Abrir o swagger `http://10.0.0.1/APIs/MinhaApi/swagger/index.html`
2. Logar no endpoint `/api/auth/usuarios` com `usuario=$API_TOKEN_USUARIO` e `senha=$API_TOKEN_SENHA` (variáveis de ambiente) para obter token
3. Autorizar no swagger com o token
4. Enviar `POST /api/movimentacoes/contrato` usando o arquivo `json_api_request.json`
5. Validar status 200
6. Em seguida, enviar `GET /api/movimentacoes/consulta-contrato/{numeroContrato}` com o numeroContrato retornado
7. Validar status 200

SaÃ­da esperada do agent:

- Um arquivo JSON no formato `skills/swagger-rest-requests/assets/request.api.template.json`, preenchido com:
  - `env.base_url`, `env.usuario`, `env.senha`
  - `entrada.request_login`, `entrada.request_contrato`, `entrada.request_consulta_contrato`, `entrada.json_contrato`
  - `entrada.entradas[]` (nÃ£o assumir somente contrato; pode ser cpf/cnpj/pedido/associado, e pode haver mais de um tipo)
  - `execucao.*` com defaults do projeto (visual + 2s)
  - `passos` numerado e `sucesso_quando`

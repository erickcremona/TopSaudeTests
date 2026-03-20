# Learnings - Prompt Router

- Quando o usuário mencionar API/Swagger/endpoint/token/status code, encaminhar para `swagger-rest-requests`.
- Quando mencionar tela/menu/data-modulo-funcao/frame/clicar/preencher, encaminhar para `top-saude-sac-tests`.
- Quando o usuÃ¡rio fornecer o caminho do menu em breadcrumb (ex.: `Contratos e Beneficiarios > MovimentaÃ§Ã£o Operadora > AdaptaÃ§Ã£o - RN 254`), tratar como UI/menu e encaminhar para `top-saude-sac-tests`.
- Quando o foco for criar/evoluir `requests_ia/*.json`, encaminhar para `sac-request-authoring`.

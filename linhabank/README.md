# LinhaBank

Bot de Telegram do LinhaBank. O atendimento é um diálogo com a Thialinha, atendente IA.

Cada pessoa que concorda com os termos abre a própria conta no LinhaBank. O saldo e o extrato ficam nessa conta. Agência, número e chave interna servem para transferência entre contas LinhaBank. A gateway só envia e recebe PIX.

## Segredos

O nome do segredo fica no projeto. O valor fica fora do git.

- `TELEGRAM_BOT_TOKEN`: token do @BotFather. No BotFather, o nome do bot é LinhaBank.
- `TELEGRAM_WEBHOOK_SECRET`: segredo do webhook. Use de 1 a 256 caracteres entre letras, números, `_` e `-`.
- `PIX_GATEWAY_URL`: endereço HTTPS da gateway. Enquanto estiver vazio, o PIX não sai.
- `PIX_GATEWAY_TOKEN`: token que o LinhaBank envia para a gateway.
- `PIX_GATEWAY_WEBHOOK_SECRET`: segredo do aviso de PIX recebido.

Quando a URL existir, inclua o domínio dela em `hosting.egressDomains` de `bot/agent.ts`.

O envio é `POST /v1/pix/enviar`, com `Authorization: Bearer`. O corpo leva `id`, `referencia`, `valorCentavos` e `chaveDestino`. Não leva agência, número nem chave interna. A resposta de sucesso traz `endToEndId`. O LinhaBank só debita o saldo depois dessa resposta.

O aviso de PIX recebido entra em `POST /v1/channels/pix/recebido`, no cabeçalho `X-Linhabank-Gateway-Token`. O corpo leva `id`, `referencia`, `valorCentavos` e, se houver, `pagador` e `endToEndId`. A `referencia` identifica a conta. Esse aviso credita o saldo e entra no extrato do LinhaBank.

Grave os valores em `.env.local` nesta pasta. Esse arquivo não entra no git. O processo também aceita as mesmas variáveis no ambiente. Uma variável já definida no ambiente vale mais que o arquivo.

## Teste local

```bash
TELEGRAM_POLL=1 npx @grok/agent-sdk dev --dir . --mode single
```

`TELEGRAM_POLL=1` faz a Thialinha buscar as mensagens no Telegram. Sem isso, o Telegram entrega no webhook.

O playground abre em http://127.0.0.1:3000/playground.

O webhook local fica em `POST /v1/channels/telegram/webhook`. Um exemplo está em `fixtures/ola.json`.

No endereço publicado, aponte o webhook para `$AGENT_ALIAS_URL/v1/channels/telegram/webhook` e envie o segredo no cabeçalho `X-Telegram-Bot-Api-Secret-Token`. Não use `TELEGRAM_POLL=1` junto com o webhook.

# LinhaBank

Bot de Telegram do LinhaBank. O atendimento é um diálogo com a Thialinha, atendente IA.

A Thialinha explica conta, PIX, cartão e segurança com o catálogo do banco. Ela abre protocolo de atendimento. Ela não vê saldo e não movimenta dinheiro.

## Segredos

O nome do segredo fica no projeto. O valor fica fora do git.

- `TELEGRAM_BOT_TOKEN`: token do @BotFather. No BotFather, o nome do bot é LinhaBank.
- `TELEGRAM_WEBHOOK_SECRET`: segredo do webhook. Use de 1 a 256 caracteres entre letras, números, `_` e `-`.

Grave os valores em `.env.local` nesta pasta. Esse arquivo não entra no git. O processo também aceita as mesmas variáveis no ambiente. Uma variável já definida no ambiente vale mais que o arquivo.

## Teste local

```bash
TELEGRAM_POLL=1 npx @grok/agent-sdk dev --dir . --mode single
```

`TELEGRAM_POLL=1` faz a Thialinha buscar as mensagens no Telegram. Sem isso, o Telegram entrega no webhook.

O playground abre em http://127.0.0.1:3000/playground.

O webhook local fica em `POST /v1/channels/telegram/webhook`. Um exemplo está em `fixtures/ola.json`.

No endereço publicado, aponte o webhook para `$AGENT_ALIAS_URL/v1/channels/telegram/webhook` e envie o segredo no cabeçalho `X-Telegram-Bot-Api-Secret-Token`. Não use `TELEGRAM_POLL=1` junto com o webhook.

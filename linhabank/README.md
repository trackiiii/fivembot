# LinhaBank

Bot de Telegram do LinhaBank. O atendimento é um diálogo com a Thialinha, atendente IA.

Cada pessoa que concorda com os termos abre a própria conta no LinhaBank. O saldo dessa conta fica na gateway de PIX. A Thialinha mostra agência, número, chave e cartão virtual, e só fala um saldo quando a gateway devolve o número daquela conta.

## Segredos

O nome do segredo fica no projeto. O valor fica fora do git.

- `TELEGRAM_BOT_TOKEN`: token do @BotFather. No BotFather, o nome do bot é LinhaBank.
- `TELEGRAM_WEBHOOK_SECRET`: segredo do webhook. Use de 1 a 256 caracteres entre letras, números, `_` e `-`.
- `PIX_GATEWAY_URL`: endereço HTTPS da gateway. Enquanto estiver vazio, a Thialinha não mostra saldo nem confirma PIX.
- `PIX_GATEWAY_TOKEN`: token que a Thialinha envia para a gateway.
- `PIX_GATEWAY_WEBHOOK_SECRET`: segredo do aviso de PIX recebido.

Quando a URL existir, inclua o domínio dela em `hosting.egressDomains` de `bot/agent.ts`. A gateway guarda o saldo de cada conta. O LinhaBank guarda de quem é a conta.

A gateway recebe `POST /v1/contas/consultar`, `POST /v1/pix/enviar`, `POST /v1/transferir` e `POST /v1/boleto`, com `Authorization: Bearer`. O corpo traz o número da conta. A resposta traz `saldoCentavos` daquela conta. O aviso de PIX recebido entra em `POST /v1/channels/pix/recebido`, no cabeçalho `X-Linhabank-Gateway-Token`. Esse aviso não altera saldo. O saldo continua sendo o da gateway.

Grave os valores em `.env.local` nesta pasta. Esse arquivo não entra no git. O processo também aceita as mesmas variáveis no ambiente. Uma variável já definida no ambiente vale mais que o arquivo.

## Teste local

```bash
TELEGRAM_POLL=1 npx @grok/agent-sdk dev --dir . --mode single
```

`TELEGRAM_POLL=1` faz a Thialinha buscar as mensagens no Telegram. Sem isso, o Telegram entrega no webhook.

O playground abre em http://127.0.0.1:3000/playground.

O webhook local fica em `POST /v1/channels/telegram/webhook`. Um exemplo está em `fixtures/ola.json`.

No endereço publicado, aponte o webhook para `$AGENT_ALIAS_URL/v1/channels/telegram/webhook` e envie o segredo no cabeçalho `X-Telegram-Bot-Api-Secret-Token`. Não use `TELEGRAM_POLL=1` junto com o webhook.

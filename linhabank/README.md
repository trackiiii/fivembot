# LINHABANK

Carteira digital em BRL, com atendimento público no Telegram pelo bot [@linhabank_bot](https://t.me/linhabank_bot). A Thialinha é a atendente IA. O dinheiro da conta não vive no modelo: saldo, ledger e PIX passam pelas ferramentas do servidor.

Este projeto **não está em produção**. Enquanto o gateway Pix, a segurança e a estrutura regulatória não estiverem prontos, o modo padrão é `sandbox`. Não processe dinheiro real nesse estado.

## O que já funciona

- Cadastro por `/start` e aceite dos termos, com uma carteira por chat.
- Saldo e extrato da própria conta.
- PIX entre contas LinhaBank, reconhecido pela chave `lb…@linhabank` ou pelo número, sem taxa.
- PIX para fora pela gateway, quando `PIX_GATEWAY_URL` e `PIX_GATEWAY_TOKEN` existem. A taxa é `PIX_TAXA_CENTAVOS` + `PIX_TAXA_PERCENTUAL` (zero se não configurada).
- Depósito PIX com QR Code e copia e cola. O saldo **não** sobe na geração. Sobe só no webhook do provedor, ou no simulador de sandbox.
- Histórico no ledger (lançamentos não são apagados). Comprovante `LB-…` em cada movimentação.
- Transferência, boleto, cartão virtual, PIX agendado e protocolo.
- Gerência no Telegram: `/admin` abre o painel operacional (custódia, contas, ficha, extrato, tesouraria PIX, movimento e tarifas). Bloqueio de conta e cartão, liquidação em homologação, cancelamento de cobrança e parametrização. Sem página web.
- Foto de comprovante **não** credita saldo.
- A Thialinha tem uma biblioteca de conversa local (saudação, saldo, depósito, FAQ). Isso não chama o modelo. PIX de envio e falas complexas continuam no turno do modelo. Sem teclado extra no chat.
- Mini-app do Telegram em `/v1/channels/app/`. Saldo, depósito PIX, envio com confirmação e extrato da mesma conta. O botão nativo **LinhaBank** só aparece com `TELEGRAM_WEBAPP_URL` em HTTPS.

## O que ainda não está pronto para dinheiro real

- Não há PSP Pix de produção ligado. O adaptador HTTP fala com o contrato `POST /v1/pix/enviar` já usado pelo bot. A cobrança de depósito é um BR Code local.
- PostgreSQL só entra com `DATABASE_URL`. Sem isso, o ledger fica no KV persistente do Agent SDK.
- Não há licença, KYC completo nem conta de liquidação. Sandbox não substitui isso.

## Como executar

No diretório `linhabank`:

```bash
# testes financeiros e de agenda
npm test

# checagem de tipos
npm run check

# bot local, escutando o Telegram
TELEGRAM_POLL=1 npx @grok/agent-sdk dev --dir . --mode single
```

Grave os valores em `.env.local` (o arquivo não entra no git):

| Variável | Função |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token do @linhabank_bot |
| `TELEGRAM_WEBHOOK_SECRET` | Segredo do webhook do Telegram |
| `TELEGRAM_WEBAPP_URL` | HTTPS do mini-app (`…/v1/channels/app/`). Sem isso, o botão do app não é ligado |
| `LINHABANK_APP_DEV_CHAT` | Chat de teste do mini-app só em `127.0.0.1` |
| `CURSOR_API_KEY` | Chave do modelo, só no ambiente |
| `PIX_GATEWAY_URL` | HTTPS da gateway. Vazio = PIX para fora não sai |
| `PIX_GATEWAY_TOKEN` | Token enviado à gateway |
| `PIX_GATEWAY_WEBHOOK_SECRET` | Segredo do aviso de PIX recebido |
| `PIX_RECEBIMENTO_CHAVE` | Chave Pix da cobrança de depósito |
| `PIX_TAXA_CENTAVOS` | Taxa fixa do PIX para fora |
| `PIX_TAXA_PERCENTUAL` | Percentual do PIX para fora |
| `LINHABANK_MODO` | `sandbox` (padrão) ou `live` |
| `ADMIN_TOKEN` | Token para o primeiro `/admin` no Telegram |
| `LINHABANK_ADMIN_CHATS` | IDs extras dos chats admin. O chat `7069054484` já entra como admin |
| `DATABASE_URL` | PostgreSQL. Sem isso, o ledger usa o KV |
| `LINHABANK_DB_PATH` | PGlite em arquivo, para teste local com SQL |

Comandos úteis no Telegram: `/start` (com conta: saldo e movimentação do dia), `/ajuda`, `/saldo`, `/extrato`, `/depositar 50,00`, `/agendamentos`. O admin abre `/admin` no mesmo chat, com botões.

## Webhooks

- Telegram: `POST /v1/channels/telegram/webhook`
- PIX recebido: `POST /v1/channels/pix/recebido` com `X-Linhabank-Gateway-Token`
- Gerência: no Telegram, `/admin` (chat `7069054484`, `LINHABANK_ADMIN_CHATS` ou `/admin` + `ADMIN_TOKEN`). Painel, contas, ficha, extrato, PIX e tarifas.
- Mini-app: `GET /v1/channels/app/` e `POST /v1/channels/app/api` com `Authorization: tma <initData>`
- Simular pagamento (só sandbox): `POST /v1/channels/admin/sandbox/pagar` `{ "cobrancaId": "dep-…" }`

O corpo do PIX recebido leva `id` (idempotente), `valorCentavos` e um destes: `txid` / `cobrancaId` da cobrança, ou `referencia` da conta. Valor diferente da cobrança é recusado. O LinhaBank não credita porque o cliente enviou comprovante.

## Ledger e banco

Os lançamentos são imutáveis. Estorno de PIX recusado pela gateway vira um crédito novo, não uma exclusão. Transferência entre contas trava as duas contas, debita e credita na mesma transação.

Com `DATABASE_URL`, rode `npm run migrate` e o schema em `migrations/`. Sem Postgres, o mesmo modelo roda no KV, com trava por conta.

## Publicação

O webhook publicado fica em `$AGENT_ALIAS_URL/v1/channels/telegram/webhook`. Não use `TELEGRAM_POLL=1` junto com o webhook. Inclua o domínio da gateway em `hosting.egressDomains` de `bot/agent.ts`.

O painel admin não é uma página web. No Telegram, o chat autorizado envia `/admin` e opera por botões. Na primeira vez, `/admin` + `ADMIN_TOKEN`. Os chats também podem ir em `LINHABANK_ADMIN_CHATS`.

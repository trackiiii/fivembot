# LINHABANK

Carteira digital em BRL, com atendimento público no Telegram pelo bot [@linhabank_bot](https://t.me/linhabank_bot). A Thialinha atende neste chat. O dinheiro da conta não vive no modelo: saldo, ledger e PIX passam pelas ferramentas do servidor.

Este projeto **não está em produção**. O Asaas pode estar ligado para PIX, mas segurança, KYC e estrutura regulatória ainda precisam estar prontos. O modo padrão da carteira continua `sandbox` (homologação). Não trate homologação como produção.

## O que já funciona

- Cadastro por `/start` e aceite dos termos, com uma carteira por chat.
- Saldo e extrato da própria conta.
- PIX entre contas LinhaBank, reconhecido pela chave `lb…@linhabank` ou pelo número, sem taxa.
- PIX para fora pelo Asaas quando `ASAAS_API_KEY` existe (`POST /v3/transfers`). Sem Asaas, vale o convênio HTTP `PIX_GATEWAY_URL` + `PIX_GATEWAY_TOKEN`. O cliente paga o custo da gateway mais o adicional LinhaBank (`PIX_TAXA_CENTAVOS` + `PIX_TAXA_PERCENTUAL`, zero se não configurado). PIX interno LinhaBank continua isento.
- Depósito PIX com QR Code e copia e cola. Com Asaas, o QR é estático (`POST /v3/pix/qrCodes/static`). O saldo **não** sobe na geração. Sobe só no webhook `PAYMENT_RECEIVED`, ou no simulador de homologação.
- Histórico no ledger (lançamentos não são apagados). Comprovante `LB-…` em cada movimentação.
- Transferência, boleto, cartão virtual, PIX agendado e protocolo.
- Gerência no Telegram: `/admin` abre o painel operacional (custódia, contas, ficha, extrato, tesouraria PIX, movimento, tarifas, anúncio e Clube). Bloqueio de conta e cartão, liquidação em homologação, cancelamento de cobrança, parametrização, LBcoins e indicações. Sem página web.
- **Atualizar** no painel consulta o custo vigente da gateway (`GET /v3/myAccount/fees/` no Asaas) e não altera o adicional LinhaBank. Em Tarifas, **Adicional R$** e **Adicional %** personalizam a margem em cima da gateway. PIX interno continua isento. Convênio HTTP não informa o custo da gateway.
- Cada depósito, envio e recebimento de qualquer cliente é publicado no canal de movimento do Telegram (`LINHABANK_CANAL_MOVIMENTO` ou, se vazio, nos chats dos operadores). Sem copia e cola e sem a Thialinha.
- Foto de comprovante **não** credita saldo.
- A Thialinha tem uma biblioteca de conversa local (saudação, saldo, depósito, FAQ, Club). Isso não chama o modelo. PIX de envio e falas complexas continuam no turno do modelo.
- LINHABANK CLUB (`/club`): LBcoins, categorias Bronze/Prata/Ouro por XP e programa INDIQUE E GANHE. LBcoins não são dinheiro, Pix nem saldo sacável. Indicação só credita depois da aprovação (padrão: análise da gerência). O teclado do Club só aparece quando o cliente abre `/club`, ou pela opção Club no menu.
- Depois de abrir a conta, o cliente escolhe falar com a Thialinha ou operar pelo menu de botões. `/menu` e `/conversa` trocam. O menu tem uma opção por linha, com Voltar. PIX de envio pede confirmação.
- Mini-app do Telegram em `/v1/channels/app/`. Saldo, depósito PIX, envio com confirmação e extrato da mesma conta. O botão nativo **LinhaBank** só aparece com `TELEGRAM_WEBAPP_URL` em HTTPS.

## O que ainda não está pronto para dinheiro real

- Asaas envia e recebe PIX, mas isso não substitui KYC, licença nem conta de liquidação própria. Homologação no painel ainda permite liquidar cobrança localmente.
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
| `ASAAS_API_KEY` | Chave da API Asaas. Conta de produção se começar com `$aact_prod_`. Nunca commitar |
| `ASAAS_WEBHOOK_TOKEN` | Token do webhook Asaas (header `asaas-access-token`, 32–255 caracteres) |
| `ASAAS_AMBIENTE` | Opcional: `sandbox` ou `producao`. Sem isso, o prefixo da chave decide |
| `PIX_GATEWAY_URL` | HTTPS de convênio HTTP genérico (testes). Vazio se o Asaas estiver no ar |
| `PIX_GATEWAY_TOKEN` | Token do convênio HTTP genérico |
| `PIX_GATEWAY_WEBHOOK_SECRET` | Segredo do aviso genérico de PIX recebido |
| `PIX_RECEBIMENTO_CHAVE` | Chave Pix da conta Asaas que recebe depósito. Sem isso, o bot lista as chaves ativas |
| `PIX_TAXA_CENTAVOS` | Adicional fixo do LinhaBank sobre o custo da gateway, no PIX para fora |
| `PIX_TAXA_PERCENTUAL` | Adicional percentual do LinhaBank sobre o custo da gateway, no PIX para fora |
| `PIX_TAXA_GATEWAY_CENTAVOS` | Custo de envio da gateway, em centavos. O painel **Atualizar** preenche pelo Asaas |
| `LINHABANK_MODO` | `sandbox` (padrão) ou `live` |
| `ADMIN_TOKEN` | Token para o primeiro `/admin` no Telegram |
| `LINHABANK_ADMIN_CHATS` | IDs extras dos chats admin. O chat `7069054484` já entra como admin |
| `LINHABANK_CANAL_MOVIMENTO` | Chat id do canal de movimento (ex.: `-100…` ou `@canal`). Sem isso, o feed vai para os operadores. O bot precisa ser admin do canal |
| `DATABASE_URL` | PostgreSQL. Sem isso, o ledger usa o KV |
| `LINHABANK_DB_PATH` | PGlite em arquivo, para teste local com SQL |
| `TELEGRAM_BOT_USERNAME` | Username do bot, sem `@`, para o link `t.me/…?start=CODIGO`. Sem isso, o bot consulta `getMe` |
| `LBCOINS_INDICACAO` | LBcoins por indicação aprovada (padrão 500). Zero desliga o crédito |
| `LINHABANK_INDICACAO_CRITERIO` | `manual` (padrão) ou `conta_aberta`. Não exige depósito |
| `LINHABANK_XP_PRATA` | XP mínimo da Prata (padrão 1000) |
| `LINHABANK_XP_OURO` | XP mínimo do Ouro (padrão 5000) |
| `LINHABANK_XP_INDICACAO` | XP creditado ao indicador na aprovação (padrão 100) |
| `LINHABANK_BENEFICIO_PRATA` | Texto extra de benefício da Prata. Vazio = só o que já existe |
| `LINHABANK_BENEFICIO_OURO` | Texto extra de benefício do Ouro. Vazio = só o que já existe |
| `LINHABANK_VOZ` | `0` desliga a nota de voz da Thialinha. Padrão: ligada. A voz humana é a neural pt-BR Francisca: `python3 -m pip install edge-tts` e `ffmpeg`. A frase falada segue para `speech.platform.bing.com`. Sem isso, cai no Mbrola/`espeak-ng` |

Comandos úteis no Telegram: `/start` (com conta: saldo e movimentação do dia; com código: registra indicação), `/ajuda`, `/saldo`, `/extrato`, `/depositar 50,00`, `/agendamentos`, `/cofrinho`, `/club`, `/menu`, `/conversa`. As falas da Thialinha no chat começam com o nome em negrito. O menu de botões não usa esse prefixo. O admin abre `/admin` no mesmo chat, com botões. No Clube, a gerência aprova indicações, ajusta LBcoins/XP com justificativa e configura recompensa e faixas de XP.

## Webhooks

- Telegram: `POST /v1/channels/telegram/webhook`
- PIX recebido (Asaas): `POST /v1/channels/pix/asaas` com `asaas-access-token: $ASAAS_WEBHOOK_TOKEN`. Evento `PAYMENT_RECEIVED`.
- PIX recebido (convênio HTTP): `POST /v1/channels/pix/recebido` com `X-Linhabank-Gateway-Token`
- Gerência: no Telegram, `/admin` (chat `7069054484`, `LINHABANK_ADMIN_CHATS` ou `/admin` + `ADMIN_TOKEN`). Painel, contas, ficha, extrato, PIX e tarifas. O canal de movimento também se configura em Tarifas → Canal TG. **Atualizar** puxa o custo Asaas; **Adicional R$** / **Adicional %** definem a margem.
- Mini-app: `GET /v1/channels/app/` e `POST /v1/channels/app/api` com `Authorization: tma <initData>`
- Simular pagamento (só sandbox): `POST /v1/channels/admin/sandbox/pagar` `{ "cobrancaId": "dep-…" }`

O corpo do PIX recebido leva `id` (idempotente), `valorCentavos` e um destes: `txid` / `cobrancaId` da cobrança, ou `referencia` da conta. Valor diferente da cobrança é recusado. O LinhaBank não credita porque o cliente enviou comprovante.

## Ledger e banco

Os lançamentos são imutáveis. Estorno de PIX recusado pela gateway vira um crédito novo, não uma exclusão. Transferência entre contas trava as duas contas, debita e credita na mesma transação.

Com `DATABASE_URL`, rode `npm run migrate` e o schema em `migrations/` (`001_wallet.sql`, `002_cobranca_taxa.sql`, `003_fidelidade.sql`, `004_cofrinho.sql`). Sem Postgres, o mesmo modelo (carteira BRL, cofrinho e LBcoins) roda no KV, com trava por conta. O cofrinho é saldo real separado do disponível, sem taxa e sem rendimento.

## Publicação

O webhook publicado fica em `$AGENT_ALIAS_URL/v1/channels/telegram/webhook`. Não use `TELEGRAM_POLL=1` junto com o webhook. No Asaas, cadastre `POST $AGENT_ALIAS_URL/v1/channels/pix/asaas` com o token `ASAAS_WEBHOOK_TOKEN`. `bot/agent.ts` já libera `api.asaas.com`.

O painel admin não é uma página web. No Telegram, o chat autorizado envia `/admin` e opera por botões. Na primeira vez, `/admin` + `ADMIN_TOKEN`. Os chats também podem ir em `LINHABANK_ADMIN_CHATS`.

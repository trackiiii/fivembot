# linhabank

Agent SDK project (`@grok/agent-sdk`). This file is
for coding agents editing the project. The served agent's prompt is
`bot/instructions.md`.

## Loop

```bash
agent-sdk validate --dir .
agent-sdk info --dir . --json
agent-sdk run --dir . --message "..."
agent-sdk eval --dir .
npm run check
```

Run the CLI under Node, never Bun.

## Layout

- `bot/instructions.md` is the always-on prompt. Keep it short.
- `bot/tools/<name>.ts` is one tool per file. The filename is the tool name.
- `bot/lib/` is shared code. Never discovered.
- `evals/` is filesystem evals (`evals/evals.config.ts` required).
  Not `bot/evals/`. That path is ignored.

## Atendimento

- A fala da Thialinha fica em `bot/instructions.md`. Cumprimento, saldo simples e outras intenções da biblioteca em `bot/lib/conversa/` respondem localmente, sem o modelo. PIX de envio, agendamento e o que a classificação não cobrir seguem no turno do modelo.
- O histórico de cada chat do Telegram fica em `ctx.host.kv`, na chave `linhabank:chat:<id>`.
- Cada chat tem a própria conta. Saldo e extrato saem do ledger. Sem `DATABASE_URL` o ledger fica no kv; com Postgres, o SQL é a fonte da verdade. Com `ASAAS_API_KEY`, o PSP é o Asaas (`POST /v3/transfers` e QR estático). Sem Asaas, o adaptador HTTP `POST /v1/pix/enviar` continua. Agência, número e chave interna servem para transferência entre contas LinhaBank.
- Depósito PIX gera cobrança (QR + copia e cola). Crédito só no webhook do provedor, com idempotência. Foto de comprovante não credita.
- O mini-app do Telegram vive em `bot/channels/app.ts` e `bot/lib/app/`. Autentica com initData. Não coloca teclado no chat. PIX de saída exige `confirmar: true`.
- A gerência é um teclado inline no Telegram (`/admin`, `bot/lib/admin/`). Linguagem operacional, sem menção a IA. Configuração em `bot/lib/config.ts` (`linhabank:config`). Não use a Thialinha nem HTML para operar o painel. Cada opção fica em um botão próprio; as telas internas têm **Voltar**. A ficha do cliente edita titular, agência, número, chave e cartão, e ativa/desativa a conta. **Manutenção** (`a:t:m`) no Início: o cliente vê o aviso institucional, sem a Thialinha; a gerência continua. Anúncio envia texto e imagem para as contas ativas, sem prefixo da Thialinha. Clube (`a:h`) opera LBcoins, indicações e XP; ajustes administrativos geram `admin_audit_logs`.
- LBcoins ficam em `bot/lib/fidelidade/` (ledger próprio, separado do saldo em reais). Categorias Bronze/Prata/Ouro usam XP, não o saldo de LBcoins. O cliente abre o Club com `/club` (`bot/lib/clube/`). Indicação via deep link `/start CODIGO`; recompensa só depois da aprovação. Não inventar saldo, XP ou indicação na fala.
- A Thialinha não explica essa ligação ao cliente. Termos, catálogo, descrição do Telegram e mensagens do chat não citam gateway.
- Não reative o diário compartilhado. Um `memoryHook` mistura mensagens de clientes diferentes.

## Do not

- Grow host TypeScript for formatting, classification, or reply composition.
  That stays in instructions/skills. Host code owns auth, idempotency,
  evidence seeding, and side-effect gates.
- Add npm deps on a first cut. Stick to what `@grok/agent-sdk` already ships.
- Point `serve` at a parent folder during bring-up. It mounts every sibling.

## Pointers

- Package loop: `node_modules/@grok/agent-sdk/AGENTS.md`
- Skills: `node_modules/@grok/agent-sdk/skills/` (`create-agent`, `deploy`, `evals`, `hillclimb`, `debug`)
- Docs: `npx @grok/agent-sdk docs`
- LLM docs index: `node_modules/@grok/agent-sdk/dist/docs/llms.txt`

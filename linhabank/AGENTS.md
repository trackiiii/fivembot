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
- Cada chat tem a própria conta. Saldo e extrato saem do ledger. Sem `DATABASE_URL` o ledger fica no kv; com Postgres, o SQL é a fonte da verdade. A gateway só envia PIX e avisa recebimento. Agência, número e chave interna servem para transferência entre contas LinhaBank.
- Depósito PIX gera cobrança (QR + copia e cola). Crédito só no webhook do provedor, com idempotência. Foto de comprovante não credita.
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

create table if not exists contas (
  chat_id text primary key,
  nome text not null,
  termos_versao text not null,
  aceitou_em timestamptz not null,
  agencia text not null,
  numero text not null unique,
  chave_interna text not null unique,
  referencia text not null unique,
  saldo_centavos bigint not null default 0,
  cartao_final text not null,
  cartao_bloqueado boolean not null default false,
  status text not null default 'ativa',
  versao integer not null default 1,
  atualizado_em timestamptz not null default now()
);

create table if not exists ledger (
  id text primary key,
  conta_chat_id text not null references contas (chat_id),
  tipo text not null,
  valor_centavos bigint not null,
  descricao text not null,
  comprovante text,
  contra_chat_id text,
  idempotency_key text not null,
  criado_em timestamptz not null default now()
);

create unique index if not exists ledger_idempotency on ledger (idempotency_key, conta_chat_id, tipo, valor_centavos);
create index if not exists ledger_conta_criado on ledger (conta_chat_id, criado_em);
create index if not exists ledger_comprovante on ledger (comprovante);

create table if not exists cobrancas (
  id text primary key,
  chat_id text not null references contas (chat_id),
  valor_centavos bigint not null,
  txid text not null unique,
  copia_e_cola text not null,
  status text not null default 'aberta',
  provedor text not null,
  webhook_id text unique,
  end_to_end_id text,
  comprovante text,
  criada_em timestamptz not null default now(),
  paga_em timestamptz
);

create index if not exists cobrancas_chat on cobrancas (chat_id, criada_em);

create table if not exists webhooks (
  id text primary key,
  tipo text not null,
  payload_hash text not null,
  criado_em timestamptz not null default now()
);

create table if not exists admin_audit (
  id text primary key,
  acao text not null,
  detalhe text not null,
  criado_em timestamptz not null default now()
);

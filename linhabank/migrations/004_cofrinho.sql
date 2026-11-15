create table if not exists cofrinhos (
  id text primary key,
  chat_id text not null references contas (chat_id),
  nome text not null,
  meta_centavos bigint not null default 0 check (meta_centavos >= 0),
  saldo_centavos bigint not null default 0 check (saldo_centavos >= 0),
  status text not null default 'ativo',
  criado_em timestamptz not null default now()
);

create index if not exists cofrinhos_chat on cofrinhos (chat_id, criado_em);

create table if not exists loyalty_wallets (
  chat_id text primary key references contas (chat_id),
  saldo bigint not null default 0 check (saldo >= 0),
  total_recebido bigint not null default 0 check (total_recebido >= 0),
  total_utilizado bigint not null default 0 check (total_utilizado >= 0),
  recompensas_bloqueadas boolean not null default false,
  codigo_indicacao text not null unique,
  criado_em timestamptz not null default now(),
  versao integer not null default 1
);

create table if not exists loyalty_transactions (
  id text primary key,
  chat_id text not null references contas (chat_id),
  tipo text not null,
  quantidade bigint not null,
  descricao text not null,
  origem text not null,
  status text not null default 'confirmado',
  idempotency_key text not null unique,
  criado_em timestamptz not null default now()
);

create index if not exists loyalty_tx_chat on loyalty_transactions (chat_id, criado_em);

create table if not exists user_referrals (
  id text primary key,
  indicador_chat_id text not null references contas (chat_id),
  indicado_chat_id text not null unique references contas (chat_id),
  codigo text not null,
  status text not null default 'pendente',
  motivo text,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por text
);

create index if not exists user_referrals_indicador on user_referrals (indicador_chat_id, status);
create index if not exists user_referrals_status on user_referrals (status, criado_em);

create table if not exists referral_rewards (
  id text primary key,
  referral_id text not null unique references user_referrals (id),
  chat_id text not null references contas (chat_id),
  quantidade bigint not null,
  transacao_id text not null,
  criado_em timestamptz not null default now()
);

create table if not exists user_xp (
  chat_id text primary key references contas (chat_id),
  xp bigint not null default 0 check (xp >= 0),
  categoria text not null default 'bronze',
  categoria_em timestamptz not null default now(),
  versao integer not null default 1
);

create table if not exists user_xp_historico (
  id text primary key,
  chat_id text not null references contas (chat_id),
  xp_anterior bigint not null,
  xp_novo bigint not null,
  categoria_anterior text not null,
  categoria_nova text not null,
  motivo text not null,
  criado_em timestamptz not null default now()
);

create index if not exists user_xp_hist_chat on user_xp_historico (chat_id, criado_em);

create table if not exists loyalty_tiers (
  id text primary key,
  nome text not null,
  xp_minimo bigint not null,
  xp_maximo bigint
);

insert into loyalty_tiers (id, nome, xp_minimo, xp_maximo) values
  ('bronze', 'Bronze', 0, 999),
  ('prata', 'Prata', 1000, 4999),
  ('ouro', 'Ouro', 5000, null)
on conflict (id) do nothing;

create table if not exists loyalty_benefits (
  id text primary key,
  categoria text not null,
  titulo text not null,
  descricao text not null,
  ativo boolean not null default true
);

insert into loyalty_benefits (id, categoria, titulo, descricao, ativo) values
  ('bronze-indicacao', 'bronze', 'Indique e ganhe', 'Participação no programa LINHABANK INDIQUE E GANHE.', true),
  ('bronze-lbcoins', 'bronze', 'LBcoins', 'Acúmulo de LBcoins. Não são dinheiro e não saem por PIX.', true),
  ('prata-bonus', 'prata', 'Bônus configuráveis', 'Bônus extras só quando a gerência configurar um valor maior que zero.', true),
  ('ouro-bonus', 'ouro', 'Bônus especiais', 'Bônus extras só quando a gerência configurar. Sem fila especial neste chat ainda.', true)
on conflict (id) do nothing;

create table if not exists loyalty_campaigns (
  id text primary key,
  titulo text not null,
  descricao text not null,
  categoria_minima text not null default 'bronze',
  ativa boolean not null default false,
  criada_em timestamptz not null default now()
);

create table if not exists admin_audit_logs (
  id text primary key,
  operador_chat_id text not null,
  acao text not null,
  alvo_chat_id text,
  motivo text not null,
  valor_anterior text,
  valor_novo text,
  criado_em timestamptz not null default now()
);

create index if not exists admin_audit_logs_criado on admin_audit_logs (criado_em desc);

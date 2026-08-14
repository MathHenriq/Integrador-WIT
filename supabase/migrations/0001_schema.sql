-- =====================================================================
-- Projeto Integrador - Núcleo WIT
-- Migration 0001: schema base (escolas, horarios, reservas, admin)
-- =====================================================================
-- Modelo de acesso: NÃO existe login. Cada escola tem dois tokens
-- (professor / coordenação) que viajam na URL. Por isso NENHUMA tabela é
-- exposta ao papel `anon`: o RLS é deny-all e todo acesso passa pelas
-- funções RPC de 0002_rpc.sql, que validam o token no servidor.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------

do $$ begin
  create type public.papel_acesso as enum ('professor', 'coordenacao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_horario as enum ('vago', 'parcial', 'cheio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_reserva as enum ('confirmado', 'cancelado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Geradores
-- ---------------------------------------------------------------------

-- Token de 18 bytes aleatórios em base64url (24 caracteres). É o segredo
-- que dá acesso à escola, então precisa vir de gen_random_bytes e não de
-- random().
create or replace function public.gerar_token()
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select replace(replace(replace(
           encode(gen_random_bytes(18), 'base64'),
         '+', '-'), '/', '_'), '=', '');
$$;

-- Protocolo legível que o professor anota/recebe na confirmação. Não é
-- segredo (é só um identificador humano), então random() basta. Alfabeto
-- sem 0/O/1/I para não confundir quem lê no papel.
create or replace function public.gerar_protocolo()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
begin
  loop
    v_codigo := 'WIT-' || (
      select string_agg(
        substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), ''
      )
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from public.reservas where protocolo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table if not exists public.escolas (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (length(btrim(nome)) >= 2),
  token_professor    text not null unique default public.gerar_token(),
  token_coordenacao  text not null unique default public.gerar_token(),
  criado_em          timestamptz not null default now()
);

create table if not exists public.horarios (
  id            uuid primary key default gen_random_uuid(),
  escola_id     uuid not null references public.escolas (id) on delete cascade,
  -- 0 = domingo ... 6 = sábado (compatível com Date.getDay() do JS)
  dia_semana    smallint not null check (dia_semana between 0 and 6),
  hora_inicio   time not null,
  hora_fim      time not null,
  capacidade    smallint not null default 18 check (capacidade > 0),
  -- Quantos alunos do Núcleo WIT já estão matriculados nesse horário.
  -- É o que diferencia "vago" (ninguém) de "parcial" (2-3 alunos numa
  -- sala de 18-20 — o caso que motiva o Projeto Integrador).
  ocupacao_wit  smallint not null default 0 check (ocupacao_wit >= 0),
  status        public.status_horario not null default 'vago',
  criado_em     timestamptz not null default now(),
  constraint horarios_intervalo_valido check (hora_fim > hora_inicio),
  constraint horarios_ocupacao_cabe check (ocupacao_wit <= capacidade),
  constraint horarios_sem_duplicata unique (escola_id, dia_semana, hora_inicio)
);

create index if not exists horarios_escola_idx on public.horarios (escola_id);

create table if not exists public.reservas (
  id              uuid primary key default gen_random_uuid(),
  horario_id      uuid not null references public.horarios (id) on delete cascade,
  protocolo       text not null unique default public.gerar_protocolo(),
  -- Texto livre e sem validação de identidade: decisão consciente do
  -- produto (ver README, "Modelo de acesso").
  nome_professor  text not null check (length(btrim(nome_professor)) >= 3),
  email_contato   text check (email_contato is null or email_contato ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status          public.status_reserva not null default 'confirmado',
  criado_em       timestamptz not null default now(),
  -- Trilha de auditoria do cancelamento feito pela coordenação.
  cancelado_em    timestamptz,
  cancelado_por   text,
  constraint reservas_cancelamento_coerente check (
    (status = 'cancelado' and cancelado_em is not null)
    or (status = 'confirmado' and cancelado_em is null)
  )
);

create index if not exists reservas_horario_idx on public.reservas (horario_id);

-- Trava de concorrência: um horário só pode ter UMA reserva confirmada.
-- Duas requisições simultâneas para o mesmo horário fazem a segunda
-- falhar aqui, não importa o que a checagem da RPC tenha lido antes.
create unique index if not exists reservas_uma_confirmada_por_horario
  on public.reservas (horario_id)
  where status = 'confirmado';

-- Token de administração (você). Criado por SQL, nunca pela aplicação.
create table if not exists public.admin_tokens (
  token      text primary key default public.gerar_token(),
  descricao  text not null,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Status derivado do horário
-- ---------------------------------------------------------------------

create or replace function public.calcular_status_horario(p_horario_id uuid, p_ocupacao_wit int)
returns public.status_horario
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1 from public.reservas r
      where r.horario_id = p_horario_id and r.status = 'confirmado'
    ) then 'cheio'::public.status_horario
    when coalesce(p_ocupacao_wit, 0) > 0 then 'parcial'::public.status_horario
    else 'vago'::public.status_horario
  end;
$$;

-- O status nunca é escrito à mão: é sempre recalculado antes de gravar.
create or replace function public.trg_horarios_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.status := public.calcular_status_horario(new.id, new.ocupacao_wit);
  return new;
end;
$$;

drop trigger if exists horarios_status on public.horarios;
create trigger horarios_status
  before insert or update on public.horarios
  for each row execute function public.trg_horarios_status();

-- Reservar/cancelar reflete no horário correspondente.
create or replace function public.trg_reservas_sincroniza_horario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_horario_id uuid := coalesce(new.horario_id, old.horario_id);
begin
  update public.horarios h
     set status = public.calcular_status_horario(h.id, h.ocupacao_wit)
   where h.id = v_horario_id;
  return null;
end;
$$;

drop trigger if exists reservas_sincroniza_horario on public.reservas;
create trigger reservas_sincroniza_horario
  after insert or update or delete on public.reservas
  for each row execute function public.trg_reservas_sincroniza_horario();

-- ---------------------------------------------------------------------
-- RLS: deny-all. Sem policies, nem anon nem authenticated leem nada
-- direto. Só as RPCs de 0002 (SECURITY DEFINER) enxergam as tabelas.
-- ---------------------------------------------------------------------

alter table public.escolas      enable row level security;
alter table public.horarios     enable row level security;
alter table public.reservas     enable row level security;
alter table public.admin_tokens enable row level security;

alter table public.escolas      force row level security;
alter table public.horarios     force row level security;
alter table public.reservas     force row level security;
alter table public.admin_tokens force row level security;

revoke all on public.escolas      from anon, authenticated;
revoke all on public.horarios     from anon, authenticated;
revoke all on public.reservas     from anon, authenticated;
revoke all on public.admin_tokens from anon, authenticated;

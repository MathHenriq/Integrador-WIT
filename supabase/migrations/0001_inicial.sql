-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Instalação completa do banco. Rode este arquivo inteiro, uma vez.
--
--   ÚNICA COISA PARA EDITAR: a senha do painel /admin, logo abaixo.
--   Pode rodar de novo quando quiser — inclusive para trocar a senha.
--
-- =====================================================================

select set_config('integrador.senha_admin', 'troque-esta-senha', false);

-- ⬆ Troque 'troque-esta-senha' pela senha que você vai usar em /admin.
--   Ela é guardada com hash bcrypt, não em texto puro.
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
-- Geradores e tempo local
-- ---------------------------------------------------------------------

-- Token de 18 bytes aleatórios em base64url (24 caracteres). É o segredo
-- que dá acesso à escola, então vem de gen_random_bytes, não de random().
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

-- Protocolo legível que o professor anota. Não é segredo, então random()
-- basta. Alfabeto sem 0/O/1/I para não confundir quem lê no papel.
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

-- O banco roda em UTC. Usar current_date faria o dia virar às 21h no
-- horário de Brasília, tirando do ar as aulas de hoje cedo demais.
create or replace function public.hoje_brasil()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date; $$;

create or replace function public.agora_brasil()
returns timestamp
language sql
stable
as $$ select (now() at time zone 'America/Sao_Paulo'); $$;

-- Até onde dá para marcar. Um ano cobre o ano letivo com folga e evita
-- reservas fantasma em 2040.
create or replace function public.limite_agendamento()
returns date
language sql
stable
as $$ select (public.hoje_brasil() + interval '12 months')::date; $$;

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

-- O molde do que se repete toda semana ("toda quarta, 14h às 15h30").
-- Quem reserva não reserva o molde: reserva uma data dele.
create table if not exists public.horarios (
  id            uuid primary key default gen_random_uuid(),
  escola_id     uuid not null references public.escolas (id) on delete cascade,
  -- 0 = domingo ... 6 = sábado (igual ao Date.getDay() do JS)
  dia_semana    smallint not null check (dia_semana between 0 and 6),
  hora_inicio   time not null,
  hora_fim      time not null,
  capacidade    smallint not null default 18 check (capacidade > 0),
  -- Quantos alunos do Núcleo WIT já estão matriculados nesse horário.
  -- É o que diferencia "vago" (ninguém) de "parcial" (2-3 alunos numa
  -- sala de 18-20 — o caso que motiva o Projeto Integrador).
  ocupacao_wit  smallint not null default 0 check (ocupacao_wit >= 0),
  status        public.status_horario not null default 'vago',
  -- Tira o horário do calendário sem apagar o histórico dele.
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  constraint horarios_intervalo_valido check (hora_fim > hora_inicio),
  constraint horarios_ocupacao_cabe check (ocupacao_wit <= capacidade),
  constraint horarios_sem_duplicata unique (escola_id, dia_semana, hora_inicio)
);

create index if not exists horarios_escola_idx on public.horarios (escola_id);

-- Uma aula concreta: o molde numa data específica.
create table if not exists public.reservas (
  id              uuid primary key default gen_random_uuid(),
  horario_id      uuid not null references public.horarios (id) on delete cascade,
  data_aula       date not null,
  protocolo       text not null unique default public.gerar_protocolo(),
  -- Texto livre e sem validação de identidade: decisão consciente do
  -- produto (ver README, "Como funciona o acesso").
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
create index if not exists reservas_data_idx    on public.reservas (data_aula);

-- Trava de concorrência por ocorrência: a mesma quarta das 14h pode ser
-- reservada em 19/08 e em 26/08 por professores diferentes, mas cada
-- data aceita só uma reserva confirmada. Duas requisições simultâneas
-- para a mesma data — a segunda falha aqui, não importa o que a RPC
-- tenha lido antes.
create unique index if not exists reservas_uma_confirmada_por_data
  on public.reservas (horario_id, data_aula)
  where status = 'confirmado';

-- Senha do painel /admin, guardada como hash bcrypt.
create table if not exists public.admin_tokens (
  senha_hash  text primary key,
  descricao   text not null,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- `status` descreve só o molde: a sala tem aluno do WIT ou não. Estar
-- reservado é propriedade DA DATA, calculada em listar_ocorrencias.
create or replace function public.trg_horarios_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.status := case
    when new.ocupacao_wit > 0 then 'parcial'::public.status_horario
    else 'vago'::public.status_horario
  end;
  return new;
end;
$$;

drop trigger if exists horarios_status on public.horarios;
create trigger horarios_status
  before insert or update on public.horarios
  for each row execute function public.trg_horarios_status();

-- A data precisa cair no dia da semana do molde. A RPC já valida isso,
-- mas a integridade não pode depender só do caminho feliz.
create or replace function public.trg_reservas_valida_data()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dia_semana smallint;
begin
  select dia_semana into v_dia_semana from public.horarios where id = new.horario_id;

  if extract(dow from new.data_aula)::smallint is distinct from v_dia_semana then
    raise exception 'A data escolhida não cai no dia da semana deste horário.'
      using errcode = 'P0004';
  end if;

  return new;
end;
$$;

drop trigger if exists reservas_valida_data on public.reservas;
create trigger reservas_valida_data
  before insert or update of data_aula, horario_id on public.reservas
  for each row execute function public.trg_reservas_valida_data();

-- ---------------------------------------------------------------------
-- RLS: deny-all.
-- ---------------------------------------------------------------------
-- O anon key do Supabase vai no bundle do navegador — é público por
-- definição. Se as tabelas fossem legíveis pelo anon, qualquer pessoa
-- com esse key listaria as escolas e os tokens delas. Por isso nenhuma
-- policy existe: só as funções abaixo (SECURITY DEFINER) enxergam as
-- tabelas, e cada uma valida o token recebido.

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

-- ---------------------------------------------------------------------
-- Funções internas (não recebem grant para anon)
-- ---------------------------------------------------------------------

create or replace function public._resolver_token(p_token text)
returns table (escola_id uuid, escola_nome text, papel public.papel_acesso)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.nome, 'professor'::public.papel_acesso
    from public.escolas e
   where p_token is not null and e.token_professor = p_token
  union all
  select e.id, e.nome, 'coordenacao'::public.papel_acesso
    from public.escolas e
   where p_token is not null and e.token_coordenacao = p_token;
$$;

create or replace function public._exigir_escola(p_token text)
returns public.escolas
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
begin
  select e.* into v_escola
    from public.escolas e
   where p_token is not null
     and (e.token_professor = p_token or e.token_coordenacao = p_token);

  if not found then
    raise exception 'Link inválido ou expirado.' using errcode = 'P0002';
  end if;

  return v_escola;
end;
$$;

create or replace function public._exigir_coordenacao(p_token text)
returns public.escolas
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
begin
  v_escola := public._exigir_escola(p_token);

  if v_escola.token_coordenacao is distinct from p_token then
    raise exception 'Esta ação é restrita ao link da coordenação.' using errcode = 'P0003';
  end if;

  return v_escola;
end;
$$;

create or replace function public._exigir_admin(p_senha text)
returns void
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_senha is null or not exists (
    select 1 from public.admin_tokens a where a.senha_hash = crypt(p_senha, a.senha_hash)
  ) then
    raise exception 'Senha de administração inválida.' using errcode = 'P0002';
  end if;
end;
$$;

-- Mesma expressão da constraint da tabela, aplicada antes do insert para
-- o usuário receber uma frase em vez de "violates check constraint".
create or replace function public._email_valido(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email is null or p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
$$;

revoke all on function public._resolver_token(text)     from public, anon, authenticated;
revoke all on function public._exigir_escola(text)      from public, anon, authenticated;
revoke all on function public._exigir_coordenacao(text) from public, anon, authenticated;
revoke all on function public._exigir_admin(text)       from public, anon, authenticated;
revoke all on function public._email_valido(text)       from public, anon, authenticated;
revoke all on function public.hoje_brasil()             from public, anon, authenticated;
revoke all on function public.agora_brasil()            from public, anon, authenticated;
revoke all on function public.limite_agendamento()      from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Portal da escola
-- ---------------------------------------------------------------------

-- Primeira chamada ao abrir o link: descobre de qual escola é o token,
-- com qual papel, e a janela de datas que o calendário pode percorrer.
-- Retorna null quando o link não existe, para a tela mostrar "link
-- inválido" sem tratar isso como erro.
create or replace function public.acessar_escola(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'escola_id',          t.escola_id,
           'escola_nome',        t.escola_nome,
           'papel',              t.papel,
           'hoje',               public.hoje_brasil(),
           'limite_agendamento', public.limite_agendamento()
         )
    from public._resolver_token(p_token) t
   limit 1;
$$;

-- Expande o molde semanal nas datas concretas de um intervalo — é o que
-- alimenta o calendário. Nenhuma data é pré-gerada em tabela: o mês que
-- o professor abrir é calculado na hora.
create or replace function public.listar_ocorrencias(
  p_token  text,
  p_inicio date default null,
  p_fim    date default null
)
returns table (
  horario_id        uuid,
  data_aula         date,
  dia_semana        smallint,
  hora_inicio       time,
  hora_fim          time,
  capacidade        smallint,
  ocupacao_wit      smallint,
  status            public.status_horario,
  reservavel        boolean,
  reserva_id        uuid,
  reserva_protocolo text,
  reserva_professor text,
  reserva_email     text,
  reserva_criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
  v_coord  boolean;
  v_hoje   date := public.hoje_brasil();
  v_inicio date;
  v_fim    date;
begin
  v_escola := public._exigir_escola(p_token);
  v_coord  := v_escola.token_coordenacao = p_token;

  v_inicio := coalesce(p_inicio, date_trunc('month', v_hoje)::date);
  v_fim    := coalesce(p_fim, (date_trunc('month', v_inicio) + interval '1 month - 1 day')::date);

  if v_fim < v_inicio then
    raise exception 'Intervalo de datas inválido.' using errcode = 'P0004';
  end if;

  -- Teto de segurança: o calendário pede um mês por vez, então um
  -- intervalo gigante só apareceria por engano ou por abuso.
  if v_fim - v_inicio > 400 then
    v_fim := v_inicio + 400;
  end if;

  return query
    select h.id,
           dia.data::date,
           h.dia_semana,
           h.hora_inicio,
           h.hora_fim,
           h.capacidade,
           h.ocupacao_wit,
           case when r.id is not null then 'cheio'::public.status_horario else h.status end,
           -- Reservável = ninguém reservou ainda, a aula não começou e a
           -- data está dentro do horizonte de agendamento.
           r.id is null
             and (dia.data::date + h.hora_inicio) > public.agora_brasil()
             and dia.data::date <= public.limite_agendamento(),
           r.id,
           r.protocolo,
           r.nome_professor,
           -- E-mail de contato só para a coordenação.
           case when v_coord then r.email_contato end,
           r.criado_em
      from public.horarios h
      join generate_series(v_inicio::timestamp, v_fim::timestamp, interval '1 day') dia(data)
        on extract(dow from dia.data)::smallint = h.dia_semana
      left join public.reservas r
        on r.horario_id = h.id
       and r.data_aula = dia.data::date
       and r.status = 'confirmado'
     where h.escola_id = v_escola.id
       and h.ativo
     order by dia.data, h.hora_inicio;
end;
$$;

-- Reserva de uma data. Professor e coordenação podem reservar.
create or replace function public.criar_reserva(
  p_token          text,
  p_horario_id     uuid,
  p_data_aula      date,
  p_nome_professor text,
  p_email_contato  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola  public.escolas;
  v_horario public.horarios;
  v_reserva public.reservas;
  v_nome    text := btrim(coalesce(p_nome_professor, ''));
  v_email   text := nullif(btrim(lower(coalesce(p_email_contato, ''))), '');
begin
  v_escola := public._exigir_escola(p_token);

  if length(v_nome) < 3 then
    raise exception 'Informe o nome do professor responsável.' using errcode = 'P0004';
  end if;

  if not public._email_valido(v_email) then
    raise exception 'O e-mail informado não parece válido.' using errcode = 'P0004';
  end if;

  if p_data_aula is null then
    raise exception 'Escolha a data da aula.' using errcode = 'P0004';
  end if;

  -- O horário precisa pertencer à escola do token. Sem isso, um token
  -- válido conseguiria reservar horários de outra escola.
  select h.* into v_horario
    from public.horarios h
   where h.id = p_horario_id and h.escola_id = v_escola.id;

  if not found then
    raise exception 'Horário não encontrado nesta escola.' using errcode = 'P0002';
  end if;

  if not v_horario.ativo then
    raise exception 'Este horário não está mais disponível na grade da escola.' using errcode = 'P0005';
  end if;

  if extract(dow from p_data_aula)::smallint is distinct from v_horario.dia_semana then
    raise exception 'A data escolhida não cai no dia da semana deste horário.' using errcode = 'P0004';
  end if;

  if (p_data_aula + v_horario.hora_inicio) <= public.agora_brasil() then
    raise exception 'Não é possível reservar um horário que já passou.' using errcode = 'P0004';
  end if;

  if p_data_aula > public.limite_agendamento() then
    raise exception 'Só é possível reservar até %.',
      to_char(public.limite_agendamento(), 'DD/MM/YYYY') using errcode = 'P0004';
  end if;

  if exists (
    select 1 from public.reservas r
     where r.horario_id = v_horario.id
       and r.data_aula = p_data_aula
       and r.status = 'confirmado'
  ) then
    raise exception 'Este horário já foi reservado nesta data.' using errcode = 'P0005';
  end if;

  begin
    insert into public.reservas (horario_id, data_aula, nome_professor, email_contato)
    values (v_horario.id, p_data_aula, v_nome, v_email)
    returning * into v_reserva;
  exception when unique_violation then
    -- Duas reservas simultâneas na mesma data: a segunda cai aqui.
    raise exception 'Este horário acabou de ser reservado por outra pessoa.' using errcode = 'P0005';
  end;

  return jsonb_build_object(
    'reserva_id',     v_reserva.id,
    'protocolo',      v_reserva.protocolo,
    'nome_professor', v_reserva.nome_professor,
    'email_contato',  v_reserva.email_contato,
    'criado_em',      v_reserva.criado_em,
    'data_aula',      v_reserva.data_aula,
    'escola_nome',    v_escola.nome,
    'dia_semana',     v_horario.dia_semana,
    'hora_inicio',    v_horario.hora_inicio,
    'hora_fim',       v_horario.hora_fim
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Coordenação
-- ---------------------------------------------------------------------

-- Histórico completo da escola, incluindo canceladas.
create or replace function public.listar_reservas(p_token text)
returns table (
  id             uuid,
  protocolo      text,
  nome_professor text,
  email_contato  text,
  status         public.status_reserva,
  criado_em      timestamptz,
  cancelado_em   timestamptz,
  cancelado_por  text,
  horario_id     uuid,
  data_aula      date,
  dia_semana     smallint,
  hora_inicio    time,
  hora_fim       time,
  ja_aconteceu   boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
begin
  v_escola := public._exigir_coordenacao(p_token);

  return query
    select r.id, r.protocolo, r.nome_professor, r.email_contato, r.status,
           r.criado_em, r.cancelado_em, r.cancelado_por,
           h.id, r.data_aula, h.dia_semana, h.hora_inicio, h.hora_fim,
           (r.data_aula + h.hora_fim) < public.agora_brasil()
      from public.reservas r
      join public.horarios h on h.id = r.horario_id
     where h.escola_id = v_escola.id
     order by r.data_aula desc, h.hora_inicio desc;
end;
$$;

create or replace function public.cancelar_reserva(
  p_token         text,
  p_reserva_id    uuid,
  p_cancelado_por text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola  public.escolas;
  v_reserva public.reservas;
begin
  v_escola := public._exigir_coordenacao(p_token);

  select r.* into v_reserva
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
   where r.id = p_reserva_id and h.escola_id = v_escola.id;

  if not found then
    raise exception 'Reserva não encontrada nesta escola.' using errcode = 'P0002';
  end if;

  if v_reserva.status = 'cancelado' then
    raise exception 'Esta reserva já está cancelada.' using errcode = 'P0006';
  end if;

  update public.reservas
     set status        = 'cancelado',
         cancelado_em  = now(),
         cancelado_por = nullif(btrim(coalesce(p_cancelado_por, '')), '')
   where id = v_reserva.id
  returning * into v_reserva;

  return to_jsonb(v_reserva);
end;
$$;

create or replace function public.editar_reserva(
  p_token          text,
  p_reserva_id     uuid,
  p_nome_professor text,
  p_email_contato  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola  public.escolas;
  v_reserva public.reservas;
  v_nome    text := btrim(coalesce(p_nome_professor, ''));
  v_email   text := nullif(btrim(lower(coalesce(p_email_contato, ''))), '');
begin
  v_escola := public._exigir_coordenacao(p_token);

  if length(v_nome) < 3 then
    raise exception 'Informe o nome do professor responsável.' using errcode = 'P0004';
  end if;

  if not public._email_valido(v_email) then
    raise exception 'O e-mail informado não parece válido.' using errcode = 'P0004';
  end if;

  update public.reservas r
     set nome_professor = v_nome,
         email_contato  = v_email
   where r.id = p_reserva_id
     and r.status = 'confirmado'
     and exists (
       select 1 from public.horarios h
        where h.id = r.horario_id and h.escola_id = v_escola.id
     )
  returning r.* into v_reserva;

  if not found then
    raise exception 'Reserva confirmada não encontrada nesta escola.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_reserva);
end;
$$;

-- ---------------------------------------------------------------------
-- Administração (Núcleo WIT)
-- ---------------------------------------------------------------------

create or replace function public.admin_listar_escolas(p_admin_token text)
returns table (
  id                uuid,
  nome              text,
  token_professor   text,
  token_coordenacao text,
  criado_em         timestamptz,
  total_horarios    bigint,
  horarios_ativos   bigint,
  reservas_futuras  bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select e.id, e.nome, e.token_professor, e.token_coordenacao, e.criado_em,
           count(distinct h.id),
           count(distinct h.id) filter (where h.ativo),
           count(distinct r.id) filter (
             where r.status = 'confirmado' and r.data_aula >= public.hoje_brasil()
           )
      from public.escolas e
      left join public.horarios h on h.escola_id = e.id
      left join public.reservas r on r.horario_id = h.id
     group by e.id
     order by e.nome;
end;
$$;

create or replace function public.admin_criar_escola(p_admin_token text, p_nome text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
  v_nome   text := btrim(coalesce(p_nome, ''));
begin
  perform public._exigir_admin(p_admin_token);

  if length(v_nome) < 2 then
    raise exception 'Informe o nome da escola.' using errcode = 'P0004';
  end if;

  insert into public.escolas (nome) values (v_nome) returning * into v_escola;
  return to_jsonb(v_escola);
end;
$$;

create or replace function public.admin_renomear_escola(p_admin_token text, p_escola_id uuid, p_nome text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
  v_nome   text := btrim(coalesce(p_nome, ''));
begin
  perform public._exigir_admin(p_admin_token);

  if length(v_nome) < 2 then
    raise exception 'Informe o nome da escola.' using errcode = 'P0004';
  end if;

  update public.escolas set nome = v_nome where id = p_escola_id returning * into v_escola;

  if not found then
    raise exception 'Escola não encontrada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_escola);
end;
$$;

-- Usado quando um link vaza: gera links novos e invalida os antigos.
create or replace function public.admin_renovar_tokens(p_admin_token text, p_escola_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
begin
  perform public._exigir_admin(p_admin_token);

  update public.escolas
     set token_professor   = public.gerar_token(),
         token_coordenacao = public.gerar_token()
   where id = p_escola_id
  returning * into v_escola;

  if not found then
    raise exception 'Escola não encontrada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_escola);
end;
$$;

create or replace function public.admin_listar_horarios(p_admin_token text, p_escola_id uuid)
returns table (
  id               uuid,
  dia_semana       smallint,
  hora_inicio      time,
  hora_fim         time,
  capacidade       smallint,
  ocupacao_wit     smallint,
  status           public.status_horario,
  ativo            boolean,
  reservas_futuras bigint,
  total_reservas   bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select h.id, h.dia_semana, h.hora_inicio, h.hora_fim, h.capacidade,
           h.ocupacao_wit, h.status, h.ativo,
           count(r.id) filter (
             where r.status = 'confirmado' and r.data_aula >= public.hoje_brasil()
           ),
           count(r.id)
      from public.horarios h
      left join public.reservas r on r.horario_id = h.id
     where h.escola_id = p_escola_id
     group by h.id
     order by h.dia_semana, h.hora_inicio;
end;
$$;

create or replace function public.admin_criar_horario(
  p_admin_token  text,
  p_escola_id    uuid,
  p_dia_semana   smallint,
  p_hora_inicio  time,
  p_hora_fim     time,
  p_capacidade   smallint default 18,
  p_ocupacao_wit smallint default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_horario public.horarios;
begin
  perform public._exigir_admin(p_admin_token);

  if not exists (select 1 from public.escolas where id = p_escola_id) then
    raise exception 'Escola não encontrada.' using errcode = 'P0002';
  end if;

  if p_hora_fim <= p_hora_inicio then
    raise exception 'O horário de término precisa ser depois do início.' using errcode = 'P0004';
  end if;

  if coalesce(p_ocupacao_wit, 0) > coalesce(p_capacidade, 18) then
    raise exception 'A ocupação do Núcleo WIT não pode ser maior que a capacidade da sala.'
      using errcode = 'P0004';
  end if;

  begin
    insert into public.horarios (escola_id, dia_semana, hora_inicio, hora_fim, capacidade, ocupacao_wit)
    values (p_escola_id, p_dia_semana, p_hora_inicio, p_hora_fim,
            coalesce(p_capacidade, 18), coalesce(p_ocupacao_wit, 0))
    returning * into v_horario;
  exception when unique_violation then
    raise exception 'Já existe um horário nesse dia e hora para esta escola.' using errcode = 'P0007';
  end;

  return to_jsonb(v_horario);
end;
$$;

create or replace function public.admin_atualizar_horario(
  p_admin_token  text,
  p_horario_id   uuid,
  p_capacidade   smallint default null,
  p_ocupacao_wit smallint default null,
  p_ativo        boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_horario public.horarios;
begin
  perform public._exigir_admin(p_admin_token);

  select * into v_horario from public.horarios where id = p_horario_id;

  if not found then
    raise exception 'Horário não encontrado.' using errcode = 'P0002';
  end if;

  v_horario.capacidade   := coalesce(p_capacidade, v_horario.capacidade);
  v_horario.ocupacao_wit := coalesce(p_ocupacao_wit, v_horario.ocupacao_wit);
  v_horario.ativo        := coalesce(p_ativo, v_horario.ativo);

  if v_horario.ocupacao_wit > v_horario.capacidade then
    raise exception 'A ocupação do Núcleo WIT não pode ser maior que a capacidade da sala.'
      using errcode = 'P0004';
  end if;

  update public.horarios
     set capacidade   = v_horario.capacidade,
         ocupacao_wit = v_horario.ocupacao_wit,
         ativo        = v_horario.ativo
   where id = p_horario_id
  returning * into v_horario;

  return to_jsonb(v_horario);
end;
$$;

-- Remover apaga em cascata as reservas do horário — ou seja, apaga
-- histórico. Só vale para horário cadastrado por engano; para tirar da
-- grade um horário que já rodou, o caminho é desativar.
create or replace function public.admin_remover_horario(p_admin_token text, p_horario_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  if exists (select 1 from public.reservas where horario_id = p_horario_id) then
    raise exception 'Este horário já tem reservas no histórico. Desative-o em vez de remover.'
      using errcode = 'P0008';
  end if;

  delete from public.horarios where id = p_horario_id;

  if not found then
    raise exception 'Horário não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_listar_reservas(
  p_admin_token text,
  p_escola_id   uuid default null,
  p_de          date default null,
  p_ate         date default null
)
returns table (
  id             uuid,
  protocolo      text,
  escola_id      uuid,
  escola_nome    text,
  nome_professor text,
  email_contato  text,
  status         public.status_reserva,
  criado_em      timestamptz,
  cancelado_em   timestamptz,
  cancelado_por  text,
  data_aula      date,
  dia_semana     smallint,
  hora_inicio    time,
  hora_fim       time
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select r.id, r.protocolo, e.id, e.nome, r.nome_professor, r.email_contato,
           r.status, r.criado_em, r.cancelado_em, r.cancelado_por,
           r.data_aula, h.dia_semana, h.hora_inicio, h.hora_fim
      from public.reservas r
      join public.horarios h on h.id = r.horario_id
      join public.escolas  e on e.id = h.escola_id
     where (p_escola_id is null or e.id = p_escola_id)
       and (p_de is null or r.data_aula >= p_de)
       and (p_ate is null or r.data_aula <= p_ate)
     order by r.data_aula desc, h.hora_inicio desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: só as funções públicas ficam acessíveis ao anon key.
-- ---------------------------------------------------------------------

grant execute on function public.acessar_escola(text)                            to anon, authenticated;
grant execute on function public.listar_ocorrencias(text, date, date)            to anon, authenticated;
grant execute on function public.criar_reserva(text, uuid, date, text, text)     to anon, authenticated;
grant execute on function public.listar_reservas(text)                           to anon, authenticated;
grant execute on function public.cancelar_reserva(text, uuid, text)              to anon, authenticated;
grant execute on function public.editar_reserva(text, uuid, text, text)          to anon, authenticated;

grant execute on function public.admin_listar_escolas(text)                                          to anon, authenticated;
grant execute on function public.admin_criar_escola(text, text)                                      to anon, authenticated;
grant execute on function public.admin_renomear_escola(text, uuid, text)                             to anon, authenticated;
grant execute on function public.admin_renovar_tokens(text, uuid)                                    to anon, authenticated;
grant execute on function public.admin_listar_horarios(text, uuid)                                   to anon, authenticated;
grant execute on function public.admin_criar_horario(text, uuid, smallint, time, time, smallint, smallint) to anon, authenticated;
grant execute on function public.admin_atualizar_horario(text, uuid, smallint, smallint, boolean)    to anon, authenticated;
grant execute on function public.admin_remover_horario(text, uuid)                                   to anon, authenticated;
grant execute on function public.admin_listar_reservas(text, uuid, date, date)                       to anon, authenticated;

-- ---------------------------------------------------------------------
-- Senha do painel /admin
-- ---------------------------------------------------------------------
-- Vem da linha lá do topo do arquivo. Rodar de novo com outra senha
-- substitui a anterior — é assim que se troca a senha.

delete from public.admin_tokens where descricao = 'Núcleo WIT';

insert into public.admin_tokens (senha_hash, descricao)
values (
  extensions.crypt(current_setting('integrador.senha_admin'), extensions.gen_salt('bf')),
  'Núcleo WIT'
);

-- Confere que deu tudo certo.
select 'Banco pronto. Use a senha que você definiu no topo do arquivo para entrar em /admin.' as resultado;

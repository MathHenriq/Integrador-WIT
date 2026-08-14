-- =====================================================================
-- Projeto Integrador - Núcleo WIT
-- Migration 0004: reserva por data (calendário)
-- =====================================================================
-- Até aqui `horarios` era ao mesmo tempo o molde semanal e a unidade de
-- reserva, então uma reserva ocupava a terça-feira das 14h para sempre.
--
-- A partir desta migration os papéis se separam:
--   horarios -> molde semanal (toda terça, das 14h às 15h30)
--   reservas -> uma ocorrência concreta (terça, 18/08/2026, das 14h)
--
-- Com isso o professor marca a semana que quiser, ou outro mês, e cada
-- data é independente das demais.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tempo local
-- ---------------------------------------------------------------------
-- O banco roda em UTC. Usar current_date faria o dia virar às 21h no
-- horário de Brasília, tirando do ar as reservas de hoje cedo demais.

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

-- Até onde dá para marcar. Um ano cobre o ano letivo inteiro com folga e
-- evita reservas fantasma em 2040.
create or replace function public.limite_agendamento()
returns date
language sql
stable
as $$ select (public.hoje_brasil() + interval '12 months')::date; $$;

-- ---------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------

alter table public.reservas add column if not exists data_aula date;

-- Reservas anteriores à migration não tinham data: adotamos a primeira
-- ocorrência do dia da semana a partir da data em que foram criadas, que
-- é o que elas significavam na prática.
update public.reservas r
   set data_aula = (r.criado_em at time zone 'America/Sao_Paulo')::date
                 + (((h.dia_semana
                      - extract(dow from (r.criado_em at time zone 'America/Sao_Paulo')::date)::int
                     ) + 7) % 7)
  from public.horarios h
 where h.id = r.horario_id
   and r.data_aula is null;

alter table public.reservas alter column data_aula set not null;

-- Horário que saiu da grade (fim do ano letivo, mudança de sala). Não dá
-- para simplesmente apagar: as reservas passadas são o histórico.
alter table public.horarios add column if not exists ativo boolean not null default true;

create index if not exists reservas_data_idx on public.reservas (data_aula);

-- ---------------------------------------------------------------------
-- Travas
-- ---------------------------------------------------------------------

-- A trava agora é por ocorrência: a mesma terça das 14h pode ser
-- reservada em 18/08 e em 25/08 por professores diferentes.
drop index if exists public.reservas_uma_confirmada_por_horario;

create unique index if not exists reservas_uma_confirmada_por_data
  on public.reservas (horario_id, data_aula)
  where status = 'confirmado';

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
-- Status do horário
-- ---------------------------------------------------------------------
-- `status` volta a descrever só o molde (a sala tem alunos do WIT ou
-- não). Se está reservado ou não passou a ser propriedade de cada data,
-- calculada em listar_ocorrencias.

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

drop trigger if exists reservas_sincroniza_horario on public.reservas;
drop function if exists public.trg_reservas_sincroniza_horario();
drop function if exists public.calcular_status_horario(uuid, int);

-- Recalcula as linhas existentes com a regra nova.
update public.horarios set ocupacao_wit = ocupacao_wit;

-- ---------------------------------------------------------------------
-- Portal da escola
-- ---------------------------------------------------------------------

-- Substituída por listar_ocorrencias: a grade semanal sozinha não diz
-- mais se um horário está livre, porque isso depende da data.
drop function if exists public.listar_horarios(text);

create or replace function public.acessar_escola(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'escola_id',           t.escola_id,
           'escola_nome',         t.escola_nome,
           'papel',               t.papel,
           'hoje',                public.hoje_brasil(),
           'limite_agendamento',  public.limite_agendamento()
         )
    from public._resolver_token(p_token) t
   limit 1;
$$;

-- Expande o molde semanal nas datas concretas de um intervalo — é o que
-- alimenta o calendário. Cada linha é uma ocorrência (horário + data),
-- com a reserva daquela data específica, se houver.
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

drop function if exists public.criar_reserva(text, uuid, text, text);

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

drop function if exists public.listar_reservas(text);

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

-- ---------------------------------------------------------------------
-- Administração
-- ---------------------------------------------------------------------

drop function if exists public.admin_listar_escolas(text);

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

drop function if exists public.admin_listar_horarios(text, uuid);

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

-- A assinatura ganhou p_ativo; a versão antiga precisa sair, senão o
-- PostgREST fica com duas candidatas para a mesma chamada.
drop function if exists public.admin_atualizar_horario(text, uuid, smallint, smallint);

create or replace function public.admin_atualizar_horario(
  p_admin_token  text,
  p_horario_id   uuid,
  p_capacidade   smallint,
  p_ocupacao_wit smallint,
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

-- Remover um horário apaga em cascata as reservas dele — ou seja, apaga
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

drop function if exists public.admin_listar_reservas(text, uuid);

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
-- Grants das assinaturas novas
-- ---------------------------------------------------------------------

revoke all on function public.hoje_brasil()        from public, anon, authenticated;
revoke all on function public.agora_brasil()       from public, anon, authenticated;
revoke all on function public.limite_agendamento() from public, anon, authenticated;

grant execute on function public.acessar_escola(text)                            to anon, authenticated;
grant execute on function public.listar_ocorrencias(text, date, date)            to anon, authenticated;
grant execute on function public.criar_reserva(text, uuid, date, text, text)     to anon, authenticated;
grant execute on function public.listar_reservas(text)                           to anon, authenticated;

grant execute on function public.admin_listar_escolas(text)                                to anon, authenticated;
grant execute on function public.admin_listar_horarios(text, uuid)                         to anon, authenticated;
grant execute on function public.admin_atualizar_horario(text, uuid, smallint, smallint, boolean) to anon, authenticated;
grant execute on function public.admin_remover_horario(text, uuid)                         to anon, authenticated;
grant execute on function public.admin_listar_reservas(text, uuid, date, date)             to anon, authenticated;

-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 2: catálogo de aulas + acesso público
--
--   Cole este arquivo inteiro no SQL Editor, depois do 0001.
--   Pode rodar de novo quantas vezes quiser.
--
--   O que muda:
--   - Acabam os links por escola. O site é público e a pessoa escolhe a
--     escola numa lista. Cancelar exige o código do protocolo ou o
--     painel do WIT.
--   - Toda reserva passa a ter uma aula: uma do catálogo do WIT ou uma
--     escrita pelo próprio professor.
--   - Catálogo com matéria, ano, tema e habilidades da BNCC.
--
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------

create table if not exists public.materias (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique check (length(btrim(nome)) >= 2),
  cor       text not null default '#00A651',
  ordem     smallint not null default 100,
  criado_em timestamptz not null default now()
);

-- Habilidade da BNCC. O código (EF06MA01) é o identificador oficial e
-- serve de chave natural: cadastrar duas vezes o mesmo código é engano.
create table if not exists public.habilidades (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique check (length(btrim(codigo)) >= 3),
  descricao  text not null check (length(btrim(descricao)) >= 10),
  materia_id uuid references public.materias (id) on delete set null,
  ano        smallint check (ano between 1 and 9),
  criado_em  timestamptz not null default now()
);

create index if not exists habilidades_materia_idx on public.habilidades (materia_id);

-- Aula pronta do Núcleo WIT (a "aula de hortaliças" do escopo original).
create table if not exists public.aulas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (length(btrim(titulo)) >= 3),
  tema         text,
  resumo       text not null check (length(btrim(resumo)) >= 10),
  descricao    text,
  objetivos    text,
  materiais    text,
  materia_id   uuid references public.materias (id) on delete set null,
  -- Anos escolares atendidos, ex: {6,7,8,9}
  anos         smallint[] not null default '{}',
  duracao_min  smallint not null default 90 check (duracao_min > 0),
  -- Rascunho não aparece para os professores.
  publicada    boolean not null default true,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists aulas_materia_idx on public.aulas (materia_id);

create table if not exists public.aulas_habilidades (
  aula_id       uuid not null references public.aulas (id) on delete cascade,
  habilidade_id uuid not null references public.habilidades (id) on delete cascade,
  primary key (aula_id, habilidade_id)
);

-- ---------------------------------------------------------------------
-- Reserva passa a ter uma aula
-- ---------------------------------------------------------------------

alter table public.reservas add column if not exists aula_id    uuid references public.aulas (id) on delete set null;
alter table public.reservas add column if not exists aula_livre text;
alter table public.reservas add column if not exists turma      text;
-- Preenchido depois da aula acontecer, aparece na vitrine pública.
alter table public.reservas add column if not exists relato     text;

-- Reservas feitas antes do catálogo existir não tinham aula nenhuma.
update public.reservas
   set aula_livre = 'Aula registrada antes do catálogo'
 where aula_id is null and (aula_livre is null or btrim(aula_livre) = '');

do $$ begin
  alter table public.reservas add constraint reservas_tem_aula
    check (aula_id is not null or length(btrim(coalesce(aula_livre, ''))) >= 3);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Fim dos links por escola
-- ---------------------------------------------------------------------
-- O acesso agora é público com seletor de escola, então os tokens não
-- têm mais função. Deixá-los na tabela seria só um segredo esquecido.

drop function if exists public.acessar_escola(text);
drop function if exists public.listar_ocorrencias(text, date, date);
drop function if exists public.criar_reserva(text, uuid, date, text, text);
drop function if exists public.listar_reservas(text);
drop function if exists public.cancelar_reserva(text, uuid, text);
drop function if exists public.editar_reserva(text, uuid, text, text);
drop function if exists public.admin_renovar_tokens(text, uuid);
drop function if exists public._resolver_token(text);
drop function if exists public._exigir_escola(text);
drop function if exists public._exigir_coordenacao(text);
drop function if exists public.admin_listar_escolas(text);

-- Migrations posteriores mudam a assinatura de algumas destas funções
-- (a 0004 acrescenta as fotos). Um `create or replace` não consegue
-- mudar tipo de retorno, e uma assinatura nova não substitui a antiga:
-- cria uma SEGUNDA função com o mesmo nome, e aí o PostgREST não sabe
-- qual chamar. Derrubar por nome, com qualquer assinatura, evita as
-- duas coisas.
--
-- Consequência: se você rodar este arquivo de novo num banco que já
-- passou pela 0004, rode a 0004 logo em seguida para recuperar o que
-- ela acrescenta.
do $$
declare
  v_assinatura text;
begin
  for v_assinatura in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'admin_cancelar_reserva', 'admin_listar_aulas', 'admin_listar_escolas',
         'admin_listar_reservas', 'admin_registrar_relato', 'admin_remover_aula',
         'admin_remover_habilidade', 'admin_salvar_aula', 'admin_salvar_habilidade',
         'admin_salvar_materia', 'agenda_escola', 'agendar', 'cancelar_por_protocolo',
         'contexto_publico', 'listar_aulas', 'listar_habilidades', 'listar_realizadas',
         'obter_aula', 'obter_reserva'
       ])
  loop
    execute 'drop function if exists ' || v_assinatura || ' cascade';
  end loop;
end $$;

alter table public.escolas drop column if exists token_professor;
alter table public.escolas drop column if exists token_coordenacao;

drop type if exists public.papel_acesso;

-- ---------------------------------------------------------------------
-- RLS nas tabelas novas: deny-all, igual às outras.
-- ---------------------------------------------------------------------

alter table public.materias          enable row level security;
alter table public.habilidades       enable row level security;
alter table public.aulas             enable row level security;
alter table public.aulas_habilidades enable row level security;

alter table public.materias          force row level security;
alter table public.habilidades       force row level security;
alter table public.aulas             force row level security;
alter table public.aulas_habilidades force row level security;

revoke all on public.materias          from anon, authenticated;
revoke all on public.habilidades       from anon, authenticated;
revoke all on public.aulas             from anon, authenticated;
revoke all on public.aulas_habilidades from anon, authenticated;

-- ---------------------------------------------------------------------
-- Consulta pública (sem token, sem senha)
-- ---------------------------------------------------------------------

create or replace function public.contexto_publico()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'hoje',               public.hoje_brasil(),
    'limite_agendamento', public.limite_agendamento(),
    'escolas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) order by e.nome)
        from public.escolas e
       where exists (select 1 from public.horarios h where h.escola_id = e.id and h.ativo)
    ), '[]'::jsonb),
    'materias', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'cor', m.cor)
                       order by m.ordem, m.nome)
        from public.materias m
    ), '[]'::jsonb)
  );
$$;

-- Agenda da semana (ou de qualquer intervalo) de uma escola.
create or replace function public.agenda_escola(
  p_escola_id uuid,
  p_inicio    date,
  p_fim       date
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
  reserva_professor text,
  reserva_turma     text,
  aula_titulo       text,
  aula_id           uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio date := coalesce(p_inicio, public.hoje_brasil());
  v_fim    date;
begin
  v_fim := coalesce(p_fim, v_inicio + 6);

  if v_fim < v_inicio then
    raise exception 'Intervalo de datas inválido.' using errcode = 'P0004';
  end if;

  -- Teto de segurança: a tela pede uma semana por vez.
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
           r.id is null
             and (dia.data::date + h.hora_inicio) > public.agora_brasil()
             and dia.data::date <= public.limite_agendamento(),
           r.id,
           r.nome_professor,
           r.turma,
           coalesce(a.titulo, r.aula_livre),
           a.id
      from public.horarios h
      join generate_series(v_inicio::timestamp, v_fim::timestamp, interval '1 day') dia(data)
        on extract(dow from dia.data)::smallint = h.dia_semana
      left join public.reservas r
        on r.horario_id = h.id
       and r.data_aula = dia.data::date
       and r.status = 'confirmado'
      left join public.aulas a on a.id = r.aula_id
     where h.escola_id = p_escola_id
       and h.ativo
     order by dia.data, h.hora_inicio;
end;
$$;

-- Catálogo navegável por matéria, ano, habilidade e busca livre.
create or replace function public.listar_aulas(
  p_materia_id    uuid default null,
  p_ano           smallint default null,
  p_habilidade_id uuid default null,
  p_busca         text default null
)
returns table (
  id           uuid,
  titulo       text,
  tema         text,
  resumo       text,
  materia_id   uuid,
  materia_nome text,
  materia_cor  text,
  anos         smallint[],
  duracao_min  smallint,
  habilidades  jsonb,
  vezes_dada   bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.titulo, a.tema, a.resumo,
         a.materia_id, m.nome, m.cor, a.anos, a.duracao_min,
         coalesce((
           select jsonb_agg(jsonb_build_object('codigo', hb.codigo, 'descricao', hb.descricao)
                            order by hb.codigo)
             from public.aulas_habilidades ah
             join public.habilidades hb on hb.id = ah.habilidade_id
            where ah.aula_id = a.id
         ), '[]'::jsonb),
         (select count(*) from public.reservas r
           where r.aula_id = a.id and r.status = 'confirmado'
             and r.data_aula <= public.hoje_brasil())
    from public.aulas a
    left join public.materias m on m.id = a.materia_id
   where a.publicada
     and (p_materia_id is null or a.materia_id = p_materia_id)
     and (p_ano is null or p_ano = any (a.anos))
     and (p_habilidade_id is null or exists (
           select 1 from public.aulas_habilidades ah
            where ah.aula_id = a.id and ah.habilidade_id = p_habilidade_id))
     and (
       p_busca is null or btrim(p_busca) = ''
       or a.titulo ilike '%' || btrim(p_busca) || '%'
       or coalesce(a.tema, '') ilike '%' || btrim(p_busca) || '%'
       or a.resumo ilike '%' || btrim(p_busca) || '%'
     )
   order by a.titulo;
$$;

create or replace function public.obter_aula(p_aula_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', a.id, 'titulo', a.titulo, 'tema', a.tema, 'resumo', a.resumo,
           'descricao', a.descricao, 'objetivos', a.objetivos, 'materiais', a.materiais,
           'anos', a.anos, 'duracao_min', a.duracao_min,
           'materia_nome', m.nome, 'materia_cor', m.cor,
           'habilidades', coalesce((
             select jsonb_agg(jsonb_build_object('codigo', hb.codigo, 'descricao', hb.descricao)
                              order by hb.codigo)
               from public.aulas_habilidades ah
               join public.habilidades hb on hb.id = ah.habilidade_id
              where ah.aula_id = a.id
           ), '[]'::jsonb),
           'vezes_dada', (select count(*) from public.reservas r
                           where r.aula_id = a.id and r.status = 'confirmado'
                             and r.data_aula <= public.hoje_brasil())
         )
    from public.aulas a
    left join public.materias m on m.id = a.materia_id
   where a.id = p_aula_id and a.publicada;
$$;

create or replace function public.listar_habilidades(
  p_materia_id uuid default null,
  p_ano        smallint default null
)
returns table (id uuid, codigo text, descricao text, materia_id uuid, ano smallint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.id, h.codigo, h.descricao, h.materia_id, h.ano
    from public.habilidades h
   where (p_materia_id is null or h.materia_id = p_materia_id)
     and (p_ano is null or h.ano = p_ano)
   order by h.codigo;
$$;

-- Vitrine: o que já foi feito, para inspirar quem ainda não marcou.
create or replace function public.listar_realizadas(
  p_materia_id uuid default null,
  p_escola_id  uuid default null,
  p_limite     int default 60
)
returns table (
  id             uuid,
  data_aula      date,
  escola_nome    text,
  nome_professor text,
  turma          text,
  titulo         text,
  tema           text,
  resumo         text,
  relato         text,
  materia_nome   text,
  materia_cor    text,
  aula_id        uuid,
  do_catalogo    boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.data_aula, e.nome, r.nome_professor, r.turma,
         coalesce(a.titulo, r.aula_livre),
         a.tema, a.resumo, r.relato, m.nome, m.cor, a.id,
         a.id is not null
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
    join public.escolas  e on e.id = h.escola_id
    left join public.aulas    a on a.id = r.aula_id
    left join public.materias m on m.id = a.materia_id
   where r.status = 'confirmado'
     and (r.data_aula + h.hora_fim) < public.agora_brasil()
     and (p_materia_id is null or a.materia_id = p_materia_id)
     and (p_escola_id is null or e.id = p_escola_id)
   order by r.data_aula desc
   limit greatest(1, least(coalesce(p_limite, 60), 200));
$$;

-- ---------------------------------------------------------------------
-- Agendamento público
-- ---------------------------------------------------------------------

create or replace function public.agendar(
  p_escola_id      uuid,
  p_horario_id     uuid,
  p_data_aula      date,
  p_nome_professor text,
  p_turma          text default null,
  p_email_contato  text default null,
  p_aula_id        uuid default null,
  p_aula_livre     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_horario public.horarios;
  v_escola  public.escolas;
  v_reserva public.reservas;
  v_aula    public.aulas;
  v_nome    text := btrim(coalesce(p_nome_professor, ''));
  v_turma   text := nullif(btrim(coalesce(p_turma, '')), '');
  v_email   text := nullif(btrim(lower(coalesce(p_email_contato, ''))), '');
  v_livre   text := nullif(btrim(coalesce(p_aula_livre, '')), '');
begin
  if length(v_nome) < 3 then
    raise exception 'Informe o nome do professor responsável.' using errcode = 'P0004';
  end if;

  if not public._email_valido(v_email) then
    raise exception 'O e-mail informado não parece válido.' using errcode = 'P0004';
  end if;

  if p_aula_id is null and (v_livre is null or length(v_livre) < 3) then
    raise exception 'Escolha uma aula do catálogo ou descreva a sua.' using errcode = 'P0004';
  end if;

  if p_aula_id is not null then
    select * into v_aula from public.aulas where id = p_aula_id and publicada;
    if not found then
      raise exception 'Aula não encontrada no catálogo.' using errcode = 'P0002';
    end if;
    -- Escolheu do catálogo: o texto livre não se aplica.
    v_livre := null;
  end if;

  select * into v_escola from public.escolas where id = p_escola_id;
  if not found then
    raise exception 'Escola não encontrada.' using errcode = 'P0002';
  end if;

  -- O horário precisa ser da escola escolhida.
  select h.* into v_horario
    from public.horarios h
   where h.id = p_horario_id and h.escola_id = p_escola_id;

  if not found then
    raise exception 'Horário não encontrado nesta escola.' using errcode = 'P0002';
  end if;

  if not v_horario.ativo then
    raise exception 'Este horário não está mais disponível na grade da escola.' using errcode = 'P0005';
  end if;

  if p_data_aula is null then
    raise exception 'Escolha a data da aula.' using errcode = 'P0004';
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

  begin
    insert into public.reservas (horario_id, data_aula, nome_professor, turma,
                                 email_contato, aula_id, aula_livre)
    values (v_horario.id, p_data_aula, v_nome, v_turma, v_email, p_aula_id, v_livre)
    returning * into v_reserva;
  exception when unique_violation then
    raise exception 'Este horário acabou de ser reservado por outra pessoa.' using errcode = 'P0005';
  end;

  return jsonb_build_object(
    'protocolo',      v_reserva.protocolo,
    'nome_professor', v_reserva.nome_professor,
    'turma',          v_reserva.turma,
    'data_aula',      v_reserva.data_aula,
    'escola_nome',    v_escola.nome,
    'hora_inicio',    v_horario.hora_inicio,
    'hora_fim',       v_horario.hora_fim,
    'aula_titulo',    coalesce(v_aula.titulo, v_livre)
  );
end;
$$;

-- Consulta e cancelamento pelo protocolo: é o comprovante que o
-- professor recebeu que autoriza mexer na própria reserva.
create or replace function public.obter_reserva(p_protocolo text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'protocolo', r.protocolo,
           'status', r.status,
           'data_aula', r.data_aula,
           'hora_inicio', h.hora_inicio,
           'hora_fim', h.hora_fim,
           'escola_nome', e.nome,
           'nome_professor', r.nome_professor,
           'turma', r.turma,
           'aula_titulo', coalesce(a.titulo, r.aula_livre),
           'cancelado_em', r.cancelado_em,
           'ja_aconteceu', (r.data_aula + h.hora_fim) < public.agora_brasil()
         )
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
    join public.escolas  e on e.id = h.escola_id
    left join public.aulas a on a.id = r.aula_id
   where upper(btrim(p_protocolo)) = r.protocolo;
$$;

create or replace function public.cancelar_por_protocolo(p_protocolo text, p_motivo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_reserva public.reservas;
  v_horario public.horarios;
begin
  select * into v_reserva
    from public.reservas
   where protocolo = upper(btrim(coalesce(p_protocolo, '')));

  if not found then
    raise exception 'Protocolo não encontrado. Confira o código do comprovante.' using errcode = 'P0002';
  end if;

  select * into v_horario from public.horarios where id = v_reserva.horario_id;

  if v_reserva.status = 'cancelado' then
    raise exception 'Esta reserva já está cancelada.' using errcode = 'P0006';
  end if;

  if (v_reserva.data_aula + v_horario.hora_fim) < public.agora_brasil() then
    raise exception 'Esta aula já aconteceu e não pode ser cancelada.' using errcode = 'P0006';
  end if;

  update public.reservas
     set status = 'cancelado',
         cancelado_em = now(),
         cancelado_por = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = v_reserva.id;

  return jsonb_build_object('protocolo', v_reserva.protocolo, 'status', 'cancelado');
end;
$$;

-- ---------------------------------------------------------------------
-- Painel do WIT
-- ---------------------------------------------------------------------

create or replace function public.admin_listar_escolas(p_admin_token text)
returns table (
  id               uuid,
  nome             text,
  criado_em        timestamptz,
  total_horarios   bigint,
  horarios_ativos  bigint,
  reservas_futuras bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select e.id, e.nome, e.criado_em,
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

create or replace function public.admin_listar_aulas(p_admin_token text)
returns table (
  id           uuid,
  titulo       text,
  tema         text,
  resumo       text,
  descricao    text,
  objetivos    text,
  materiais    text,
  materia_id   uuid,
  materia_nome text,
  anos         smallint[],
  duracao_min  smallint,
  publicada    boolean,
  habilidades  jsonb,
  vezes_dada   bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select a.id, a.titulo, a.tema, a.resumo, a.descricao, a.objetivos, a.materiais,
           a.materia_id, m.nome, a.anos, a.duracao_min, a.publicada,
           coalesce((
             select jsonb_agg(jsonb_build_object('id', hb.id, 'codigo', hb.codigo,
                                                 'descricao', hb.descricao) order by hb.codigo)
               from public.aulas_habilidades ah
               join public.habilidades hb on hb.id = ah.habilidade_id
              where ah.aula_id = a.id
           ), '[]'::jsonb),
           (select count(*) from public.reservas r where r.aula_id = a.id and r.status = 'confirmado')
      from public.aulas a
      left join public.materias m on m.id = a.materia_id
     order by a.atualizado_em desc;
end;
$$;

-- Cria ou atualiza numa chamada só: o painel tem um formulário único.
create or replace function public.admin_salvar_aula(
  p_admin_token   text,
  p_aula_id       uuid,
  p_titulo        text,
  p_resumo        text,
  p_tema          text default null,
  p_descricao     text default null,
  p_objetivos     text default null,
  p_materiais     text default null,
  p_materia_id    uuid default null,
  p_anos          smallint[] default '{}',
  p_duracao_min   smallint default 90,
  p_publicada     boolean default true,
  p_habilidades   uuid[] default '{}'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_aula public.aulas;
begin
  perform public._exigir_admin(p_admin_token);

  if length(btrim(coalesce(p_titulo, ''))) < 3 then
    raise exception 'Dê um título para a aula.' using errcode = 'P0004';
  end if;

  if length(btrim(coalesce(p_resumo, ''))) < 10 then
    raise exception 'Escreva um resumo de pelo menos 10 caracteres.' using errcode = 'P0004';
  end if;

  if p_aula_id is null then
    insert into public.aulas (titulo, tema, resumo, descricao, objetivos, materiais,
                              materia_id, anos, duracao_min, publicada)
    values (btrim(p_titulo), nullif(btrim(coalesce(p_tema, '')), ''), btrim(p_resumo),
            nullif(btrim(coalesce(p_descricao, '')), ''),
            nullif(btrim(coalesce(p_objetivos, '')), ''),
            nullif(btrim(coalesce(p_materiais, '')), ''),
            p_materia_id, coalesce(p_anos, '{}'), coalesce(p_duracao_min, 90),
            coalesce(p_publicada, true))
    returning * into v_aula;
  else
    update public.aulas
       set titulo = btrim(p_titulo),
           tema = nullif(btrim(coalesce(p_tema, '')), ''),
           resumo = btrim(p_resumo),
           descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
           objetivos = nullif(btrim(coalesce(p_objetivos, '')), ''),
           materiais = nullif(btrim(coalesce(p_materiais, '')), ''),
           materia_id = p_materia_id,
           anos = coalesce(p_anos, '{}'),
           duracao_min = coalesce(p_duracao_min, 90),
           publicada = coalesce(p_publicada, true),
           atualizado_em = now()
     where id = p_aula_id
    returning * into v_aula;

    if not found then
      raise exception 'Aula não encontrada.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.aulas_habilidades where aula_id = v_aula.id;
  insert into public.aulas_habilidades (aula_id, habilidade_id)
  select v_aula.id, h
    from unnest(coalesce(p_habilidades, '{}'::uuid[])) as h
   where exists (select 1 from public.habilidades where id = h)
  on conflict do nothing;

  return to_jsonb(v_aula);
end;
$$;

-- Só some do catálogo se ninguém tiver usado; senão vira rascunho, para
-- o histórico das aulas já dadas não perder o título.
create or replace function public.admin_remover_aula(p_admin_token text, p_aula_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  if exists (select 1 from public.reservas where aula_id = p_aula_id) then
    update public.aulas set publicada = false, atualizado_em = now() where id = p_aula_id;
    return jsonb_build_object('removida', false, 'despublicada', true);
  end if;

  delete from public.aulas where id = p_aula_id;

  if not found then
    raise exception 'Aula não encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('removida', true, 'despublicada', false);
end;
$$;

create or replace function public.admin_salvar_materia(
  p_admin_token text,
  p_materia_id  uuid,
  p_nome        text,
  p_cor         text default '#00A651',
  p_ordem       smallint default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_materia public.materias;
begin
  perform public._exigir_admin(p_admin_token);

  if length(btrim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Informe o nome da matéria.' using errcode = 'P0004';
  end if;

  if p_materia_id is null then
    insert into public.materias (nome, cor, ordem)
    values (btrim(p_nome), coalesce(p_cor, '#00A651'), coalesce(p_ordem, 100))
    returning * into v_materia;
  else
    update public.materias
       set nome = btrim(p_nome), cor = coalesce(p_cor, cor), ordem = coalesce(p_ordem, ordem)
     where id = p_materia_id
    returning * into v_materia;

    if not found then
      raise exception 'Matéria não encontrada.' using errcode = 'P0002';
    end if;
  end if;

  return to_jsonb(v_materia);
end;
$$;

create or replace function public.admin_salvar_habilidade(
  p_admin_token  text,
  p_habilidade_id uuid,
  p_codigo       text,
  p_descricao    text,
  p_materia_id   uuid default null,
  p_ano          smallint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hab public.habilidades;
begin
  perform public._exigir_admin(p_admin_token);

  if length(btrim(coalesce(p_codigo, ''))) < 3 then
    raise exception 'Informe o código da habilidade (ex: EF06MA01).' using errcode = 'P0004';
  end if;

  if length(btrim(coalesce(p_descricao, ''))) < 10 then
    raise exception 'Escreva a descrição da habilidade.' using errcode = 'P0004';
  end if;

  begin
    if p_habilidade_id is null then
      insert into public.habilidades (codigo, descricao, materia_id, ano)
      values (upper(btrim(p_codigo)), btrim(p_descricao), p_materia_id, p_ano)
      returning * into v_hab;
    else
      update public.habilidades
         set codigo = upper(btrim(p_codigo)), descricao = btrim(p_descricao),
             materia_id = p_materia_id, ano = p_ano
       where id = p_habilidade_id
      returning * into v_hab;

      if not found then
        raise exception 'Habilidade não encontrada.' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe uma habilidade com esse código.' using errcode = 'P0007';
  end;

  return to_jsonb(v_hab);
end;
$$;

create or replace function public.admin_remover_habilidade(p_admin_token text, p_habilidade_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);
  delete from public.habilidades where id = p_habilidade_id;
  if not found then
    raise exception 'Habilidade não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

drop function if exists public.admin_listar_reservas(text, uuid, date, date);

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
  turma          text,
  email_contato  text,
  status         public.status_reserva,
  criado_em      timestamptz,
  cancelado_em   timestamptz,
  cancelado_por  text,
  data_aula      date,
  hora_inicio    time,
  hora_fim       time,
  aula_titulo    text,
  relato         text,
  ja_aconteceu   boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select r.id, r.protocolo, e.id, e.nome, r.nome_professor, r.turma, r.email_contato,
           r.status, r.criado_em, r.cancelado_em, r.cancelado_por,
           r.data_aula, h.hora_inicio, h.hora_fim,
           coalesce(a.titulo, r.aula_livre), r.relato,
           (r.data_aula + h.hora_fim) < public.agora_brasil()
      from public.reservas r
      join public.horarios h on h.id = r.horario_id
      join public.escolas  e on e.id = h.escola_id
      left join public.aulas a on a.id = r.aula_id
     where (p_escola_id is null or e.id = p_escola_id)
       and (p_de is null or r.data_aula >= p_de)
       and (p_ate is null or r.data_aula <= p_ate)
     order by r.data_aula desc, h.hora_inicio desc;
end;
$$;

create or replace function public.admin_cancelar_reserva(
  p_admin_token text,
  p_reserva_id  uuid,
  p_motivo      text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_reserva public.reservas;
begin
  perform public._exigir_admin(p_admin_token);

  update public.reservas
     set status = 'cancelado',
         cancelado_em = now(),
         cancelado_por = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_reserva_id and status = 'confirmado'
  returning * into v_reserva;

  if not found then
    raise exception 'Reserva confirmada não encontrada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_reserva);
end;
$$;

-- Relato do que aconteceu na aula, exibido na vitrine pública.
create or replace function public.admin_registrar_relato(
  p_admin_token text,
  p_reserva_id  uuid,
  p_relato      text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_reserva public.reservas;
begin
  perform public._exigir_admin(p_admin_token);

  update public.reservas
     set relato = nullif(btrim(coalesce(p_relato, '')), '')
   where id = p_reserva_id
  returning * into v_reserva;

  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_reserva);
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------

grant execute on function public.contexto_publico()                                to anon, authenticated;
grant execute on function public.agenda_escola(uuid, date, date)                   to anon, authenticated;
grant execute on function public.listar_aulas(uuid, smallint, uuid, text)          to anon, authenticated;
grant execute on function public.obter_aula(uuid)                                  to anon, authenticated;
grant execute on function public.listar_habilidades(uuid, smallint)                to anon, authenticated;
grant execute on function public.listar_realizadas(uuid, uuid, int)                to anon, authenticated;
grant execute on function public.agendar(uuid, uuid, date, text, text, text, uuid, text) to anon, authenticated;
grant execute on function public.obter_reserva(text)                               to anon, authenticated;
grant execute on function public.cancelar_por_protocolo(text, text)                to anon, authenticated;

grant execute on function public.admin_listar_escolas(text)                        to anon, authenticated;
grant execute on function public.admin_listar_aulas(text)                          to anon, authenticated;
grant execute on function public.admin_salvar_aula(text, uuid, text, text, text, text, text, text, uuid, smallint[], smallint, boolean, uuid[]) to anon, authenticated;
grant execute on function public.admin_remover_aula(text, uuid)                    to anon, authenticated;
grant execute on function public.admin_salvar_materia(text, uuid, text, text, smallint) to anon, authenticated;
grant execute on function public.admin_salvar_habilidade(text, uuid, text, text, uuid, smallint) to anon, authenticated;
grant execute on function public.admin_remover_habilidade(text, uuid)              to anon, authenticated;
grant execute on function public.admin_listar_reservas(text, uuid, date, date)     to anon, authenticated;
grant execute on function public.admin_cancelar_reserva(text, uuid, text)          to anon, authenticated;
grant execute on function public.admin_registrar_relato(text, uuid, text)          to anon, authenticated;

-- ---------------------------------------------------------------------
-- Matérias iniciais, para o painel já abrir utilizável
-- ---------------------------------------------------------------------

insert into public.materias (nome, cor, ordem) values
  ('Língua Portuguesa', '#00A651', 10),
  ('Matemática',        '#007236', 20),
  ('Ciências',          '#8DC63F', 30),
  ('História',          '#0E7C5A', 40),
  ('Geografia',         '#39B54A', 50),
  ('Arte',              '#A6CE39', 60),
  ('Educação Física',   '#00843D', 70),
  ('Língua Inglesa',    '#4CAF50', 80),
  ('Projeto Integrador','#00C46A', 90)
on conflict (nome) do nothing;

select 'Catálogo instalado. O site agora é público, com seletor de escola.' as resultado;

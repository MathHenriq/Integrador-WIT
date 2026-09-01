-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 21: confirmação da equipe WIT + mais dados no agendamento
--
--   Cole no SQL Editor DEPOIS da 0020. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- Dois pedidos da equipe, na mesma leva porque mexem nas mesmas peças:
--
-- 1. Reserva feita pelo professor da escola não nasce mais confirmada.
--    Nasce "aguardando confirmação" — o professor do dia entra em
--    contato (e-mail ou WhatsApp), entende a aula e só então confirma
--    pelo painel. Sem isso, tinha professor "aparecendo" achando que só
--    reservar já garantia a aula, sem a equipe saber como preparar a
--    sala.
--
-- 2. O agendamento passa a pedir: quantos alunos a turma tem (novo,
--    obrigatório) e um jeito de falar com o professor — e-mail OU
--    WhatsApp, pelo menos um dos dois, nunca os dois em branco.
--
-- Uma reserva "aguardando confirmação" continua contando como o horário
-- ocupado (ninguém mais pode reservar aquela data/tempo enquanto ela não
-- for cancelada) — é reservado, só que pendente. Por isso todo lugar que
-- olhava só `status = 'confirmado'` para saber se um horário está tomado
-- passa a olhar `status in ('confirmado', 'aguardando_confirmacao')`.

-- --------------------------------------------------------------------
-- 1. Colunas novas em `reservas`
-- --------------------------------------------------------------------

alter table public.reservas add column if not exists whatsapp_contato  text;
alter table public.reservas add column if not exists quantidade_alunos smallint;

do $$ begin
  alter table public.reservas add constraint reservas_quantidade_alunos_positiva
    check (quantidade_alunos is null or quantidade_alunos > 0);
exception when duplicate_object then null; end $$;

comment on column public.reservas.whatsapp_contato is
  'Telefone/WhatsApp de contato. Junto com email_contato: a reserva feita
   pelo site exige pelo menos um dos dois preenchido.';
comment on column public.reservas.quantidade_alunos is
  'Quantos alunos a turma tem. Obrigatório no agendamento pelo site; pode
   ficar em branco em reserva registrada retroativamente pela equipe.';

-- --------------------------------------------------------------------
-- 2. `cancelado_em` coerente com um terceiro status
-- --------------------------------------------------------------------
-- Antes só existiam 'confirmado' e 'cancelado'. Com 'aguardando_confirmacao'
-- no meio, a regra vira "só cancelado tem cancelado_em", em vez de
-- amarrada aos dois valores antigos nomeados.

alter table public.reservas drop constraint if exists reservas_cancelamento_coerente;
alter table public.reservas add constraint reservas_cancelamento_coerente check (
  (status = 'cancelado' and cancelado_em is not null)
  or (status <> 'cancelado' and cancelado_em is null)
);

-- --------------------------------------------------------------------
-- 3. A trava de concorrência passa a valer para as duas situações ativas
-- --------------------------------------------------------------------
-- Uma reserva "aguardando confirmação" também tranca a data/horário — é
-- reservado, só que pendente. Sem isto, duas escolas poderiam disputar o
-- mesmo horário enquanto o primeiro pedido ainda não foi confirmado.

drop index if exists public.reservas_uma_confirmada_por_data;
drop index if exists public.reservas_uma_ativa_por_data;
create unique index reservas_uma_ativa_por_data
  on public.reservas (horario_id, data_aula)
  where status in ('confirmado', 'aguardando_confirmacao');

-- --------------------------------------------------------------------
-- 4. Agendamento público: pede quantidade de alunos e um contato
-- --------------------------------------------------------------------
-- Assinatura muda (dois parâmetros novos), então a função antiga precisa
-- sair antes — `create or replace` não troca a lista de parâmetros.

drop function if exists public.agendar(uuid, uuid, date, text, text, text, uuid, text);

create or replace function public.agendar(
  p_escola_id         uuid,
  p_horario_id        uuid,
  p_data_aula         date,
  p_nome_professor    text,
  p_turma             text default null,
  p_email_contato     text default null,
  p_aula_id           uuid default null,
  p_aula_livre        text default null,
  p_quantidade_alunos smallint default null,
  p_whatsapp_contato  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_horario   public.horarios;
  v_escola    public.escolas;
  v_reserva   public.reservas;
  v_aula      public.aulas;
  v_nome      text := btrim(coalesce(p_nome_professor, ''));
  v_turma     text := nullif(btrim(coalesce(p_turma, '')), '');
  v_email     text := nullif(btrim(lower(coalesce(p_email_contato, ''))), '');
  v_whatsapp  text := nullif(btrim(coalesce(p_whatsapp_contato, '')), '');
  v_livre     text := nullif(btrim(coalesce(p_aula_livre, '')), '');
begin
  if length(v_nome) < 3 then
    raise exception 'Informe o nome do professor responsável.' using errcode = 'P0004';
  end if;

  if not public._email_valido(v_email) then
    raise exception 'O e-mail informado não parece válido.' using errcode = 'P0004';
  end if;

  if v_whatsapp is not null and length(regexp_replace(v_whatsapp, '\D', '', 'g')) < 10 then
    raise exception 'O WhatsApp informado não parece válido — inclua o DDD.' using errcode = 'P0004';
  end if;

  if v_email is null and v_whatsapp is null then
    raise exception 'Informe um e-mail ou um WhatsApp para a equipe falar com você sobre a aula.'
      using errcode = 'P0004';
  end if;

  if p_quantidade_alunos is null or p_quantidade_alunos < 1 then
    raise exception 'Informe quantos alunos a turma tem.' using errcode = 'P0004';
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
                                 email_contato, whatsapp_contato, quantidade_alunos,
                                 aula_id, aula_livre, origem, status)
    values (v_horario.id, p_data_aula, v_nome, v_turma,
            v_email, v_whatsapp, p_quantidade_alunos,
            p_aula_id, v_livre, 'escola', 'aguardando_confirmacao')
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
    'aula_titulo',    coalesce(v_aula.titulo, v_livre),
    'status',         v_reserva.status
  );
end;
$$;

grant execute on function public.agendar(uuid, uuid, date, text, text, text, uuid, text, smallint, text)
  to anon, authenticated;

-- --------------------------------------------------------------------
-- 5. O calendário público conta "aguardando confirmação" como ocupado
-- --------------------------------------------------------------------

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
       and r.status in ('confirmado', 'aguardando_confirmacao')
      left join public.aulas a on a.id = r.aula_id
     where h.escola_id = p_escola_id
       and h.ativo
     order by dia.data, h.hora_inicio;
end;
$$;

-- --------------------------------------------------------------------
-- 6. Painel: confirmar uma reserva pendente
-- --------------------------------------------------------------------

create or replace function public.admin_confirmar_reserva(
  p_admin_token text,
  p_reserva_id  uuid
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
     set status = 'confirmado'
   where id = p_reserva_id
     and status = 'aguardando_confirmacao'
  returning * into v_reserva;

  if not found then
    raise exception 'Reserva não encontrada, ou já foi confirmada ou cancelada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_reserva);
end;
$$;

grant execute on function public.admin_confirmar_reserva(text, uuid) to anon, authenticated;

-- --------------------------------------------------------------------
-- 7. Painel: cancelar vale tanto para confirmada quanto para pendente
-- --------------------------------------------------------------------

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
   where id = p_reserva_id
     and status in ('confirmado', 'aguardando_confirmacao')
  returning * into v_reserva;

  if not found then
    raise exception 'Reserva não encontrada, ou já está cancelada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_reserva);
end;
$$;

-- --------------------------------------------------------------------
-- 8. Lista de reservas do painel devolve WhatsApp e quantidade de alunos
-- --------------------------------------------------------------------

drop function if exists public.admin_listar_reservas(text, uuid, date, date);

create or replace function public.admin_listar_reservas(
  p_admin_token text,
  p_escola_id   uuid default null,
  p_de          date default null,
  p_ate         date default null
)
returns table (
  id                uuid,
  protocolo         text,
  escola_id         uuid,
  escola_nome       text,
  nome_professor    text,
  turma             text,
  email_contato     text,
  whatsapp_contato  text,
  quantidade_alunos smallint,
  status            public.status_reserva,
  criado_em         timestamptz,
  cancelado_em      timestamptz,
  cancelado_por     text,
  data_aula         date,
  hora_inicio       time,
  hora_fim          time,
  aula_titulo       text,
  relato            text,
  fotos             text[],
  ja_aconteceu      boolean,
  origem            public.origem_reserva
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
           r.whatsapp_contato, r.quantidade_alunos,
           r.status, r.criado_em, r.cancelado_em, r.cancelado_por,
           r.data_aula, h.hora_inicio, h.hora_fim,
           coalesce(a.titulo, r.aula_livre), r.relato, r.fotos,
           (r.data_aula + h.hora_fim) < public.agora_brasil(),
           r.origem
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

grant execute on function public.admin_listar_reservas(text, uuid, date, date) to anon, authenticated;

-- --------------------------------------------------------------------
-- 9. Contadores do painel (escolas e horários) somam também as pendentes
-- --------------------------------------------------------------------

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
             where r.status in ('confirmado', 'aguardando_confirmacao')
               and r.data_aula >= public.hoje_brasil()
           )
      from public.escolas e
      left join public.horarios h on h.escola_id = e.id
      left join public.reservas r on r.horario_id = h.id
     group by e.id
     order by e.nome;
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
             where r.status in ('confirmado', 'aguardando_confirmacao')
               and r.data_aula >= public.hoje_brasil()
           ),
           count(r.id)
      from public.horarios h
      left join public.reservas r on r.horario_id = h.id
     where h.escola_id = p_escola_id
     group by h.id
     order by h.dia_semana, h.hora_inicio;
end;
$$;

-- --------------------------------------------------------------------
-- 10. Painel de panorama por escola (mesma régua, ainda que sem tela
--     própria hoje)
-- --------------------------------------------------------------------

create or replace function public.admin_panorama_escolas(p_admin_token text)
returns table (
  escola_id    uuid,
  escola_nome  text,
  realizadas   bigint,
  agendadas    bigint,
  canceladas   bigint,
  professores  bigint,
  ultima_data  date,
  proxima_data date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
  with linhas as (
    select e.id   as escola_id,
           e.nome as escola_nome,
           r.status,
           r.data_aula,
           r.nome_professor,
           (r.data_aula + h.hora_fim) < public.agora_brasil() as ja_aconteceu
      from public.escolas e
      left join public.horarios h on h.escola_id = e.id
      left join public.reservas r on r.horario_id = h.id
  ),
  contas as (
    select l.escola_id,
           l.escola_nome,
           l.status = 'confirmado' and l.ja_aconteceu                                 as feita,
           l.status in ('confirmado', 'aguardando_confirmacao') and not l.ja_aconteceu as marcada,
           l.status = 'cancelado'                                                     as cancelada,
           l.data_aula,
           l.nome_professor
      from linhas l
  )
  select c.escola_id,
         c.escola_nome,
         count(*) filter (where c.feita),
         count(*) filter (where c.marcada),
         count(*) filter (where c.cancelada),
         count(distinct lower(btrim(c.nome_professor))) filter (where c.feita),
         max(c.data_aula) filter (where c.feita),
         min(c.data_aula) filter (where c.marcada)
    from contas c
   group by c.escola_id, c.escola_nome
   order by c.escola_nome;
end;
$$;

-- --------------------------------------------------------------------
-- 11. Registro retroativo (documento/Canva) também respeita reserva
--     pendente: anexa nela em vez de tentar criar outra no mesmo tempo,
--     e confirma a reserva junto — a aula aconteceu, então deixou de
--     estar pendente.
-- --------------------------------------------------------------------

create or replace function public.admin_importar_aula_realizada(
  p_admin_token     text,
  p_importacao_id   uuid,
  p_escola_id       uuid,
  p_data_aula       date,
  p_nome_professor  text,
  p_turma           text,
  p_titulo          text,
  p_relato          text,
  p_fotos           text[] default '{}',
  p_descricao       text default null,
  p_objetivos       text default null,
  p_materiais       text default null,
  p_virar_atividade boolean default true,
  p_origem          public.origem_reserva default 'equipe_wit'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_escola     public.escolas;
  v_reserva    public.reservas;
  v_horario_id uuid;
  v_titulo     text := btrim(coalesce(p_titulo, ''));
  v_professor  text := btrim(coalesce(p_nome_professor, ''));
  v_turma      text := nullif(btrim(coalesce(p_turma, '')), '');
  v_relato     text := nullif(btrim(coalesce(p_relato, '')), '');
  v_descricao  text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_objetivos  text := nullif(btrim(coalesce(p_objetivos, '')), '');
  v_materiais  text := nullif(btrim(coalesce(p_materiais, '')), '');
  v_fotos      text[];
  v_anexada    boolean := false;
  v_hora_ini   time;
  v_hora_fim   time;
  v_aula_id    uuid;
  v_nova_aula  boolean := false;
  v_resumo     text;
  v_ano        smallint;
  v_anos       smallint[];
begin
  perform public._exigir_admin(p_admin_token);

  select * into v_escola from public.escolas where id = p_escola_id;
  if not found then
    raise exception 'Escolha a escola desta aula.' using errcode = 'P0004';
  end if;

  if p_data_aula is null then
    raise exception 'Escolha a data desta aula.' using errcode = 'P0004';
  end if;

  -- A vitrine é de aula que aconteceu. Data no futuro aqui seria uma
  -- reserva disfarçada, com fotos de uma aula que ninguém deu.
  if p_data_aula > public.hoje_brasil() then
    raise exception 'Esta data ainda não chegou. A vitrine é de aulas já realizadas.'
      using errcode = 'P0004';
  end if;

  if length(v_professor) < 3 then
    raise exception 'Diga quem é o professor ou a professora desta aula.' using errcode = 'P0004';
  end if;

  if length(v_titulo) < 3 then
    raise exception 'Dê um tema para a aula — é o título que aparece na vitrine.'
      using errcode = 'P0004';
  end if;

  v_fotos := coalesce(
    (select array_agg(btrim(f)) from unnest(coalesce(p_fotos, '{}')) f where btrim(f) <> ''),
    '{}'
  );

  -- 1. A reserva que já existe (confirmada ou ainda aguardando a equipe
  -- confirmar), se o nome do professor bater.
  select r.* into v_reserva
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
   where h.escola_id = p_escola_id
     and r.data_aula = p_data_aula
     and r.status in ('confirmado', 'aguardando_confirmacao')
     and (
       public._texto_chave(r.nome_professor) = public._texto_chave(v_professor)
       or public._texto_chave(r.nome_professor) like '%' || public._texto_chave(v_professor) || '%'
       or public._texto_chave(v_professor) like '%' || public._texto_chave(r.nome_professor) || '%'
     )
   order by h.hora_inicio
   limit 1;

  if found then
    -- A aula aconteceu de verdade: se ainda estava pendente, confirma
    -- junto, porque não faz sentido registrar relato e fotos de uma aula
    -- "aguardando confirmação".
    update public.reservas
       set relato = coalesce(v_relato, relato),
           fotos  = case when array_length(v_fotos, 1) is null then fotos else v_fotos end,
           turma  = coalesce(turma, v_turma),
           status = 'confirmado'
     where id = v_reserva.id
    returning * into v_reserva;

    v_anexada := true;
  else
    -- 2. Primeiro tempo livre daquele dia da semana (livre de verdade:
    -- sem reserva confirmada nem pendente).
    select h.id into v_horario_id
      from public.horarios h
     where h.escola_id = p_escola_id
       and h.ativo
       and h.dia_semana = extract(dow from p_data_aula)::smallint
       and not exists (
         select 1 from public.reservas r
          where r.horario_id = h.id
            and r.data_aula = p_data_aula
            and r.status in ('confirmado', 'aguardando_confirmacao')
       )
     order by h.hora_inicio
     limit 1;

    if v_horario_id is null then
      -- Duas causas bem diferentes, duas frases diferentes: sem grade
      -- naquele dia (data de fim de semana, quase sempre erro de leitura
      -- do documento) ou grade cheia.
      if not exists (
        select 1 from public.horarios h
         where h.escola_id = p_escola_id
           and h.ativo
           and h.dia_semana = extract(dow from p_data_aula)::smallint
      ) then
        raise exception '% não tem horário nenhum neste dia da semana. Confira a data do documento.',
          v_escola.nome using errcode = 'P0004';
      end if;

      raise exception 'Todos os tempos desta data em % já têm aula registrada.',
        v_escola.nome using errcode = 'P0004';
    end if;

    insert into public.reservas (horario_id, data_aula, nome_professor, turma,
                                 aula_livre, relato, fotos, origem, status)
    values (v_horario_id, p_data_aula, v_professor, v_turma, v_titulo, v_relato, v_fotos,
            coalesce(p_origem, 'equipe_wit'), 'confirmado')
    returning * into v_reserva;
  end if;

  -- ------------------------------------------------------------------
  -- A atividade do catálogo
  -- ------------------------------------------------------------------

  if p_virar_atividade then
    -- O ano da turma sai do próprio nome: "7-A", "9A" e "8C" viram 7, 9
    -- e 8. Turma com nome sem número (uma "Inclusão", por exemplo) fica
    -- sem ano, que é o mesmo que "serve para qualquer ano".
    v_ano := nullif((regexp_match(coalesce(v_turma, ''), '([1-9])'))[1], '')::smallint;
    v_anos := case when v_ano is null then '{}'::smallint[] else array[v_ano] end;

    -- O resumo é a primeira parte da descrição, cortada numa palavra
    -- inteira: é o que aparece no cartão do catálogo.
    v_resumo := regexp_replace(coalesce(v_descricao, v_relato, v_titulo), '\s+', ' ', 'g');
    if length(v_resumo) > 220 then
      v_resumo := regexp_replace(left(v_resumo, 220), '\s+\S*$', '') || '…';
    end if;

    select a.id into v_aula_id
      from public.aulas a
     where public._texto_chave(a.titulo) = public._texto_chave(v_titulo)
     order by a.criado_em
     limit 1;

    if v_aula_id is null then
      insert into public.aulas (titulo, resumo, descricao, objetivos, materiais, anos, publicada)
      values (v_titulo, v_resumo, v_descricao, v_objetivos, v_materiais, v_anos, true)
      returning id into v_aula_id;
      v_nova_aula := true;
    else
      -- Mesmo tema de novo: completa o que estava em branco e não mexe
      -- no que alguém já ajustou à mão.
      update public.aulas
         set resumo        = case when btrim(coalesce(resumo, '')) = '' then v_resumo else resumo end,
             descricao     = coalesce(descricao, v_descricao),
             objetivos     = coalesce(objetivos, v_objetivos),
             materiais     = coalesce(materiais, v_materiais),
             anos          = case when array_length(anos, 1) is null then v_anos else anos end,
             publicada     = true,
             atualizado_em = now()
       where id = v_aula_id;
    end if;

    update public.reservas set aula_id = v_aula_id where id = v_reserva.id returning * into v_reserva;
  end if;

  select h.hora_inicio, h.hora_fim into v_hora_ini, v_hora_fim
    from public.horarios h where h.id = v_reserva.horario_id;

  if p_importacao_id is not null then
    update public.importacoes_canva
       set status      = 'aplicada',
           reserva_id  = v_reserva.id,
           aplicada_em = now()
     where id = p_importacao_id;
  end if;

  return jsonb_build_object(
    'reserva_id',  v_reserva.id,
    'protocolo',   v_reserva.protocolo,
    'anexada',     v_anexada,
    'data_aula',   v_reserva.data_aula,
    'hora_inicio', v_hora_ini,
    'hora_fim',    v_hora_fim,
    'escola_nome', v_escola.nome,
    'titulo',      coalesce(v_reserva.aula_livre, v_titulo),
    'fotos',       to_jsonb(v_reserva.fotos),
    'aula_id',     v_aula_id,
    'aula_nova',   v_nova_aula,
    'origem',      v_reserva.origem
  );
end;
$$;

select 'Confirmação da equipe WIT e novos dados do agendamento prontos.' as resultado;

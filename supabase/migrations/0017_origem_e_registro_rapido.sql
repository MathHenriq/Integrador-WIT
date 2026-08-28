-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 17: origem do integrador + limpeza dos dados de teste
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- Três pedidos da equipe, resolvidos juntos porque mexem na mesma tabela:
--
-- 1. O sistema entra em uso real esta semana. As aulas do catálogo e o
--    histórico de reservas que estavam lá são teste — saem daqui, para o
--    acervo próprio da equipe entrar limpo.
--
-- 2. Toda reserva passa a guardar QUEM conseguiu aquele projeto
--    integrador: a Equipe WIT (ela procurou a escola e fechou direto,
--    sem passar pelo agendamento do site) ou a Escola (o professor
--    reservou pelo site público). É a `origem`.
--
-- 3. O caminho para a equipe registrar um projeto que já rolou, sem
--    agendamento prévio pela escola, precisa ser fácil e visível — não
--    dá para depender de montar um documento do Canva toda vez. A
--    `admin_importar_aula_realizada` já sabia criar a reserva sozinha
--    quando não existe uma prévia; só faltava ela saber a origem.

-- --------------------------------------------------------------------
-- 1. Limpeza: fora as aulas de teste e o histórico de reservas
-- --------------------------------------------------------------------
-- Escolas e horários continuam — é a grade real da sala. O que sai é
-- só o que foi cadastrado em teste: o catálogo de aulas e as reservas
-- (agendadas, confirmadas ou canceladas), com a trilha de importações
-- do Canva que andava junto.

delete from public.reservas;
delete from public.aulas;
delete from public.importacoes_canva;

-- --------------------------------------------------------------------
-- 2. De onde veio o projeto integrador
-- --------------------------------------------------------------------

do $$ begin
  create type public.origem_reserva as enum ('equipe_wit', 'escola');
exception when duplicate_object then null; end $$;

alter table public.reservas
  add column if not exists origem public.origem_reserva not null default 'escola';

comment on column public.reservas.origem is
  'equipe_wit = a Equipe WIT fechou o projeto direto com o professor, sem passar pelo agendamento do site.
   escola = o professor (ou a escola) reservou pelo site público.';

-- O agendamento público é sempre a escola reservando — é o que a tela
-- de agendar faz. Fica explícito aqui, e não só no default da coluna.

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
                                 email_contato, aula_id, aula_livre, origem)
    values (v_horario.id, p_data_aula, v_nome, v_turma, v_email, p_aula_id, v_livre, 'escola')
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

-- --------------------------------------------------------------------
-- 3. A lista de reservas do painel passa a devolver a origem
-- --------------------------------------------------------------------

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
  fotos          text[],
  ja_aconteceu   boolean,
  origem         public.origem_reserva
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
-- 4. Registro rápido, com origem
-- --------------------------------------------------------------------
-- Mesma função de sempre (a que já sabia criar a reserva sozinha quando
-- não existe agendamento prévio), só que agora recebe quem conseguiu o
-- projeto. Só marca a origem quando CRIA a reserva: quando o relato
-- entra numa reserva que já existia (o professor tinha agendado pelo
-- site), a origem continua sendo a de quem agendou.

drop function if exists public.admin_importar_aula_realizada(text, uuid, uuid, date, text, text, text, text, text[], text, text, text, boolean);

create function public.admin_importar_aula_realizada(
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

  -- 1. A reserva que já existe, se o nome do professor bater.
  select r.* into v_reserva
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
   where h.escola_id = p_escola_id
     and r.data_aula = p_data_aula
     and r.status = 'confirmado'
     and (
       public._texto_chave(r.nome_professor) = public._texto_chave(v_professor)
       or public._texto_chave(r.nome_professor) like '%' || public._texto_chave(v_professor) || '%'
       or public._texto_chave(v_professor) like '%' || public._texto_chave(r.nome_professor) || '%'
     )
   order by h.hora_inicio
   limit 1;

  if found then
    update public.reservas
       set relato = coalesce(v_relato, relato),
           fotos  = case when array_length(v_fotos, 1) is null then fotos else v_fotos end,
           turma  = coalesce(turma, v_turma)
     where id = v_reserva.id
    returning * into v_reserva;

    v_anexada := true;
  else
    -- 2. Primeiro tempo livre daquele dia da semana.
    select h.id into v_horario_id
      from public.horarios h
     where h.escola_id = p_escola_id
       and h.ativo
       and h.dia_semana = extract(dow from p_data_aula)::smallint
       and not exists (
         select 1 from public.reservas r
          where r.horario_id = h.id
            and r.data_aula = p_data_aula
            and r.status = 'confirmado'
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
                                 aula_livre, relato, fotos, origem)
    values (v_horario_id, p_data_aula, v_professor, v_turma, v_titulo, v_relato, v_fotos,
            coalesce(p_origem, 'equipe_wit'))
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

grant execute on function public.admin_importar_aula_realizada(text, uuid, uuid, date, text, text, text, text, text[], text, text, text, boolean, public.origem_reserva) to anon, authenticated;

select 'Origem do integrador pronta, e o catálogo/histórico de teste foi limpo.' as resultado;

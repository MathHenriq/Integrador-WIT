-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 22: descrição, objetivos e materiais no agendamento
--
--   Cole no SQL Editor DEPOIS da 0021. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- Quando o professor escreve a própria aula (em vez de escolher do
-- catálogo), o campo único de texto livre vira três, no mesmo padrão do
-- "Novo documento" e do "Registrar projeto": descrição, objetivos de
-- aprendizagem e materiais/recursos. `aula_livre` passa a guardar só a
-- descrição — objetivos e materiais ganham colunas próprias, os dois
-- opcionais.
--
-- Só valem quando a aula é escrita pelo professor: escolher do catálogo
-- zera os três, porque a atividade do catálogo já tem a sua própria
-- descrição/objetivos/materiais.

alter table public.reservas add column if not exists aula_objetivos text;
alter table public.reservas add column if not exists aula_materiais text;

comment on column public.reservas.aula_objetivos is
  'Objetivos de aprendizagem digitados pelo professor, só quando a aula não
   é do catálogo (aula_id is null). Um por linha, texto livre.';
comment on column public.reservas.aula_materiais is
  'Materiais e recursos digitados pelo professor, só quando a aula não é do
   catálogo (aula_id is null). Um por linha, texto livre.';

-- --------------------------------------------------------------------
-- Agendamento público: dois parâmetros novos
-- --------------------------------------------------------------------

drop function if exists public.agendar(uuid, uuid, date, text, text, text, uuid, text, smallint, text);

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
  p_whatsapp_contato  text default null,
  p_aula_objetivos    text default null,
  p_aula_materiais    text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_horario    public.horarios;
  v_escola     public.escolas;
  v_reserva    public.reservas;
  v_aula       public.aulas;
  v_nome       text := btrim(coalesce(p_nome_professor, ''));
  v_turma      text := nullif(btrim(coalesce(p_turma, '')), '');
  v_email      text := nullif(btrim(lower(coalesce(p_email_contato, ''))), '');
  v_whatsapp   text := nullif(btrim(coalesce(p_whatsapp_contato, '')), '');
  v_livre      text := nullif(btrim(coalesce(p_aula_livre, '')), '');
  v_objetivos  text := nullif(btrim(coalesce(p_aula_objetivos, '')), '');
  v_materiais  text := nullif(btrim(coalesce(p_aula_materiais, '')), '');
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
    -- Escolheu do catálogo: o texto livre não se aplica — a atividade já
    -- tem a própria descrição, objetivos e materiais.
    v_livre := null;
    v_objetivos := null;
    v_materiais := null;
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
                                 aula_id, aula_livre, aula_objetivos, aula_materiais,
                                 origem, status)
    values (v_horario.id, p_data_aula, v_nome, v_turma,
            v_email, v_whatsapp, p_quantidade_alunos,
            p_aula_id, v_livre, v_objetivos, v_materiais,
            'escola', 'aguardando_confirmacao')
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

grant execute on function public.agendar(
  uuid, uuid, date, text, text, text, uuid, text, smallint, text, text, text
) to anon, authenticated;

-- --------------------------------------------------------------------
-- O professor vê os próprios objetivos/materiais em "Minha reserva"
-- --------------------------------------------------------------------

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
           'aula_objetivos', r.aula_objetivos,
           'aula_materiais', r.aula_materiais,
           'cancelado_em', r.cancelado_em,
           'ja_aconteceu', (r.data_aula + h.hora_fim) < public.agora_brasil()
         )
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
    join public.escolas  e on e.id = h.escola_id
    left join public.aulas a on a.id = r.aula_id
   where upper(btrim(p_protocolo)) = r.protocolo;
$$;

-- --------------------------------------------------------------------
-- Painel: a lista de reservas devolve objetivos/materiais também
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
  aula_objetivos    text,
  aula_materiais    text,
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
           coalesce(a.titulo, r.aula_livre), r.aula_objetivos, r.aula_materiais,
           r.relato, r.fotos,
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

select 'Descrição, objetivos e materiais separados no agendamento.' as resultado;

-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 26: registrar aula em horário fora da grade
--
--   Cole no SQL Editor DEPOIS da 0025. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- Um horário desativado ("Fora da grade") some do calendário público —
-- que é exatamente para isso que a equipe o desativa: o tempo é da turma
-- do próprio Núcleo, não está aberto para uma turma parceira agendar.
--
-- Só que ele sumia junto do REGISTRO do que já aconteceu. E acontece
-- aula nesse tempo: quando a turma do Núcleo vem com pouca gente, sobra
-- sala, e o profissional WIT faz o projeto integrador ali mesmo. Na hora
-- de registrar, o horário certo não aparecia em lugar nenhum — foi o que
-- travou a segunda turma da EMEF Rita de Jesus.
--
-- São duas coisas diferentes que estavam presas numa só: fechar para
-- agendamento novo (continua fechado) e poder anotar a aula que já foi
-- dada (passa a valer em qualquer tempo da escola). Registro retroativo
-- não ocupa agenda: ele descreve o passado.
--
-- O bloqueio maior era de tela — os selects de horário filtravam por
-- `ativo`, e essa parte vai no código do site. Aqui fica a metade do
-- banco: a escolha automática do tempo, quando a equipe não informa
-- qual foi. Ela também pulava os desativados e, com isso, uma escola
-- cujo dia inteiro está fora da grade recusava o registro.
--
-- Nada muda para quem agenda pelo site: `calendario_publico` continua
-- mostrando só horário ativo, e o tempo fechado segue fechado.

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
  p_origem          public.origem_reserva default 'equipe_wit',
  p_horario_id      uuid default null
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
  v_horario    public.horarios;
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

  -- Quando a equipe já sabe o horário certo, confere se ele é mesmo desta
  -- escola e cai no dia da semana da data escolhida — elimina de vez a
  -- dúvida que o "primeiro tempo livre" não tem como resolver sozinho.
  if p_horario_id is not null then
    select h.* into v_horario from public.horarios h
     where h.id = p_horario_id and h.escola_id = p_escola_id;

    if not found then
      raise exception 'Horário não encontrado nesta escola.' using errcode = 'P0002';
    end if;

    if extract(dow from p_data_aula)::smallint is distinct from v_horario.dia_semana then
      raise exception 'Esta data não cai no dia da semana deste horário.' using errcode = 'P0004';
    end if;
  end if;

  -- 1. A reserva que já existe (confirmada ou ainda aguardando a equipe
  -- confirmar) nesta escola e data. Quando o horário foi informado, ele
  -- decide sozinho qual reserva é (não precisa nem bater o nome — é o
  -- mesmo tempo, então é a mesma aula). Sem horário informado, o nome do
  -- professor é quem decide, comparando palavra inteira.
  select r.* into v_reserva
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
   where h.escola_id = p_escola_id
     and r.data_aula = p_data_aula
     and r.status in ('confirmado', 'aguardando_confirmacao')
     and (
       (p_horario_id is not null and r.horario_id = p_horario_id)
       or (p_horario_id is null and public._mesmo_professor(r.nome_professor, v_professor))
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
  elsif p_horario_id is not null then
    -- 2a. Horário informado e nenhuma reserva prévia nele: usa exatamente
    -- esse, sem adivinhar. Só falha se ele já estiver ocupado por outra
    -- aula que o nome/horário acima não capturou (caso raríssimo — outra
    -- reserva ativa no mesmo tempo com nome bem diferente).
    if exists (
      select 1 from public.reservas r
       where r.horario_id = p_horario_id
         and r.data_aula = p_data_aula
         and r.status in ('confirmado', 'aguardando_confirmacao')
    ) then
      raise exception 'Este horário já tem outra reserva ativa nesta data.' using errcode = 'P0005';
    end if;

    insert into public.reservas (horario_id, data_aula, nome_professor, turma,
                                 aula_livre, relato, fotos, origem, status)
    values (p_horario_id, p_data_aula, v_professor, v_turma, v_titulo, v_relato, v_fotos,
            coalesce(p_origem, 'equipe_wit'), 'confirmado')
    returning * into v_reserva;
  else
    -- 2b. Sem horário informado e sem reserva prévia: primeiro tempo
    -- livre do dia da semana (livre de verdade: sem reserva confirmada
    -- nem pendente). Continua sendo uma escolha arbitrária entre os
    -- tempos livres — é por isso que dá para informar o horário quando
    -- ele é conhecido, em vez de cair nesta escolha.
    --
    -- Tempo fora da grade entra na disputa, mas por último: quando sobra
    -- um tempo aberto, é dele que a aula era; o fechado só é escolhido
    -- se não houver mais nenhum.
    select h.id into v_horario_id
      from public.horarios h
     where h.escola_id = p_escola_id
       and h.dia_semana = extract(dow from p_data_aula)::smallint
       and not exists (
         select 1 from public.reservas r
          where r.horario_id = h.id
            and r.data_aula = p_data_aula
            and r.status in ('confirmado', 'aguardando_confirmacao')
       )
     order by h.ativo desc, h.hora_inicio
     limit 1;

    if v_horario_id is null then
      -- Duas causas bem diferentes, duas frases diferentes: sem grade
      -- naquele dia (data de fim de semana, quase sempre erro de leitura
      -- do documento) ou grade cheia.
      if not exists (
        select 1 from public.horarios h
         where h.escola_id = p_escola_id
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

grant execute on function public.admin_importar_aula_realizada(
  text, uuid, uuid, date, text, text, text, text, text[], text, text, text, boolean,
  public.origem_reserva, uuid
) to anon, authenticated;

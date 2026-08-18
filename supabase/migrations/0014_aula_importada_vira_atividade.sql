-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 14: a aula importada também vira atividade do catálogo
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- O documento do Canva conta uma aula que aconteceu, mas ele é bom
-- demais para servir só de registro: tema, objetivos, descrição e
-- materiais são exatamente o que outro professor precisa para repetir a
-- proposta na turma dele. Até agora a importação gravava tudo isso como
-- texto solto na reserva (`aula_livre`), e a aula não existia no
-- catálogo — não dava para escolher na hora de agendar.
--
-- Agora a importação também **abre a atividade no catálogo** e amarra a
-- reserva nela. Um documento importado passa a valer duas vezes: conta o
-- que foi feito e vira opção para as próximas aulas.
--
-- Importar o mesmo tema de novo não duplica: reaproveita a atividade de
-- mesmo título e só completa o que estiver em branco.

drop function if exists public.admin_importar_aula_realizada(text, uuid, uuid, date, text, text, text, text, text[]);
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
  p_virar_atividade boolean default true
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
                                 aula_livre, relato, fotos)
    values (v_horario_id, p_data_aula, v_professor, v_turma, v_titulo, v_relato, v_fotos)
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
    'aula_nova',   v_nova_aula
  );
end;
$$;

grant execute on function public.admin_importar_aula_realizada(text, uuid, uuid, date, text, text, text, text, text[], text, text, text, boolean) to anon, authenticated;

select 'Aula importada do Canva agora também abre a atividade no catálogo.' as resultado;

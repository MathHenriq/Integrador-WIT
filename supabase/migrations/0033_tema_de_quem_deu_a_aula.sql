-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 33: o tema que vale é o da aula que aconteceu
--
--   Cole no SQL Editor DEPOIS da 0032. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- O professor da escola agenda escolhendo uma atividade do catálogo; na
-- conversa com a equipe, combinam outra coisa, e é a outra que acontece.
-- Na hora de registrar, o sistema achava a reserva daquele dia e anexava
-- relato e fotos a ela — mas deixava o tema como estava. O título digitado
-- pela equipe sumia sem aviso e a vitrine seguia mostrando a atividade do
-- agendamento.
--
-- E não tinha como consertar depois: o "Editar" travava o tema de toda
-- reserva ligada ao catálogo, mandando editar a atividade na aba Aulas —
-- o que mudaria a aula de todas as outras turmas que a usaram.
--
-- Duas mudanças, uma regra só: o tema é da RESERVA, não da atividade.
--
--   * Registrar numa reserva que já existe passa a gravar o tema digitado.
--     Se ele já existe no catálogo, a reserva passa a apontar para essa
--     atividade; se não existe e ninguém pediu para abrir, a reserva
--     deixa de apontar para a atividade do agendamento e fica com o tema
--     como texto livre — igual a um registro sem reserva prévia.
--
--   * O "Editar" aceita trocar o tema de qualquer reserva. Trocar solta a
--     reserva da atividade antiga (ou liga à atividade que tem o tema
--     novo, se houver) e NUNCA altera a atividade: ela continua igual
--     para as outras turmas.
--
-- Assinaturas das duas funções não mudam: a tela antiga continua
-- funcionando enquanto a nova não é publicada.

-- --------------------------------------------------------------------
-- 1. Registro de aula realizada
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
  v_escola        public.escolas;
  v_reserva       public.reservas;
  v_horario       public.horarios;
  v_horario_id    uuid;
  v_titulo        text := btrim(coalesce(p_titulo, ''));
  v_professor     text := btrim(coalesce(p_nome_professor, ''));
  v_turma         text := nullif(btrim(coalesce(p_turma, '')), '');
  v_relato        text := nullif(btrim(coalesce(p_relato, '')), '');
  v_descricao     text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_objetivos     text := nullif(btrim(coalesce(p_objetivos, '')), '');
  v_materiais     text := nullif(btrim(coalesce(p_materiais, '')), '');
  v_fotos         text[];
  v_anexada       boolean := false;
  v_tema_agendado text;
  v_hora_ini      time;
  v_hora_fim      time;
  v_aula_id       uuid;
  v_nova_aula     boolean := false;
  v_resumo        text;
  v_ano           smallint;
  v_anos          smallint[];
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
    -- O tema que estava no agendamento, para a tela avisar quando ele
    -- mudou — senão parece que o título digitado foi ignorado.
    select coalesce(a.titulo, v_reserva.aula_livre) into v_tema_agendado
      from (select 1) x
      left join public.aulas a on a.id = v_reserva.aula_id;

    -- A aula aconteceu de verdade: se ainda estava pendente, confirma
    -- junto, porque não faz sentido registrar relato e fotos de uma aula
    -- "aguardando confirmação".
    --
    -- O tema passa a ser o de quem deu a aula. A atividade do catálogo é
    -- decidida logo abaixo, pela mesma régua do registro sem reserva.
    update public.reservas
       set relato         = coalesce(v_relato, relato),
           fotos          = case when array_length(v_fotos, 1) is null then fotos else v_fotos end,
           turma          = coalesce(turma, v_turma),
           status         = 'confirmado',
           aula_livre     = v_titulo,
           aula_objetivos = coalesce(v_objetivos, aula_objetivos),
           aula_materiais = coalesce(v_materiais, aula_materiais)
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

  -- O mesmo tema, escrito com a mesma régua da vitrine: se já existe no
  -- catálogo, a aula entra nele, tenha ou não pedido para abrir.
  select a.id into v_aula_id
    from public.aulas a
   where public._texto_chave(a.titulo) = public._texto_chave(v_titulo)
   order by a.criado_em
   limit 1;

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
  end if;

  -- Sem tema igual no catálogo e sem pedido para abrir, v_aula_id é nulo:
  -- a reserva deixa de apontar para a atividade escolhida no agendamento,
  -- que já não é a aula que aconteceu.
  update public.reservas set aula_id = v_aula_id where id = v_reserva.id returning * into v_reserva;

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
    'reserva_id',    v_reserva.id,
    'protocolo',     v_reserva.protocolo,
    'anexada',       v_anexada,
    'data_aula',     v_reserva.data_aula,
    'hora_inicio',   v_hora_ini,
    'hora_fim',      v_hora_fim,
    'escola_nome',   v_escola.nome,
    'titulo',        coalesce((select a.titulo from public.aulas a where a.id = v_reserva.aula_id),
                              v_titulo),
    -- Só vem preenchido quando o agendamento tinha outro tema.
    'tema_agendado', case
                       when v_tema_agendado is not null
                        and public._texto_chave(v_tema_agendado) is distinct from public._texto_chave(v_titulo)
                       then v_tema_agendado
                     end,
    'fotos',         to_jsonb(v_reserva.fotos),
    'aula_id',       v_aula_id,
    'aula_nova',     v_nova_aula,
    'origem',        v_reserva.origem
  );
end;
$$;

grant execute on function public.admin_importar_aula_realizada(
  text, uuid, uuid, date, text, text, text, text, text[], text, text, text, boolean,
  public.origem_reserva, uuid
) to anon, authenticated;

-- --------------------------------------------------------------------
-- 2. Editar reserva: o tema pode ser trocado em qualquer uma
-- --------------------------------------------------------------------
-- `p_aula_livre` é o tema da aula. Nulo mantém o tema como está (é o que
-- a tela antiga mandava para reserva do catálogo). Preenchido e igual ao
-- tema atual (mesma régua da vitrine), nada muda no vínculo. Diferente:
-- a reserva passa a apontar para a atividade do catálogo com esse tema,
-- se existir, ou fica com o tema como texto livre. A atividade antiga
-- não é tocada.

create or replace function public.admin_atualizar_reserva(
  p_admin_token       text,
  p_reserva_id        uuid,
  p_horario_id        uuid,
  p_data_aula         date,
  p_nome_professor    text,
  p_turma             text default null,
  p_email_contato     text default null,
  p_whatsapp_contato  text default null,
  p_quantidade_alunos smallint default null,
  p_aula_livre        text default null,
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
  v_reserva       public.reservas;
  v_horario_atual public.horarios;
  v_horario_novo  public.horarios;
  v_nome          text := btrim(coalesce(p_nome_professor, ''));
  v_turma         text := nullif(btrim(coalesce(p_turma, '')), '');
  v_email         text := nullif(btrim(lower(coalesce(p_email_contato, ''))), '');
  v_whatsapp      text := nullif(btrim(coalesce(p_whatsapp_contato, '')), '');
  v_livre         text := nullif(btrim(coalesce(p_aula_livre, '')), '');
  v_objetivos     text := nullif(btrim(coalesce(p_aula_objetivos, '')), '');
  v_materiais     text := nullif(btrim(coalesce(p_aula_materiais, '')), '');
  v_tema_atual    text;
  v_aula_id       uuid;
  v_aula_livre    text;
  v_obj_final     text;
  v_mat_final     text;
begin
  perform public._exigir_admin(p_admin_token);

  select * into v_reserva from public.reservas where id = p_reserva_id;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_horario_atual from public.horarios where id = v_reserva.horario_id;

  select * into v_horario_novo from public.horarios where id = p_horario_id;
  if not found then
    raise exception 'Horário não encontrado.' using errcode = 'P0002';
  end if;

  if v_horario_novo.escola_id is distinct from v_horario_atual.escola_id then
    raise exception 'Não é possível mudar a escola por aqui — cancele e registre de novo.'
      using errcode = 'P0004';
  end if;

  if length(v_nome) < 3 then
    raise exception 'Informe o nome do professor responsável.' using errcode = 'P0004';
  end if;

  if p_data_aula is null then
    raise exception 'Escolha a data da aula.' using errcode = 'P0004';
  end if;

  if extract(dow from p_data_aula)::smallint is distinct from v_horario_novo.dia_semana then
    raise exception 'Esta data não cai no dia da semana deste horário.' using errcode = 'P0004';
  end if;

  if not public._email_valido(v_email) then
    raise exception 'O e-mail informado não parece válido.' using errcode = 'P0004';
  end if;

  if v_reserva.aula_id is null and coalesce(v_livre, v_reserva.aula_livre) is null then
    raise exception 'Dê um tema para a aula.' using errcode = 'P0004';
  end if;

  if v_livre is not null and length(v_livre) < 3 then
    raise exception 'O tema da aula precisa de pelo menos 3 letras.' using errcode = 'P0004';
  end if;

  select coalesce(a.titulo, v_reserva.aula_livre) into v_tema_atual
    from (select 1) x
    left join public.aulas a on a.id = v_reserva.aula_id;

  v_aula_id    := v_reserva.aula_id;
  v_aula_livre := v_reserva.aula_livre;
  v_obj_final  := v_reserva.aula_objetivos;
  v_mat_final  := v_reserva.aula_materiais;

  if v_livre is not null then
    if public._texto_chave(v_livre) is distinct from public._texto_chave(v_tema_atual) then
      -- Tema trocado: liga à atividade que já tem esse tema, se houver.
      select a.id into v_aula_id
        from public.aulas a
       where public._texto_chave(a.titulo) = public._texto_chave(v_livre)
       order by a.criado_em
       limit 1;
      -- Sem linha, o `select into` deixa nulo: fica o tema como texto livre.
    end if;
    v_aula_livre := v_livre;
    v_obj_final  := v_objetivos;
    v_mat_final  := v_materiais;
  elsif v_reserva.aula_id is null then
    -- Tela antiga, reserva sem catálogo: comportamento de antes.
    v_obj_final := v_objetivos;
    v_mat_final := v_materiais;
  end if;

  begin
    update public.reservas
       set horario_id        = p_horario_id,
           data_aula          = p_data_aula,
           nome_professor     = v_nome,
           turma              = v_turma,
           email_contato      = v_email,
           whatsapp_contato   = v_whatsapp,
           quantidade_alunos  = p_quantidade_alunos,
           aula_id            = v_aula_id,
           aula_livre         = v_aula_livre,
           aula_objetivos     = v_obj_final,
           aula_materiais     = v_mat_final
     where id = p_reserva_id
    returning * into v_reserva;
  exception when unique_violation then
    raise exception 'Já existe uma reserva ativa desta escola nesta data e horário.'
      using errcode = 'P0005';
  end;

  return to_jsonb(v_reserva);
end;
$$;

grant execute on function public.admin_atualizar_reserva(
  text, uuid, uuid, date, text, text, text, text, smallint, text, text, text
) to anon, authenticated;

select 'Tema da aula realizada e troca de tema no Editar prontos.' as resultado;

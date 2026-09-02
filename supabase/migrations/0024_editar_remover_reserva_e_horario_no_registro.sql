-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 24: editar/remover reserva + horário no registro
--
--   Cole no SQL Editor DEPOIS da 0023. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- Três pedidos na mesma leva:
--
-- 1. A aba "Integradores" ganha editar e remover de verdade. "Remover"
--    apaga a linha (diferente de "Cancelar", que já existia e só marca
--    `cancelado` — continua contando na vitrine de canceladas).
--
-- 2. Bug de verdade em `admin_importar_aula_realizada`: ao procurar uma
--    reserva já existente para anexar o relato, o casamento por nome de
--    professor usava "contém" sem respeitar palavra inteira — "Ana" batia
--    dentro de "Mariana", "Adriana", "Juliana". Uma escola com duas
--    professoras assim no mesmo dia corria o risco de colar o relato (e o
--    horário) na reserva errada.
--
-- 3. "Registrar projeto" e a conferência do Canva passam a aceitar um
--    horário opcional. Sem ele, o banco continua escolhendo sozinho o
--    primeiro tempo livre do dia (como sempre foi) — mas esse "escolher
--    sozinho" não tem como acertar o tempo real da aula quando mais de um
--    horário está livre naquele dia. Foi o que aconteceu com a professora
--    da Rita: aula das 9:20 registrada sem dizer o horário, e o banco
--    pegou o primeiro tempo livre do dia (7:20). Quando a equipe sabe o
--    horário, agora dá para informar e eliminar a dúvida na origem.

-- --------------------------------------------------------------------
-- 1. Casamento por nome de professor respeita palavra inteira
-- --------------------------------------------------------------------
-- "ana" só bate com "mariana silva" se aparecer como palavra própria
-- (separada por espaço ou borda de texto) — nunca como pedaço de outra
-- palavra.

create or replace function public._mesmo_professor(p_nome_a text, p_nome_b text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select v.a = v.b
      or v.a ~ ('(^|[[:space:]])' || v.b || '($|[[:space:]])')
      or v.b ~ ('(^|[[:space:]])' || v.a || '($|[[:space:]])')
    from (select public._texto_chave(p_nome_a) as a, public._texto_chave(p_nome_b) as b) v;
$$;

revoke all on function public._mesmo_professor(text, text) from public, anon, authenticated;

-- --------------------------------------------------------------------
-- 2. Registro retroativo aceita horário opcional
-- --------------------------------------------------------------------

drop function if exists public.admin_importar_aula_realizada(
  text, uuid, uuid, date, text, text, text, text, text[], text, text, text, boolean, public.origem_reserva
);

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
    -- tempos livres — é por isso que agora dá para informar o horário
    -- quando ele é conhecido, em vez de cair nesta escolha.
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

grant execute on function public.admin_importar_aula_realizada(
  text, uuid, uuid, date, text, text, text, text, text[], text, text, text, boolean,
  public.origem_reserva, uuid
) to anon, authenticated;

-- --------------------------------------------------------------------
-- 3. Lista de reservas do painel também devolve o id da aula do catálogo
-- --------------------------------------------------------------------
-- Sem isso a tela não tem como saber se o tema mostrado vem do catálogo
-- (e por isso não deve ser editado ali) ou foi escrito solto na própria
-- reserva — e não tem o `horario_id` para pré-selecionar o horário certo
-- na tela de editar.

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
  horario_id        uuid,
  hora_inicio       time,
  hora_fim          time,
  aula_id           uuid,
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
           r.data_aula, h.id, h.hora_inicio, h.hora_fim,
           r.aula_id, coalesce(a.titulo, r.aula_livre), r.aula_objetivos, r.aula_materiais,
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

-- --------------------------------------------------------------------
-- 4. Painel: editar uma reserva (data, horário, professor, turma, tema
--    livre etc.) — o jeito de corrigir um registro que saiu errado sem
--    precisar apagar e recomeçar.
-- --------------------------------------------------------------------
-- Não deixa mudar de escola por aqui (mudaria também o catálogo de
-- horários envolvido) nem mexer no tema/objetivos/materiais quando a
-- reserva é de uma aula do catálogo (`aula_id` preenchido) — esses dados
-- são da atividade, compartilhados com quem mais já deu a mesma aula.

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

  if v_reserva.aula_id is null and v_livre is not null and length(v_livre) < 3 then
    raise exception 'O tema da aula precisa de pelo menos 3 letras.' using errcode = 'P0004';
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
           aula_livre         = case when aula_id is null then coalesce(v_livre, aula_livre) else aula_livre end,
           aula_objetivos     = case when aula_id is null then v_objetivos else aula_objetivos end,
           aula_materiais     = case when aula_id is null then v_materiais else aula_materiais end
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

-- --------------------------------------------------------------------
-- 5. Painel: remover uma reserva de vez (diferente de cancelar)
-- --------------------------------------------------------------------

create or replace function public.admin_remover_reserva(
  p_admin_token text,
  p_reserva_id  uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  delete from public.reservas where id = p_reserva_id;

  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.admin_remover_reserva(text, uuid) to anon, authenticated;

select 'Editar/remover reserva e horário opcional no registro prontos.' as resultado;

-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 28: professor que cobre uma escola avulsa
--
--   Cole no SQL Editor DEPOIS da 0027. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- A 0027 resolveu o aviso por grupo: quem cobre o W recebe das sete
-- escolas do W. Na hora de cadastrar a equipe de verdade apareceu um
-- caso que o grupo sozinho não descreve — um profissional que atende
-- **só a EMEF Professor Egídio Costa**, que é uma das sete do W.
--
-- Pelo grupo, ou ele recebia as sete, ou não recebia nada. As duas
-- opções estão erradas pelo mesmo motivo: e-mail que não é seu ensina a
-- ignorar, e não receber é o problema que essa história inteira existe
-- para resolver.
--
-- Então a cobertura passa a ter duas partes, somadas:
--
--   grupos  — a rotação (pode ser vazio)
--   escolas — escolas avulsas, fora da rotação (pode ser vazio)
--
-- Quem tem grupo continua igual. Quem cobre uma escola específica marca
-- só a escola. Quem cobre os dois recebe dos dois. Ninguém deixa de
-- receber por causa do formato do cadastro.
--
-- --------------------------------------------------------------------
-- 1. A coluna
-- --------------------------------------------------------------------

alter table public.equipe_wit
  add column if not exists escolas uuid[] not null default '{}';

comment on column public.equipe_wit.escolas is
  'Escolas que este professor cobre ALÉM (ou no lugar) dos grupos dele.
   Para quem atende uma escola específica em vez da rotação inteira.';

-- --------------------------------------------------------------------
-- 2. Quem recebe: grupo OU escola avulsa
-- --------------------------------------------------------------------
-- A regra de fallback da 0027 continua valendo e continua sendo o ponto
-- mais importante da função: se a busca não achar ninguém, o aviso vai
-- para a equipe inteira em vez de sumir.

create or replace function public._destinatarios_da_reserva(p_reserva_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupo  public.grupo_wit;
  v_escola uuid;
  v_lista  text[];
begin
  select e.grupo, e.id into v_grupo, v_escola
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
    join public.escolas  e on e.id = h.escola_id
   where r.id = p_reserva_id;

  -- Uma consulta só para os dois caminhos: pega quem cobre o grupo da
  -- escola e quem cobre aquela escola nominalmente. `or` em vez de duas
  -- buscas porque quem estiver nos dois não pode aparecer duas vezes na
  -- lista — seria o mesmo e-mail duplicado no `to`.
  select array_agg(distinct m.email) into v_lista
    from public.equipe_wit m
   where m.ativo
     and (
       (v_grupo is not null and v_grupo = any (m.grupos))
       or (v_escola is not null and v_escola = any (m.escolas))
     );

  if v_lista is null or cardinality(v_lista) = 0 then
    select array_agg(m.email) into v_lista
      from public.equipe_wit m
     where m.ativo;
  end if;

  return coalesce(v_lista, '{}');
end;
$$;

revoke all on function public._destinatarios_da_reserva(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------------
-- 3. Painel: cadastrar e listar a cobertura por escola
-- --------------------------------------------------------------------

drop function if exists public.admin_listar_equipe(text);

create or replace function public.admin_listar_equipe(p_admin_token text)
returns table (
  id            uuid,
  nome          text,
  email         text,
  grupos        text[],
  escolas       uuid[],
  escolas_nomes text[],
  ativo         boolean,
  criado_em     timestamptz,
  avisos_30dias bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select m.id, m.nome, m.email,
           array(select g::text from unnest(m.grupos) g),
           m.escolas,
           -- O nome junto do id para a tela não precisar cruzar as duas
           -- listas para escrever "cobre a EMEF Tal".
           array(
             select e.nome from public.escolas e
              where e.id = any (m.escolas)
              order by e.nome
           ),
           m.ativo, m.criado_em,
           (select count(*)
              from public.notificacoes n
             where n.status = 'enviado'
               and n.enviado_em > now() - interval '30 days'
               and m.email = any (n.destinatarios))
      from public.equipe_wit m
     order by m.ativo desc, m.nome;
end;
$$;

drop function if exists public.admin_salvar_membro_equipe(text, uuid, text, text, text[], boolean);

create or replace function public.admin_salvar_membro_equipe(
  p_admin_token text,
  p_id          uuid,
  p_nome        text,
  p_email       text,
  p_grupos      text[],
  p_escolas     uuid[],
  p_ativo       boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupos  public.grupo_wit[];
  v_escolas uuid[];
  v_id      uuid;
begin
  perform public._exigir_admin(p_admin_token);

  begin
    select coalesce(array_agg(distinct upper(btrim(g))::public.grupo_wit), '{}')
      into v_grupos
      from unnest(coalesce(p_grupos, '{}')) g
     where btrim(g) <> '';
  exception when invalid_text_representation then
    raise exception 'Grupo inválido: use W, I ou T.';
  end;

  -- Escola que não existe entra como cobertura morta: o professor fica
  -- cadastrado achando que recebe de algum lugar e nunca recebe nada.
  -- Melhor recusar na hora.
  select coalesce(array_agg(distinct x), '{}') into v_escolas
    from unnest(coalesce(p_escolas, '{}')) x;

  if exists (
    select 1 from unnest(v_escolas) x
     where not exists (select 1 from public.escolas e where e.id = x)
  ) then
    raise exception 'Uma das escolas informadas não existe.';
  end if;

  if p_id is null then
    insert into public.equipe_wit (nome, email, grupos, escolas, ativo)
    values (btrim(p_nome), lower(btrim(p_email)), v_grupos, v_escolas, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.equipe_wit
       set nome    = btrim(p_nome),
           email   = lower(btrim(p_email)),
           grupos  = v_grupos,
           escolas = v_escolas,
           ativo   = coalesce(p_ativo, true)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Professor não encontrado.';
    end if;
  end if;

  return jsonb_build_object('id', v_id);
exception
  when unique_violation then
    raise exception 'Já existe alguém na equipe com esse e-mail.';
end;
$$;

grant execute on function public.admin_listar_equipe(text)                                                  to anon, authenticated;
grant execute on function public.admin_salvar_membro_equipe(text, uuid, text, text, text[], uuid[], boolean) to anon, authenticated;

-- --------------------------------------------------------------------
-- 4. Cadastro sem cobertura nenhuma é armadilha silenciosa
-- --------------------------------------------------------------------
-- Sem grupo e sem escola, o professor só receberia de escola que não
-- está alocada na rotação — e hoje todas as 18 estão. Ou seja: ele
-- aparece ativo no painel e não recebe nada, para sempre, sem nenhum
-- erro em lugar nenhum.
--
-- Não vira restrição do banco de propósito (cadastrar primeiro e
-- decidir a cobertura depois é um jeito legítimo de trabalhar); vira
-- aviso na tela, que é onde a pessoa está na hora de resolver.

create or replace function public.admin_equipe_sem_cobertura(p_admin_token text)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
begin
  perform public._exigir_admin(p_admin_token);

  select count(*) into v_total
    from public.equipe_wit m
   where m.ativo
     and cardinality(m.grupos) = 0
     and cardinality(m.escolas) = 0;

  return v_total;
end;
$$;

grant execute on function public.admin_equipe_sem_cobertura(text) to anon, authenticated;

-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 11: buscar habilidade em vez de rolar 1.303
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================

-- --------------------------------------------------------------------
-- Por que
-- --------------------------------------------------------------------
-- Com a BNCC carregada, a lista de habilidades do painel passou a ter
-- 1.303 linhas. Ninguém acha uma rolando isso — e havia um problema pior
-- e silencioso: o PostgREST corta a resposta em mil linhas, então **303
-- habilidades simplesmente não existiam** para quem usava a tela. Nada
-- avisava; elas só não estavam lá.
--
-- Filtrar no navegador não resolve, porque o que foi cortado nunca
-- chegou. A busca tem que acontecer aqui, com limite explícito.

drop function if exists public.listar_habilidades(uuid, smallint);
drop function if exists public.listar_habilidades(uuid, smallint, text, int);

create function public.listar_habilidades(
  p_materia_id uuid     default null,
  p_ano        smallint default null,
  p_busca      text     default null,
  p_limite     int      default 60
)
returns table (
  id         uuid,
  codigo     text,
  descricao  text,
  materia_id uuid,
  ano        smallint,
  -- Quantas atendem ao filtro no total, para a tela poder dizer
  -- "mostrando 60 de 388" em vez de fingir que são só 60.
  total      bigint
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with filtradas as (
    select h.id, h.codigo, h.descricao, h.materia_id, h.ano
      from public.habilidades h
     where (p_materia_id is null or h.materia_id = p_materia_id)
       and (p_ano is null or h.ano = p_ano)
       -- Código combina por prefixo ("EF06" acha o 6º ano inteiro); a
       -- descrição combina sem acento, senão "posicao" não acha
       -- "posição" e o professor conclui que não existe.
       and (
         nullif(btrim(coalesce(p_busca, '')), '') is null
         or h.codigo ilike '%' || btrim(p_busca) || '%'
         or public._texto_chave(h.descricao) like '%' || public._texto_chave(p_busca) || '%'
       )
  )
  select f.*, count(*) over () as total
    from filtradas f
   order by f.codigo
   limit greatest(1, least(coalesce(p_limite, 60), 300));
$$;

grant execute on function public.listar_habilidades(uuid, smallint, text, int) to anon, authenticated;

select 'Busca de habilidades pronta.' as resultado;

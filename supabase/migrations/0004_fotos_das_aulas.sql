-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 4: fotos das aulas
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
-- As fotos entram como lista de URLs, não como arquivo no banco. O
-- painel do WIT não tem login de verdade (é uma senha conferida por
-- RPC), então liberar upload direto pelo navegador exigiria abrir o
-- Storage para o papel anon — qualquer um poderia subir arquivo.
-- Guardar o endereço de uma imagem já hospedada evita esse buraco e
-- funciona com Drive, Instagram ou o próprio Storage do Supabase.
-- =====================================================================

alter table public.reservas add column if not exists fotos text[] not null default '{}';
alter table public.aulas    add column if not exists fotos text[] not null default '{}';

-- --------------------------------------------------------------------
-- Consulta pública passa a devolver as fotos
-- --------------------------------------------------------------------

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
           -- As da própria aula mais as registradas em cada turma que já
           -- fez essa atividade: é o que mostra ao professor o que dá
           -- para fazer na prática.
           'fotos', coalesce((
             select jsonb_agg(f)
               from (
                 select unnest(a.fotos) as f
                 union all
                 select unnest(r.fotos)
                   from public.reservas r
                  where r.aula_id = a.id and r.status = 'confirmado'
               ) t
              where f is not null and btrim(f) <> ''
           ), '[]'::jsonb),
           'vezes_dada', (select count(*) from public.reservas r
                           where r.aula_id = a.id and r.status = 'confirmado'
                             and r.data_aula <= public.hoje_brasil())
         )
    from public.aulas a
    left join public.materias m on m.id = a.materia_id
   where a.id = p_aula_id and a.publicada;
$$;

drop function if exists public.listar_realizadas(uuid, uuid, int);

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
  do_catalogo    boolean,
  fotos          text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.data_aula, e.nome, r.nome_professor, r.turma,
         coalesce(a.titulo, r.aula_livre),
         a.tema, a.resumo, r.relato, m.nome, m.cor, a.id,
         a.id is not null,
         r.fotos
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

-- --------------------------------------------------------------------
-- Painel: registrar as fotos de uma turma
-- --------------------------------------------------------------------

drop function if exists public.admin_registrar_relato(text, uuid, text);

create or replace function public.admin_registrar_relato(
  p_admin_token text,
  p_reserva_id  uuid,
  p_relato      text,
  p_fotos       text[] default null
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
     set relato = nullif(btrim(coalesce(p_relato, '')), ''),
         fotos  = coalesce(
           (select array_agg(btrim(f)) from unnest(coalesce(p_fotos, '{}')) f
             where btrim(f) <> ''),
           '{}'
         )
   where id = p_reserva_id
  returning * into v_reserva;

  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_reserva);
end;
$$;

grant execute on function public.obter_aula(uuid)                              to anon, authenticated;
grant execute on function public.listar_realizadas(uuid, uuid, int)            to anon, authenticated;
grant execute on function public.admin_registrar_relato(text, uuid, text, text[]) to anon, authenticated;

select 'Fotos das aulas habilitadas.' as resultado;

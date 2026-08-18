-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 13: as fotos na lista de reservas do painel
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- `admin_listar_reservas` nunca devolveu a coluna `fotos`, embora a tela
-- do painel já contasse com ela desde a 0004 — a aba de reservas só
-- toca nesse campo em aula confirmada que já aconteceu, e enquanto não
-- houve nenhuma o erro não aparecia. Na aba de integradores, com as
-- canceladas na tela, a página inteira apagava.

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
  ja_aconteceu   boolean
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
           coalesce(a.titulo, r.aula_livre), r.relato, coalesce(r.fotos, '{}'),
           (r.data_aula + h.hora_fim) < public.agora_brasil()
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

-- O panorama escola por escola foi retirado do painel: quem tem projeto
-- reservado aparece na aba de reservas, e quem não tem não aparece.
drop function if exists public.admin_panorama_escolas(text);

select 'Lista de reservas agora devolve as fotos.' as resultado;

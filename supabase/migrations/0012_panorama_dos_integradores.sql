-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 12: panorama dos integradores por escola
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- A aba "Integradores realizados" do painel responde uma pergunta que a
-- lista de reservas não responde: **quais escolas ainda não estão no
-- projeto**. Escola sem nenhuma reserva não tem linha em reserva
-- nenhuma, então ela só aparece se a conta começar pelas escolas — é o
-- que esta função faz, com `left join`, devolvendo as 17 sempre, mesmo
-- as zeradas.
--
-- Contar no banco também evita a armadilha do PostgREST, que corta
-- qualquer resposta em mil linhas: somar no navegador daria números
-- errados sem avisar, no dia em que o histórico passar disso.

drop function if exists public.admin_panorama_escolas(text);

create or replace function public.admin_panorama_escolas(p_admin_token text)
returns table (
  escola_id    uuid,
  escola_nome  text,
  realizadas   bigint,
  agendadas    bigint,
  canceladas   bigint,
  professores  bigint,
  ultima_data  date,
  proxima_data date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
  with linhas as (
    select e.id   as escola_id,
           e.nome as escola_nome,
           r.status,
           r.data_aula,
           r.nome_professor,
           -- Mesma régua da lista de reservas e da vitrine pública: a
           -- aula só virou passado depois do fim do tempo dela.
           (r.data_aula + h.hora_fim) < public.agora_brasil() as ja_aconteceu
      from public.escolas e
      left join public.horarios h on h.escola_id = e.id
      left join public.reservas r on r.horario_id = h.id
  ),
  contas as (
    select l.escola_id,
           l.escola_nome,
           l.status = 'confirmado' and l.ja_aconteceu     as feita,
           l.status = 'confirmado' and not l.ja_aconteceu as marcada,
           l.status = 'cancelado'                         as cancelada,
           l.data_aula,
           l.nome_professor
      from linhas l
  )
  select c.escola_id,
         c.escola_nome,
         count(*) filter (where c.feita),
         count(*) filter (where c.marcada),
         count(*) filter (where c.cancelada),
         count(distinct lower(btrim(c.nome_professor))) filter (where c.feita),
         max(c.data_aula) filter (where c.feita),
         min(c.data_aula) filter (where c.marcada)
    from contas c
   group by c.escola_id, c.escola_nome
   order by c.escola_nome;
end;
$$;

grant execute on function public.admin_panorama_escolas(text) to anon, authenticated;

select 'Panorama dos integradores por escola disponível no painel.' as resultado;

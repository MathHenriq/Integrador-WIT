-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 26: EMEF Prefeito Nestor de Camargo entra no Grupo W
--
--   Cole no SQL Editor DEPOIS da 0025. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- A EMEF Prefeito Nestor de Camargo também é escola de período integral
-- (Grupo W) e ficou de fora quando a `0018` (capacidade) e a `0019`
-- (grade dos tempos 2 e 3) trataram do grupo. Esta migration repete as
-- duas coisas só para ela:
--
--   - capacidade dos horários vai de 20 para 28;
--   - 2ª aula 09:20–10:50 vira 10:00–12:00;
--   - 3ª aula 13:20–14:50 vira 13:00–14:40.
--
-- Mesma busca por pedaço do nome, sem acento e sem caixa, da `0016`/`0018`
-- /`0019` — e mesma garantia de poder rodar de novo sem efeito.

update public.horarios h
   set capacidade = 28
  from public.escolas e
 where h.escola_id = e.id
   and h.capacidade <> 28
   and public._texto_chave(e.nome) like '%nestor de camargo%';

update public.horarios h
   set hora_inicio = '10:00', hora_fim = '12:00'
  from public.escolas e
 where h.escola_id = e.id
   and h.hora_inicio = '09:20'
   and public._texto_chave(e.nome) like '%nestor de camargo%';

update public.horarios h
   set hora_inicio = '13:00', hora_fim = '14:40'
  from public.escolas e
 where h.escola_id = e.id
   and h.hora_inicio = '13:20'
   and public._texto_chave(e.nome) like '%nestor de camargo%';

select e.nome, h.dia_semana, h.hora_inicio, h.hora_fim, h.capacidade
  from public.horarios h
  join public.escolas e on e.id = h.escola_id
 where public._texto_chave(e.nome) like '%nestor de camargo%'
 order by h.dia_semana, h.hora_inicio;

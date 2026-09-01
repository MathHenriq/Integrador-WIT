-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 19: horários das escolas integrais (Grupo W)
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- As escolas de período integral (Grupo W) têm uma grade diferente da
-- padrão nos tempos 2 e 3:
--
--   2ª aula: 09:20–10:50  vira  10:00–12:00
--   3ª aula: 13:20–14:50  vira  13:00–14:40
--
-- Grupo W:
--   Complexo Educacional Professor Carlos Osmarinho de Lima
--   EMEF Professor Ézio Berzaghi
--   EMEF Renato Rosa
--   EMEIEF Professor Eneias Raimundo da Silva
--   EMEF Professor Alfredo do Carmo
--
-- A EMEF Professor Egídio Costa é um caso à parte: só a 3ª aula muda,
-- a 2ª continua no horário padrão (09:20–10:50).
--
-- A busca é pelo horário antigo (`hora_inicio`), então rodar de novo
-- não faz nada: depois da primeira vez, '09:20' e '13:20' não existem
-- mais para essas escolas.

update public.horarios h
   set hora_inicio = '10:00', hora_fim = '12:00'
  from public.escolas e
 where h.escola_id = e.id
   and h.hora_inicio = '09:20'
   and (
     public._texto_chave(e.nome) like '%carlos osmarinho%'
     or public._texto_chave(e.nome) like '%ezio berzaghi%'
     or public._texto_chave(e.nome) like '%renato rosa%'
     or public._texto_chave(e.nome) like '%eneias raimundo%'
     or public._texto_chave(e.nome) like '%alfredo do carmo%'
   );

update public.horarios h
   set hora_inicio = '13:00', hora_fim = '14:40'
  from public.escolas e
 where h.escola_id = e.id
   and h.hora_inicio = '13:20'
   and (
     public._texto_chave(e.nome) like '%carlos osmarinho%'
     or public._texto_chave(e.nome) like '%ezio berzaghi%'
     or public._texto_chave(e.nome) like '%renato rosa%'
     or public._texto_chave(e.nome) like '%eneias raimundo%'
     or public._texto_chave(e.nome) like '%alfredo do carmo%'
     or public._texto_chave(e.nome) like '%egidio costa%'
   );

select e.nome, h.dia_semana, h.hora_inicio, h.hora_fim
  from public.horarios h
  join public.escolas e on e.id = h.escola_id
 where public._texto_chave(e.nome) like '%carlos osmarinho%'
    or public._texto_chave(e.nome) like '%ezio berzaghi%'
    or public._texto_chave(e.nome) like '%renato rosa%'
    or public._texto_chave(e.nome) like '%eneias raimundo%'
    or public._texto_chave(e.nome) like '%alfredo do carmo%'
    or public._texto_chave(e.nome) like '%egidio costa%'
 order by e.nome, h.dia_semana, h.hora_inicio;

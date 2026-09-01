-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 18: capacidade maior em quatro escolas
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- A sala comporta 20 alunos por padrão. Nestas quatro escolas a turma
-- é maior, então a capacidade dos horários passa a ser 28:
--
--   Complexo Educacional Professor Carlos Osmarinho de Lima
--   EMEF Professor Ézio Berzaghi
--   EMEF Renato Rosa
--   EMEIEF Professor Eneias Raimundo da Silva
--
-- Mesma busca por pedaço do nome, sem acento e sem caixa, da `0016` —
-- vale tanto para quem já está com o nome oficial quanto para quem
-- ainda não foi renomeado, e rodar de novo não faz nada.

update public.horarios h
   set capacidade = 28
  from public.escolas e
 where h.escola_id = e.id
   and h.capacidade <> 28
   and (
     public._texto_chave(e.nome) like '%carlos osmarinho%'
     or public._texto_chave(e.nome) like '%ezio berzaghi%'
     or public._texto_chave(e.nome) like '%renato rosa%'
     or public._texto_chave(e.nome) like '%eneias raimundo%'
   );

select e.nome, h.capacidade, count(*)
  from public.horarios h
  join public.escolas e on e.id = h.escola_id
 group by e.nome, h.capacidade
 order by e.nome;

-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 23: completa a grade de todas as escolas
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- Um professor avisou que faltava horário na EMEF Prof. João Tibúrcio
-- Silva Filho (o das 07:20). Em vez de corrigir só essa escola, esta
-- migration confere as 18 e recria qualquer combinação dia/horário que
-- estiver faltando — a regra é "toda escola tem os quatro tempos, de
-- segunda a sexta, e quem tira um horário do ar é o botão Desativar, não
-- um buraco no cadastro".
--
-- Cada escola recebe a grade que já é dela: as cinco do Grupo W (horários
-- diferentes nos tempos 2 e 3, ver `0019`), a Egídio Costa (só o tempo 3
-- diferente) e o padrão nas outras treze. A capacidade também respeita o
-- que já foi definido (28 nas quatro escolas da `0018`, 20 nas demais) —
-- só entra em vigor para o horário que está sendo criado agora; os que já
-- existem não são tocados.
--
-- Mesma busca "sem acento e sem caixa" das migrations anteriores, então
-- roda igual não importa se o nome da escola já foi para o padrão oficial
-- ou não.

with grade_padrao(inicio, fim) as (
  values ('07:20'::time, '08:50'::time),
         ('09:20'::time, '10:50'::time),
         ('13:20'::time, '14:50'::time),
         ('15:20'::time, '16:50'::time)
),
grade_grupo_w(inicio, fim) as (
  values ('07:20'::time, '08:50'::time),
         ('10:00'::time, '12:00'::time),
         ('13:00'::time, '14:40'::time),
         ('15:20'::time, '16:50'::time)
),
grade_egidio(inicio, fim) as (
  values ('07:20'::time, '08:50'::time),
         ('09:20'::time, '10:50'::time),
         ('13:00'::time, '14:40'::time),
         ('15:20'::time, '16:50'::time)
),
grade_por_escola as (
  select e.id as escola_id, g.inicio, g.fim
    from public.escolas e
    cross join grade_grupo_w g
   where public._texto_chave(e.nome) like '%carlos osmarinho%'
      or public._texto_chave(e.nome) like '%ezio berzaghi%'
      or public._texto_chave(e.nome) like '%renato rosa%'
      or public._texto_chave(e.nome) like '%eneias raimundo%'
      or public._texto_chave(e.nome) like '%alfredo do carmo%'
   union all
  select e.id, g.inicio, g.fim
    from public.escolas e
    cross join grade_egidio g
   where public._texto_chave(e.nome) like '%egidio costa%'
   union all
  select e.id, g.inicio, g.fim
    from public.escolas e
    cross join grade_padrao g
   where not (
     public._texto_chave(e.nome) like '%carlos osmarinho%'
     or public._texto_chave(e.nome) like '%ezio berzaghi%'
     or public._texto_chave(e.nome) like '%renato rosa%'
     or public._texto_chave(e.nome) like '%eneias raimundo%'
     or public._texto_chave(e.nome) like '%alfredo do carmo%'
     or public._texto_chave(e.nome) like '%egidio costa%'
   )
)
insert into public.horarios (escola_id, dia_semana, hora_inicio, hora_fim, capacidade)
select ge.escola_id, d.dia, ge.inicio, ge.fim,
       case
         when public._texto_chave(e.nome) like '%carlos osmarinho%'
           or public._texto_chave(e.nome) like '%ezio berzaghi%'
           or public._texto_chave(e.nome) like '%renato rosa%'
           or public._texto_chave(e.nome) like '%eneias raimundo%'
         then 28
         else 20
       end
  from grade_por_escola ge
  join public.escolas e on e.id = ge.escola_id
  cross join generate_series(1, 5) as d(dia)
 where not exists (
   select 1 from public.horarios h
    where h.escola_id = ge.escola_id
      and h.dia_semana = d.dia
      and h.hora_inicio = ge.inicio
 );

-- Conferência: cada escola devia aparecer com 20 linhas (4 tempos × 5
-- dias). Menos que isso é porque algum horário está com hora_inicio fora
-- dos quatro esperados (então caiu fora do "not exists" acima e merece
-- olhar à mão) — não é o caso de nenhuma das 18 hoje.
select e.nome, count(*) as horarios_cadastrados
  from public.escolas e
  join public.horarios h on h.escola_id = e.id
 group by e.nome
 order by e.nome;

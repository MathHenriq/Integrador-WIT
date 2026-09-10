-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 27: a quinta da Alfredo do Carmo vira dois tempos
--
--   Cole no SQL Editor DEPOIS da 0026. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- A `0026` gravou a tarde de quinta da EMEF Professor Alfredo do Carmo
-- como um bloco só, 15:00–18:00. Três horas seguidas viram um horário
-- único no site: o primeiro professor que reservasse trancava a tarde
-- inteira, e o segundo via "Reservada" mesmo com a sala livre da metade
-- em diante.
--
-- Então o bloco vira dois tempos de 1h30 — a mesma duração dos tempos
-- padrão da rede (07:20–08:50 e companhia):
--
--   quinta   15:00–16:30   16:30–18:00
--
-- O tempo que já existe é encurtado em vez de apagado e recriado: se
-- alguém já tiver reservado a tarde de quinta, a reserva continua de pé,
-- agora na primeira metade.
--
-- Rodar de novo não faz nada: o update procura o bloco de três horas
-- (`hora_fim = '18:00'`), que depois da primeira passagem não existe
-- mais, e o insert só entra se o segundo tempo estiver faltando.

update public.horarios h
   set hora_fim = '16:30'
  from public.escolas e
 where h.escola_id = e.id
   and public._texto_chave(e.nome) like '%alfredo do carmo%'
   and h.dia_semana = 4
   and h.hora_inicio = '15:00'
   and h.hora_fim = '18:00';

insert into public.horarios (escola_id, dia_semana, hora_inicio, hora_fim, capacidade)
select e.id, 4, '16:30', '18:00',
       coalesce(
         (select max(h.capacidade) from public.horarios h where h.escola_id = e.id),
         20
       )
  from public.escolas e
 where public._texto_chave(e.nome) like '%alfredo do carmo%'
   and not exists (
     select 1 from public.horarios h
      where h.escola_id = e.id
        and h.dia_semana = 4
        and h.hora_inicio = '16:30'
   );

-- Conferência: a quinta (dia_semana = 4) agora sai com três linhas —
-- 08:00–09:00, 15:00–16:30 e 16:30–18:00 — e a semana toda com dez.
select h.dia_semana, h.hora_inicio, h.hora_fim, h.capacidade, h.ativo,
       (select count(*) from public.reservas r where r.horario_id = h.id) as reservas
  from public.horarios h
  join public.escolas e on e.id = h.escola_id
 where public._texto_chave(e.nome) like '%alfredo do carmo%'
 order by h.ativo desc, h.dia_semana, h.hora_inicio;

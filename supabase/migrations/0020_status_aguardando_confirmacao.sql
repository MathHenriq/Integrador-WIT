-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 20: novo status de reserva — passo 1 de 2
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- Preparação para a `0021`: quando o professor da escola agenda pelo
-- site, a reserva vai passar a nascer "aguardando confirmação da equipe
-- WIT" em vez de já nascer confirmada — é o professor do dia que precisa
-- entrar em contato, entender a aula e só então confirmar pelo painel.
--
-- O Postgres não deixa usar um valor de enum recém-criado na mesma
-- transação em que ele foi adicionado, então este passo fica sozinho
-- neste arquivo. A `0021` é quem de fato usa o valor novo nas funções e
-- nas constraints.

alter type public.status_reserva add value if not exists 'aguardando_confirmacao';

select 'Valor novo do enum pronto. Continue na 0021.' as resultado;

-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 27: grade real de segunda-feira da Nestor de Camargo
--
--   Cole no SQL Editor DEPOIS da 0026. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- A grade padrão do Grupo W (aplicada pela `0019`/`0026`) não bate com o
-- horário real da EMEF Prefeito Nestor de Camargo às segundas-feiras:
-- nesse dia ela tem 5 tempos, em horários próprios, diferentes até da
-- grade integral padrão. Só a segunda-feira muda — de terça a sexta a
-- escola continua na grade do Grupo W.
--
-- Segunda-feira da Nestor de Camargo:
--
--   07:20 – 08:50
--   10:20 – 12:00
--   13:00 – 14:40
--   15:00 – 16:00
--   16:10 – 17:30
--
-- Apaga os horários de segunda que não batem com nenhum desses cinco (só
-- quando não têm reserva presa) e insere os que ainda faltam. Roda de
-- novo sem efeito, porque depois da primeira vez os horários de segunda
-- já são exatamente esses cinco.

do $$
declare
  v_escola_id uuid;
begin
  select id into v_escola_id
    from public.escolas
   where public._texto_chave(nome) like '%nestor de camargo%'
   limit 1;

  if v_escola_id is null then
    raise notice 'EMEF Prefeito Nestor de Camargo não encontrada — nada para ajustar.';
    return;
  end if;

  delete from public.horarios h
   where h.escola_id = v_escola_id
     and h.dia_semana = 1
     and (h.hora_inicio, h.hora_fim) not in (
       ('07:20', '08:50'),
       ('10:20', '12:00'),
       ('13:00', '14:40'),
       ('15:00', '16:00'),
       ('16:10', '17:30')
     )
     and not exists (select 1 from public.reservas r where r.horario_id = h.id);

  insert into public.horarios (escola_id, dia_semana, hora_inicio, hora_fim, capacidade)
  select v_escola_id, 1, f.inicio::time, f.fim::time, 28
    from (values
      ('07:20', '08:50'),
      ('10:20', '12:00'),
      ('13:00', '14:40'),
      ('15:00', '16:00'),
      ('16:10', '17:30')
    ) as f(inicio, fim)
   where not exists (
     select 1 from public.horarios h
      where h.escola_id = v_escola_id
        and h.dia_semana = 1
        and h.hora_inicio = f.inicio::time
   );

  update public.horarios h
     set capacidade = 28
   where h.escola_id = v_escola_id
     and h.dia_semana = 1
     and h.capacidade <> 28;
end $$;

select h.dia_semana, h.hora_inicio, h.hora_fim, h.capacidade
  from public.horarios h
  join public.escolas e on e.id = h.escola_id
 where public._texto_chave(e.nome) like '%nestor de camargo%'
 order by h.dia_semana, h.hora_inicio;

-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 26: grade própria da EMEF Professor Alfredo do Carmo
--
--   Cole no SQL Editor DEPOIS da 0025. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- A escola informou a grade real da sala do Núcleo lá, e ela não é a do
-- Grupo W (nem a padrão): muda de dia para dia, tem dia com um tempo só
-- e blocos de duração diferente.
--
--   segunda  08:00–09:00
--   terça    08:00–09:00   16:00–17:00
--   quarta   11:00–12:00   15:00–16:00
--   quinta   08:00–09:00   15:00–18:00
--   sexta    08:00–09:00   15:00–17:00
--
-- São nove tempos, não os vinte que a `0023` criou para ela. Então esta
-- migration faz, nesta ordem:
--
--   1. cria o que falta da grade nova (e alinha a hora de término de um
--      tempo que já exista no mesmo dia e mesma hora de início);
--   2. apaga os tempos antigos que sobraram e nunca foram reservados;
--   3. desativa — em vez de apagar — os que sobraram mas têm reserva,
--      porque apagar o horário levaria a reserva junto (`on delete
--      cascade`) e sumiria com o histórico da aula.
--
-- Depois do passo 1 não há mais o que criar, e depois dos passos 2 e 3
-- não sobra tempo antigo para tratar: rodar de novo não muda nada.
--
-- Tudo num bloco só porque a grade fica numa tabela temporária, para não
-- repetir a lista de horários em cada passo — é ela que define o que é
-- "tempo da grade nova" e o que é sobra do cadastro antigo.
--
-- A busca pelo nome é a mesma "sem acento e sem caixa" das migrations
-- anteriores (`_texto_chave`, ver `0016`).

do $$
begin
  create temporary table grade_alfredo (
    dia    smallint not null,
    inicio time not null,
    fim    time not null
  ) on commit drop;

  -- 1 = segunda ... 5 = sexta (mesma numeração do Date.getDay() do JS).
  insert into grade_alfredo (dia, inicio, fim) values
    (1, '08:00', '09:00'),
    (2, '08:00', '09:00'),
    (2, '16:00', '17:00'),
    (3, '11:00', '12:00'),
    (3, '15:00', '16:00'),
    (4, '08:00', '09:00'),
    (4, '15:00', '18:00'),
    (5, '08:00', '09:00'),
    (5, '15:00', '17:00');

  -- ------------------------------------------------------------------
  -- 1. A grade nova
  -- ------------------------------------------------------------------

  -- Capacidade: a que a escola já usa nos tempos dela. O valor fixo só
  -- vale se ela estiver sem nenhum horário cadastrado.
  insert into public.horarios (escola_id, dia_semana, hora_inicio, hora_fim, capacidade)
  select e.id, g.dia, g.inicio, g.fim,
         coalesce(
           (select max(h.capacidade) from public.horarios h where h.escola_id = e.id),
           20
         )
    from public.escolas e
    cross join grade_alfredo g
   where public._texto_chave(e.nome) like '%alfredo do carmo%'
     and not exists (
       select 1 from public.horarios h
        where h.escola_id = e.id
          and h.dia_semana = g.dia
          and h.hora_inicio = g.inicio
     );

  -- Mesmo dia e mesma hora de início, término diferente (ou desativado
  -- numa passagem anterior): alinha com a grade nova.
  update public.horarios h
     set hora_fim = g.fim,
         ativo = true
    from public.escolas e, grade_alfredo g
   where h.escola_id = e.id
     and public._texto_chave(e.nome) like '%alfredo do carmo%'
     and h.dia_semana = g.dia
     and h.hora_inicio = g.inicio
     and (h.hora_fim is distinct from g.fim or not h.ativo);

  -- ------------------------------------------------------------------
  -- 2. Os tempos antigos sem reserva nenhuma: fora do cadastro
  -- ------------------------------------------------------------------

  delete from public.horarios h
   using public.escolas e
   where h.escola_id = e.id
     and public._texto_chave(e.nome) like '%alfredo do carmo%'
     and not exists (
       select 1 from grade_alfredo g
        where g.dia = h.dia_semana and g.inicio = h.hora_inicio
     )
     and not exists (
       select 1 from public.reservas r where r.horario_id = h.id
     );

  -- ------------------------------------------------------------------
  -- 3. Os tempos antigos que já foram usados: só saem do calendário
  -- ------------------------------------------------------------------

  update public.horarios h
     set ativo = false
    from public.escolas e
   where h.escola_id = e.id
     and public._texto_chave(e.nome) like '%alfredo do carmo%'
     and h.ativo
     and not exists (
       select 1 from grade_alfredo g
        where g.dia = h.dia_semana and g.inicio = h.hora_inicio
     );
end;
$$;

-- Conferência: devem sair nove linhas ativas, exatamente as da grade
-- acima. Linha com `ativo = false` é tempo antigo preservado por causa
-- de reserva já registrada — o histórico continua, mas ninguém consegue
-- agendar nele.
select e.nome, h.dia_semana, h.hora_inicio, h.hora_fim, h.capacidade, h.ativo,
       (select count(*) from public.reservas r where r.horario_id = h.id) as reservas
  from public.horarios h
  join public.escolas e on e.id = h.escola_id
 where public._texto_chave(e.nome) like '%alfredo do carmo%'
 order by h.ativo desc, h.dia_semana, h.hora_inicio;

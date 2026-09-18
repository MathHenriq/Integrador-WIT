-- =====================================================================
-- 0030 · Aula já relatada entra na vitrine na hora
-- =====================================================================
-- A vitrine mostrava a aula só depois que o horário dela terminava
-- (`data_aula + hora_fim < agora`). A regra existe por um motivo certo:
-- uma reserva marcada para sexta não pode aparecer como "realizada" na
-- quarta.
--
-- Só que ela também pegava o registro retroativo do mesmo dia. A aula era
-- às 13:20, o profissional registrava 14:10, a tela dizia "Projeto
-- registrado" e oferecia "Ver na vitrine" — e a aula não estava lá até as
-- 14:50. Some sem ter sumido, e quem registrou não tem como saber disso.
--
-- O que separa um caso do outro não é o relógio: é ter relato ou foto.
-- Ninguém escreve o relato de uma aula que ainda não aconteceu — a própria
-- `admin_importar_aula_realizada` recusa data no futuro. Então: entra na
-- vitrine a aula cujo tempo já passou **ou** a que já foi relatada, desde
-- que a data não seja no futuro. Reserva agendada continua de fora, que é
-- o que a regra antiga protegia.
-- =====================================================================

create or replace function public.listar_realizadas(
  p_materia_id uuid default null,
  p_escola_id  uuid default null,
  p_limite     int default 60
)
returns table (
  id             uuid,
  data_aula      date,
  escola_nome    text,
  nome_professor text,
  turma          text,
  titulo         text,
  tema           text,
  resumo         text,
  relato         text,
  materia_nome   text,
  materia_cor    text,
  aula_id        uuid,
  do_catalogo    boolean,
  fotos          text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.data_aula, e.nome, r.nome_professor, r.turma,
         coalesce(a.titulo, r.aula_livre),
         a.tema, a.resumo, r.relato, m.nome, m.cor, a.id,
         a.id is not null,
         r.fotos
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
    join public.escolas  e on e.id = h.escola_id
    left join public.aulas    a on a.id = r.aula_id
    left join public.materias m on m.id = a.materia_id
   where r.status = 'confirmado'
     and (
       (r.data_aula + h.hora_fim) < public.agora_brasil()
       or (
         r.data_aula <= public.hoje_brasil()
         and (r.relato is not null or coalesce(array_length(r.fotos, 1), 0) > 0)
       )
     )
     and (p_materia_id is null or a.materia_id = p_materia_id)
     and (p_escola_id is null or e.id = p_escola_id)
   order by r.data_aula desc
   limit greatest(1, least(coalesce(p_limite, 60), 200));
$$;

grant execute on function public.listar_realizadas(uuid, uuid, int) to anon, authenticated;

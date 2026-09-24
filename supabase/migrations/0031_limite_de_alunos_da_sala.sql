-- =====================================================================
-- 0031 · Limite de alunos da sala, por escola
-- =====================================================================
-- A sala do Núcleo na EMEF Professor Egídio Costa só comporta 16 alunos.
-- O agendamento pelo site continua igual; só passa a recusar turma maior
-- que isso.
--
-- Por que não `horarios.capacidade`: aquele número nunca foi limite de
-- turma parceira (há reserva de 35 alunos num horário de capacidade 20) e
-- conta junto os alunos do próprio Núcleo (`ocupacao_wit`), com uma check
-- que impede baixá-lo abaixo deles — na Egídio há horário com 18. São
-- coisas diferentes, então ficam em lugares diferentes.
--
-- `escolas.limite_alunos` nulo = sem limite, que é o caso das outras 17.
--
-- O limite só vale para o agendamento público (`origem = 'escola'`, no
-- insert). Não vale para:
--   - registro da equipe (aula que já aconteceu — descreve o passado);
--   - edição no painel (as reservas que já existem acima do limite
--     continuam como estão, e a equipe pode corrigi-las sem tropeçar).
-- =====================================================================

alter table public.escolas add column if not exists limite_alunos smallint;

do $$
begin
  alter table public.escolas add constraint escolas_limite_alunos_positivo
    check (limite_alunos is null or limite_alunos > 0);
exception when duplicate_object then null;
end $$;

comment on column public.escolas.limite_alunos is
  'Quantos alunos cabem na sala do Núcleo nesta escola. Nulo = sem limite. '
  'Só barra o agendamento pelo site.';

update public.escolas
   set limite_alunos = 16
 where nome = 'EMEF Professor Egídio Costa';

-- ---------------------------------------------------------------------
-- A regra fica num trigger, não dentro de `agendar`: assim ela vale para
-- qualquer caminho que crie reserva pelo site, sem copiar a função
-- inteira só para acrescentar um if.
-- ---------------------------------------------------------------------

create or replace function public._reserva_respeita_limite_de_alunos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite smallint;
begin
  if new.origem is distinct from 'escola' or new.quantidade_alunos is null then
    return new;
  end if;

  select e.limite_alunos into v_limite
    from public.horarios h
    join public.escolas e on e.id = h.escola_id
   where h.id = new.horario_id;

  if v_limite is not null and new.quantidade_alunos > v_limite then
    raise exception 'A sala do Núcleo WIT nesta escola comporta até % alunos.', v_limite
      using errcode = 'P0004';
  end if;

  return new;
end;
$$;

drop trigger if exists reservas_limite_de_alunos on public.reservas;
create trigger reservas_limite_de_alunos
  before insert on public.reservas
  for each row execute function public._reserva_respeita_limite_de_alunos();

-- ---------------------------------------------------------------------
-- O site precisa saber o limite para avisar antes de enviar.
-- ---------------------------------------------------------------------

create or replace function public.contexto_publico()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'hoje',               public.hoje_brasil(),
    'limite_agendamento', public.limite_agendamento(),
    'escolas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome,
                                          'limite_alunos', e.limite_alunos)
                       order by e.nome)
        from public.escolas e
       where exists (select 1 from public.horarios h where h.escola_id = e.id and h.ativo)
    ), '[]'::jsonb),
    'materias', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'cor', m.cor)
                       order by m.ordem, m.nome)
        from public.materias m
    ), '[]'::jsonb)
  );
$$;

select nome, limite_alunos from public.escolas where limite_alunos is not null;

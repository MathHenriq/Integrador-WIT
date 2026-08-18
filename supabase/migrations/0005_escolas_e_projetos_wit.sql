-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 5: as escolas e a matéria "Projetos WIT"
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================

-- --------------------------------------------------------------------
-- Escolas atendidas
-- --------------------------------------------------------------------
-- Nomes exatamente como na relação oficial — os mesmos que a `0016`
-- acertou no banco que já estava rodando. `on conflict` não serve aqui
-- porque `nome` não é único na tabela: a checagem é pelo not exists.

insert into public.escolas (nome)
select nome from (values
  ('EMEF Renato Rosa'),
  ('EMEF Prefeito Nestor de Camargo'),
  ('EMEF Professor Ézio Berzaghi'),
  ('EMEIEF Professor Eneias Raimundo da Silva'),
  ('Complexo Educacional Professor Carlos Osmarinho de Lima'),
  ('EMEF Professor Alfredo do Carmo'),
  ('EMEF Professor Egídio Costa'),
  ('EMEF Francisco Zacarioto'),
  ('EMEF Rita de Jesus'),
  ('EMEF Professora Dalva Fogaça'),
  ('EMEF Prof. João Tibúrcio Silva Filho'),
  ('EMEIEF Anna Irene Mazaro de Freitas'),
  ('EMEIEF Benedito Adherbal Farbo'),
  ('EMEF Armando Cavazza'),
  ('EMEIEF Vereadora Elisabet Titto'),
  ('EMEIEF José Emidio de Aguiar'),
  ('EMEF Professora Maria Medunekas'),
  ('EMEF Júlio Gomes Camisão')
) as t(nome)
where not exists (select 1 from public.escolas e where e.nome = t.nome);

-- --------------------------------------------------------------------
-- Grade padrão: segunda a sexta, nos quatro tempos da sala
-- --------------------------------------------------------------------

insert into public.horarios (escola_id, dia_semana, hora_inicio, hora_fim, capacidade)
select e.id, d.dia, f.inicio::time, f.fim::time, 20
  from public.escolas e
  cross join generate_series(1, 5) as d(dia)
  cross join (values
    ('07:20', '08:50'),
    ('09:20', '10:50'),
    ('13:20', '14:50'),
    ('15:20', '16:50')
  ) as f(inicio, fim)
 where not exists (
   select 1 from public.horarios h
    where h.escola_id = e.id
      and h.dia_semana = d.dia
      and h.hora_inicio = f.inicio::time
 );

-- --------------------------------------------------------------------
-- "Projeto Integrador" vira "Projetos WIT"
-- --------------------------------------------------------------------
-- O Projeto Integrador é o programa inteiro, não uma matéria. A caixa
-- que agrupa as atividades próprias do Núcleo (câmera, VR, controles,
-- IA, Alexa) passa a se chamar Projetos WIT.

update public.materias
   set nome = 'Projetos WIT'
 where nome = 'Projeto Integrador'
   and not exists (select 1 from public.materias m2 where m2.nome = 'Projetos WIT');

insert into public.materias (nome, cor, ordem)
select 'Projetos WIT', '#00C46A', 5
where not exists (select 1 from public.materias where nome = 'Projetos WIT');

-- Ela abre a lista: é a cara do Núcleo.
update public.materias set ordem = 5 where nome = 'Projetos WIT';

select
  (select count(*) from public.escolas)  as escolas,
  (select count(*) from public.horarios) as horarios,
  'Escolas e grade padrão prontas.'      as resultado;

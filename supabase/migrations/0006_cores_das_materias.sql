-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 6: uma cor para cada matéria
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================

-- --------------------------------------------------------------------
-- Por que
-- --------------------------------------------------------------------
-- Todas as matérias nasceram com tons de verde, o que fazia os cartões
-- do catálogo virarem uma parede verde só. Na cabeça de quem usa, cada
-- matéria tem a sua cor — matemática é azul, ciências é verde — e essa
-- associação acha a matéria mais rápido do que ler o nome.
--
-- O site aplica esta mesma paleta pelo nome da matéria, então a tela já
-- fica certa mesmo sem rodar isto. Esta migration serve para o banco não
-- discordar da tela: é o que o painel da equipe mostra ao editar.

update public.materias set cor = case
  when nome ilike '%portugu%'                          then '#d62828'
  when nome ilike '%matem%'                            then '#2563eb'
  when nome ilike '%ci_ncia%' or nome ilike '%ciencia%' then '#00a651'
  when nome ilike '%hist%'                             then '#b45309'
  when nome ilike '%geograf%'                          then '#0d9488'
  when nome ilike '%arte%'                             then '#db2777'
  when nome ilike '%f_sica%' or nome ilike '%fisica%'  then '#f77f00'
  when nome ilike '%ingl%'                             then '#7c3aed'
  when nome ilike '%projetos wit%'
    or nome ilike '%integrador%'                       then '#a6ce39'
  else cor
end
where cor is distinct from case
  when nome ilike '%portugu%'                          then '#d62828'
  when nome ilike '%matem%'                            then '#2563eb'
  when nome ilike '%ci_ncia%' or nome ilike '%ciencia%' then '#00a651'
  when nome ilike '%hist%'                             then '#b45309'
  when nome ilike '%geograf%'                          then '#0d9488'
  when nome ilike '%arte%'                             then '#db2777'
  when nome ilike '%f_sica%' or nome ilike '%fisica%'  then '#f77f00'
  when nome ilike '%ingl%'                             then '#7c3aed'
  when nome ilike '%projetos wit%'
    or nome ilike '%integrador%'                       then '#a6ce39'
  else cor
end;

select nome, cor from public.materias order by ordem, nome;

-- =====================================================================
-- 0032 · Limite de alunos da sala da Egídio Costa passa de 16 para 20
-- =====================================================================
-- Decisão da equipe. Só a EMEF Professor Egídio Costa tinha limite (0031);
-- o `where` pega qualquer escola que ainda esteja em 16, para a migration
-- continuar certa se for reexecutada.
-- =====================================================================

update public.escolas
   set limite_alunos = 20
 where limite_alunos = 16;

select nome, limite_alunos from public.escolas where limite_alunos is not null;

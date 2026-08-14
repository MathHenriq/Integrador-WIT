-- =====================================================================
-- Projeto Integrador - Núcleo WIT
-- Migration 0003: primeiro token de administração
-- =====================================================================
-- Não existe tela de cadastro de admin: o token nasce aqui, por SQL.
-- Rode esta migration uma vez e guarde o token retornado — ele é a
-- senha do painel /admin.
--
--   select token from public.admin_tokens;
--
-- Para revogar o acesso de alguém, apague a linha correspondente e crie
-- outra:
--
--   delete from public.admin_tokens where descricao = 'Núcleo WIT - admin inicial';
--   insert into public.admin_tokens (descricao) values ('Núcleo WIT - admin novo');
-- =====================================================================

insert into public.admin_tokens (descricao)
select 'Núcleo WIT - admin inicial'
where not exists (select 1 from public.admin_tokens);

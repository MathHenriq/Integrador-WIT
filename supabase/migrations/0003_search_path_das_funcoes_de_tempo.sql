-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 3: fixa o search_path das funções auxiliares
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
-- Quatro funções nasceram sem `set search_path`. Todas as outras já
-- tinham. Sem isso, um nome não qualificado dentro do corpo é resolvido
-- pelo search_path de quem chama, e não pelo da função — e essas quatro
-- são chamadas de dentro de funções SECURITY DEFINER.
--
-- O corpo delas só usa builtins, então o risco concreto é baixo; a
-- correção é barata e tira a inconsistência (o linter do Supabase
-- apontava as quatro).
-- =====================================================================

create or replace function public.hoje_brasil()
returns date
language sql
stable
set search_path = pg_catalog, pg_temp
as $$ select (now() at time zone 'America/Sao_Paulo')::date; $$;

create or replace function public.agora_brasil()
returns timestamp
language sql
stable
set search_path = pg_catalog, pg_temp
as $$ select (now() at time zone 'America/Sao_Paulo'); $$;

create or replace function public.limite_agendamento()
returns date
language sql
stable
set search_path = public, pg_catalog, pg_temp
as $$ select (public.hoje_brasil() + interval '12 months')::date; $$;

create or replace function public._email_valido(p_email text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_email is null or p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
$$;

-- Os grants se perdem no replace quando a função é recriada; estas três
-- são internas e continuam fora do alcance do anon.
revoke all on function public.hoje_brasil()        from public, anon, authenticated;
revoke all on function public.agora_brasil()       from public, anon, authenticated;
revoke all on function public.limite_agendamento() from public, anon, authenticated;
revoke all on function public._email_valido(text)  from public, anon, authenticated;

select 'search_path fixado nas 4 funções auxiliares.' as resultado;

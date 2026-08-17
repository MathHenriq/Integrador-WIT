-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 7: importar a BNCC de uma vez
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================

-- --------------------------------------------------------------------
-- Por que
-- --------------------------------------------------------------------
-- Cadastrar habilidade a habilidade é inviável: o Ensino Fundamental tem
-- mais de mil. Esta função recebe a lista inteira colada de uma vez.
--
-- O código da BNCC já diz o ano e o componente, então não há o que
-- escolher na mão:
--
--     EF06MA01  ->  6º ano, Matemática
--     EF35LP12  ->  3º ao 5º ano (ano fica nulo), Língua Portuguesa
--     EF69AR03  ->  6º ao 9º ano (ano fica nulo), Arte
--
-- Quando os dois dígitos são "0X" é um ano só; quando são diferentes é
-- uma faixa, e aí `ano` fica nulo de propósito — a habilidade vale para
-- todos os anos da faixa, e gravar só o primeiro seria mentira.

create or replace function public._materia_da_sigla(p_sigla text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.materias
   where nome ilike case upper(p_sigla)
     -- `ilike` ignora a caixa mas NÃO ignora o acento: '%fisica%' não
     -- encontra "Educação Física". Onde cai acento, entra `_`.
     when 'LP' then '%portugu%'
     when 'MA' then '%matem%'
     when 'CI' then '%ci_ncia%'
     when 'HI' then '%hist%'
     when 'GE' then '%geograf%'
     when 'AR' then '%arte%'
     when 'EF' then '%f_sica%'
     when 'LI' then '%ingl%'
     when 'ER' then '%religi%'
     else 'zzz-sigla-desconhecida'
   end
   order by ordem, nome
   limit 1;
$$;

-- --------------------------------------------------------------------
-- A importação
-- --------------------------------------------------------------------
-- Recebe pares código/descrição já separados pelo site. Devolve quantas
-- entraram, quantas foram atualizadas e quais linhas não deu para ler,
-- para a equipe conferir em vez de descobrir depois que faltou coisa.

drop function if exists public.admin_importar_habilidades(text, text[], text[]);

create function public.admin_importar_habilidades(
  p_admin_token text,
  p_codigos     text[],
  p_descricoes  text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo    text;
  v_descricao text;
  v_sigla     text;
  v_digitos   text;
  v_ano       smallint;
  v_inserida  boolean;
  v_novas     int := 0;
  v_alteradas int := 0;
  v_ignoradas text[] := '{}';
  i           int;
begin
  perform public._exigir_admin(p_admin_token);

  if p_codigos is null or array_length(p_codigos, 1) is null then
    raise exception 'Cole a lista de habilidades antes de importar.' using errcode = 'P0004';
  end if;

  if array_length(p_codigos, 1) <> array_length(p_descricoes, 1) then
    raise exception 'Lista inconsistente: sobrou código sem descrição.' using errcode = 'P0004';
  end if;

  for i in 1 .. array_length(p_codigos, 1) loop
    v_codigo    := upper(btrim(p_codigos[i]));
    v_descricao := btrim(p_descricoes[i]);

    -- Código fora do formato da BNCC ou descrição curta demais entram na
    -- lista de ignoradas em vez de derrubar a importação inteira.
    if v_codigo !~ '^EF[0-9]{2}[A-Z]{2}[0-9]{2}$' or length(v_descricao) < 10 then
      v_ignoradas := v_ignoradas || v_codigo;
      continue;
    end if;

    v_digitos := substring(v_codigo from 3 for 2);
    v_sigla   := substring(v_codigo from 5 for 2);

    v_ano := case
      when left(v_digitos, 1) = '0' then right(v_digitos, 1)::smallint
      else null
    end;

    insert into public.habilidades (codigo, descricao, materia_id, ano)
    values (v_codigo, v_descricao, public._materia_da_sigla(v_sigla), v_ano)
    on conflict (codigo) do update
      set descricao  = excluded.descricao,
          materia_id = coalesce(excluded.materia_id, public.habilidades.materia_id),
          ano        = excluded.ano
    -- `xmax = 0` é o jeito de o próprio upsert dizer se inseriu ou
    -- atualizou, sem uma consulta extra por linha.
    returning (xmax = 0) into v_inserida;

    if v_inserida then
      v_novas := v_novas + 1;
    else
      v_alteradas := v_alteradas + 1;
    end if;

  end loop;

  return jsonb_build_object(
    'novas',     v_novas,
    'alteradas', v_alteradas,
    'ignoradas', to_jsonb(v_ignoradas)
  );
end;
$$;

revoke all on function public.admin_importar_habilidades(text, text[], text[]) from public;
grant execute on function public.admin_importar_habilidades(text, text[], text[]) to anon, authenticated;
revoke all on function public._materia_da_sigla(text) from public, anon, authenticated;

select 'Importação de habilidades pronta.' as resultado;

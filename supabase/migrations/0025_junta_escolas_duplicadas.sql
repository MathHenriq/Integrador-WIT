-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 25: junta escolas duplicadas
--
--   Cole no SQL Editor DEPOIS da 0024. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- Um coordenador percebeu duas linhas iguais para a mesma escola (a
-- "EMEF Prefeito Nestor de Camargo" estava duplicada). A causa é
-- estrutural: `escolas.nome` nunca foi único na tabela (ver comentário da
-- `0005`), e nem `admin_criar_escola` nem `admin_renomear_escola`
-- checavam se já existia uma escola com aquele nome antes de gravar — só
-- faltava alguém clicar em "Criar escola" duas vezes, ou digitar o nome
-- de novo sem perceber que já existia, para nascer uma duplicata.
--
-- Esta migration faz duas coisas:
--
-- 1. Funde qualquer escola cujo nome bata (sem acento e sem caixa, mesma
--    regra da `0016`) com outra: a mais antiga fica valendo, os horários
--    e reservas da(s) outra(s) migram para ela, e a duplicata é apagada.
--    Se as duas linhas tiverem reserva ativa no mesmo horário/data (caso
--    raríssimo — teria que ter dado choque em duas mesmo com o horário
--    "ocupado" nos dois lados), a reserva presa fica onde está e a
--    duplicata não é apagada, com um aviso para olhar à mão.
--
-- 2. Fecha a porta que deixou isso acontecer: `admin_criar_escola` e
--    `admin_renomear_escola` passam a recusar um nome que já existe
--    (mesma comparação sem acento/caixa), e o banco ganha um índice
--    único nessa mesma comparação — depois da fusão acima, para não
--    falhar por causa de duplicata que ainda exista.

-- --------------------------------------------------------------------
-- 1. Funde as duplicatas que já existem
-- --------------------------------------------------------------------

do $$
declare
  v_grupo   record;
  v_keeper  public.escolas;
  v_loser   record;
  v_horario record;
  v_alvo    public.horarios;
  v_reserva record;
begin
  for v_grupo in
    select public._texto_chave(nome) as chave
      from public.escolas
     group by public._texto_chave(nome)
    having count(*) > 1
  loop
    -- A mais antiga fica; é o registro "original" — as outras com o
    -- mesmo nome (ignorando acento/caixa) se fundem nela.
    select * into v_keeper
      from public.escolas
     where public._texto_chave(nome) = v_grupo.chave
     order by criado_em
     limit 1;

    for v_loser in
      select * from public.escolas
       where public._texto_chave(nome) = v_grupo.chave
         and id <> v_keeper.id
    loop
      for v_horario in
        select * from public.horarios where escola_id = v_loser.id
      loop
        select * into v_alvo
          from public.horarios
         where escola_id = v_keeper.id
           and dia_semana = v_horario.dia_semana
           and hora_inicio = v_horario.hora_inicio;

        if found then
          -- A escola que fica já tem esse mesmo horário: move as
          -- reservas uma a uma, para isolar só a que colidir (as duas
          -- escolas tinham reserva ativa no mesmo horário/data) em vez
          -- de travar a fusão inteira por causa de uma só.
          for v_reserva in select * from public.reservas where horario_id = v_horario.id loop
            begin
              update public.reservas set horario_id = v_alvo.id where id = v_reserva.id;
            exception when unique_violation then
              raise notice 'Reserva % (escola duplicada "%") não foi movida — já existe reserva ativa no mesmo horário/data na escola que ficou. Resolva à mão.',
                v_reserva.protocolo, v_loser.nome;
            end;
          end loop;

          -- Só apaga o horário duplicado se esvaziou de verdade — uma
          -- reserva presa no aviso acima o mantém vivo de propósito.
          if not exists (select 1 from public.reservas where horario_id = v_horario.id) then
            delete from public.horarios where id = v_horario.id;
          end if;
        else
          -- A escola que fica nem tinha esse horário: move o horário
          -- inteiro (com as reservas dele, já que continuam apontando
          -- para o mesmo `horario_id`) em vez de reserva por reserva.
          update public.horarios set escola_id = v_keeper.id where id = v_horario.id;
        end if;
      end loop;

      -- Só apaga a escola duplicada se não sobrou horário nenhum dela —
      -- um horário só fica pra trás por causa do aviso de conflito acima.
      if not exists (select 1 from public.horarios where escola_id = v_loser.id) then
        delete from public.escolas where id = v_loser.id;
      else
        raise notice 'Escola "%" (id %) não foi apagada: ainda tem horário com reserva que não pôde ser movida. Confira à mão.',
          v_loser.nome, v_loser.id;
      end if;
    end loop;
  end loop;
end $$;

-- --------------------------------------------------------------------
-- 2. Fecha a porta: criar/renomear escola recusa nome já existente
-- --------------------------------------------------------------------

create or replace function public.admin_criar_escola(p_admin_token text, p_nome text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola    public.escolas;
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_existente text;
begin
  perform public._exigir_admin(p_admin_token);

  if length(v_nome) < 2 then
    raise exception 'Informe o nome da escola.' using errcode = 'P0004';
  end if;

  select nome into v_existente
    from public.escolas
   where public._texto_chave(nome) = public._texto_chave(v_nome)
   limit 1;

  if found then
    raise exception 'Já existe uma escola cadastrada com esse nome: "%".', v_existente
      using errcode = 'P0005';
  end if;

  insert into public.escolas (nome) values (v_nome) returning * into v_escola;
  return to_jsonb(v_escola);
end;
$$;

create or replace function public.admin_renomear_escola(p_admin_token text, p_escola_id uuid, p_nome text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola    public.escolas;
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_existente text;
begin
  perform public._exigir_admin(p_admin_token);

  if length(v_nome) < 2 then
    raise exception 'Informe o nome da escola.' using errcode = 'P0004';
  end if;

  select nome into v_existente
    from public.escolas
   where public._texto_chave(nome) = public._texto_chave(v_nome)
     and id <> p_escola_id
   limit 1;

  if found then
    raise exception 'Já existe outra escola cadastrada com esse nome: "%".', v_existente
      using errcode = 'P0005';
  end if;

  update public.escolas set nome = v_nome where id = p_escola_id returning * into v_escola;

  if not found then
    raise exception 'Escola não encontrada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_escola);
end;
$$;

-- Trava no próprio banco, para valer mesmo se algum dia entrar outro
-- jeito de gravar em `escolas` além dessas duas funções. Roda depois da
-- fusão acima de propósito — se ainda sobrou duplicata por causa de uma
-- reserva presa, o índice falha e avisa em vez de mascarar o problema.
do $$
begin
  create unique index if not exists escolas_nome_normalizado_unico
    on public.escolas (public._texto_chave(nome));
exception when unique_violation then
  raise notice 'Ainda há escolas com o mesmo nome depois da fusão — veja os avisos acima, resolva à mão e rode esta migration de novo.';
end $$;

select nome, criado_em from public.escolas order by nome;

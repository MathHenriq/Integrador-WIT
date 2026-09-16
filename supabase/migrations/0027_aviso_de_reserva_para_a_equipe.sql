-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 27: aviso de reserva nova para a equipe
--
--   Cole no SQL Editor DEPOIS da 0026. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- O agendamento pelo site funcionou bem demais: professor da escola
-- entrou, reservou, apareceu no dia — e a equipe WIT só descobriu na
-- hora. A reserva nasce `aguardando_confirmacao` justamente para o
-- professor do dia entrar em contato antes; só que ninguém sabia que
-- havia o que confirmar. Enquanto o aviso dependeu de alguém lembrar de
-- abrir o painel, ele não aconteceu.
--
-- A correção é inverter o sentido: em vez de a equipe ir buscar a
-- informação, a informação vai atrás da equipe. Reserva nova pelo site
-- vira e-mail para os professores WIT responsáveis por aquela escola.
--
-- Três peças, e a razão de cada uma:
--
-- 1. `escolas.grupo` — a rotação W / I / T. O Grupo W já existia de
--    fato (as cinco integrais, com grade própria desde a 0019), mas só
--    no texto das migrations. Agora é coluna, porque é ela que decide
--    para quem vai o e-mail. I e T ficam em branco: quem sabe a divisão
--    é a equipe, e ela aloca pelo painel.
--
-- 2. `equipe_wit` — os professores do Núcleo e os grupos de cada um.
--    Um professor pode cobrir mais de um grupo (por isso `grupos` é
--    lista, não coluna única), e todos os professores do grupo da
--    escola recebem o aviso.
--
-- 3. `notificacoes` — a fila. O envio NÃO é feito aqui: o banco só
--    registra que há um aviso a mandar. Quem manda é a Edge Function
--    `notificar-equipe`, acordada pelo cron. É o que garante que o
--    aviso saia mesmo que o professor da escola feche o navegador no
--    instante seguinte ao agendamento — coisa que o disparo pelo site,
--    sozinho, não garante.
--
-- Uma reserva registrada pela própria equipe (aba "Registrar projeto",
-- importação do Canva) não gera aviso: ela nasce `confirmado` e é
-- sempre de aula que já aconteceu. Não há nada para avisar.
--
-- --------------------------------------------------------------------
-- 1. O grupo da rotação
-- --------------------------------------------------------------------

do $$ begin
  create type public.grupo_wit as enum ('W', 'I', 'T');
exception when duplicate_object then null; end $$;

alter table public.escolas
  add column if not exists grupo public.grupo_wit;

comment on column public.escolas.grupo is
  'Grupo da rotação da equipe WIT (W, I ou T). Decide quais professores
   do Núcleo recebem o aviso de reserva nova desta escola. Em branco =
   ainda não alocada: o aviso vai para a equipe inteira, para não sumir.';

-- O Grupo W é o das escolas de período integral — a mesma lista que a
-- 0019 usou para dar a elas a grade de 2º e 3º tempos. Casada por
-- `_texto_chave` (sem acento, sem caixa) porque é assim que o resto do
-- projeto compara nome de escola desde a 0025.
--
-- `where grupo is null` de propósito: se a equipe já tiver mexido na
-- alocação pelo painel, rodar esta migration de novo não desfaz.

update public.escolas e
   set grupo = 'W'
 where e.grupo is null
   and public._texto_chave(e.nome) in (
     public._texto_chave('Complexo Educacional Professor Carlos Osmarinho de Lima'),
     public._texto_chave('EMEF Professor Ézio Berzaghi'),
     public._texto_chave('EMEF Renato Rosa'),
     public._texto_chave('EMEIEF Professor Eneias Raimundo da Silva'),
     public._texto_chave('EMEF Professor Alfredo do Carmo')
   );

-- --------------------------------------------------------------------
-- 2. Os professores da equipe WIT
-- --------------------------------------------------------------------
-- Não é login: o painel continua sem contas, protegido pela senha única
-- conferida em `_exigir_admin`. Esta tabela é uma agenda de contatos —
-- para onde mandar o aviso, e de quem é cada grupo.

-- Só e-mail. O canal é um só de propósito: campo que ninguém preenche
-- (ou que o sistema não usa) vira dado velho e confunde quem cadastra.
-- O WhatsApp que importa aqui é o do professor DA ESCOLA, que vem na
-- reserva e vai dentro do aviso — é por ele que a equipe faz contato.
create table if not exists public.equipe_wit (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(btrim(nome)) >= 3),
  email      text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  grupos     public.grupo_wit[] not null default '{}',
  -- Desligar sem apagar: o professor sai da rotação e o histórico de
  -- avisos que ele recebeu continua fazendo sentido.
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Duas linhas com o mesmo e-mail significariam e-mail duplicado a cada
-- reserva. Comparação sem caixa porque Fulano@ e fulano@ são a mesma
-- caixa postal.
create unique index if not exists equipe_wit_email_unico
  on public.equipe_wit (lower(email));

comment on table public.equipe_wit is
  'Professores do Núcleo WIT que recebem o aviso de reserva nova. Um
   professor pode cobrir mais de um grupo da rotação.';

-- --------------------------------------------------------------------
-- 3. A fila de avisos
-- --------------------------------------------------------------------
-- Por que fila e não envio direto: o banco não fala HTTP no meio de uma
-- transação sem arriscar a transação. Se o provedor de e-mail estiver
-- fora do ar, quem não pode falhar é a RESERVA — ela é o dado real; o
-- e-mail é recado. Enfileirar separa as duas coisas: a reserva grava
-- sempre, o aviso é tentado depois, e o que falhou fica registrado para
-- ser tentado de novo em vez de sumir.

do $$ begin
  create type public.status_notificacao as enum (
    'pendente',   -- esperando a Edge Function pegar
    'enviando',   -- reivindicada por um envio em andamento
    'enviado',
    'falhou',     -- estourou o limite de tentativas; precisa de olho humano
    'dispensado'  -- a reserva foi cancelada antes de o aviso sair
  );
exception when duplicate_object then null; end $$;

create table if not exists public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  reserva_id     uuid not null references public.reservas (id) on delete cascade,
  tipo           text not null default 'reserva_nova',
  status         public.status_notificacao not null default 'pendente',
  destinatarios  text[] not null default '{}',
  tentativas     smallint not null default 0,
  ultimo_erro    text,
  criado_em      timestamptz not null default now(),
  reivindicado_em timestamptz,
  enviado_em     timestamptz
);

-- Uma reserva gera um aviso de cada tipo, e só. Protege contra o
-- trigger disparar duas vezes e contra reenvio manual acidental.
create unique index if not exists notificacoes_uma_por_reserva
  on public.notificacoes (reserva_id, tipo);

-- A varredura do cron é sempre "o que está pendente, mais antigo
-- primeiro" — é este índice que ela usa.
create index if not exists notificacoes_pendentes_idx
  on public.notificacoes (status, criado_em)
  where status in ('pendente', 'enviando');

alter table public.equipe_wit   enable row level security;
alter table public.notificacoes enable row level security;
alter table public.equipe_wit   force row level security;
alter table public.notificacoes force row level security;

-- Deny-all como todo o resto do projeto: o `anon key` está no bundle do
-- navegador, então nenhuma destas tabelas pode ser lida direto. E-mail
-- de professor não vaza nem para quem abrir o DevTools.
revoke all on public.equipe_wit   from anon, authenticated;
revoke all on public.notificacoes from anon, authenticated;

-- --------------------------------------------------------------------
-- 4. O trigger que enfileira
-- --------------------------------------------------------------------
-- No trigger, e não dentro da função `agendar`, porque assim vale para
-- qualquer caminho que crie uma reserva de escola — inclusive os que
-- ainda não existem. Quem esquece de enfileirar é o código novo; o
-- trigger não esquece.

create or replace function public.trg_reservas_avisa_equipe()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Só pedido de escola esperando confirmação. Reserva da própria
  -- equipe nasce 'confirmado' e descreve aula que já aconteceu.
  if new.origem = 'escola' and new.status = 'aguardando_confirmacao' then
    insert into public.notificacoes (reserva_id, tipo)
    values (new.id, 'reserva_nova')
    on conflict (reserva_id, tipo) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists reservas_avisa_equipe on public.reservas;
create trigger reservas_avisa_equipe
  after insert on public.reservas
  for each row
  execute function public.trg_reservas_avisa_equipe();

-- --------------------------------------------------------------------
-- 5. Quem recebe o aviso de uma reserva
-- --------------------------------------------------------------------
-- Uma escola sem grupo não pode significar aviso sem destinatário: era
-- esse o problema que a atualização inteira existe para resolver. Se a
-- escola ainda não foi alocada, ou se o grupo dela está sem nenhum
-- professor ativo, cai para a equipe inteira. Antes e-mail demais do
-- que reserva invisível de novo.

create or replace function public._destinatarios_da_reserva(p_reserva_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupo public.grupo_wit;
  v_lista text[];
begin
  select e.grupo into v_grupo
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
    join public.escolas  e on e.id = h.escola_id
   where r.id = p_reserva_id;

  if v_grupo is not null then
    select array_agg(m.email order by m.nome) into v_lista
      from public.equipe_wit m
     where m.ativo and v_grupo = any (m.grupos);
  end if;

  if v_lista is null or cardinality(v_lista) = 0 then
    select array_agg(m.email order by m.nome) into v_lista
      from public.equipe_wit m
     where m.ativo;
  end if;

  return coalesce(v_lista, '{}');
end;
$$;

-- --------------------------------------------------------------------
-- 6. A reivindicação da fila (usada pela Edge Function)
-- --------------------------------------------------------------------
-- O aviso é disparado por dois caminhos: o site chama a função logo
-- depois de agendar (para chegar em segundos) e o cron varre a fila de
-- minuto em minuto (para chegar mesmo se o site não chamar). Os dois
-- podem cair em cima da mesma linha ao mesmo tempo.
--
-- `for update skip locked` resolve: quem pega a linha a marca como
-- 'enviando' dentro da mesma transação, e o outro processo simplesmente
-- não a enxerga mais. Sem isso, a equipe receberia o mesmo e-mail duas
-- vezes — e e-mail repetido é o caminho mais curto para a equipe
-- aprender a ignorar o aviso.
--
-- Só o service_role chama: a chave fica na Edge Function, nunca no
-- navegador.

create or replace function public.reivindicar_notificacoes(p_limite int default 20)
returns table (
  id              uuid,
  reserva_id      uuid,
  tipo            text,
  tentativas      smallint,
  destinatarios   text[],
  protocolo       text,
  nome_professor  text,
  turma           text,
  email_contato   text,
  whatsapp_contato text,
  quantidade_alunos smallint,
  data_aula       date,
  hora_inicio     time,
  hora_fim        time,
  dia_semana      smallint,
  escola          text,
  grupo           public.grupo_wit,
  atividade       text,
  objetivos       text,
  materiais       text
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  -- Reserva cancelada entre o pedido e a varredura não vira e-mail. O
  -- professor da escola desmarcou; avisar a equipe de uma aula que não
  -- existe mais é o tipo de recado que ensina a ignorar o próximo.
  update public.notificacoes n
     set status = 'dispensado', ultimo_erro = null
    from public.reservas r
   where r.id = n.reserva_id
     and n.status in ('pendente', 'enviando')
     and r.status = 'cancelado';

  return query
  with alvo as (
    select n.id
      from public.notificacoes n
     where n.status = 'pendente'
        -- Reivindicada e largada no meio (função derrubada, timeout):
        -- depois de 5 minutos volta para a fila em vez de travar nela.
        or (n.status = 'enviando' and n.reivindicado_em < now() - interval '5 minutes')
     order by n.criado_em
     limit greatest(1, least(coalesce(p_limite, 20), 100))
       for update skip locked
  ),
  reivindicada as (
    update public.notificacoes n
       set status = 'enviando',
           tentativas = n.tentativas + 1,
           reivindicado_em = now(),
           destinatarios = public._destinatarios_da_reserva(n.reserva_id)
      from alvo
     where n.id = alvo.id
     returning n.*
  )
  select rn.id, rn.reserva_id, rn.tipo, rn.tentativas, rn.destinatarios,
         r.protocolo, r.nome_professor, r.turma, r.email_contato,
         r.whatsapp_contato, r.quantidade_alunos, r.data_aula,
         h.hora_inicio, h.hora_fim, h.dia_semana, e.nome, e.grupo,
         coalesce(a.titulo, r.aula_livre, 'Projeto integrador'),
         coalesce(r.aula_objetivos, a.objetivos),
         coalesce(r.aula_materiais, a.materiais)
    from reivindicada rn
    join public.reservas r on r.id = rn.reserva_id
    join public.horarios h on h.id = r.horario_id
    join public.escolas  e on e.id = h.escola_id
    left join public.aulas a on a.id = r.aula_id
   order by rn.id;
end;
$$;

create or replace function public.concluir_notificacao(
  p_id     uuid,
  p_ok     boolean,
  p_erro   text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notificacoes n
     set status = case
                    when p_ok then 'enviado'::public.status_notificacao
                    -- Três tentativas antes de desistir. Falha de
                    -- provedor costuma ser momentânea; o que passa
                    -- disso é configuração errada, e aí insistir só
                    -- enche a fila.
                    when n.tentativas >= 3 then 'falhou'::public.status_notificacao
                    else 'pendente'::public.status_notificacao
                  end,
         enviado_em  = case when p_ok then now() else n.enviado_em end,
         ultimo_erro = case when p_ok then null else p_erro end
   where n.id = p_id;
end;
$$;

-- Falta de configuração não é falha de envio. Enquanto não houver chave
-- da Resend ou ninguém cadastrado na equipe, o aviso não tem como sair —
-- mas ele não pode morrer por isso. `adiar` devolve a linha para a fila
-- e DESFAZ a tentativa que a reivindicação contou, senão os primeiros
-- pedidos da escola gastariam as três tentativas contra um problema que
-- é de configuração e some sozinho quando a equipe terminar o cadastro.
create or replace function public.adiar_notificacao(p_id uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notificacoes n
     set status = 'pendente',
         tentativas = greatest(n.tentativas - 1, 0),
         reivindicado_em = null,
         ultimo_erro = p_motivo
   where n.id = p_id;
end;
$$;

revoke all on function public.adiar_notificacao(uuid, text)        from public, anon, authenticated;
revoke all on function public.reivindicar_notificacoes(int)        from public, anon, authenticated;
revoke all on function public.concluir_notificacao(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public._destinatarios_da_reserva(uuid)      from public, anon, authenticated;

-- --------------------------------------------------------------------
-- 7. Painel: alocar escolas e cuidar da equipe
-- --------------------------------------------------------------------

create or replace function public.admin_definir_grupo_escola(
  p_admin_token text,
  p_escola_id   uuid,
  p_grupo       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupo public.grupo_wit;
begin
  perform public._exigir_admin(p_admin_token);

  -- Texto vazio é "tirar da rotação", não erro de digitação.
  if p_grupo is null or btrim(p_grupo) = '' then
    v_grupo := null;
  else
    begin
      v_grupo := upper(btrim(p_grupo))::public.grupo_wit;
    exception when invalid_text_representation then
      raise exception 'Grupo inválido: use W, I ou T.';
    end;
  end if;

  update public.escolas set grupo = v_grupo where id = p_escola_id;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  return jsonb_build_object('escola_id', p_escola_id, 'grupo', v_grupo);
end;
$$;

drop function if exists public.admin_listar_equipe(text);

create or replace function public.admin_listar_equipe(p_admin_token text)
returns table (
  id            uuid,
  nome          text,
  email         text,
  grupos        text[],
  ativo         boolean,
  criado_em     timestamptz,
  avisos_30dias bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select m.id, m.nome, m.email,
           array(select g::text from unnest(m.grupos) g),
           m.ativo, m.criado_em,
           (select count(*)
              from public.notificacoes n
             where n.status = 'enviado'
               and n.enviado_em > now() - interval '30 days'
               and m.email = any (n.destinatarios))
      from public.equipe_wit m
     order by m.ativo desc, m.nome;
end;
$$;

drop function if exists public.admin_salvar_membro_equipe(text, uuid, text, text, text, text[], boolean);

create or replace function public.admin_salvar_membro_equipe(
  p_admin_token text,
  p_id          uuid,
  p_nome        text,
  p_email       text,
  p_grupos      text[],
  p_ativo       boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupos public.grupo_wit[];
  v_id     uuid;
begin
  perform public._exigir_admin(p_admin_token);

  begin
    select coalesce(array_agg(distinct upper(btrim(g))::public.grupo_wit), '{}')
      into v_grupos
      from unnest(coalesce(p_grupos, '{}')) g
     where btrim(g) <> '';
  exception when invalid_text_representation then
    raise exception 'Grupo inválido: use W, I ou T.';
  end;

  if p_id is null then
    insert into public.equipe_wit (nome, email, grupos, ativo)
    values (btrim(p_nome), lower(btrim(p_email)), v_grupos, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.equipe_wit
       set nome   = btrim(p_nome),
           email  = lower(btrim(p_email)),
           grupos = v_grupos,
           ativo  = coalesce(p_ativo, true)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Professor não encontrado.';
    end if;
  end if;

  return jsonb_build_object('id', v_id);
exception
  when unique_violation then
    raise exception 'Já existe alguém na equipe com esse e-mail.';
end;
$$;

create or replace function public.admin_remover_membro_equipe(
  p_admin_token text,
  p_id          uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  delete from public.equipe_wit where id = p_id;

  if not found then
    raise exception 'Professor não encontrado.';
  end if;

  return jsonb_build_object('removido', p_id);
end;
$$;

-- A prova de que o aviso está funcionando (ou de que não está). Sem
-- isso, "não chegou e-mail" vira adivinhação entre reserva, fila,
-- provedor e caixa de spam.
create or replace function public.admin_listar_notificacoes(
  p_admin_token text,
  p_limite      int default 30
)
returns table (
  id             uuid,
  status         text,
  tentativas     smallint,
  destinatarios  text[],
  ultimo_erro    text,
  criado_em      timestamptz,
  enviado_em     timestamptz,
  protocolo      text,
  escola         text,
  grupo          text,
  data_aula      date,
  nome_professor text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select n.id, n.status::text, n.tentativas, n.destinatarios, n.ultimo_erro,
           n.criado_em, n.enviado_em,
           r.protocolo, e.nome, e.grupo::text, r.data_aula, r.nome_professor
      from public.notificacoes n
      join public.reservas r on r.id = n.reserva_id
      join public.horarios h on h.id = r.horario_id
      join public.escolas  e on e.id = h.escola_id
     order by n.criado_em desc
     limit greatest(1, least(coalesce(p_limite, 30), 200));
end;
$$;

-- Devolver para a fila o que falhou, depois de arrumar a causa (chave
-- errada, domínio não verificado). Sem isto, corrigir a configuração
-- não traria de volta o aviso perdido.
create or replace function public.admin_reenfileirar_notificacao(
  p_admin_token text,
  p_id          uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  update public.notificacoes
     set status = 'pendente', tentativas = 0, ultimo_erro = null, reivindicado_em = null
   where id = p_id;

  if not found then
    raise exception 'Aviso não encontrado.';
  end if;

  return jsonb_build_object('reenfileirado', p_id);
end;
$$;

-- `admin_listar_escolas` passa a devolver o grupo: é na aba "Escolas"
-- que a equipe aloca a rotação. Assinatura igual, então `create or
-- replace` não dá conta — a lista de colunas de retorno mudou.
--
-- O resto do corpo é o da 0021 sem alteração (inclusive a contagem de
-- reservas futuras, que já soma as pendentes desde lá).
drop function if exists public.admin_listar_escolas(text);

create or replace function public.admin_listar_escolas(p_admin_token text)
returns table (
  id               uuid,
  nome             text,
  grupo            text,
  criado_em        timestamptz,
  total_horarios   bigint,
  horarios_ativos  bigint,
  reservas_futuras bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select e.id, e.nome, e.grupo::text, e.criado_em,
           count(distinct h.id),
           count(distinct h.id) filter (where h.ativo),
           count(distinct r.id) filter (
             where r.status in ('confirmado', 'aguardando_confirmacao')
               and r.data_aula >= public.hoje_brasil()
           )
      from public.escolas e
      left join public.horarios h on h.escola_id = e.id
      left join public.reservas r on r.horario_id = h.id
     group by e.id
     order by e.nome;
end;
$$;

grant execute on function public.admin_listar_escolas(text)                              to anon, authenticated;
grant execute on function public.admin_definir_grupo_escola(text, uuid, text)            to anon, authenticated;
grant execute on function public.admin_listar_equipe(text)                               to anon, authenticated;
grant execute on function public.admin_salvar_membro_equipe(text, uuid, text, text, text[], boolean) to anon, authenticated;
grant execute on function public.admin_remover_membro_equipe(text, uuid)                 to anon, authenticated;
grant execute on function public.admin_listar_notificacoes(text, int)                    to anon, authenticated;
grant execute on function public.admin_reenfileirar_notificacao(text, uuid)              to anon, authenticated;

-- --------------------------------------------------------------------
-- 8. Reservas pendentes que já estavam no banco
-- --------------------------------------------------------------------
-- O trigger só vale para o que entrar de agora em diante. O pedido que
-- está parado esperando confirmação desde antes desta atualização é
-- exatamente o caso que motivou tudo isto — ele entra na fila também.

insert into public.notificacoes (reserva_id, tipo)
select r.id, 'reserva_nova'
  from public.reservas r
 where r.origem = 'escola'
   and r.status = 'aguardando_confirmacao'
   and r.data_aula >= public.hoje_brasil()
on conflict (reserva_id, tipo) do nothing;

-- =====================================================================
-- 9. O QUE FALTA, E QUE NÃO DÁ PARA FAZER DAQUI
-- =====================================================================
--
-- Esta migration monta a fila. Ela não manda e-mail nenhum — quem manda
-- é a Edge Function `notificar-equipe`, e ela precisa de três coisas
-- que são de fora do banco. Enquanto elas não existirem, a fila só
-- acumula (nada se perde, mas nada chega).
--
-- (a) Implantar a função e dar a ela a chave do provedor:
--
--       supabase functions deploy notificar-equipe
--       supabase secrets set RESEND_API_KEY=re_xxxxxxxx
--       supabase secrets set EMAIL_REMETENTE="Núcleo WIT <avisos@seudominio.com.br>"
--
--     O remetente precisa ser de um domínio verificado na Resend. Com
--     domínio não verificado a Resend aceita a chamada e não entrega.
--
-- (b) Ligar as extensões do agendador (uma vez, no painel do Supabase
--     em Database > Extensions, ou aqui):
--
--       create extension if not exists pg_cron with schema cron;
--       create extension if not exists pg_net;
--
-- (c) Guardar a service_role key no Vault e agendar a varredura. Estas
--     linhas NÃO estão na migration de propósito: elas carregam segredo
--     e o ref do projeto, e migration versionada não é lugar de chave.
--     Rode uma vez no SQL Editor, trocando os dois valores:
--
--       select vault.create_secret(
--         'SUA_SERVICE_ROLE_KEY', 'service_role_key',
--         'Usada pelo cron para acordar a notificar-equipe'
--       );
--
--       select cron.schedule(
--         'notificar-equipe-wit',
--         '* * * * *',
--         $cron$
--         select net.http_post(
--           url     := 'https://mdwqwwdohwixxotyeiua.supabase.co/functions/v1/notificar-equipe',
--           headers := jsonb_build_object(
--             'Content-Type', 'application/json',
--             'Authorization', 'Bearer ' || (
--               select decrypted_secret from vault.decrypted_secrets
--                where name = 'service_role_key'
--             )
--           ),
--           body    := '{}'::jsonb
--         );
--         $cron$
--       );
--
--     Para conferir depois:
--       select * from cron.job;
--       select * from cron.job_run_details order by start_time desc limit 10;
--
-- O passo a passo completo, com o que checar quando não chegar e-mail,
-- está na seção "Aviso de reserva para a equipe" do HANDOFF.md.
-- =====================================================================

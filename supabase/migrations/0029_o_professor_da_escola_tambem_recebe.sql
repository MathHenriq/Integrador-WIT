-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 29: o professor da escola também recebe e-mail
--
--   Cole no SQL Editor DEPOIS da 0028. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- A 0027 resolveu metade do problema: a equipe WIT passou a saber que
-- existe reserva nova. A outra metade continuou como estava desde o
-- começo — quem agenda pelo site vê o protocolo na tela e **não recebe
-- nada**. Nem "recebemos seu pedido", nem "sua aula foi confirmada".
--
-- Do lado do professor da escola isso é exatamente o mesmo silêncio que
-- motivou tudo isto, só que na direção contrária: ele reserva, não
-- recebe confirmação nenhuma, e fica sem saber se funcionou.
--
-- Existia no repositório uma Edge Function `enviar-confirmacao` escrita
-- para isso, nunca implantada e presa à Resend. Ela **não** é o caminho:
-- seria um segundo envio, com um segundo provedor para configurar, uma
-- segunda lógica de tentativa e nenhuma visibilidade no painel.
--
-- A fila da 0027 já sabe fazer tudo isso. O que faltava nela era só a
-- noção de que um aviso pode ter destinatário diferente. A coluna `tipo`
-- já existia desde a 0027 (com um valor só). Agora ela vale de verdade:
--
--   reserva_nova       -> equipe WIT: "tem pedido esperando confirmação"
--   reserva_recebida   -> professor da escola: "seu pedido chegou"
--   reserva_confirmada -> professor da escola: "está confirmado"
--
-- Mesma fila, mesmo cron, mesmo provedor, mesma tela de acompanhamento,
-- mesma regra de tentativas. Uma função de envio, não duas.
--
-- --------------------------------------------------------------------
-- 1. Quem recebe passa a depender do tipo
-- --------------------------------------------------------------------
-- A assinatura muda (ganha o tipo), então a antiga sai antes.

drop function if exists public._destinatarios_da_reserva(uuid);

create or replace function public._destinatarios_da_reserva(
  p_reserva_id uuid,
  p_tipo       text
)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupo  public.grupo_wit;
  v_escola uuid;
  v_email  text;
  v_lista  text[];
begin
  select e.grupo, e.id, r.email_contato
    into v_grupo, v_escola, v_email
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
    join public.escolas  e on e.id = h.escola_id
   where r.id = p_reserva_id;

  -- Avisos que vão para quem agendou. Um só destinatário, e ele pode
  -- não existir: o agendamento aceita WhatsApp no lugar do e-mail.
  if p_tipo in ('reserva_recebida', 'reserva_confirmada') then
    return case when v_email is null then '{}' else array[v_email] end;
  end if;

  -- reserva_nova: a equipe, por grupo ou por escola avulsa (0028).
  select array_agg(distinct m.email) into v_lista
    from public.equipe_wit m
   where m.ativo
     and (
       (v_grupo is not null and v_grupo = any (m.grupos))
       or (v_escola is not null and v_escola = any (m.escolas))
     );

  -- Nunca deixar aviso da equipe sem destinatário: é o problema que a
  -- 0027 existe para resolver.
  if v_lista is null or cardinality(v_lista) = 0 then
    select array_agg(m.email) into v_lista
      from public.equipe_wit m
     where m.ativo;
  end if;

  return coalesce(v_lista, '{}');
end;
$$;

revoke all on function public._destinatarios_da_reserva(uuid, text) from public, anon, authenticated;

-- --------------------------------------------------------------------
-- 2. Enfileirar o comprovante junto do pedido
-- --------------------------------------------------------------------

create or replace function public.trg_reservas_avisa_equipe()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.origem = 'escola' and new.status = 'aguardando_confirmacao' then
    -- Para a equipe: tem pedido esperando confirmação.
    insert into public.notificacoes (reserva_id, tipo)
    values (new.id, 'reserva_nova')
    on conflict (reserva_id, tipo) do nothing;

    -- Para quem agendou: o pedido chegou. Só quando há e-mail — o
    -- agendamento aceita WhatsApp no lugar, e enfileirar sem
    -- destinatário só encheria a fila de linha morta.
    if new.email_contato is not null then
      insert into public.notificacoes (reserva_id, tipo)
      values (new.id, 'reserva_recebida')
      on conflict (reserva_id, tipo) do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- --------------------------------------------------------------------
-- 3. Enfileirar a confirmação quando a equipe confirma
-- --------------------------------------------------------------------
-- No trigger, e não dentro de `admin_confirmar_reserva`, pela mesma
-- razão da 0027: vale para qualquer caminho que confirme uma reserva,
-- inclusive os que ainda não existem.
--
-- A condição olha a transição, não o estado: `aguardando_confirmacao ->
-- confirmado`. Sem isso, qualquer update numa reserva já confirmada
-- (corrigir a turma, anexar relato) dispararia o e-mail de novo.

create or replace function public.trg_reservas_avisa_confirmacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'aguardando_confirmacao'
     and new.status = 'confirmado'
     and new.origem = 'escola'
     and new.email_contato is not null
  then
    insert into public.notificacoes (reserva_id, tipo)
    values (new.id, 'reserva_confirmada')
    on conflict (reserva_id, tipo) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists reservas_avisa_confirmacao on public.reservas;
create trigger reservas_avisa_confirmacao
  after update of status on public.reservas
  for each row
  execute function public.trg_reservas_avisa_confirmacao();

-- --------------------------------------------------------------------
-- 4. A reivindicação passa o tipo adiante
-- --------------------------------------------------------------------

create or replace function public.reivindicar_notificacoes(p_limite int default 20)
returns table (
  id                uuid,
  reserva_id        uuid,
  tipo              text,
  tentativas        smallint,
  destinatarios     text[],
  protocolo         text,
  nome_professor    text,
  turma             text,
  email_contato     text,
  whatsapp_contato  text,
  quantidade_alunos smallint,
  data_aula         date,
  hora_inicio       time,
  hora_fim          time,
  dia_semana        smallint,
  escola            text,
  grupo             public.grupo_wit,
  atividade         text,
  objetivos         text,
  materiais         text
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  -- Reserva cancelada antes do envio não vira e-mail — para nenhum dos
  -- lados. Quem desmarcou foi o próprio professor da escola; mandar
  -- "seu pedido chegou" depois disso é pior que não mandar nada.
  update public.notificacoes n
     set status = 'dispensado', ultimo_erro = null
    from public.reservas r
   where r.id = n.reserva_id
     and n.status in ('pendente', 'enviando')
     and r.status = 'cancelado';

  -- Comprovante de uma reserva que não tem e-mail (o professor deixou
  -- só WhatsApp) nunca vai ter destinatário. Sai da fila como
  -- dispensado em vez de ficar sendo adiado para sempre.
  update public.notificacoes n
     set status = 'dispensado',
         ultimo_erro = 'Quem agendou não informou e-mail, só WhatsApp.'
    from public.reservas r
   where r.id = n.reserva_id
     and n.status in ('pendente', 'enviando')
     and n.tipo in ('reserva_recebida', 'reserva_confirmada')
     and r.email_contato is null;

  return query
  with alvo as (
    select n.id
      from public.notificacoes n
     where n.status = 'pendente'
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
           destinatarios = public._destinatarios_da_reserva(n.reserva_id, n.tipo)
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

revoke all on function public.reivindicar_notificacoes(int) from public, anon, authenticated;

-- --------------------------------------------------------------------
-- 5. O painel mostra de que aviso se trata
-- --------------------------------------------------------------------
-- Sem o tipo na lista, "Enviado" para três coisas diferentes vira
-- adivinhação: não dá para saber se o que saiu foi o aviso da equipe ou
-- o comprovante do professor.

drop function if exists public.admin_listar_notificacoes(text, int);

create or replace function public.admin_listar_notificacoes(
  p_admin_token text,
  p_limite      int default 30
)
returns table (
  id             uuid,
  tipo           text,
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
    select n.id, n.tipo, n.status::text, n.tentativas, n.destinatarios, n.ultimo_erro,
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

grant execute on function public.admin_listar_notificacoes(text, int) to anon, authenticated;

-- --------------------------------------------------------------------
-- 6. As reservas que já existem
-- --------------------------------------------------------------------
-- Comprovante de pedido só faz sentido para o que ainda está esperando
-- confirmação: mandar "recebemos seu pedido" de uma aula que já
-- aconteceu é ruído. E a confirmação de quem já foi confirmado antes
-- desta atualização também não vai — o professor já foi avisado por
-- WhatsApp ou e-mail na mão, e receber agora seria estranho.
--
-- Só entra na fila o que está pendente e ainda vai acontecer.

insert into public.notificacoes (reserva_id, tipo)
select r.id, 'reserva_recebida'
  from public.reservas r
 where r.origem = 'escola'
   and r.status = 'aguardando_confirmacao'
   and r.email_contato is not null
   and r.data_aula >= public.hoje_brasil()
on conflict (reserva_id, tipo) do nothing;

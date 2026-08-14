-- =====================================================================
-- Projeto Integrador - Núcleo WIT
-- Migration 0002: API pública (RPC)
-- =====================================================================
-- Todo acesso do browser passa por aqui. As funções são SECURITY DEFINER
-- (enxergam as tabelas apesar do RLS deny-all) e recebem o token como
-- argumento, validando-o a cada chamada. Um token da escola A nunca
-- alcança dados da escola B porque o escopo é derivado do próprio token,
-- nunca de um parâmetro enviado pelo cliente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internas (NÃO recebem grant para anon)
-- ---------------------------------------------------------------------

create or replace function public._resolver_token(p_token text)
returns table (escola_id uuid, escola_nome text, papel public.papel_acesso)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.nome, 'professor'::public.papel_acesso
    from public.escolas e
   where p_token is not null and e.token_professor = p_token
  union all
  select e.id, e.nome, 'coordenacao'::public.papel_acesso
    from public.escolas e
   where p_token is not null and e.token_coordenacao = p_token;
$$;

create or replace function public._exigir_escola(p_token text)
returns public.escolas
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
begin
  select e.* into v_escola
    from public.escolas e
   where p_token is not null
     and (e.token_professor = p_token or e.token_coordenacao = p_token);

  if not found then
    raise exception 'Link inválido ou expirado.' using errcode = 'P0002';
  end if;

  return v_escola;
end;
$$;

create or replace function public._exigir_coordenacao(p_token text)
returns public.escolas
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
begin
  v_escola := public._exigir_escola(p_token);

  if v_escola.token_coordenacao is distinct from p_token then
    raise exception 'Esta ação é restrita ao link da coordenação.' using errcode = 'P0003';
  end if;

  return v_escola;
end;
$$;

create or replace function public._exigir_admin(p_token text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token is null or not exists (select 1 from public.admin_tokens a where a.token = p_token) then
    raise exception 'Token de administração inválido.' using errcode = 'P0002';
  end if;
end;
$$;

-- Mesma expressão da constraint da tabela, só que aplicada antes do
-- insert: a constraint continua sendo a garantia, esta função existe
-- para o usuário receber uma frase em vez de "violates check constraint".
create or replace function public._email_valido(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email is null or p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
$$;

revoke all on function public._resolver_token(text)     from public, anon, authenticated;
revoke all on function public._email_valido(text)       from public, anon, authenticated;
revoke all on function public._exigir_escola(text)      from public, anon, authenticated;
revoke all on function public._exigir_coordenacao(text) from public, anon, authenticated;
revoke all on function public._exigir_admin(text)       from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Portal da escola (professor + coordenação)
-- ---------------------------------------------------------------------

-- Primeira chamada ao abrir o link: descobre de qual escola é o token e
-- com qual papel. Retorna null quando o link não existe, para a tela
-- poder mostrar "link inválido" sem tratar isso como erro.
create or replace function public.acessar_escola(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'escola_id',   t.escola_id,
           'escola_nome', t.escola_nome,
           'papel',       t.papel
         )
    from public._resolver_token(p_token) t
   limit 1;
$$;

-- Grade da escola. O professor enxerga quem reservou (é a informação que
-- hoje ele busca de porta em porta), mas o e-mail de contato só aparece
-- para a coordenação.
create or replace function public.listar_horarios(p_token text)
returns table (
  id                 uuid,
  dia_semana         smallint,
  hora_inicio        time,
  hora_fim           time,
  capacidade         smallint,
  ocupacao_wit       smallint,
  status             public.status_horario,
  reserva_id         uuid,
  reserva_protocolo  text,
  reserva_professor  text,
  reserva_email      text,
  reserva_criado_em  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
  v_coord  boolean;
begin
  v_escola := public._exigir_escola(p_token);
  v_coord  := v_escola.token_coordenacao = p_token;

  return query
    select h.id,
           h.dia_semana,
           h.hora_inicio,
           h.hora_fim,
           h.capacidade,
           h.ocupacao_wit,
           h.status,
           r.id,
           r.protocolo,
           r.nome_professor,
           case when v_coord then r.email_contato end,
           r.criado_em
      from public.horarios h
      left join public.reservas r
        on r.horario_id = h.id and r.status = 'confirmado'
     where h.escola_id = v_escola.id
     order by h.dia_semana, h.hora_inicio;
end;
$$;

-- Reserva de um horário vago. Professor e coordenação podem reservar.
create or replace function public.criar_reserva(
  p_token          text,
  p_horario_id     uuid,
  p_nome_professor text,
  p_email_contato  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola  public.escolas;
  v_horario public.horarios;
  v_reserva public.reservas;
  v_nome    text := btrim(coalesce(p_nome_professor, ''));
  v_email   text := nullif(btrim(lower(coalesce(p_email_contato, ''))), '');
begin
  v_escola := public._exigir_escola(p_token);

  if length(v_nome) < 3 then
    raise exception 'Informe o nome do professor responsável.' using errcode = 'P0004';
  end if;

  if not public._email_valido(v_email) then
    raise exception 'O e-mail informado não parece válido.' using errcode = 'P0004';
  end if;

  -- O horário precisa pertencer à escola do token. Sem isso, um token
  -- válido conseguiria reservar horários de outra escola.
  select h.* into v_horario
    from public.horarios h
   where h.id = p_horario_id and h.escola_id = v_escola.id;

  if not found then
    raise exception 'Horário não encontrado nesta escola.' using errcode = 'P0002';
  end if;

  if v_horario.status = 'cheio' then
    raise exception 'Este horário já foi reservado.' using errcode = 'P0005';
  end if;

  begin
    insert into public.reservas (horario_id, nome_professor, email_contato)
    values (v_horario.id, v_nome, v_email)
    returning * into v_reserva;
  exception when unique_violation then
    -- Duas reservas simultâneas no mesmo horário: a segunda cai aqui.
    raise exception 'Este horário acabou de ser reservado por outra pessoa.' using errcode = 'P0005';
  end;

  return jsonb_build_object(
    'reserva_id',     v_reserva.id,
    'protocolo',      v_reserva.protocolo,
    'nome_professor', v_reserva.nome_professor,
    'email_contato',  v_reserva.email_contato,
    'criado_em',      v_reserva.criado_em,
    'escola_nome',    v_escola.nome,
    'dia_semana',     v_horario.dia_semana,
    'hora_inicio',    v_horario.hora_inicio,
    'hora_fim',       v_horario.hora_fim
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Coordenação
-- ---------------------------------------------------------------------

-- Histórico completo da escola, incluindo canceladas.
create or replace function public.listar_reservas(p_token text)
returns table (
  id             uuid,
  protocolo      text,
  nome_professor text,
  email_contato  text,
  status         public.status_reserva,
  criado_em      timestamptz,
  cancelado_em   timestamptz,
  cancelado_por  text,
  horario_id     uuid,
  dia_semana     smallint,
  hora_inicio    time,
  hora_fim       time
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
begin
  v_escola := public._exigir_coordenacao(p_token);

  return query
    select r.id, r.protocolo, r.nome_professor, r.email_contato, r.status,
           r.criado_em, r.cancelado_em, r.cancelado_por,
           h.id, h.dia_semana, h.hora_inicio, h.hora_fim
      from public.reservas r
      join public.horarios h on h.id = r.horario_id
     where h.escola_id = v_escola.id
     order by r.criado_em desc;
end;
$$;

create or replace function public.cancelar_reserva(
  p_token        text,
  p_reserva_id   uuid,
  p_cancelado_por text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola  public.escolas;
  v_reserva public.reservas;
begin
  v_escola := public._exigir_coordenacao(p_token);

  select r.* into v_reserva
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
   where r.id = p_reserva_id and h.escola_id = v_escola.id;

  if not found then
    raise exception 'Reserva não encontrada nesta escola.' using errcode = 'P0002';
  end if;

  if v_reserva.status = 'cancelado' then
    raise exception 'Esta reserva já está cancelada.' using errcode = 'P0006';
  end if;

  update public.reservas
     set status        = 'cancelado',
         cancelado_em  = now(),
         cancelado_por = nullif(btrim(coalesce(p_cancelado_por, '')), '')
   where id = v_reserva.id
  returning * into v_reserva;

  return to_jsonb(v_reserva);
end;
$$;

create or replace function public.editar_reserva(
  p_token          text,
  p_reserva_id     uuid,
  p_nome_professor text,
  p_email_contato  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola  public.escolas;
  v_reserva public.reservas;
  v_nome    text := btrim(coalesce(p_nome_professor, ''));
  v_email   text := nullif(btrim(lower(coalesce(p_email_contato, ''))), '');
begin
  v_escola := public._exigir_coordenacao(p_token);

  if length(v_nome) < 3 then
    raise exception 'Informe o nome do professor responsável.' using errcode = 'P0004';
  end if;

  if not public._email_valido(v_email) then
    raise exception 'O e-mail informado não parece válido.' using errcode = 'P0004';
  end if;

  update public.reservas r
     set nome_professor = v_nome,
         email_contato  = v_email
   where r.id = p_reserva_id
     and r.status = 'confirmado'
     and exists (
       select 1 from public.horarios h
        where h.id = r.horario_id and h.escola_id = v_escola.id
     )
  returning r.* into v_reserva;

  if not found then
    raise exception 'Reserva confirmada não encontrada nesta escola.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_reserva);
end;
$$;

-- ---------------------------------------------------------------------
-- Administração (Núcleo WIT)
-- ---------------------------------------------------------------------

create or replace function public.admin_listar_escolas(p_admin_token text)
returns table (
  id                uuid,
  nome              text,
  token_professor   text,
  token_coordenacao text,
  criado_em         timestamptz,
  total_horarios    bigint,
  horarios_livres   bigint,
  reservas_ativas   bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select e.id, e.nome, e.token_professor, e.token_coordenacao, e.criado_em,
           count(h.id),
           count(h.id) filter (where h.status <> 'cheio'),
           count(h.id) filter (where h.status = 'cheio')
      from public.escolas e
      left join public.horarios h on h.escola_id = e.id
     group by e.id
     order by e.nome;
end;
$$;

create or replace function public.admin_criar_escola(p_admin_token text, p_nome text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
  v_nome   text := btrim(coalesce(p_nome, ''));
begin
  perform public._exigir_admin(p_admin_token);

  if length(v_nome) < 2 then
    raise exception 'Informe o nome da escola.' using errcode = 'P0004';
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
  v_escola public.escolas;
  v_nome   text := btrim(coalesce(p_nome, ''));
begin
  perform public._exigir_admin(p_admin_token);

  if length(v_nome) < 2 then
    raise exception 'Informe o nome da escola.' using errcode = 'P0004';
  end if;

  update public.escolas set nome = v_nome where id = p_escola_id returning * into v_escola;

  if not found then
    raise exception 'Escola não encontrada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_escola);
end;
$$;

-- Usado quando um link vaza: gera tokens novos e invalida os antigos.
create or replace function public.admin_renovar_tokens(p_admin_token text, p_escola_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_escola public.escolas;
begin
  perform public._exigir_admin(p_admin_token);

  update public.escolas
     set token_professor   = public.gerar_token(),
         token_coordenacao = public.gerar_token()
   where id = p_escola_id
  returning * into v_escola;

  if not found then
    raise exception 'Escola não encontrada.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_escola);
end;
$$;

create or replace function public.admin_listar_horarios(p_admin_token text, p_escola_id uuid)
returns table (
  id                uuid,
  dia_semana        smallint,
  hora_inicio       time,
  hora_fim          time,
  capacidade        smallint,
  ocupacao_wit      smallint,
  status            public.status_horario,
  reserva_professor text,
  reserva_protocolo text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select h.id, h.dia_semana, h.hora_inicio, h.hora_fim, h.capacidade,
           h.ocupacao_wit, h.status, r.nome_professor, r.protocolo
      from public.horarios h
      left join public.reservas r
        on r.horario_id = h.id and r.status = 'confirmado'
     where h.escola_id = p_escola_id
     order by h.dia_semana, h.hora_inicio;
end;
$$;

create or replace function public.admin_criar_horario(
  p_admin_token  text,
  p_escola_id    uuid,
  p_dia_semana   smallint,
  p_hora_inicio  time,
  p_hora_fim     time,
  p_capacidade   smallint default 18,
  p_ocupacao_wit smallint default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_horario public.horarios;
begin
  perform public._exigir_admin(p_admin_token);

  if not exists (select 1 from public.escolas where id = p_escola_id) then
    raise exception 'Escola não encontrada.' using errcode = 'P0002';
  end if;

  if p_hora_fim <= p_hora_inicio then
    raise exception 'O horário de término precisa ser depois do início.' using errcode = 'P0004';
  end if;

  if coalesce(p_ocupacao_wit, 0) > coalesce(p_capacidade, 18) then
    raise exception 'A ocupação do Núcleo WIT não pode ser maior que a capacidade da sala.'
      using errcode = 'P0004';
  end if;

  begin
    insert into public.horarios (escola_id, dia_semana, hora_inicio, hora_fim, capacidade, ocupacao_wit)
    values (p_escola_id, p_dia_semana, p_hora_inicio, p_hora_fim,
            coalesce(p_capacidade, 18), coalesce(p_ocupacao_wit, 0))
    returning * into v_horario;
  exception when unique_violation then
    raise exception 'Já existe um horário nesse dia e hora para esta escola.' using errcode = 'P0007';
  end;

  return to_jsonb(v_horario);
end;
$$;

create or replace function public.admin_atualizar_horario(
  p_admin_token  text,
  p_horario_id   uuid,
  p_capacidade   smallint,
  p_ocupacao_wit smallint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_horario public.horarios;
begin
  perform public._exigir_admin(p_admin_token);

  select * into v_horario from public.horarios where id = p_horario_id;

  if not found then
    raise exception 'Horário não encontrado.' using errcode = 'P0002';
  end if;

  v_horario.capacidade   := coalesce(p_capacidade, v_horario.capacidade);
  v_horario.ocupacao_wit := coalesce(p_ocupacao_wit, v_horario.ocupacao_wit);

  if v_horario.ocupacao_wit > v_horario.capacidade then
    raise exception 'A ocupação do Núcleo WIT não pode ser maior que a capacidade da sala.'
      using errcode = 'P0004';
  end if;

  update public.horarios
     set capacidade   = v_horario.capacidade,
         ocupacao_wit = v_horario.ocupacao_wit
   where id = p_horario_id
  returning * into v_horario;

  return to_jsonb(v_horario);
end;
$$;

-- Remove o horário e, em cascata, as reservas dele. Só é permitido
-- quando não há reserva confirmada, para não apagar um compromisso já
-- assumido com um professor sem passar pelo cancelamento.
create or replace function public.admin_remover_horario(p_admin_token text, p_horario_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  if exists (
    select 1 from public.reservas
     where horario_id = p_horario_id and status = 'confirmado'
  ) then
    raise exception 'Cancele a reserva confirmada antes de remover o horário.' using errcode = 'P0008';
  end if;

  delete from public.horarios where id = p_horario_id;

  if not found then
    raise exception 'Horário não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_listar_reservas(p_admin_token text, p_escola_id uuid default null)
returns table (
  id             uuid,
  protocolo      text,
  escola_id      uuid,
  escola_nome    text,
  nome_professor text,
  email_contato  text,
  status         public.status_reserva,
  criado_em      timestamptz,
  cancelado_em   timestamptz,
  cancelado_por  text,
  dia_semana     smallint,
  hora_inicio    time,
  hora_fim       time
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return query
    select r.id, r.protocolo, e.id, e.nome, r.nome_professor, r.email_contato,
           r.status, r.criado_em, r.cancelado_em, r.cancelado_por,
           h.dia_semana, h.hora_inicio, h.hora_fim
      from public.reservas r
      join public.horarios h on h.id = r.horario_id
      join public.escolas  e on e.id = h.escola_id
     where p_escola_id is null or e.id = p_escola_id
     order by r.criado_em desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: só as funções públicas ficam acessíveis ao anon key.
-- ---------------------------------------------------------------------

grant execute on function public.acessar_escola(text)                      to anon, authenticated;
grant execute on function public.listar_horarios(text)                     to anon, authenticated;
grant execute on function public.criar_reserva(text, uuid, text, text)     to anon, authenticated;
grant execute on function public.listar_reservas(text)                     to anon, authenticated;
grant execute on function public.cancelar_reserva(text, uuid, text)        to anon, authenticated;
grant execute on function public.editar_reserva(text, uuid, text, text)    to anon, authenticated;

grant execute on function public.admin_listar_escolas(text)                                              to anon, authenticated;
grant execute on function public.admin_criar_escola(text, text)                                          to anon, authenticated;
grant execute on function public.admin_renomear_escola(text, uuid, text)                                 to anon, authenticated;
grant execute on function public.admin_renovar_tokens(text, uuid)                                        to anon, authenticated;
grant execute on function public.admin_listar_horarios(text, uuid)                                       to anon, authenticated;
grant execute on function public.admin_criar_horario(text, uuid, smallint, time, time, smallint, smallint) to anon, authenticated;
grant execute on function public.admin_atualizar_horario(text, uuid, smallint, smallint)                 to anon, authenticated;
grant execute on function public.admin_remover_horario(text, uuid)                                       to anon, authenticated;
grant execute on function public.admin_listar_reservas(text, uuid)                                       to anon, authenticated;

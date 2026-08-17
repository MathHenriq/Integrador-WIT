-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 8: importar o documento de aula do Canva
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================

-- --------------------------------------------------------------------
-- Por que
-- --------------------------------------------------------------------
-- A equipe já preenche, para cada aula, o documento do Canva: tema,
-- curso, turma, data, professor, escola, objetivos, descrição, materiais
-- e as fotos. Redigitar tudo isso no painel é trabalho repetido, e
-- trabalho repetido não é feito — foi por isso que a vitrine de aulas
-- realizadas passou tanto tempo vazia.
--
-- O importador lê o PDF exportado do Canva e devolve a aula pronta. Quem
-- lê o arquivo é uma Edge Function (supabase/functions/importar-canva),
-- porque só ela tem service role para subir as fotos no Storage; o
-- painel não tem login de verdade, e abrir o Storage para o papel anon
-- deixaria qualquer pessoa subir arquivo (a mesma razão da 0004).

-- --------------------------------------------------------------------
-- Onde as fotos ficam
-- --------------------------------------------------------------------
-- Balde público na leitura: a vitrine é pública, a foto precisa abrir
-- sem token. Na escrita não há policy nenhuma para anon/authenticated,
-- então só o service role da Edge Function grava aqui.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-aulas', 'fotos-aulas', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- --------------------------------------------------------------------
-- A trilha das importações
-- --------------------------------------------------------------------
-- Guardar o que foi lido serve para três coisas concretas: avisar quando
-- o mesmo documento é importado duas vezes, saber de onde veio uma aula
-- da vitrine, e achar foto órfã de importação que ninguém terminou.

create table if not exists public.importacoes_canva (
  id             uuid primary key default gen_random_uuid(),
  arquivo_nome   text not null,
  -- sha256 do PDF: é o que identifica "este documento já passou por aqui".
  arquivo_hash   text not null,
  tamanho_bytes  integer not null default 0,
  -- O que o extrator leu, cru, antes de qualquer conferência humana.
  campos         jsonb not null default '{}'::jsonb,
  fotos          text[] not null default '{}',
  avisos         text[] not null default '{}',
  status         text not null default 'rascunho'
                 check (status in ('rascunho', 'aplicada')),
  reserva_id     uuid references public.reservas (id) on delete set null,
  criado_em      timestamptz not null default now(),
  aplicada_em    timestamptz
);

create index if not exists importacoes_canva_hash_idx   on public.importacoes_canva (arquivo_hash);
create index if not exists importacoes_canva_criado_idx on public.importacoes_canva (criado_em desc);

alter table public.importacoes_canva enable row level security;
alter table public.importacoes_canva force  row level security;
revoke all on public.importacoes_canva from anon, authenticated;

-- --------------------------------------------------------------------
-- Conferir a senha sem fazer mais nada
-- --------------------------------------------------------------------
-- A Edge Function chama isto antes de gastar tempo lendo o PDF e subindo
-- foto. Não abre nada que as outras RPCs de admin já não abram: todas
-- recebem a mesma senha e respondem se ela vale.

create or replace function public.admin_conferir_senha(p_admin_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);
  return jsonb_build_object('ok', true);
end;
$$;

-- --------------------------------------------------------------------
-- Comparar nome de professor
-- --------------------------------------------------------------------
-- "Prof. Dante", "DANTE", "Dante Oliveira" e "dante  oliveira" são a
-- mesma pessoa para quem lê. Sem unaccent instalado, o translate resolve
-- os acentos do português, que é o alfabeto que aparece aqui.

create or replace function public._texto_chave(p_texto text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    translate(
      lower(coalesce(p_texto, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    -- fora letras, números e espaço, tudo vira espaço (some o "Prof.",
    -- o ponto, a vírgula) e espaços seguidos viram um só.
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

-- --------------------------------------------------------------------
-- Publicar a aula realizada
-- --------------------------------------------------------------------
-- Aula que já aconteceu não pede escolha de horário: ela está no site
-- para inspirar outros professores, não para ocupar agenda. Então o
-- horário é resolvido aqui dentro, por regra, e ninguém precisa
-- responder nada na tela:
--
--   1. Já existe reserva confirmada nessa escola nessa data com o nome
--      do professor batendo? O relato e as fotos entram nela. É o
--      caminho normal — o professor agendou pelo site, a equipe deu a
--      aula e agora sobe o documento.
--   2. Não existe? Cria a aula no primeiro tempo livre daquele dia.

drop function if exists public.admin_importar_aula_realizada(text, uuid, uuid, date, text, text, text, text, text[]);

create function public.admin_importar_aula_realizada(
  p_admin_token    text,
  p_importacao_id  uuid,
  p_escola_id      uuid,
  p_data_aula      date,
  p_nome_professor text,
  p_turma          text,
  p_titulo         text,
  p_relato         text,
  p_fotos          text[] default '{}'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_escola     public.escolas;
  v_reserva    public.reservas;
  v_horario_id uuid;
  v_titulo     text := btrim(coalesce(p_titulo, ''));
  v_professor  text := btrim(coalesce(p_nome_professor, ''));
  v_turma      text := nullif(btrim(coalesce(p_turma, '')), '');
  v_relato     text := nullif(btrim(coalesce(p_relato, '')), '');
  v_fotos      text[];
  v_anexada    boolean := false;
  v_hora_ini   time;
  v_hora_fim   time;
begin
  perform public._exigir_admin(p_admin_token);

  select * into v_escola from public.escolas where id = p_escola_id;
  if not found then
    raise exception 'Escolha a escola desta aula.' using errcode = 'P0004';
  end if;

  if p_data_aula is null then
    raise exception 'Escolha a data desta aula.' using errcode = 'P0004';
  end if;

  -- A vitrine é de aula que aconteceu. Data no futuro aqui seria uma
  -- reserva disfarçada, com fotos de uma aula que ninguém deu.
  if p_data_aula > public.hoje_brasil() then
    raise exception 'Esta data ainda não chegou. A vitrine é de aulas já realizadas.'
      using errcode = 'P0004';
  end if;

  if length(v_professor) < 3 then
    raise exception 'Diga quem é o professor ou a professora desta aula.' using errcode = 'P0004';
  end if;

  if length(v_titulo) < 3 then
    raise exception 'Dê um tema para a aula — é o título que aparece na vitrine.'
      using errcode = 'P0004';
  end if;

  v_fotos := coalesce(
    (select array_agg(btrim(f)) from unnest(coalesce(p_fotos, '{}')) f where btrim(f) <> ''),
    '{}'
  );

  -- 1. A reserva que já existe, se o nome do professor bater.
  select r.* into v_reserva
    from public.reservas r
    join public.horarios h on h.id = r.horario_id
   where h.escola_id = p_escola_id
     and r.data_aula = p_data_aula
     and r.status = 'confirmado'
     and (
       public._texto_chave(r.nome_professor) = public._texto_chave(v_professor)
       or public._texto_chave(r.nome_professor) like '%' || public._texto_chave(v_professor) || '%'
       or public._texto_chave(v_professor) like '%' || public._texto_chave(r.nome_professor) || '%'
     )
   order by h.hora_inicio
   limit 1;

  if found then
    update public.reservas
       set relato = coalesce(v_relato, relato),
           fotos  = case when array_length(v_fotos, 1) is null then fotos else v_fotos end,
           turma  = coalesce(turma, v_turma)
     where id = v_reserva.id
    returning * into v_reserva;

    v_anexada := true;
  else
    -- 2. Primeiro tempo livre daquele dia da semana.
    select h.id into v_horario_id
      from public.horarios h
     where h.escola_id = p_escola_id
       and h.ativo
       and h.dia_semana = extract(dow from p_data_aula)::smallint
       and not exists (
         select 1 from public.reservas r
          where r.horario_id = h.id
            and r.data_aula = p_data_aula
            and r.status = 'confirmado'
       )
     order by h.hora_inicio
     limit 1;

    if v_horario_id is null then
      -- Duas causas bem diferentes, duas frases diferentes: sem grade
      -- naquele dia (data de fim de semana, quase sempre erro de leitura
      -- do documento) ou grade cheia.
      if not exists (
        select 1 from public.horarios h
         where h.escola_id = p_escola_id
           and h.ativo
           and h.dia_semana = extract(dow from p_data_aula)::smallint
      ) then
        raise exception '% não tem horário nenhum neste dia da semana. Confira a data do documento.',
          v_escola.nome using errcode = 'P0004';
      end if;

      raise exception 'Todos os tempos desta data em % já têm aula registrada.',
        v_escola.nome using errcode = 'P0004';
    end if;

    insert into public.reservas (horario_id, data_aula, nome_professor, turma,
                                 aula_livre, relato, fotos)
    values (v_horario_id, p_data_aula, v_professor, v_turma, v_titulo, v_relato, v_fotos)
    returning * into v_reserva;
  end if;

  select h.hora_inicio, h.hora_fim into v_hora_ini, v_hora_fim
    from public.horarios h where h.id = v_reserva.horario_id;

  if p_importacao_id is not null then
    update public.importacoes_canva
       set status      = 'aplicada',
           reserva_id  = v_reserva.id,
           aplicada_em = now()
     where id = p_importacao_id;
  end if;

  return jsonb_build_object(
    'reserva_id',  v_reserva.id,
    'protocolo',   v_reserva.protocolo,
    'anexada',     v_anexada,
    'data_aula',   v_reserva.data_aula,
    'hora_inicio', v_hora_ini,
    'hora_fim',    v_hora_fim,
    'escola_nome', v_escola.nome,
    'titulo',      coalesce(v_reserva.aula_livre, v_titulo),
    'fotos',       to_jsonb(v_reserva.fotos)
  );
end;
$$;

-- --------------------------------------------------------------------
-- Registrar o que a Edge Function leu
-- --------------------------------------------------------------------
-- Chamada pela função depois de ler o PDF e subir as fotos. Devolve
-- também as importações anteriores do mesmo arquivo, para a tela poder
-- avisar "este documento já entrou" em vez de deixar duplicar calado.

drop function if exists public.admin_registrar_importacao_canva(text, text, text, integer, jsonb, text[], text[]);

create function public.admin_registrar_importacao_canva(
  p_admin_token   text,
  p_arquivo_nome  text,
  p_arquivo_hash  text,
  p_tamanho_bytes integer,
  p_campos        jsonb,
  p_fotos         text[],
  p_avisos        text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id        uuid;
  v_anteriores jsonb;
begin
  perform public._exigir_admin(p_admin_token);

  select coalesce(jsonb_agg(jsonb_build_object(
           'criado_em',  i.criado_em,
           'status',     i.status,
           'protocolo',  r.protocolo,
           'data_aula',  r.data_aula
         ) order by i.criado_em desc), '[]'::jsonb)
    into v_anteriores
    from public.importacoes_canva i
    left join public.reservas r on r.id = i.reserva_id
   where i.arquivo_hash = p_arquivo_hash
     and i.status = 'aplicada';

  insert into public.importacoes_canva
    (arquivo_nome, arquivo_hash, tamanho_bytes, campos, fotos, avisos)
  values
    (coalesce(nullif(btrim(p_arquivo_nome), ''), 'documento.pdf'),
     p_arquivo_hash,
     greatest(coalesce(p_tamanho_bytes, 0), 0),
     coalesce(p_campos, '{}'::jsonb),
     coalesce(p_fotos, '{}'),
     coalesce(p_avisos, '{}'))
  returning id into v_id;

  return jsonb_build_object('importacao_id', v_id, 'anteriores', v_anteriores);
end;
$$;

-- --------------------------------------------------------------------
-- Listar o que já foi importado
-- --------------------------------------------------------------------

create or replace function public.admin_listar_importacoes(p_admin_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._exigir_admin(p_admin_token);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',           i.id,
             'arquivo_nome', i.arquivo_nome,
             'status',       i.status,
             'criado_em',    i.criado_em,
             'fotos',        array_length(i.fotos, 1),
             'protocolo',    r.protocolo,
             'data_aula',    r.data_aula,
             'escola_nome',  e.nome
           ) order by i.criado_em desc)
      from public.importacoes_canva i
      left join public.reservas r on r.id = i.reserva_id
      left join public.horarios h on h.id = r.horario_id
      left join public.escolas  e on e.id = h.escola_id
     where i.status = 'aplicada'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public._texto_chave(text) from public, anon, authenticated;

revoke all on function public.admin_conferir_senha(text) from public;
revoke all on function public.admin_registrar_importacao_canva(text, text, text, integer, jsonb, text[], text[]) from public;
revoke all on function public.admin_importar_aula_realizada(text, uuid, uuid, date, text, text, text, text, text[]) from public;
revoke all on function public.admin_listar_importacoes(text) from public;

grant execute on function public.admin_conferir_senha(text) to anon, authenticated;
grant execute on function public.admin_registrar_importacao_canva(text, text, text, integer, jsonb, text[], text[]) to anon, authenticated;
grant execute on function public.admin_importar_aula_realizada(text, uuid, uuid, date, text, text, text, text, text[]) to anon, authenticated;
grant execute on function public.admin_listar_importacoes(text) to anon, authenticated;

select 'Importação do documento do Canva pronta.' as resultado;

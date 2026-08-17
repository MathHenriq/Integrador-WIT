-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 9: a ponte entre os cursos do WIT e a BNCC
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================

-- --------------------------------------------------------------------
-- Por que
-- --------------------------------------------------------------------
-- O professor não procura a BNCC pelo código. Ele chega com a ideia da
-- aula — "vamos usar o óculos VR para explorar o Sistema Solar" — e a
-- pergunta dele é "onde isso encaixa na minha matéria?".
--
-- Buscar por palavra não responde isso, e a razão é simples: as palavras
-- do WIT não existem no texto da BNCC. "Metaverso", "óculos VR", "robô"
-- e "impressão 3D" não aparecem uma vez sequer no documento. Procurar
-- "metaverso" devolve "pesquisa sobre tema da realidade social", que é
-- pior que não devolver nada.
--
-- Então a ponte é feita à mão, uma vez, e fica no banco: para cada
-- cruzamento de curso do WIT com matéria do comum, UMA habilidade que
-- serve de ponto de partida. Não é a lista definitiva — é o começo de
-- conversa entre o professor da turma e o profissional do WIT, que
-- juntos escolhem as outras.

create table if not exists public.pontes_bncc (
  id            uuid primary key default gen_random_uuid(),
  curso         text not null,
  materia_id    uuid not null references public.materias (id)   on delete cascade,
  habilidade_id uuid not null references public.habilidades (id) on delete cascade,
  -- Por que esta habilidade e não outra. É o que o professor lê.
  motivo        text not null,
  ordem         smallint not null default 100,
  criado_em     timestamptz not null default now(),
  constraint pontes_bncc_uma_por_cruzamento unique (curso, materia_id)
);

create index if not exists pontes_bncc_curso_idx on public.pontes_bncc (curso);

alter table public.pontes_bncc enable row level security;
alter table public.pontes_bncc force  row level security;
revoke all on public.pontes_bncc from anon, authenticated;

-- --------------------------------------------------------------------
-- A carga
-- --------------------------------------------------------------------
-- Os códigos abaixo são todos reais e conferidos contra o PDF oficial da
-- BNCC. Cruzamento cujo código ainda não esteja no banco simplesmente
-- não entra — nada aqui inventa habilidade.

create or replace function public._pontear(
  p_curso text, p_codigo text, p_motivo text, p_ordem smallint
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_habilidade uuid;
  v_materia    uuid;
begin
  select id, materia_id into v_habilidade, v_materia
    from public.habilidades where codigo = upper(p_codigo);

  -- Sem a habilidade carregada, ou sem matéria ligada a ela, não há
  -- ponte para fazer. Segue sem barulho: a carga é reexecutável.
  if v_habilidade is null or v_materia is null then return; end if;

  insert into public.pontes_bncc (curso, materia_id, habilidade_id, motivo, ordem)
  values (p_curso, v_materia, v_habilidade, p_motivo, p_ordem)
  on conflict (curso, materia_id) do update
    set habilidade_id = excluded.habilidade_id,
        motivo        = excluded.motivo,
        ordem         = excluded.ordem;
end;
$$;

do $$
begin
  -- ---------------------------------------------------------- IA
  perform public._pontear('Inteligência Artificial', 'EF69LP32',
    'Antes de treinar qualquer modelo vem a pergunta de português: esta fonte presta? A turma separa dado bom de dado ruim.', 1::smallint);
  perform public._pontear('Inteligência Artificial', 'EF08MA24',
    'Classificar é o que a máquina faz. Aqui a turma classifica na mão primeiro, e entende por que a máquina erra quando a classe está mal escolhida.', 1::smallint);
  perform public._pontear('Inteligência Artificial', 'EF07CI11',
    'A conversa sobre o que a tecnologia digital muda na vida das pessoas, com a IA como caso do momento.', 1::smallint);
  perform public._pontear('Inteligência Artificial', 'EF09HI33',
    'As tecnologias digitais mudaram a política local e mundial. A IA é o capítulo que a turma está vivendo.', 1::smallint);
  perform public._pontear('Inteligência Artificial', 'EF07GE10',
    'Ler um gráfico de dados socioeconômicos é o exercício que revela viés — o mesmo viés que a IA aprende sem avisar.', 1::smallint);
  perform public._pontear('Inteligência Artificial', 'EF69AR31',
    'Arte feita por máquina põe na mesa a dimensão ética e estética da criação: de quem é a obra?', 1::smallint);
  perform public._pontear('Inteligência Artificial', 'EF89EF08',
    'Padrão de desempenho, saúde e beleza é o que os filtros e os algoritmos empurram todo dia. Aqui a turma discute de onde vem esse padrão.', 1::smallint);
  perform public._pontear('Inteligência Artificial', 'EF07LI09',
    'Achar a informação certa dentro do texto é o que se pede a um assistente — e o que o aluno treina antes de pedir.', 1::smallint);

  -- ---------------------------------------------------------- Games
  perform public._pontear('Games', 'EF67LP30',
    'Todo jogo é uma narrativa com regra. Escrever o conto de enigma é escrever o roteiro da fase.', 2::smallint);
  perform public._pontear('Games', 'EF07MA34',
    'Dado, sorteio e chance de dropar item: probabilidade é a matemática que o jogo usa o tempo todo.', 2::smallint);
  perform public._pontear('Games', 'EF08CI15',
    'Simular é o verbo do jogo e o verbo da ciência. A turma monta a simulação e vê as variáveis mudarem o resultado.', 2::smallint);
  perform public._pontear('Games', 'EF06HI10',
    'A pólis grega vira cenário jogável: para desenhar o mapa e as regras, a turma precisa entender como aquela sociedade se organizava.', 2::smallint);
  perform public._pontear('Games', 'EF08GE19',
    'Mapa de jogo é cartografia. Ler croqui e cartograma é o mesmo gesto de ler o mapa do mundo aberto.', 2::smallint);
  perform public._pontear('Games', 'EF69AR29',
    'O jogo cênico e a improvisação são o protótipo do jogo digital, feitos com o corpo antes da tela.', 2::smallint);
  perform public._pontear('Games', 'EF67EF02',
    'A BNCC fala de jogo eletrônico com todas as letras: como ele mudou com a tecnologia e o que exige do corpo.', 2::smallint);
  perform public._pontear('Games', 'EF09LI05',
    'A capa, o trailer e o nome do jogo são persuasão em inglês — cor, imagem e jogo de palavras.', 2::smallint);

  -- ---------------------------------------------------------- Metaverso
  perform public._pontear('Metaverso', 'EF69LP33',
    'Descrever um espaço que ninguém viu exige articular texto, esquema e imagem — que é o que o ambiente virtual faz.', 3::smallint);
  perform public._pontear('Metaverso', 'EF09MA17',
    'Vista ortogonal e perspectiva são exatamente o que o aluno manipula ao montar um cenário em três dimensões.', 3::smallint);
  perform public._pontear('Metaverso', 'EF09CI14',
    'É a aula do exemplo: a turma percorre o Sistema Solar no óculos e depois descreve a composição e a estrutura dele.', 3::smallint);
  perform public._pontear('Metaverso', 'EF09HI05',
    'Reconstruir a cidade de outra época no ambiente virtual obriga a entender a urbanização e as contradições dela.', 3::smallint);
  perform public._pontear('Metaverso', 'EF06GE09',
    'A BNCC pede modelo tridimensional e bloco-diagrama. O metaverso é o lugar onde isso deixa de ser papel.', 3::smallint);
  perform public._pontear('Metaverso', 'EF69AR04',
    'Espaço, escala, dimensão e movimento: os elementos das artes visuais são os controles do ambiente virtual.', 3::smallint);
  perform public._pontear('Metaverso', 'EF67EF11',
    'Ritmo, espaço e gesto são os elementos da dança — e o que o corpo faz dentro do ambiente imersivo.', 3::smallint);
  perform public._pontear('Metaverso', 'EF07LI21',
    'Ambiente virtual é lugar onde o mundo inteiro se encontra, e a língua franca desse encontro é o inglês.', 3::smallint);

  -- -------------------------------------------- Ambientes inteligentes
  perform public._pontear('Ambientes Inteligentes (IoT)', 'EF69LP38',
    'O sensor gera número; alguém precisa transformar isso em painel que se entenda. É produção de texto com dado.', 4::smallint);
  perform public._pontear('Ambientes Inteligentes (IoT)', 'EF07MA29',
    'Medir grandeza em contexto do dia a dia é literalmente o que o sensor faz — e a turma confere se a conta fecha.', 4::smallint);
  perform public._pontear('Ambientes Inteligentes (IoT)', 'EF08CI05',
    'A BNCC pede ação coletiva para otimizar a energia da escola. Com sensor, a turma mede antes e depois.', 4::smallint);
  perform public._pontear('Ambientes Inteligentes (IoT)', 'EF08HI03',
    'A Revolução Industrial é a primeira vez que a máquina passa a medir e a ditar o ritmo. O IoT é a mesma história, agora.', 4::smallint);
  perform public._pontear('Ambientes Inteligentes (IoT)', 'EF07GE06',
    'Produção, circulação e consumo com impacto ambiental: o painel de sensores mostra o consumo da própria escola.', 4::smallint);
  perform public._pontear('Ambientes Inteligentes (IoT)', 'EF69AR06',
    'A instalação artística com sensor reage a quem passa: criação em artes visuais que só existe com o público dentro.', 4::smallint);
  perform public._pontear('Ambientes Inteligentes (IoT)', 'EF67EF10',
    'Diferenciar exercício de atividade física fica concreto quando a turma mede as duas coisas com o próprio sensor.', 4::smallint);
  perform public._pontear('Ambientes Inteligentes (IoT)', 'EF06LI25',
    'Sensor, display, reset: o vocabulário do laboratório é inglês, e ele já circula na comunidade.', 4::smallint);

  -- --------------------------------------------- Comunicação digital
  perform public._pontear('Comunicação Digital', 'EF89LP08',
    'Planejar reportagem para rádio, vídeo ou site é o coração do curso — e é habilidade de português.', 5::smallint);
  perform public._pontear('Comunicação Digital', 'EF09MA21',
    'Gráfico que engana está em toda parte. A turma aprende a fazer o gráfico honesto e a flagrar o desonesto.', 5::smallint);
  perform public._pontear('Comunicação Digital', 'EF09CI05',
    'Como imagem e som viajam: é a física que sustenta o vídeo que a turma vai gravar.', 5::smallint);
  perform public._pontear('Comunicação Digital', 'EF08HI22',
    'Quem conta a história, e por qual meio, decide qual identidade fica registrada. Vale para o século XIX e para o feed.', 5::smallint);
  perform public._pontear('Comunicação Digital', 'EF07GE07',
    'As redes de comunicação desenham o território tanto quanto as estradas. A turma mapeia por onde a informação passa.', 5::smallint);
  perform public._pontear('Comunicação Digital', 'EF69AR35',
    'Acessar, produzir, registrar e compartilhar com recurso digital: a BNCC de Arte descreve o curso inteiro.', 5::smallint);
  perform public._pontear('Comunicação Digital', 'EF89EF01',
    'A turma vira equipe de transmissão do jogo da escola: quem narra, quem filma, quem arbitra.', 5::smallint);
  perform public._pontear('Comunicação Digital', 'EF07LI04',
    'Reconhecer finalidade e interlocutor em texto de cinema, internet e TV — em inglês, que é onde a maior parte circula.', 5::smallint);
end $$;

-- --------------------------------------------------------------------
-- Consulta pública
-- --------------------------------------------------------------------

create or replace function public.listar_pontes_bncc()
returns table (
  curso              text,
  ordem              smallint,
  materia_nome       text,
  materia_cor        text,
  habilidade_codigo  text,
  habilidade_texto   text,
  motivo             text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.curso, p.ordem, m.nome, m.cor, h.codigo, h.descricao, p.motivo
    from public.pontes_bncc p
    join public.materias    m on m.id = p.materia_id
    join public.habilidades h on h.id = p.habilidade_id
   order by p.ordem, p.curso, m.ordem, m.nome;
$$;

revoke all on function public._pontear(text, text, text, smallint) from public, anon, authenticated;
revoke all on function public.listar_pontes_bncc() from public;
grant execute on function public.listar_pontes_bncc() to anon, authenticated;

select 'Pontes entre os cursos do WIT e a BNCC prontas.' as resultado;

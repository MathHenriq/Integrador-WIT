-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 10: as pontes viram atividades do catálogo
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================

-- --------------------------------------------------------------------
-- Por que
-- --------------------------------------------------------------------
-- A 0009 criou uma página só para mostrar a ponte entre cada curso do
-- WIT e cada matéria do comum. A página ficou pouco útil: era mais uma
-- aba para o professor visitar, e o que estava ali dentro já era ideia
-- de aula.
--
-- Então elas passam para onde o professor já procura — o catálogo de
-- atividades —, com o curso do WIT no lugar do tema. O que era "olhe
-- esta ponte" vira "marque esta aula".
--
-- A tabela `pontes_bncc` continua sendo a fonte: é dela que sai a
-- matéria, a habilidade e o motivo. A página `/cursos` é que sai do ar.

create or replace function public._aula_da_ponte(
  p_curso text, p_codigo text, p_titulo text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ponte      public.pontes_bncc;
  v_habilidade public.habilidades;
  v_aula_id    uuid;
  v_anos       smallint[];
  v_digitos    text;
begin
  select p.* into v_ponte
    from public.pontes_bncc p
    join public.habilidades h on h.id = p.habilidade_id
   where p.curso = p_curso and h.codigo = upper(p_codigo);

  if not found then return; end if;

  select * into v_habilidade from public.habilidades where id = v_ponte.habilidade_id;

  -- Os anos saem do próprio código: "08" é o 8º ano, "69" é do 6º ao 9º.
  v_digitos := substring(v_habilidade.codigo from 3 for 2);
  v_anos := case
    when left(v_digitos, 1) = '0' then array[right(v_digitos, 1)::smallint]
    else (
      select array_agg(n::smallint)
        from generate_series(left(v_digitos, 1)::int, right(v_digitos, 1)::int) n
    )
  end;

  -- O título é a chave natural: reexecutar atualiza em vez de duplicar.
  select id into v_aula_id from public.aulas where titulo = p_titulo;

  if v_aula_id is null then
    insert into public.aulas (titulo, tema, resumo, materia_id, anos, duracao_min, publicada)
    values (p_titulo, p_curso, v_ponte.motivo, v_ponte.materia_id, v_anos, 90, true)
    returning id into v_aula_id;
  else
    update public.aulas
       set tema = p_curso, resumo = v_ponte.motivo, materia_id = v_ponte.materia_id,
           anos = v_anos, atualizado_em = now()
     where id = v_aula_id;
  end if;

  insert into public.aulas_habilidades (aula_id, habilidade_id)
  values (v_aula_id, v_ponte.habilidade_id)
  on conflict do nothing;
end;
$$;

do $$
begin
  -- ---------------------------------------------------------- IA
  perform public._aula_da_ponte('Inteligência Artificial', 'EF69LP32', 'Caça às fontes: o que a IA aprendeu errado');
  perform public._aula_da_ponte('Inteligência Artificial', 'EF08MA24', 'Classificar como a máquina: dos dados às classes');
  perform public._aula_da_ponte('Inteligência Artificial', 'EF07CI11', 'A tecnologia mudou o quê? Linha do tempo até a IA');
  perform public._aula_da_ponte('Inteligência Artificial', 'EF09HI33', 'Antes e depois da rede: a política na era digital');
  perform public._aula_da_ponte('Inteligência Artificial', 'EF07GE10', 'O gráfico mente? Dados da nossa região sob suspeita');
  perform public._aula_da_ponte('Inteligência Artificial', 'EF69AR31', 'Arte feita por máquina: de quem é a obra?');
  perform public._aula_da_ponte('Inteligência Artificial', 'EF89EF08', 'Corpo de filtro: o padrão que o algoritmo empurra');
  perform public._aula_da_ponte('Inteligência Artificial', 'EF07LI09', 'Prompt em inglês: achar a informação certa');

  -- ---------------------------------------------------------- Games
  perform public._aula_da_ponte('Games', 'EF67LP30', 'Roteiro de fase: escrever o conto de enigma jogável');
  perform public._aula_da_ponte('Games', 'EF07MA34', 'Chance de dropar: a probabilidade dentro do jogo');
  perform public._aula_da_ponte('Games', 'EF08CI15', 'Simulador do tempo: mexer nas variáveis e ver o que muda');
  perform public._aula_da_ponte('Games', 'EF06HI10', 'A pólis jogável: mapa e regras da Grécia Antiga');
  perform public._aula_da_ponte('Games', 'EF08GE19', 'Mapa de mundo aberto: croqui, cartograma e legenda');
  perform public._aula_da_ponte('Games', 'EF69AR29', 'Jogo cênico: prototipar o game com o corpo');
  perform public._aula_da_ponte('Games', 'EF67EF02', 'Do fliperama ao VR: o corpo no jogo eletrônico');
  perform public._aula_da_ponte('Games', 'EF09LI05', 'Trailer e capa: persuasão em inglês');

  -- ---------------------------------------------------------- Metaverso
  perform public._aula_da_ponte('Metaverso', 'EF69LP33', 'Descrever um lugar que ainda não existe');
  perform public._aula_da_ponte('Metaverso', 'EF09MA17', 'Vistas e perspectiva: montar o cenário em três dimensões');
  perform public._aula_da_ponte('Metaverso', 'EF09CI14', 'Sistema Solar no óculos: percorrer e descrever');
  perform public._aula_da_ponte('Metaverso', 'EF09HI05', 'A cidade de outra época, reconstruída');
  perform public._aula_da_ponte('Metaverso', 'EF06GE09', 'Do bloco-diagrama ao terreno navegável');
  perform public._aula_da_ponte('Metaverso', 'EF69AR04', 'Espaço, escala e cor: os controles do ambiente virtual');
  perform public._aula_da_ponte('Metaverso', 'EF67EF11', 'Dança no espaço imersivo: ritmo, espaço e gesto');
  perform public._aula_da_ponte('Metaverso', 'EF07LI21', 'Encontro global: o inglês dentro do ambiente virtual');

  -- ------------------------------------------- Ambientes inteligentes
  perform public._aula_da_ponte('Ambientes Inteligentes (IoT)', 'EF69LP38', 'Do sensor ao painel: apresentar o dado para alguém entender');
  perform public._aula_da_ponte('Ambientes Inteligentes (IoT)', 'EF07MA29', 'Medir de verdade: grandezas com sensor na mão');
  perform public._aula_da_ponte('Ambientes Inteligentes (IoT)', 'EF08CI05', 'Quanta energia a escola gasta? Medir, propor e medir de novo');
  perform public._aula_da_ponte('Ambientes Inteligentes (IoT)', 'EF08HI03', 'A máquina que passou a ditar o ritmo');
  perform public._aula_da_ponte('Ambientes Inteligentes (IoT)', 'EF07GE06', 'Consumo e pegada: o painel da própria escola');
  perform public._aula_da_ponte('Ambientes Inteligentes (IoT)', 'EF69AR06', 'Instalação que reage a quem passa');
  perform public._aula_da_ponte('Ambientes Inteligentes (IoT)', 'EF67EF10', 'Exercício ou atividade física? O sensor responde');
  perform public._aula_da_ponte('Ambientes Inteligentes (IoT)', 'EF06LI25', 'Sensor, display, reset: o inglês do laboratório');

  -- -------------------------------------------- Comunicação digital
  perform public._aula_da_ponte('Comunicação Digital', 'EF89LP08', 'Reportagem em vídeo: da pauta à edição');
  perform public._aula_da_ponte('Comunicação Digital', 'EF09MA21', 'Gráfico honesto, gráfico torto');
  perform public._aula_da_ponte('Comunicação Digital', 'EF09CI05', 'Como a imagem e o som viajam até a tela');
  perform public._aula_da_ponte('Comunicação Digital', 'EF08HI22', 'Quem conta a história decide o que fica');
  perform public._aula_da_ponte('Comunicação Digital', 'EF07GE07', 'Por onde a informação passa: redes e território');
  perform public._aula_da_ponte('Comunicação Digital', 'EF69AR35', 'Produzir e compartilhar com recurso digital');
  perform public._aula_da_ponte('Comunicação Digital', 'EF89EF01', 'Equipe de transmissão: narrar o jogo da escola');
  perform public._aula_da_ponte('Comunicação Digital', 'EF07LI04', 'Cinema, internet e TV: para quem se fala?');
end $$;

-- --------------------------------------------------------------------
-- A página some, a tabela fica
-- --------------------------------------------------------------------
-- `pontes_bncc` continua guardando a curadoria e é a fonte desta carga.
-- Só a consulta pública sai, porque a tela que a usava deixou de existir.

drop function if exists public.listar_pontes_bncc();

revoke all on function public._aula_da_ponte(text, text, text) from public, anon, authenticated;

select 'Pontes publicadas como atividades do catálogo.' as resultado;

-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 16: os nomes oficiais das escolas
--
--   Cole no SQL Editor. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- As escolas entraram na `0005` com o nome abreviado da planilha, em
-- maiúsculas ("EMEF MARIA MEDUNECKAS - PROF."). A relação oficial tem
-- nome por extenso, com o cargo na frente e a grafia certa — é o que o
-- professor reconhece e o que a Secretaria usa.
--
-- O nome é o mesmo registro: renomear não mexe em reserva, aula nem
-- foto, porque tudo aponta para o `id` da escola.
--
-- A busca é por um pedaço do nome, sem acento e sem caixa
-- (`_texto_chave`), e não pelo texto inteiro: assim vale tanto para o
-- banco que ainda está com o nome antigo quanto para o que já foi
-- renomeado, e rodar de novo não faz nada.

do $$
declare
  v_par text[];
  -- pedaço que identifica a escola  ->  nome oficial
  v_nomes text[][] := array[
    ['anna irene',          'EMEIEF Anna Irene Mazaro de Freitas'],
    ['armando cavazza',     'EMEF Armando Cavazza'],
    ['benedito adherbal',   'EMEIEF Benedito Adherbal Farbo'],
    ['carlos osmarinho',    'Complexo Educacional Professor Carlos Osmarinho de Lima'],
    ['dalva fogaca',        'EMEF Professora Dalva Fogaça'],
    ['egidio costa',        'EMEF Professor Egídio Costa'],
    ['elisabet titto',      'EMEIEF Vereadora Elisabet Titto'],
    ['eneias raimundo',     'EMEIEF Professor Eneias Raimundo da Silva'],
    ['ezio berzaghi',       'EMEF Professor Ézio Berzaghi'],
    ['francisco zacarioto', 'EMEF Francisco Zacarioto'],
    ['joao tiburcio',       'EMEF Prof. João Tibúrcio Silva Filho'],
    ['julio gomes camisao', 'EMEF Júlio Gomes Camisão'],
    ['medune',              'EMEF Professora Maria Medunekas'],
    ['nestor de camargo',   'EMEF Prefeito Nestor de Camargo'],
    ['renato rosa',         'EMEF Renato Rosa'],
    ['rita de jesus',       'EMEF Rita de Jesus'],
    ['jose emidio',         'EMEIEF José Emidio de Aguiar']
  ];
begin
  foreach v_par slice 1 in array v_nomes loop
    update public.escolas
       set nome = v_par[2]
     where public._texto_chave(nome) like '%' || v_par[1] || '%'
       and nome <> v_par[2];
  end loop;
end $$;

-- --------------------------------------------------------------------
-- A escola que faltava
-- --------------------------------------------------------------------
-- A relação oficial tem dezoito escolas; o cadastro tinha dezessete.

insert into public.escolas (nome)
select 'EMEF Professor Alfredo do Carmo'
 where not exists (
   select 1 from public.escolas e where public._texto_chave(e.nome) like '%alfredo do carmo%'
 );

-- A grade padrão da sala, para a escola nova poder receber turma: de
-- segunda a sexta, nos quatro tempos. Igual à da `0005`.

insert into public.horarios (escola_id, dia_semana, hora_inicio, hora_fim, capacidade)
select e.id, d.dia, f.inicio::time, f.fim::time, 20
  from public.escolas e
  cross join generate_series(1, 5) as d(dia)
  cross join (values
    ('07:20', '08:50'),
    ('09:20', '10:50'),
    ('13:20', '14:50'),
    ('15:20', '16:50')
  ) as f(inicio, fim)
 where public._texto_chave(e.nome) like '%alfredo do carmo%'
   and not exists (
     select 1 from public.horarios h
      where h.escola_id = e.id
        and h.dia_semana = d.dia
        and h.hora_inicio = f.inicio::time
   );

select nome from public.escolas order by nome;

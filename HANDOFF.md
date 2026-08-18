# Handoff — onde o projeto parou

> Leia o `CLAUDE.md` primeiro: ele tem a definição do produto, as regras de interface, a lista
> de escolas e os horários. **Este arquivo é o estado da obra**; o `CLAUDE.md` é permanente.

Site no ar pelo Vercel, banco no Supabase (projeto `Integrador-WIT`, ref `mdwqwwdohwixxotyeiua`).

---

## 1. Primeira coisa a fazer: conferir o banco

**Da `0001` à `0011`, tudo já foi aplicado e conferido.** A consulta abaixo tem que voltar todos
os números do nome da coluna:

```sql
select
  (select count(*) from public.escolas)                              as escolas_esperado_17,
  (select count(*) from public.horarios)                             as horarios_esperado_340,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='reservas'
      and column_name='fotos')                                       as coluna_fotos_esperado_1,
  (select count(*) from public.materias where cor = '#2563eb')       as cores_esperado_1,
  (select count(*) from pg_proc
    where proname = 'admin_importar_habilidades')                    as importador_esperado_1,
  (select count(*) from pg_proc
    where proname = 'admin_importar_aula_realizada')                 as importador_canva_esperado_1,
  (select count(*) from storage.buckets
    where id = 'fotos-aulas' and public)                             as balde_esperado_1,
  (select count(*) from public.habilidades)                          as bncc_esperado_1303,
  (select count(*) from public.pontes_bncc)                          as pontes_esperado_40,
  (select count(*) from public.aulas where publicada)                as atividades_esperado_40,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'listar_habilidades'
      and p.pronargs = 4)                                            as busca_bncc_esperado_1;
```

Se `coluna_fotos` vier 0, **as páginas de atividade e de aulas realizadas quebram assim que
existir uma aula realizada** — o front já lê esse campo. Rode `0004_fotos_das_aulas.sql`.

### Edge Functions

`importar-canva` **está deployada e testada em produção**. A `enviar-confirmacao` existe no
repositório mas **nunca subiu** — a confirmação por e-mail continua desligada, o que não quebra
nada (o protocolo na tela é a confirmação que vale).

### Ordem de execução das migrations

Da `0002` em diante todos os arquivos reexecutam à vontade, **em ordem**. A `0001` só reexecuta em
banco que ainda não passou pela `0002` (a `0002` apaga as colunas de token que as funções da
`0001` usam). Isso está escrito no cabeçalho dela.

### O conector do Supabase

Existem **duas instalações** do Supabase na conta: uma `connected`, outra `unknown`. **Remover a
duplicada** deve resolver as quedas.

O estado que aparece do lado do Claude é `connected: true, enabledInChat: false`: autenticado na
conta, desligado *naquele chat*. A lista de ferramentas do conector é fixada quando a conversa
começa — ligar o botão no meio de uma conversa **não** vale para ela; é preciso abrir um chat
novo. Também não adianta tentar falar com `supabase.co` por HTTP da sessão: o proxy de rede
devolve 403 no CONNECT (dá para liberar mudando a política de rede do ambiente).

Atenção: `list_projects` já voltou vazio mesmo com o conector ligado (a org nasceu pela
integração Vercel↔Supabase). Nesse caso, passar o `project_id` direto funciona.

---

## 2. O que falta construir

### 2.1 A BNCC — **carregada**, e a ponte com os cursos do WIT também
**As 1.303 habilidades estão no banco.** Não foi preciso pedir arquivo a ninguém: o leitor de PDF
do importador do Canva lê o documento oficial do MEC (600 páginas) em quatro segundos. Para
recarregar, `ferramentas/extrair-bncc.mts` — a receita está no cabeçalho dele.

Ficam sem matéria só as 63 de Ensino Religioso, porque essa matéria não está cadastrada.

#### O corte de mil linhas do PostgREST

Vale saber antes de mexer em qualquer lista que possa crescer: **o PostgREST devolve no máximo mil
linhas e não avisa**. A `listar_habilidades` antiga trazia tudo e filtrava no navegador — o que
significava que, das 1.303, **303 não existiam** para quem usava a tela. Não dava erro, não dava
aviso; elas só não estavam lá.

Por isso a `0011` levou a busca para dentro do banco, com limite explícito e o `count(*) over ()`
junto, para a tela poder dizer *"mostrando as primeiras 60 de 1.303"*. **Filtrar no navegador não
é opção em lista grande**: o que foi cortado nunca chegou.

Duas armadilhas que já custaram tempo e estão resolvidas na `0011`:

- `ilike` ignora a caixa mas **não** ignora o acento. A descrição combina via `_texto_chave`,
  senão "posicao" não acha "posição" e o professor conclui que a habilidade não existe.
- No editor de aula, guardar só os `id` das habilidades marcadas fazia a escolhida **sumir da
  tela** na busca seguinte, enquanto seguia salva — parecia que tinha desmarcado sozinha. As
  marcadas são guardadas como objeto inteiro e entram na lista mesmo fora do resultado.

#### O que a busca por palavra não resolve, e o que foi feito no lugar

O pedido real não era agrupar por tema: era **o professor descrever a ideia da aula e a ferramenta
achar a habilidade**. Isso foi testado e **não funciona com busca por palavra**, por um motivo que
não tem contorno: *metaverso*, *óculos VR*, *robô* e *impressão 3D* **não aparecem uma única vez
no texto da BNCC**. Buscar "metaverso" devolve "pesquisa sobre tema da realidade social".

A saída escolhida foi a ponte curada (migration `0009`): para cada cruzamento de curso do WIT com
matéria do comum, **uma** habilidade real, com uma frase dizendo por que ela. São 5 cursos × 8
matérias = 40 pontes, e os 40 códigos foram conferidos contra o PDF oficial.

Elas nasceram numa página própria (`/cursos`) e **a página foi removida na `0010`**: era mais uma
aba para o professor visitar, e o que estava lá dentro já era ideia de aula. Agora as 40 são
**atividades do catálogo**, com o curso do WIT no lugar do tema — onde o professor já procura. A
tabela `pontes_bncc` continua sendo a fonte da carga; só a tela saiu.

Se um dia quiserem a busca por frase de verdade, o caminho é etiquetar as 1.303 uma vez com uma
IA (script com chave de API, custo de centavos, uma vez só) e deixar a busca em cima das
etiquetas, que aí é `to_tsvector` e sai de graça. **Não** vale fazer isso dentro de uma conversa:
aí sim o custo é absurdo.

O `extrair-bncc.mts` já separa o **objeto de conhecimento** de 727 habilidades (vem grudado no fim
da descrição, na coluna ao lado da tabela). É por ali que sai o agrupamento por tema, quando for a
vez dele: falta uma coluna em `habilidades` e a terceira lista no `admin_importar_habilidades`.

### 2.2 Importador do documento do Canva — **pronto**
Sobe o PDF na aba "Importar do Canva" do painel e vira aula realizada. As peças:

| onde | o quê |
| --- | --- |
| `supabase/functions/importar-canva/pdf.ts` | leitor de PDF escrito à mão, sem dependência |
| `.../texto.ts` | texto das páginas, traduzindo o `/ToUnicode` de cada fonte |
| `.../imagens.ts` | fotos: JPEG sai direto, Flate vira PNG |
| `.../extrair.ts` | os campos rotulados e a data |
| `.../index.ts` | HTTP: confere a senha, sobe as fotos, registra |
| `0008_importar_do_canva.sql` | balde, tabela `importacoes_canva` e as RPCs |
| `src/componentes/ImportarCanva.tsx` | a tela de conferência |

**Sem biblioteca de PDF de propósito.** O pdf.js resolveria o texto mas não entrega as imagens sem
canvas, e custa ~1 MB de arranque frio. O leitor usa só APIs da plataforma, então **roda igual no
Node** — é o que permite testar sem deployar.

**Separar foto de template**, a parte que importa: num PDF a mesma imagem é *um* objeto
referenciado por várias páginas. Conta-se em quantas páginas cada objeto aparece; apareceu em
todas, é cabeçalho/rodapé e vai fora. Nada de comparar bytes ou chutar tamanho. Há ainda um piso
de 120 px de lado, que pega ícone solto.

**O horário não é perguntado.** Aula que já aconteceu está no site para inspirar outro professor,
não para ocupar agenda. A RPC resolve: se já existe reserva confirmada naquela escola naquela data
com o nome do professor batendo, o relato e as fotos entram *nela*; senão, cria no primeiro tempo
livre do dia.

**Nada derruba a importação.** PDF fora do padrão vira formulário meio preenchido com aviso — e as
fotos são extraídas assim mesmo, que é o trabalho maior. Recusa mesmo, só: arquivo que não é PDF,
PDF com senha, acima de 10 MB e data no futuro.

**Duas armadilhas do arquivo de verdade**, descobertas exportando um documento do Canva da conta
da equipe e rodando o extrator nele:

1. **O Canva desenha uma letra por vez**, cada glifo com o seu próprio `Td`. O leitor antigo
   decidia o espaço por "mudou o x, então cabe um espaço" e devolvia `T E M A  D A  A U L A` —
   texto perfeito aos olhos, e nenhum rótulo casava. Agora o `texto.ts` soma a largura dos glifos
   (`/Widths` nas fontes simples, `/W` e `/DW` nas Type0): espaço é só o buraco que sobra além do
   avanço natural da letra anterior.
2. **A ordem dos objetos não é a ordem de leitura.** No documento do Canva os rótulos são
   desenhados primeiro e os valores depois, então "TEMA DA AULA:" era seguido, no texto extraído,
   por "MATERIAIS E RECURSOS" — e o tema saía vazio. O leitor agora acompanha a matriz (`cm`,
   `q`/`Q`, `Tm`, `Td`, `/Matrix` do formulário) e devolve **linhas com x e y**, ordenadas de cima
   para baixo. O resto do extrator não mudou: continua achando o rótulo e recortando até o
   próximo.

**O logo não é foto.** A regra do template era "objeto de imagem referenciado por todas as
páginas". O Canva grava o MESMO logo como um objeto por página — cada um aparecia numa página só,
e os dois subiam como se fossem foto da aula. A conta passou a ser por **conteúdo** (SHA-1 dos
bytes), o que de quebra resolve a foto que o Canva duplica dentro do arquivo.

Resultado nos três documentos reais testados: 9 de 9 campos (o terceiro tem 8 porque a caixa de
materiais está vazia no próprio documento) e só as fotos de verdade.

**Campo que não veio tem aviso próprio.** A tela de conferência marca em âmbar, embaixo do campo,
qual deles o documento não entregou — e o cabeçalho diz "7 de 8 campos preenchidos pelo
documento". O resto continua preenchido: documento fora do padrão nunca vira parede.

**A aula importada vira atividade** (`0014`). O documento do Canva é bom demais para servir só de
registro: tema, objetivos, descrição e materiais são o que outro professor precisa para repetir a
proposta. A importação abre a atividade no catálogo, amarra a reserva nela (`reservas.aula_id`) e
tira daí o ano do dado que já existe — "8C" vira 8º ano. Como `obter_aula` já junta as fotos das
reservas ligadas, as fotos da aula aparecem na página da atividade sem cópia nenhuma. Mesmo tema
importado de novo reaproveita a atividade e só completa o que estava em branco. A caixa fica
marcada por padrão na tela de conferência; desmarcar registra a aula sem publicar no catálogo.

**Como testar sem o arquivo do usuário.** `ferramentas/gerar-pdf-de-teste.mjs` monta um PDF que
imita o do Canva: fontes recortadas com `/ToUnicode` (1 e 2 bytes) **e com larguras de glifo**,
páginas escondidas num `/ObjStm`, cabeçalho e rodapé **gravados como dois objetos cada**, fotos em
JPEG e em Flate, um ícone pequeno, e uma folha de rosto escrita **letra por letra com os rótulos
antes dos valores**. É o caso difícil de propósito — as duas armadilhas de cima estão ali dentro.

### 2.3 Integradores realizados — **pronto**

Aba "Integradores realizados" do painel: as escolas que estão no projeto agora, os filtros e a
lista das aulas.

| onde | o quê |
| --- | --- |
| `src/componentes/IntegradoresRealizados.tsx` | a aba inteira |
| `src/lib/relato.ts` | o relato e as fotos perguntados no navegador, usados por duas abas |
| `0013_fotos_na_lista_de_reservas.sql` | a coluna que faltava na `admin_listar_reservas` |

**Filtros no topo**, antes de qualquer coisa: escola, período (de/até) e situação — Tudo,
Realizadas, Agendadas, Canceladas, nessa ordem. As datas são comparadas como string `AAAA-MM-DD`,
igual ao resto do site; `new Date` mostraria o dia anterior.

**"Em projeto integrador agora"** é só a lista de nomes das escolas com aula confirmada, e some da
tela quando não há nenhuma — um "0 de 17" não diz nada a ninguém. Quem tem projeto reservado
aparece na aba de reservas, e quem não tem não aparece em lugar nenhum: panorama escola por escola
foi tentado e reprovado, junto com "escola parada" e "falta o registro".

**O bug que apagava a tela** (`0013`): `admin_listar_reservas` nunca devolveu `fotos`, e a tela lê
`reserva.fotos.length` em toda linha. A aba de reservas só toca nesse campo em aula confirmada que
já aconteceu — como não havia nenhuma, o erro ficou escondido desde a `0004`. Bastou uma cancelada
na tela para o React derrubar a página inteira. **Lição:** o tipo `ReservaAdmin` é um contrato, e
nada garante que a RPC o cumpra — quando mexer numa das pontas, confira a outra.

### 2.4 Gerador do documento — **pronto**

O caminho contrário do importador: a aba "Novo documento" do painel tem os mesmos campos do Canva,
recebe as fotos e **devolve o PDF pronto**, no mesmo desenho — além de publicar a aula realizada e
abrir a atividade no catálogo.

| onde | o quê |
| --- | --- |
| `src/lib/documento/escritor.ts` | escritor de PDF: caixas, texto, JPEG e páginas |
| `src/lib/documento/montar.ts` | o layout do documento, medida por medida |
| `src/lib/documento/modelo.ts` | o logo e a marca d'água, gerados pela ferramenta |
| `src/componentes/CriarDocumento.tsx` | o formulário e as fotos |
| `ferramentas/extrair-modelo.mts` | tira o logo e a marca de um PDF do Canva |
| `ferramentas/conferir-gerador.mts` | gera um documento e o passa pelo importador |

**Roda no navegador, não no servidor.** O PDF é montado na máquina de quem preencheu e sobe pelo
**mesmo caminho de um PDF do Canva**: a Edge Function `importar-canva` hospeda as fotos e registra
o arquivo. Um caminho só nos dois sentidos, e nenhuma função nova para manter. O `modelo.ts` (99 KB,
quase tudo base64 das duas imagens) fica num pedaço separado do bundle, carregado só quando alguém
clica em gerar.

**Nenhuma medida foi estimada a olho.** As caixas são os retângulos brancos do PDF exportado, as
posições do logo e da marca são as matrizes com que o Canva os desenha, e os tamanhos de letra são
os do texto de lá — tudo lido com `ferramentas/placas`-como-script durante o desenvolvimento e
anotado em `montar.ts`.

**A fonte não é embutida, e é de propósito.** O documento do Canva escreve 98% do texto em
Arial-BoldMT; a Helvetica-Bold, uma das 14 fontes que todo visualizador tem, tem **as mesmas
larguras de glifo** que a Arial. O texto cai onde caía, e o arquivo não carrega fonte nenhuma. (O
resto do original é "Now Bold", uma fonte do Canva: o recorte embutido no PDF cobre 31 glifos, nem
metade do alfabeto, então não dava para reaproveitar.)

**A prova é o round-trip.** `ferramentas/conferir-gerador.mts` gera um documento e o entrega ao
extrator do importador: os nove campos voltam idênticos ao que entrou. Se o leitor do Canva lê o
que o gerador escreve, os dois lados falam do mesmo documento.

**Uma liberdade em relação ao original:** o texto sempre cabe. O bloco diminui a letra até entrar
na caixa, em vez de transbordar como acontece no Canva quando alguém escreve demais.

---

## 3. Decisões tomadas que não devem ser revertidas sem conversa

### 3.1 Quem escreve no Storage é a Edge Function, nunca o navegador
No relato manual as fotos continuam entrando como **URL de imagem já hospedada**: o painel não tem
login de verdade, e dar escrita ao papel `anon` deixaria qualquer um subir arquivo.

O importador do Canva é a exceção construída para isso — o balde `fotos-aulas` é **público na
leitura** (a vitrine precisa abrir a foto) e **não tem policy nenhuma de escrita**, então só a
service role da Edge Function grava. Conferido: com o `anon key`, subir arquivo no balde dá
`new row violates row-level security policy`.

Se um dia aparecer upload em outra tela, é por esse caminho — nunca abrindo o balde.

### 3.2 O site é público
Não existem mais links por escola. Qualquer um agenda; cancelar exige o protocolo recebido no
agendamento, ou o painel da equipe.

### 3.3 Status do horário é derivado
`horarios.status` sai de trigger (`parcial` se há aluno WIT matriculado, senão `vago`). Estar
reservado ou não é propriedade **da data**, calculada em `agenda_escola`. Nunca escrever `status`
à mão.

### 3.4 A cor e o desenho da matéria vivem no código, não no banco
`src/componentes/MotivoMateria.tsx` decide os dois pelo nome da matéria. A cor do cadastro só é
usada para matéria que não está na lista. É de propósito: cada matéria tem a sua cor na cabeça de
quem usa, e isso não deve depender de alguém não ter errado o hex no painel. A `0006` grava a
mesma paleta no banco para os dois não discordarem.

Os desenhos são os `duotone` do Phosphor (MIT), **copiados** para `desenhos-materias.tsx` por
`ferramentas/extrair-desenhos.py`. Não instale `@phosphor-icons/react`: ele carrega os seis pesos
de cada ícone e custava ~45 kB gzip para usar um.

---

## 4. Pendências de segurança (avisadas, não resolvidas)

- **`service_role` e `sb_secret_` foram colados no chat** e estão comprometidos. Foi pedida a
  rotação várias vezes e **não há confirmação de que foi feita**. Não use essas chaves.
- **A senha do `/admin` é `WIT`.** O usuário optou por manter por enquanto. É a única coisa que
  protege o painel, que lista todas as escolas, reservas e e-mails de contato. Não há limite de
  tentativas.

---

## 5. Dívida técnica conhecida

- ~~`npm run build` sem `.env` compilava em silêncio~~ — **resolvido**. O `vite.config.ts` agora
  quebra o build, com o nome do que falta, quando `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY`
  não está definida. No `dev` continua subindo, porque ali a tela de "configuração pendente" é o
  aviso útil para quem acabou de clonar. Para compilar:
  `VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run build`.
- ~~Bundle acima do aviso do Vite~~ — **resolvido**. O `/admin` é `React.lazy`: o site público caiu
  para 454 kB (133 kB gzip) e o painel virou um pedaço à parte de 36 kB, baixado só por quem entra
  nele.
- ~~Listar 1.303 habilidades para o professor rolar~~ — **resolvido na `0011`**, junto com o corte
  de mil linhas do PostgREST descrito na seção 2.1. Ganharam busca o catálogo de atividades, a aba
  BNCC e o editor de aula.
- **`npm audit`**: esbuild/vite com aviso moderado. A correção exige Vite 8, que é breaking.
- **Não há suíte de testes de ponta a ponta.** O arranjo da seção 6 continua vivendo em diretório
  temporário. O que ficou no repositório é a conferência do extrator do Canva
  (`ferramentas/conferir-extrator.mts`), que roda em Node sem banco e sem deploy — é o começo do
  que faltava.
- **Sobraram 4 fotos de teste no balde `fotos-aulas`**, na pasta `add0e69c70723d50/`, de um teste
  feito contra a produção. Não estão ligadas a aula nenhuma. O Storage não deixa apagar por SQL;
  dá para removê-las pelo painel do Supabase (Storage → `fotos-aulas`).

---

## 6. Como testar sem tocar em produção

1. Postgres 16 local. `initdb` recusa rodar como root — crie um usuário sem privilégio
   (`useradd pgtest`) e um diretório fora do scratchpad (`/var/tmp/...`, com `chown`). Crie à mão
   os papéis `anon` e `authenticated` e o schema `extensions`, imitando o Supabase.
2. Aplique as migrations em ordem num banco limpo e **rode a sequência duas vezes** — foi assim
   que apareceu a função duplicada de `admin_registrar_relato`, que deixaria o PostgREST sem saber
   qual chamar.
3. Um stub HTTP de ~60 linhas traduzindo `POST /rest/v1/rpc/<fn>` em chamada SQL com `set local
   role anon`. Com ele o front roda inteiro contra o banco local.
   Cuidado: o driver `pg` devolve `date` como `Date`; o PostgREST devolve `"2026-08-19"`. Force
   `pg.types.setTypeParser(1082, v => v)` ou o calendário aparece vazio sem erro nenhum.
4. Playwright com `executablePath: '/opt/pw-browsers/chromium'`. Suba o Vite **a partir da raiz do
   projeto** (`nohup env VITE_… npx vite --port 5199 &`), senão ele serve o diretório errado.

Vários bugs desta obra só apareceram no navegador, nunca no typecheck: colunas `NaN` na grade, o
botão de tema invisível no tema claro, a agenda abrindo numa semana sem vaga, o desenho do
Projetos WIT decepado pela capa, `.rodape-cartao` sem regra nenhuma e a aba sob o mouse ficando
verde-escura com texto escuro no tema claro. **Olhe a tela.**

### O extrator do Canva, sem banco e sem deploy

```
node ferramentas/gerar-pdf-de-teste.mjs /tmp/canva-falso.pdf
node --experimental-strip-types ferramentas/conferir-extrator.mts /tmp/canva-falso.pdf
```

Sai zero quando está tudo certo. O `--experimental-strip-types` é necessário porque o extrator é
TypeScript escrito para o Deno; ele só usa APIs da plataforma justamente para rodar nos dois.

### O Chromium deste ambiente não sai pelo proxy

Para olhar a tela do importador, as respostas do Supabase foram interceptadas com `page.route()`
usando payloads **capturados de verdade** da produção com `curl` (que passa pelo proxy sem
problema). O servidor foi testado direto, com `curl` contra a função deployada; o navegador serviu
só para conferir a tela.

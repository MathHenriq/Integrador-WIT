# Handoff — onde o projeto parou

> Leia o `CLAUDE.md` primeiro: ele tem a definição do produto, as regras de interface, a lista
> de escolas e os horários. **Este arquivo é o estado da obra**; o `CLAUDE.md` é permanente.

Site no ar pelo Vercel, banco no Supabase (projeto `Integrador-WIT`, ref `mdwqwwdohwixxotyeiua`).

---

## 1. Primeira coisa a fazer: conferir o banco

**Da `0001` à `0008`, tudo já foi aplicado e conferido.** A consulta abaixo tem que voltar todos
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
    where id = 'fotos-aulas' and public)                             as balde_esperado_1;
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

### 2.1 A BNCC em si — a ferramenta está pronta, faltam os dados
A importação em lote existe (`0007` + caixa de colar na aba BNCC do painel): cola-se a lista
oficial e o ano e a matéria saem do próprio código (`EF06MA01` → 6º ano, Matemática).

**O que não existe é a lista.** Ninguém aqui deve escrever as mais de mil descrições de memória:
sai texto plausível e errado, num sistema em que professor usa a habilidade para justificar aula.
Peça o CSV/planilha oficial ao usuário — não está no Drive dele (já procurei).

Falta também **agrupar por tema** na listagem, que foi o pedido original ("em listas separadas
pelos seus temas"). Hoje a lista é corrida, e a tabela `habilidades` não tem coluna de unidade
temática — vai precisar de uma.

O agrupamento **depende do arquivo oficial** e por isso não foi feito: a unidade temática não sai
do código da habilidade (`EF06MA01` diz 6º ano e Matemática, mas não diz "Números"), então ela tem
que vir da mesma planilha que traz as descrições. Escrever a lista de unidades de memória cairia
no mesmo problema das descrições. Quando o arquivo chegar: uma migration acrescenta
`habilidades.unidade_tematica`, o `admin_importar_habilidades` passa a receber a terceira coluna e
a aba BNCC agrupa por ela.

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

**Como testar sem o arquivo do usuário.** `ferramentas/gerar-pdf-de-teste.mjs` monta um PDF que
imita o do Canva: fontes recortadas com `/ToUnicode` (1 e 2 bytes), páginas escondidas num
`/ObjStm`, cabeçalho e rodapé nas 4 páginas, fotos em JPEG e em Flate, e um ícone pequeno. É o
caso difícil de propósito.

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

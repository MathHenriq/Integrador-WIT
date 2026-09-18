# Projeto Integrador · Núcleo WIT

Memória do projeto. Leia antes de mexer em qualquer coisa.

## O que é o Projeto Integrador (use esta definição, não invente outra)

A sala do Núcleo WIT está **aberta para receber os professores e as turmas deles**. O objetivo é
**unir o conhecimento das matérias comuns com o conhecimento técnico da equipe WIT**, usando
tecnologia a favor da educação.

Acontece **no período regular de aula**, em parceria direta com o professor da disciplina:

- Transforma conteúdo curricular em proposta prática apoiada por tecnologia e metodologias ativas.
- Desenvolve aulas divertidas, concretas e envolventes.
- Usa os materiais e recursos que já existem nos Núcleos WIT para tornar o conteúdo palpável.
- **Atuação conjunta** entre o professor da turma e o profissional WIT.
- Une teoria e prática, estimulando protagonismo, criatividade e pensamento crítico.

Exemplo que resume: o professor de Ciências vai ensinar astros e planetas → a equipe WIT entra com
os óculos VR para mostrar os planetas no metaverso → a turma fecha com uma pesquisa sobre o tema.

### Como NÃO falar do projeto

**Nunca escrever "você não precisa preparar nada" ou equivalente.** Está errado e desvaloriza o
professor. O certo é o oposto: **o professor traz o conteúdo dele**, e juntos (professor + WIT)
montam a aula. As aulas do catálogo existem como **base e exemplo** — não para substituir o
trabalho do professor.

## Regras de interface

- **Nunca usar a "abinha": a tarja/listra colorida na lateral esquerda de caixas e cartões**
  (`border-left` de destaque, tipo `border-left: 3px solid verde`). Foi reprovada
  explicitamente e não pode voltar em nenhuma tela. Borda, quando houver, é igual nos quatro
  lados.
- **Sem glow** em cartão. Só sombra pequena.
- Cartões retangulares, cantos levemente arredondados.
- Navegação óbvia: o professor precisa bater o olho e saber o que fazer. Nada de "procure no site".
  O público é professor cansado, coordenador e gestor — praticidade acima de tudo.
- Fonte: `Outfit` nos títulos (parecida com o logo), `Source Sans 3` no texto. Evitar cara de
  template genérico.

## Identidade

Verdes da marca: `#A6CE39` (lima), `#39B54A`, `#00A651`, `#007236`.
Logo oficial em `public/logo-wit.png`. Imagem da home em `public/WIT HOME.jpg`.

## Horários da sala

Estes quatro, de segunda a sexta, na maioria das escolas:

| | |
| --- | --- |
| 07:20 – 08:50 | 09:20 – 10:50 |
| 13:20 – 14:50 | 15:20 – 16:50 |

### Escolas integrais

Período integral tem outra grade nos tempos 2 e 3 (1º e 4º tempos continuam iguais aos da tabela
acima):

| | |
| --- | --- |
| 2ª aula | 10:00 – 12:00 |
| 3ª aula | 13:00 – 14:40 |

São **seis**: **Complexo Educacional Professor Carlos Osmarinho de Lima**, **EMEF Professor Ézio
Berzaghi**, **EMEF Renato Rosa**, **EMEIEF Professor Eneias Raimundo da Silva**, **EMEF Professor
Alfredo do Carmo** e **EMEF Prefeito Nestor de Camargo**.

Dois casos que **não** devem ser "normalizados" para ficarem iguais aos outros:

- **EMEF Prefeito Nestor de Camargo** é integral, mas com horário próprio: a segunda-feira dela
  corre em 10:20, 15:00 e 16:10, diferente dos outros dias e das outras escolas. Confirmado com a
  equipe — é assim mesmo.
- **EMEF Professor Egídio Costa** não é integral: só a 3ª aula muda (13:00 – 14:40); a 2ª continua
  no horário padrão (09:20 – 10:50).

A grade de verdade de cada escola é a que está em `horarios`, no banco. Esta tabela é resumo, não
fonte: quando as duas divergirem, quem manda é o banco, e a divergência se resolve perguntando à
equipe — não igualando uma escola às vizinhas.

## Reservas

Quando o professor da escola agenda pelo site, a reserva **não nasce confirmada** — nasce
`aguardando_confirmacao`. É o professor do dia, da equipe WIT, que entra em contato (e-mail ou
WhatsApp, o que o professor deixou), entende como vai ser a aula e só então confirma pelo painel
(aba "Reservas", botão "Confirmar"). Uma reserva pendente já tranca o horário — ninguém mais
consegue reservar aquela data/tempo enquanto ela não for cancelada.

O agendamento público exige:
- **Quantidade de alunos** da turma.
- **E-mail ou WhatsApp** — pelo menos um dos dois, nunca os dois em branco.

Reserva registrada pela própria equipe (aba "Registrar projeto" ou importação do Canva/documento)
não passa por essa fila: já entra `confirmado`, porque é sempre de aula que **já aconteceu**.

Na aba "Integradores", cada linha tem **Editar** e **Remover**. Editar corrige data, horário,
professor, turma, contato e (só quando o tema não vem do catálogo) o tema/objetivos/materiais —
usa a RPC `admin_atualizar_reserva`. Remover é diferente de cancelar: cancelar (`admin_cancelar_reserva`)
mantém o histórico com status `cancelado`, aparece no filtro "Canceladas"; remover
(`admin_remover_reserva`) apaga a linha de vez, com confirmação antes ("Você tem certeza que quer
apagar o projeto integrador do dia X sobre 'tema'?").

### Avisos por e-mail (rotação W / I / T e comprovante de quem agenda)

A equipe não vai atrás da reserva: a reserva vai atrás da equipe. E quem agenda não fica sem
resposta. Uma reserva pelo site gera **até três e-mails**, todos na mesma fila:

| `tipo` | Vai para | Quando |
| --- | --- | --- |
| `reserva_nova` | equipe WIT do grupo daquela escola | ao agendar |
| `reserva_recebida` | professor **da escola** | ao agendar |
| `reserva_confirmada` | professor **da escola** | quando a equipe confirma no painel |

Os dois últimos só existem quando quem agendou informou e-mail — o agendamento aceita WhatsApp no
lugar. Sem e-mail, a linha sai da fila como `dispensado`, não fica sendo tentada para sempre.

`reserva_confirmada` é disparada por um trigger que olha a **transição** `aguardando_confirmacao →
confirmado`, não o estado. Olhar o estado faria qualquer edição numa reserva já confirmada
(corrigir a turma, anexar relato) mandar o e-mail de novo.

Uma função de envio só (`notificar-equipe` — o nome ficou de quando ela só servia à equipe). Não
criar uma segunda: a fila, o cron, as tentativas, o provedor e a tela de acompanhamento já existem,
e duplicar isso é dobrar os lugares onde o envio pode falhar em silêncio.

A rotação tem três grupos, e **cada escola pertence a um**. A divisão é da equipe; a alocação
atual, gravada no banco, é esta:

| Grupo | Escolas |
| --- | --- |
| **W** (7) | Carlos Osmarinho · Nestor de Camargo · Alfredo do Carmo · Egídio Costa · Ézio Berzaghi · Renato Rosa · Eneias Raimundo |
| **I** (5) | Francisco Zacarioto · João Tibúrcio · Dalva Fogaça · Rita de Jesus · Anna Irene Mazaro |
| **T** (6) | Armando Cavazza · Júlio Gomes Camisão · Maria Medunekas · Benedito Adherbal · José Emidio · Elisabet Titto |

⚠️ **O grupo W da rotação não é a lista de escolas integrais**, e confundir os dois estraga o
horário de uma escola. São as seis integrais **mais a EMEF Professor Egídio Costa**, que não é
integral (só a 3ª aula dela muda). Igualar a grade da Egídio às das integrais "porque todas são do
grupo W" seria erro.

A coluna `escolas.grupo` guarda **só a rotação de avisos**; a grade vem de `horarios`, escola por
escola. Uma nunca deve ser derivada da outra.

Os professores do Núcleo ficam na aba "Equipe"; desmarcar "Recebendo avisos" pausa sem apagar.

A cobertura de cada um tem **duas partes que se somam**, e as duas podem ser vazias:

- **grupos** — a rotação (pode marcar mais de um; a gestão marca os três).
- **escolas avulsas** — para quem atende **uma escola específica** em vez da rotação inteira. Foi
  o caso do profissional que cobre só a EMEF Professor Egídio Costa: pelo grupo ele receberia as
  sete do W, e sem grupo não receberia nada — as duas erradas pelo mesmo motivo (e-mail que não é
  seu ensina a ignorar; não receber é o problema que tudo isto resolve).

**Cadastro sem grupo e sem escola não recebe nada** e não dá erro nenhum: como as 18 escolas estão
alocadas, o fallback de "escola sem grupo" nunca dispara para ele. Por isso a aba conta esses
cadastros e avisa em vermelho — é armadilha silenciosa, não erro de banco.

O envio sai por um provedor de e-mail configurado em secret da função — **Brevo** enquanto o
Núcleo não tiver domínio próprio (ela verifica um endereço só, um Gmail serve), **Resend** quando
tiver (exige domínio verificado). Trocar é trocar o secret, não o código. O `EMAIL_REMETENTE`
precisa ser o endereço verificado: se não for, o provedor responde 200 e não entrega — falha que
parece sucesso.

**O canal é só e-mail.** O professor da equipe tem e-mail e mais nada — não existe WhatsApp no
cadastro dele, e campo assim não deve ser "deixado para o futuro": vira dado velho que ninguém
preenche. O WhatsApp que existe no sistema é outro, o do professor **da escola**, que vem na
reserva e vai dentro do aviso — é por ele que a equipe faz contato.

Escola sem grupo, ou grupo sem ninguém ativo, manda para a equipe inteira. É de propósito: o
problema que isso resolve é reserva que ninguém viu, então nunca pode existir aviso sem
destinatário.

O envio não acontece dentro da reserva. Um trigger enfileira em `notificacoes` e quem manda é a
Edge Function `notificar-equipe`, acordada pelo cron de minuto em minuto — e também pelo site logo
depois de agendar, só para chegar mais rápido. Se o provedor de e-mail cair, quem não pode falhar
é a reserva. Reserva registrada pela própria equipe não gera aviso: nasce `confirmado` e é aula
que já aconteceu.

Detalhe que não deve ser "simplificado": a reivindicação da fila usa `for update skip locked`
porque os dois disparos podem cair na mesma linha. E-mail repetido é o caminho mais curto para a
equipe aprender a ignorar o aviso.

### Aula relatada entra na vitrine na hora

A vitrine mostrava a aula só depois que o horário dela terminava. A regra protege o caso certo (uma
reserva de sexta não pode aparecer como realizada na quarta), mas pegava junto o registro
retroativo do próprio dia: a aula era às 13:20, o registro às 14:10, e a tela mandava "ver na
vitrine" — onde ela só apareceria às 14:50. Sumia sem ter sumido.

O que separa os dois casos não é o relógio, é **ter relato ou foto**: ninguém relata aula que ainda
não aconteceu, e a `admin_importar_aula_realizada` recusa data no futuro. Desde a migration `0030`,
entra na vitrine a aula cujo tempo já passou **ou** a que já foi relatada, com data não futura.
Reserva agendada continua de fora. O painel usa a mesma régua em `situacaoDoIntegrador`, senão o
projeto recém-registrado apareceria como "Agendada" na lista e como realizada na vitrine.

### Foto entra por anexo, nunca por link

Não existe campo de link de foto em tela nenhuma, e **não deve voltar**. Já existiu, e chegou a ser
melhorado (a Edge Function baixava a imagem e hospedava no balde, em vez de guardar o endereço) —
mas mesmo assim dependia de o arquivo estar como "qualquer pessoa com o link", e a equipe nunca
usou: quem acabou de dar a aula tem a foto no aparelho. O que o campo fazia de fato era manter viva
a porta por onde **oito fotos da vitrine quebraram** (link de compartilhamento do Drive, restrito à
conta, que devolve a tela de login do Google). Essas oito não têm mais como ser recuperadas do
servidor.

O botão "Relato e fotos", nas abas Reservas e Integradores realizados, era um `window.prompt`
pedindo endereços colados — virou um diálogo com o mesmo seletor de arquivos do registro
(`EditorRelato.tsx`). É por ele que se conserta foto quebrada: a que não abre aparece como imagem
vazia, sai no "×" e entra o arquivo de verdade.

### Horário fechado fecha agendamento, não fecha registro

Desativar um horário na aba "Horários" (fica "Fora da grade") tira o tempo do calendário público.
É assim que a equipe marca o tempo que é da **turma do próprio Núcleo**: ninguém agenda uma turma
parceira em cima dela.

Isso **não** vale para registrar o que já aconteceu. Quando a turma do Núcleo vem com pouca gente,
sobra sala e o profissional WIT faz o projeto integrador ali mesmo — e essa aula precisa entrar no
site. Por isso "Registrar projeto", "Importar do Canva" e "Editar" listam **todos** os tempos da
escola naquele dia da semana, com os fora da grade no fim da lista e marcados `· fora da grade`.
A escolha automática do banco (quando ninguém informa o horário) segue a mesma régua: prefere
tempo aberto e só cai no fechado se não sobrou nenhum. Registro retroativo descreve o passado; não
ocupa agenda.

## Escolas atendidas (18)

Nomes oficiais, como na relação da Secretaria. É assim que aparecem no site e no documento —
não abreviar nem trocar a caixa.

```
EMEF Renato Rosa
EMEF Prefeito Nestor de Camargo
EMEF Professor Ézio Berzaghi
EMEIEF Professor Eneias Raimundo da Silva
Complexo Educacional Professor Carlos Osmarinho de Lima
EMEF Professor Alfredo do Carmo
EMEF Professor Egídio Costa
EMEF Francisco Zacarioto
EMEF Rita de Jesus
EMEF Professora Dalva Fogaça
EMEF Prof. João Tibúrcio Silva Filho
EMEIEF Anna Irene Mazaro de Freitas
EMEIEF Benedito Adherbal Farbo
EMEF Armando Cavazza
EMEIEF Vereadora Elisabet Titto
EMEIEF José Emidio de Aguiar
EMEF Professora Maria Medunekas
EMEF Júlio Gomes Camisão
```

## Arquitetura

- React 18 + TypeScript + Vite 5 + Supabase (projeto `Integrador-WIT`, ref `mdwqwwdohwixxotyeiua`).
- **Sem login.** Site público; o painel da equipe é protegido por senha conferida em RPC
  (bcrypt na tabela `admin_tokens`). Senha atual: `WIT`.
- **RLS deny-all em todas as tabelas.** O `anon key` vai no bundle do navegador, então nenhuma
  tabela é legível direto: tudo passa por funções `SECURITY DEFINER` que validam por dentro.
- Migrations em `supabase/migrations/`, numeradas e reexecutáveis.
- Datas andam como string `AAAA-MM-DD` e **nunca** passam por `new Date(iso)` — isso exibiria o
  dia anterior no fuso do Brasil. "Hoje" é calculado em `America/Sao_Paulo` no banco.

## Cursos do Núcleo WIT

São cinco: **Inteligência Artificial, Games, Metaverso, Ambientes Inteligentes (IoT) e Comunicação
Digital**. Cada um deles tem, no catálogo de atividades, uma aula por matéria do comum, com o
curso no lugar do tema — a ponte que responde "onde isso encaixa na minha matéria". São 40, e
cada uma carrega a habilidade da BNCC que a sustenta.

É **ponto de partida, não lista fechada**: quem escolhe as outras habilidades é o professor da
turma junto com o profissional do WIT. Escrever essa página como se ela dispensasse a conversa
seria o mesmo erro de dizer que o professor não precisa preparar nada.

Não tente resolver isso com busca por palavra: *metaverso*, *óculos VR*, *robô* e *impressão 3D*
não aparecem uma única vez no texto da BNCC.

## Documento de aula do Canva (importação)

O PDF exportado do Canva tem os campos rotulados: `TEMA DA AULA`, `Curso`, `Turma`, `Data`,
`Prof.`, `Escola`, `OBJETIVOS DE APRENDIZAGEM`, `DESCRIÇÃO DA AULA`,
`MATERIAIS E RECURSOS NECESSÁRIOS`, `FOTOS`.

As imagens que **se repetem em todas as páginas** são o cabeçalho/rodapé do template (ex.:
321×231 e 657×489) — descartar. As fotos reais da aula são as que aparecem uma vez só
(ex.: 640×480, 800×600).

Isso já está implementado em `supabase/functions/importar-canva/` (leitor de PDF próprio, sem
biblioteca) e na aba "Importar do Canva" do painel. Ver a seção 2.2 do `HANDOFF.md`.

**Aula realizada não obriga escolher horário.** Ela está no site para inspirar outro professor, não
para ocupar agenda: sem informar, quem resolve o tempo é o banco, na `admin_importar_aula_realizada`
(anexa à reserva que já existe ou usa o primeiro tempo livre do dia). Mas "Registrar projeto" e a
conferência do Canva têm um select de horário opcional — quando a equipe sabe o tempo certo, vale
informar, porque o "primeiro tempo livre" é uma escolha arbitrária entre os horários livres daquele
dia, sem nenhuma relação com o horário real da aula. Foi exatamente isso que causou um projeto da
EMEF Rita de Jesus ser gravado às 07:20 quando a aula tinha sido às 09:20.

**O site também gera o documento, e a porta é uma só: "Registrar projeto".** Existia uma aba
separada, "Novo documento", com os mesmos campos — foi removida. Ela fazia menos do que a de
registro (não perguntava o horário da aula, que é o campo que já gravou um projeto no tempo errado)
e mantinha duas telas para a mesma coisa. Hoje: preenche em "Registrar projeto", a aula entra na
vitrine e a tela de sucesso tem **"Baixar o documento"**. O PDF é montado no navegador
(`src/lib/documento/`). Quando o template mudar no Canva, rode `ferramentas/extrair-modelo.mts` com
um documento exportado.

**O PDF nunca fica guardado, e é assim de propósito.** Ele é montado na hora, toda vez que
alguém pede — na tela de sucesso do registro e no botão **"Baixar documento"** de cada linha em
"Integradores realizados", que remonta o arquivo com os campos e as fotos da própria reserva
(`src/lib/documento/refazer.ts`). Não criar balde nem coluna para guardar o arquivo: seria mais um
lugar onde ele pode sumir, e não serviria para os projetos que já estão registrados. O **curso**
depende disso: como não tem coluna, ele fica no relato, na linha `Curso: X`. Editar o relato à mão
apagando os títulos "Objetivos de aprendizagem" e "Materiais e recursos" é o jeito de estragar um
documento sem perceber — é de lá que esses campos voltam.

**O lote é o caso do coordenador**, que manda ao gestor da prefeitura os projetos de um período:
o botão "Baixar documentos em lote" pergunta o período e a escola e devolve um ZIP com um PDF por
projeto. Um ZIP, não vários downloads — o navegador bloqueia download em série, e é um anexo só que
vai no e-mail. Nome de cada arquivo: `Projeto Integrador - Escola - AAAA-MM-DD.pdf`, com a data em
ISO para a pasta ordenar sozinha.

**O documento importado vale duas vezes.** Além de registrar o que a turma fez, ele **abre a
atividade no catálogo** (tema, descrição, objetivos, materiais e o ano da turma), para outro
professor poder escolher a mesma proposta ao agendar. Importar o mesmo tema de novo reaproveita a
atividade em vez de duplicar.

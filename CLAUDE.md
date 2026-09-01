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

### Escolas integrais (Grupo W)

Período integral tem outra grade nos tempos 2 e 3 (1º e 4º tempos continuam iguais aos da tabela
acima):

| | |
| --- | --- |
| 2ª aula | 10:00 – 12:00 |
| 3ª aula | 13:00 – 14:40 |

Grupo W: **Complexo Educacional Professor Carlos Osmarinho de Lima**, **EMEF Professor Ézio
Berzaghi**, **EMEF Renato Rosa**, **EMEIEF Professor Eneias Raimundo da Silva**, **EMEF Professor
Alfredo do Carmo**.

Caso à parte: **EMEF Professor Egídio Costa** só muda a 3ª aula (13:00 – 14:40); a 2ª continua no
horário padrão (09:20 – 10:50).

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

**Aula realizada não pergunta horário.** Ela está no site para inspirar outro professor, não para
ocupar agenda: quem resolve o tempo é o banco, na `admin_importar_aula_realizada`.

**O site também gera o documento.** A aba "Novo documento" do painel tem os mesmos campos do Canva
e devolve o PDF pronto, no mesmo desenho, com as fotos dentro — e publica a aula na mesma hora. O
PDF é montado no navegador (`src/lib/documento/`) e sobe pelo mesmo caminho de um arquivo do Canva.
Quando o template mudar no Canva, rode `ferramentas/extrair-modelo.mts` com um documento exportado.

**O documento importado vale duas vezes.** Além de registrar o que a turma fez, ele **abre a
atividade no catálogo** (tema, descrição, objetivos, materiais e o ano da turma), para outro
professor poder escolher a mesma proposta ao agendar. Importar o mesmo tema de novo reaproveita a
atividade em vez de duplicar.

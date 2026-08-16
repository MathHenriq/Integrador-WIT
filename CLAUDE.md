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

Sempre estes quatro, de segunda a sexta:

| | |
| --- | --- |
| 07:20 – 08:50 | 09:20 – 10:50 |
| 13:20 – 14:50 | 15:20 – 16:50 |

## Escolas atendidas (17)

```
EMEIEF ANNA IRENE M. FREITAS
EMEF ARMANDO CAVAZZA
EMEIEF BENEDITO ADHERBAL
EMEF CARLOS OSMARINHO DE LIMA - PROF. (COMPL.)
EMEF DALVA FOGAÇA
EMEF EGÍDIO COSTA
EMEIEF ELISABET TITTO
EMEIEF ENEIAS RAIMUNDO DA SILVA - PROF.
EMEF EZIO BERZAGHI
EMEIEF FRANCISCO ZACARIOTO
EMEF JOÃO TIBÚRCIO
EMEF JULIO GOMES CAMISÃO
EMEF MARIA MEDUNECKAS - PROF.
EMEF NESTOR DE CAMARGO
EMEF RENATO ROSA
EMEF RITA DE JESUS
EMEIEF JOSÉ EMÍDIO DE AGUIAR
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

## Documento de aula do Canva (importação)

O PDF exportado do Canva tem os campos rotulados: `TEMA DA AULA`, `Curso`, `Turma`, `Data`,
`Prof.`, `Escola`, `OBJETIVOS DE APRENDIZAGEM`, `DESCRIÇÃO DA AULA`,
`MATERIAIS E RECURSOS NECESSÁRIOS`, `FOTOS`.

As imagens que **se repetem em todas as páginas** são o cabeçalho/rodapé do template (ex.:
321×231 e 657×489) — descartar. As fotos reais da aula são as que aparecem uma vez só
(ex.: 640×480, 800×600).

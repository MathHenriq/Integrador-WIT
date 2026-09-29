# Replicação — o que cada parte do sistema faz

> Sistema desenvolvido por **Matheus Macedo** ([github.com/MathHenriq](https://github.com/MathHenriq)).
> Licença MIT: a cópia é livre, desde que o aviso de copyright do `LICENSE` e os créditos de
> autoria (rodapé do site, metadados do PDF) sejam mantidos.

Este documento é para quem vai **montar outra instância** do sistema a partir deste repositório
(outro Núcleo, outra rede, outra cidade). Ele explica o que cada peça faz e em que ordem subir.

Os outros três documentos, e para que serve cada um:

| Arquivo | Conteúdo |
| --- | --- |
| `CLAUDE.md` | Regras permanentes do produto: definição do Projeto Integrador, regras de interface, escolas, horários, fluxo de reservas. **Ler antes de mexer.** |
| `HANDOFF.md` | Diário da obra da instância original: o que foi decidido, por quê, e as armadilhas que já custaram tempo. |
| `README.md` | Visão de produto da primeira versão. Parte dele está desatualizada (ver §9). |
| `REPLICACAO.md` | Este arquivo: mapa do sistema e passo a passo de instalação. |

---

## 1. Visão geral

O site conecta professores das escolas à sala do Núcleo WIT. O professor **agenda** um horário
da sala, a equipe WIT **confirma** e dá a aula junto com ele, e a aula realizada vira **vitrine**
e **atividade de catálogo** para inspirar outros professores.

```
Navegador (React/Vite, hospedado no Vercel)
   │  anon key pública  →  só chama funções RPC (tabelas fechadas por RLS)
   ▼
Supabase
   ├─ Postgres: tabelas + funções SECURITY DEFINER + triggers
   ├─ Storage: balde público "fotos-aulas"
   ├─ Edge Functions (Deno): importar-canva · subir-fotos · notificar-equipe
   └─ pg_cron + pg_net: acorda a notificar-equipe a cada minuto
         │
         ▼
   Provedor de e-mail (Brevo ou Resend)
```

**Três princípios que explicam quase todas as decisões:**

1. **Não há login.** O público (professores) usa sem cadastro. O painel da equipe é protegido
   por uma senha conferida no banco (hash bcrypt em `admin_tokens`).
2. **Nenhuma tabela é acessível pelo navegador.** A `anon key` está no bundle, então é pública.
   Todas as tabelas têm RLS ligado **sem policy** (nega tudo); o acesso é feito só por funções
   `SECURITY DEFINER` que validam por dentro. Funções `admin_*` recebem a senha como primeiro
   parâmetro (`p_admin_token`).
3. **O banco é a fonte da verdade das regras.** Travas de horário, limite de alunos, fila de
   e-mail e status são garantidos por constraint/trigger — a tela só avisa antes.

---

## 2. Stack e estrutura de pastas

- React 18 + TypeScript + Vite 5 + react-router 7. Sem framework de UI: CSS próprio em
  `src/estilos.css`.
- Supabase (Postgres 15+, Storage, Edge Functions em Deno).
- Nenhuma biblioteca de PDF: leitor e escritor de PDF foram escritos à mão (ver §6).

```
src/
  main.tsx, App.tsx     entrada e rotas
  paginas/              uma tela por rota
  componentes/          peças das telas e abas do painel
  lib/                  API, tipos, formatação, geração de documento
supabase/
  migrations/           SQL numerado, aplicar em ordem
  functions/            Edge Functions (Deno)
ferramentas/            scripts de manutenção e de teste (Node/Python), fora do bundle
public/                 logo, imagem da home, imagens do tema
```

---

## 3. Front-end — telas públicas (`src/paginas/`)

| Rota | Arquivo | O que faz |
| --- | --- | --- |
| `/` | `Inicio.tsx` | Página inicial: as três ações principais (agendar, ver atividades, ver realizadas) e destaques. |
| `/agendar` | `Agendar.tsx` | Professor escolhe a escola, navega semana a semana e clica num horário livre. Abre o `DialogoAgendamento`. |
| `/atividades` | `Atividades.tsx` | Catálogo de atividades filtrável por matéria, ano, habilidade BNCC e busca. |
| `/atividades/:id` | `Atividades.tsx` (`AtividadeDetalhe`) | A atividade completa: objetivos, materiais, habilidades e fotos das turmas que já fizeram. |
| `/realizadas` | `Realizadas.tsx` | Vitrine das aulas já dadas. Agrupa na tela o mesmo tema dado a várias turmas num cartão só. |
| `/reserva` | `MinhaReserva.tsx` | Consulta e cancelamento pelo protocolo (`WIT-XXXXXX`). Guarda no navegador os protocolos já consultados. |
| `/admin` | `Admin.tsx` | Painel da equipe (carregado sob demanda — o professor não baixa esse código). |

`App.tsx` também tem a tela **"Configuração pendente"**, que aparece quando faltam as variáveis
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

### Painel da equipe (`/admin`) — abas

| Aba | Componente | O que faz |
| --- | --- | --- |
| Registrar projeto | `RegistrarProjeto.tsx` + `ConfirmarRegistro.tsx` + `SeletorDeFotos.tsx` | Registra aula que já aconteceu (nasce `confirmado`). Sugere temas parecidos do catálogo, pede confirmação e oferece "Baixar o documento" em PDF no fim. |
| Aulas | `Admin.tsx` (`AbaAulas`) + `EditorAula.tsx` | CRUD do catálogo de atividades, com habilidades BNCC. Aula já usada é despublicada, não apagada. |
| Escolas | `Admin.tsx` (`AbaEscolas`) + `AdminHorarios.tsx` | Escolas, grupo de rotação (W/I/T), limite de alunos e a grade de horários de cada uma. |
| Equipe | `AbaEquipe.tsx` | Professores do Núcleo que recebem os avisos: grupos e escolas avulsas que cobrem, pausa, fila de e-mails com botão "Tentar de novo". Avisa em vermelho quem não cobre nada. |
| Reservas | `Admin.tsx` (`AbaReservas`) + `EditorRelato.tsx` | Fila de reservas. Botão **Confirmar** para as `aguardando_confirmacao`; relato e fotos. |
| Integradores realizados | `IntegradoresRealizados.tsx` + `EditorReserva.tsx` + `PacoteDeDocumentos.tsx` | Lista completa com filtros, Editar, Cancelar, Remover, "Baixar documento" e "Baixar documentos em lote" (ZIP). |
| Importar do Canva | `ImportarCanva.tsx` | Sobe o PDF do Canva, mostra os campos lidos para conferência e registra. |
| BNCC | `Admin.tsx` (`AbaBncc`) | Busca, cadastro e remoção de habilidades BNCC. |

### Componentes de apoio (`src/componentes/`)

| Arquivo | Função |
| --- | --- |
| `Layout.tsx` | Cabeçalho, menu, alternância de tema claro/escuro e rodapé de todas as páginas. |
| `Assinatura.tsx` | Crédito "Desenvolvido por Matheus Macedo" no rodapé. |
| `DialogoAgendamento.tsx` | Formulário do agendamento público: professor, turma, quantidade de alunos, e-mail/WhatsApp (ao menos um), aula do catálogo ou livre. |
| `LogoWit.tsx` | Mostra `public/logo-wit.png`; sem ele, um SVG equivalente. |
| `MotivoMateria.tsx`, `desenhos-materias.tsx` | Ícone e cor de cada matéria (o segundo é gerado por `ferramentas/extrair-desenhos.py`). |
| `Modal.tsx`, `Aviso.tsx`, `Etiqueta.tsx` | Peças genéricas: diálogo, mensagem, etiqueta de origem (Equipe WIT / Escola). |

### Bibliotecas (`src/lib/`)

| Arquivo | Função |
| --- | --- |
| `supabase.ts` | Cria o cliente Supabase com as variáveis de ambiente. |
| `api.ts` | **Toda** chamada ao back-end passa por aqui: uma função tipada por RPC/Edge Function. Converte erros do banco em mensagem para o usuário. |
| `tipos.ts` | Tipos TypeScript espelhando o que as RPCs devolvem. |
| `formato.ts` | Datas (sempre string `AAAA-MM-DD`, nunca `new Date(iso)`), horas, situação do integrador. |
| `temas.ts` | Compara tema digitado com o catálogo (sem acento/caixa/pontuação) para sugerir o existente. |
| `escolas.ts` | Casa o nome da escola escrito no documento com o nome oficial do cadastro. |
| `imagem.ts` | Converte e reduz foto para JPEG no navegador antes de subir. |
| `autoria.ts` | Nome do autor, usado no rodapé, no console e nos metadados do PDF. |
| `documento/` | Gera o PDF do documento de aula no navegador (§6). |

---

## 4. Banco de dados (`supabase/migrations/`)

### Tabelas

| Tabela | Guarda |
| --- | --- |
| `escolas` | Nome oficial, `grupo` da rotação de avisos (W/I/T), `limite_alunos` da sala (nulo = sem limite). |
| `horarios` | O **molde semanal** de cada escola (dia da semana, início, fim, capacidade, ativo). Não guarda datas. |
| `reservas` | A **ocorrência**: data concreta + horário + professor, turma, contato, aula (catálogo ou livre), relato, fotos, `status`, `origem` (`escola` ou `equipe_wit`), protocolo. |
| `materias` | Matérias do currículo comum, com cor e ordem. |
| `habilidades` | Habilidades da BNCC (código, descrição, matéria, ano). |
| `aulas` / `aulas_habilidades` | Catálogo de atividades e suas habilidades. |
| `pontes_bncc` | 40 pontes curadas: curso do WIT × matéria → uma habilidade real. Origem das 40 atividades de curso. |
| `importacoes_canva` | Registro de cada PDF importado. |
| `equipe_wit` | Professores do Núcleo que recebem avisos: e-mail, grupos, escolas avulsas, ativo. |
| `notificacoes` | Fila de e-mails (`reserva_nova`, `reserva_recebida`, `reserva_confirmada`). |
| `admin_tokens` | Hash bcrypt da senha do painel. |

**Ideia central:** `horarios` é o molde, `reservas` é a ocorrência. A função `agenda_escola`
expande o molde para o período pedido; nenhuma lista de datas é pré-gerada.

**Status da reserva:** `aguardando_confirmacao` (agendada pelo site) → `confirmado` (equipe
confirmou) · `cancelado` (fica no histórico). Registro da equipe já nasce `confirmado`.

### Triggers

| Trigger | Faz |
| --- | --- |
| `reservas_valida_data` | Recusa data que não cai no dia da semana do horário. |
| `reservas_limite_de_alunos` | Recusa agendamento pelo site com mais alunos que `escolas.limite_alunos`. |
| `reservas_avisa_equipe` | Enfileira `reserva_nova` (equipe) e `reserva_recebida` (professor da escola). |
| `reservas_avisa_confirmacao` | Enfileira `reserva_confirmada` só na **transição** `aguardando_confirmacao → confirmado`. |
| `horarios_status` | Deriva o status do horário. |

Além deles: índice único parcial em `(horario_id, data_aula)` impede duas reservas ativas no
mesmo tempo, mesmo com cliques simultâneos.

### Funções RPC (chamadas pelo site, via `src/lib/api.ts`)

**Públicas:** `agenda_escola`, `agendar`, `obter_reserva`, `cancelar_por_protocolo`,
`listar_aulas`, `obter_aula`, `listar_habilidades`, `listar_realizadas`.

**Do painel (exigem a senha):**
- Catálogo: `admin_listar_aulas`, `admin_salvar_aula`, `admin_remover_aula`,
  `admin_salvar_materia`, `admin_salvar_habilidade`, `admin_remover_habilidade`,
  `admin_importar_habilidades`.
- Escolas e grade: `admin_listar_escolas`, `admin_definir_grupo_escola`,
  `admin_listar_horarios`, `admin_criar_horario`, `admin_atualizar_horario`,
  `admin_remover_horario`.
- Reservas: `admin_listar_reservas`, `admin_confirmar_reserva`, `admin_cancelar_reserva`,
  `admin_remover_reserva`, `admin_atualizar_reserva`, `admin_registrar_relato`,
  `admin_importar_aula_realizada` (usada por "Registrar projeto" e pelo Canva).
- Equipe e avisos: `admin_listar_equipe`, `admin_salvar_membro_equipe`,
  `admin_remover_membro_equipe`, `admin_equipe_sem_cobertura`, `admin_listar_notificacoes`,
  `admin_reenfileirar_notificacao`.

### Migrations

São 33 arquivos, **aplicados em ordem numérica** no SQL Editor (ou `supabase db push`). Da
`0002` em diante todos podem ser reexecutados. Os dois `0032_*` são independentes: aplique
`0032_junta_projetos_repetidos.sql` e depois `0032_limite_da_egidio_passa_a_20.sql`.

Agrupadas pelo que fazem:

| Faixa | Assunto |
| --- | --- |
| 0001–0003 | Estrutura base, catálogo, acesso público por RPC, fuso `America/Sao_Paulo`. |
| 0004–0006 | Fotos das aulas, escolas iniciais, cores das matérias. |
| 0007, 0009–0011 | BNCC: importação, pontes curso×matéria, busca no banco. |
| 0008, 0014, 0015 | Importação do Canva, balde `fotos-aulas`, aula importada vira atividade. |
| 0012, 0013, 0017 | Panorama dos integradores, origem (escola/equipe), registro rápido. |
| 0016, 0018, 0019, 0023, 0025 | Nomes oficiais, capacidades, grade das escolas integrais, grade completa, escolas duplicadas. |
| 0020–0022, 0024, 0026 | Status `aguardando_confirmacao`, mais dados no agendamento, editar/remover, registro fora da grade. |
| 0027–0029 | Fila de avisos por e-mail, escolas avulsas, e-mail para o professor da escola. |
| 0030–0032 | Aula relatada entra na vitrine, limite de alunos, junção de temas repetidos. |

> ⚠️ **Dados específicos da instância original estão dentro das migrations**: nomes das 18
> escolas de Barueri, grades de horário, grupos W/I/T, limite da EMEF Professor Egídio Costa.
> Numa rede diferente, aplique as migrations normalmente e depois ajuste pelo painel (abas
> Escolas e Horários) — ou edite as migrations de dados **antes** da primeira aplicação.

---

## 5. Edge Functions (`supabase/functions/`)

Todas usam a `service_role` (injetada pelo Supabase, nunca vai ao navegador) e conferem a senha
do painel quando são de uso da equipe.

| Função | Chamada por | O que faz |
| --- | --- | --- |
| `importar-canva` | aba "Importar do Canva" | Lê o PDF (leitor próprio em `pdf.ts`/`texto.ts`), extrai os campos rotulados (`extrair.ts`), separa fotos reais de imagens do template (`imagens.ts` — imagem repetida em todas as páginas é moldura), sobe as fotos para o balde e devolve tudo para conferência. |
| `subir-fotos` | "Registrar projeto", "Relato e fotos" | Recebe fotos anexadas, valida que são imagem e hospeda no balde `fotos-aulas`. **Só a função escreve no Storage**, nunca o navegador. |
| `notificar-equipe` | cron a cada minuto + o site logo após agendar | Drena a fila `notificacoes` (`for update skip locked` para não enviar duas vezes), monta o e-mail e envia por Brevo ou Resend. Até 3 tentativas; sem e-mail de destino vira `dispensado`. |

Secrets da `notificar-equipe`:

| Secret | Obrigatório | Uso |
| --- | --- | --- |
| `BREVO_API_KEY` **ou** `RESEND_API_KEY` | sim | Provedor. Brevo verifica um endereço (Gmail serve); Resend exige domínio. |
| `EMAIL_REMETENTE` | sim | **Tem que ser o endereço verificado no provedor**, senão ele responde 200 e não entrega. |
| `SITE_URL` | não | Endereço do site, vira o botão dentro do e-mail. |

---

## 6. Documento de aula em PDF (`src/lib/documento/`)

O PDF do documento de aula (o mesmo formato do template do Canva) é **montado no navegador na
hora** e nunca é guardado.

| Arquivo | Função |
| --- | --- |
| `escritor.ts` | Escritor de PDF mínimo (retângulos, texto em Helvetica-Bold, JPEG, páginas, metadados). |
| `modelo.ts` | Cabeçalho/rodapé do template, **gerado** por `ferramentas/extrair-modelo.mts` a partir de um PDF exportado do Canva. |
| `montar.ts` | Posiciona os campos (tema, curso, turma, data, professor, escola, objetivos, descrição, materiais, fotos). |
| `refazer.ts` | Remonta o documento de uma reserva já registrada, a partir do relato e das fotos dela. |
| `pacote.ts` | Gera o ZIP com um PDF por projeto de um período (`Projeto Integrador - Escola - AAAA-MM-DD.pdf`). |

O **curso** não tem coluna: fica no relato, na linha `Curso: X`. Os títulos "Objetivos de
aprendizagem" e "Materiais e recursos" dentro do relato também são lidos de volta — não os apague
à mão.

**Para usar outro template:** exporte um documento do Canva em PDF e rode
`node --experimental-strip-types ferramentas/extrair-modelo.mts documento.pdf`, que reescreve
`modelo.ts`. Depois confira com `ferramentas/conferir-gerador.mts`.

---

## 7. Ferramentas (`ferramentas/`)

| Script | Para quê |
| --- | --- |
| `extrair-bncc.mts` | Lê o PDF oficial da BNCC e gera JSON com as 1.303 habilidades (código + descrição). A carga é feita com a RPC `admin_importar_habilidades(senha, codigos[], descricoes[])`. |
| `extrair-modelo.mts` | Gera `src/lib/documento/modelo.ts` a partir de um PDF do Canva. |
| `conferir-gerador.mts` | Gera um documento de teste e o lê de volta com o importador — prova que o PDF gerado é compatível. |
| `gerar-pdf-de-teste.mjs` + `conferir-extrator.mts` | Testes do importador do Canva sem banco e sem deploy. |
| `conferir-escolas.mts` | Testa o casamento de nome de escola do documento com o cadastro. |
| `extrair-desenhos.py` | Copia os ícones Phosphor para `desenhos-materias.tsx`. |
| `gerar-softbox.py` | Gera as imagens de fundo da tela "Minha reserva". |

Todos rodam com Node 22+ (`--experimental-strip-types`) ou Python 3, fora do bundle do site.

---

## 8. Passo a passo para subir uma cópia

### 8.1 Supabase

1. Crie um projeto novo no Supabase.
2. Na **primeira linha** de `supabase/migrations/0001_inicial.sql`, troque a senha do painel:
   `select set_config('integrador.senha_admin', 'SUA-SENHA', false);`
   (a senha da instância original está no `CLAUDE.md` — **não reutilize**).
3. No SQL Editor, cole e rode as migrations **em ordem**, de `0001` a `0032` (§4).
4. Ative as extensões `pg_cron` e `pg_net` (Database → Extensions).
5. Deploy das funções — **antes** de ligar o cron:
   ```bash
   supabase link --project-ref SEU_REF
   supabase functions deploy importar-canva
   supabase functions deploy subir-fotos
   supabase functions deploy notificar-equipe
   supabase secrets set BREVO_API_KEY=... EMAIL_REMETENTE="Nome <endereco@verificado>" SITE_URL=https://seu-site
   ```
6. Agende o cron (fora das migrations porque leva o ref e a anon key do projeto):
   ```sql
   select cron.schedule('notificar-equipe-wit', '* * * * *', $cron$
     select net.http_post(
       url     := 'https://SEU_REF.supabase.co/functions/v1/notificar-equipe',
       headers := jsonb_build_object('Content-Type','application/json',
                                     'Authorization','Bearer SUA_ANON_KEY'),
       body    := '{}'::jsonb);
   $cron$);
   ```
   É a **anon key**, não a service_role.
7. (Opcional) Carregue a BNCC com `ferramentas/extrair-bncc.mts` + `admin_importar_habilidades`.

### 8.2 Site

```bash
npm install
cp .env.example .env    # VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (Settings → API)
npm run dev             # desenvolvimento
npm run build           # typecheck + build em dist/
```

No Vercel: importe o repositório, defina as mesmas variáveis em Settings → Environment
Variables e faça deploy. O `vercel.json` já faz o rewrite de SPA (toda rota devolve
`index.html`); `public/_redirects` faz o mesmo no Netlify. Variável nova exige redeploy — são
lidas no build.

### 8.3 Personalizar

| O quê | Onde |
| --- | --- |
| Escolas, grupos, limites | aba "Escolas" do painel |
| Grade de horários | aba "Escolas" → horários de cada escola |
| Quem recebe os avisos | aba "Equipe" (cadastro sem grupo e sem escola não recebe nada) |
| Logo e imagem da home | `public/logo-wit.png`, `public/WIT HOME.jpg` |
| Cores da marca e fontes | variáveis no topo de `src/estilos.css`; fontes em `index.html` |
| Textos do cabeçalho/rodapé | `src/componentes/Layout.tsx` |
| Cursos do Núcleo | `CURSOS` em `RegistrarProjeto.tsx` e as pontes da migration `0009` |
| Template do documento | `ferramentas/extrair-modelo.mts` (§6) |

### 8.4 Conferir que funcionou

1. Abra `/agendar`, escolha uma escola e agende → deve aparecer o protocolo.
2. Em `/admin` (com a senha), aba "Reservas": a reserva está `aguardando_confirmacao`.
3. Aba "Equipe": a fila mostra o aviso como enviado em até um minuto.
4. Confirme a reserva → o professor recebe `reserva_confirmada` (se deixou e-mail).
5. "Registrar projeto" com uma foto → aparece em `/realizadas` e "Baixar o documento" gera o PDF.

---

## 9. Onde o README está desatualizado

O `README.md` descreve a primeira versão. Diferenças que importam:

- Não existe mais `/e/:token` nem links por escola: o site é aberto e a escola é escolhida numa
  lista.
- A função `enviar-confirmacao` não existe mais; os e-mails saem todos pela `notificar-equipe`,
  pela fila `notificacoes`. `VITE_EMAIL_CONFIRMACAO` não é mais necessária.
- Reserva pelo site nasce `aguardando_confirmacao`, não confirmada.
- Fotos e documento, listados como "Fase 2", já estão implementados.
- As migrations vão até a `0032`, não até a `0002`.

---

## 10. Autoria

Desenvolvido por **Matheus Macedo** — [github.com/MathHenriq](https://github.com/MathHenriq).

O crédito aparece em: rodapé de todas as páginas (`src/componentes/Assinatura.tsx`), tela de
configuração pendente, metadados de autor de todo PDF gerado (`src/lib/documento/escritor.ts`),
console do navegador, `<meta name="author">` do `index.html`, `package.json` e `LICENSE`. O nome
fica centralizado em `src/lib/autoria.ts`.

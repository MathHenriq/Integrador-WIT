# Handoff — onde o projeto parou

> Leia o `CLAUDE.md` primeiro: ele tem a definição do produto, as regras de interface, a lista
> de escolas e os horários. **Este arquivo é o estado da obra**; o `CLAUDE.md` é permanente.

Estado em `128b179`. Site no ar pelo Vercel, banco no Supabase (projeto `Integrador-WIT`,
ref `mdwqwwdohwixxotyeiua`).

---

## 1. Primeira coisa a fazer: conferir o banco

A `0005` **já rodou** — as próprias telas do usuário provam: a home mostrou "340 de 340" horários
(17 escolas × 4 tempos × 5 dias) e a lista de matérias trouxe "Projetos WIT", que é o nome novo.

Falta confirmar a `0004` (coluna `fotos`) e rodar a `0006` e a `0007`:

```sql
select
  (select count(*) from public.escolas)                              as escolas_esperado_17,
  (select count(*) from public.horarios)                             as horarios_esperado_340,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='reservas'
      and column_name='fotos')                                       as coluna_fotos_esperado_1,
  (select count(*) from public.materias where cor = '#2563eb')       as cores_esperado_1,
  (select count(*) from pg_proc
    where proname = 'admin_importar_habilidades')                    as importador_esperado_1;
```

Se `coluna_fotos` vier 0, **as páginas de atividade e de aulas realizadas quebram assim que
existir uma aula realizada** — o front já lê esse campo. Rode `0004_fotos_das_aulas.sql`.

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

### 2.2 Importador do documento do Canva
A funcionalidade mais pedida, ainda não começada. O PDF exportado do Canva vira um "projeto já
realizado" automaticamente.

**Estrutura já decifrada** (exemplo analisado: `Projeto_Integrador_1405.pdf`, 4 páginas):

- Campos rotulados no texto: `TEMA DA AULA`, `Curso`, `Turma`, `Data`, `Prof.`, `Escola`,
  `OBJETIVOS DE APRENDIZAGEM`, `DESCRIÇÃO DA AULA`, `MATERIAIS E RECURSOS NECESSÁRIOS`, `FOTOS`.
- No exemplo: Prof. Dante, EMEF Rita de Jesus, curso Inteligência Artificial, turma Inclusão,
  14/05/2026.
- **Separar foto de template**: as imagens que se repetem em *todas* as páginas são o
  cabeçalho/rodapé do Canva (no exemplo, 321×231 e 657×489). As fotos reais aparecem uma vez só
  (640×480, 800×600). No exemplo dá 8 fotos reais.

**Onde rodar:** precisa ser no servidor (Edge Function). Extrair no navegador esbarraria no mesmo
problema do upload — ver 3.1.

---

## 3. Decisões tomadas que não devem ser revertidas sem conversa

### 3.1 Fotos entram como URL, não como upload
O painel não tem login de verdade: é uma senha conferida por RPC. Aceitar upload direto pelo
navegador exigiria abrir o Storage para o papel `anon`, e aí qualquer pessoa sobe arquivo.
Guardar o endereço de uma imagem já hospedada evita o buraco.

**Se o usuário quiser upload de verdade**, o caminho é uma Edge Function que valida a senha e sobe
com service role. Foi oferecido e ainda não foi pedido.

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

- **`npm run build` sem `.env` não compila o site.** Sem as variáveis, `configuracaoAusente` vira
  constante, o Vite elimina o router inteiro como código morto e o bundle fica congelado em
  365 kB — build "verde" que não testou nada. Para valer, rode
  `VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run build`. Vale fazer o script falhar alto
  quando as variáveis faltam.
- **Bundle de 479 kB (139 kB gzip)**, acima do aviso do Vite. O `/admin` é só para a equipe e
  poderia ser `React.lazy`.
- **`npm audit`**: esbuild/vite com aviso moderado. A correção exige Vite 8, que é breaking.
- **Não há suíte de testes.** O arranjo da seção 6 vive em diretório temporário e se perde.

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
Projetos WIT decepado pela capa e `.rodape-cartao` sem regra nenhuma. **Olhe a tela.**

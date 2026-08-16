# Handoff — onde o projeto parou

> Leia o `CLAUDE.md` primeiro: ele tem a definição do produto, as regras de interface, a lista
> de escolas e os horários. **Este arquivo é o estado da obra**; o `CLAUDE.md` é permanente.

Estado em `819384f`. Site no ar pelo Vercel, banco no Supabase (projeto `Integrador-WIT`,
ref `mdwqwwdohwixxotyeiua`).

---

## 1. Primeira coisa a fazer: conferir o banco

As migrations `0004` e `0005` foram coladas no SQL Editor pelo usuário, mas **ninguém verificou o
resultado** — o conector do Supabase estava fora do ar. Rode isto antes de qualquer outra coisa:

```sql
select
  (select count(*) from public.escolas)                              as escolas_esperado_17,
  (select count(*) from public.horarios)                             as horarios_esperado_340,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='reservas'
      and column_name='fotos')                                       as coluna_fotos_esperado_1,
  (select count(*) from public.materias where nome='Projetos WIT')   as projetos_wit_esperado_1;
```

Se `coluna_fotos` vier 0, **as páginas de atividade e de aulas realizadas estão quebradas em
produção** — o front já espera esse campo. Rode `supabase/migrations/0004_fotos_das_aulas.sql`.

### O conector do Supabase

Existem **duas instalações** do Supabase na conta: uma `connected`, outra `unknown`. O conector
caiu três vezes numa mesma sessão, sempre com o mesmo padrão — suspeita de que o chat religa a
instalação sem sessão válida. **Remover a duplicada** deve resolver.

O estado que aparece do lado do Claude é `connected: true, enabledInChat: false`: autenticado na
conta, desligado *naquele chat*. É um botão por conversa, nas configurações de conector do próprio
chat — o Claude não liga sozinho. Também não adianta tentar falar com `supabase.co` por HTTP da
sessão: o proxy de rede devolve 403 no CONNECT.

Atenção: `list_projects` já voltou vazio mesmo com o conector ligado (a org nasceu pela
integração Vercel↔Supabase). Nesse caso, passar o `project_id` direto funciona.

---

## 2. O que falta construir

Os quatro itens de interface saíram em `5f092d7` — cartões por matéria nas realizadas, o motivo
do Projetos WIT (VR, câmera, controle, IA e Alexa), o Painel WIT como botão no topo à direita e
o ciclorama do `/reserva` com o vinco parede-piso. Foram conferidos no navegador, nos dois temas
e em 390px, contra um stub das RPCs. **Falta o que depende do banco:**

### 2.1 BNCC pré-carregada, agrupada por tema
Hoje a equipe cadastra habilidade a habilidade na aba BNCC. O pedido: **já vir tudo preenchido**,
em listas separadas por tema, para facilitar professor, equipe e gestão. É uma migration de seed
grande — vale confirmar o recorte (quais anos/componentes) antes de escrever.

### 2.2 Importador do documento do Canva
A funcionalidade mais pedida. O PDF exportado do Canva vira um "projeto já realizado"
automaticamente.

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

---

## 4. Pendências de segurança (avisadas, não resolvidas)

- **A senha do `/admin` é `WIT`.** O usuário optou por manter por enquanto. É a única coisa que
  protege o painel, que lista todas as escolas, reservas e e-mails de contato. Não há limite de
  tentativas.
- **`service_role` e `sb_secret_` foram colados no chat** e estão comprometidos. Foi pedida a
  rotação várias vezes e **não há confirmação de que foi feita**. Não use essas chaves.

---

## 5. Como testar sem tocar em produção

Não existe suite de teste no repositório — o que foi usado nesta sessão vivia em diretório
temporário e se perdeu. O arranjo que funcionou bem, caso valha reconstruir:

1. Postgres 16 local, com os papéis `anon` e `authenticated` criados à mão e o schema
   `extensions`, imitando o Supabase.
2. Aplicar as migrations em ordem num banco limpo, e **rodar duas vezes** — todas são
   reexecutáveis e isso já pegou erro real.
3. Um stub HTTP de ~60 linhas traduzindo `POST /rest/v1/rpc/<fn>` em chamada SQL com `set local
   role anon`. Com ele o front roda inteiro contra o banco local.
   Cuidado: o driver `pg` devolve `date` como `Date`; o PostgREST devolve `"2026-08-19"`. Force
   `pg.types.setTypeParser(1082, v => v)` ou o calendário aparece vazio sem erro nenhum.
4. Playwright com `executablePath: '/opt/pw-browsers/chromium'`.

Três bugs desta sessão só apareceram no navegador, nunca no typecheck: colunas `NaN` na grade,
o botão de tema invisível no tema claro, e a agenda abrindo numa semana sem vaga. **Olhe a tela.**

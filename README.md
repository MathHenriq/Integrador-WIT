# Projeto Integrador · Núcleo WIT

Quando uma sala de tecnologia do Núcleo WIT fica ociosa, a escola e o Núcleo são cobrados
igual pela Secretaria. A saída informal já existia — o professor da escola "empresta" a
turma dele para uma aula dada pelo Núcleo WIT — mas dependia do instrutor caçar coordenador
de porta em porta para descobrir quem toparia.

Este sistema resolve as duas dores. **Disponibilidade:** o professor entra, escolhe a escola,
vê a semana e agenda a data que quiser. **Conteúdo:** ele descobre que já existe uma aula
pronta sobre o assunto dele — ou escreve a própria. Sem login, sem senha, sem app.

## As telas

| Tela | Quem usa | O que faz |
| --- | --- | --- |
| `/` | todo mundo | vitrine: caminhos, aulas em destaque, o que já rolou |
| `/agendar` | professores | escolhe a escola, navega semana a semana, agenda uma data |
| `/atividades` | professores | catálogo filtrável por matéria, ano, habilidade BNCC e busca |
| `/atividades/:id` | professores | a aula por inteiro: objetivos, materiais, habilidades |
| `/realizadas` | todo mundo | histórico público das aulas já dadas, para inspirar |
| `/reserva` | quem agendou | consulta e cancela pelo protocolo |
| `/admin` | equipe WIT | aulas, escolas, horários, reservas e habilidades |

## Como funciona o acesso

O site é **público**: qualquer pessoa entra, escolhe a escola numa lista e agenda. Não há
login, cadastro nem link secreto por escola.

O nome do professor é **texto livre, sem validação de identidade**. É um trade-off consciente:
exigir cadastro mataria a adoção num público que só quer marcar uma aula. Os contrapesos:

- **Cancelar exige o protocolo** (`WIT-XXXXXX`), que só quem agendou recebeu. Sem ele, nem
  consulta nem cancela.
- **A equipe WIT cancela qualquer reserva** pelo painel, protegido por senha.
- Nada some sem deixar rastro: cancelamento guarda data e motivo.

### Por que nenhuma tabela é exposta ao cliente

O `anon key` do Supabase vai no bundle do navegador — é público por definição. Se as tabelas
fossem legíveis pelo `anon`, qualquer pessoa com esse key leria e escreveria à vontade.

Então o RLS é **deny-all** em todas as tabelas (sem policy nenhuma) e todo acesso passa por
funções RPC `SECURITY DEFINER`. As públicas expõem só o que é público; as de `admin_` exigem
a senha, conferida contra um hash bcrypt.

O horário reservado precisa pertencer à escola escolhida — passar o `escola_id` de uma e o
`horario_id` de outra é recusado no servidor.

## Confirmação da reserva

1. **Protocolo na tela** é a confirmação que vale. Fica gravado, aparece na hora para a
   equipe WIT e é a chave de "Minha reserva".
2. **E-mail é camada opcional**, via Edge Function (`supabase/functions/enviar-confirmacao`)
   usando a Resend. Sem a chave configurada a função vira no-op e a reserva funciona igual.

O motivo de não pendurar o MVP no e-mail: com escola pública e e-mail de professor, entrega é
incerta. Uma reserva legítima nunca pode falhar porque o provedor de e-mail caiu.

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha com o projeto Supabase
npm run dev
```

### Supabase

Crie um projeto **novo** (não reaproveite o do WIT Dungeon — domínio de dados diferente). No
projeto criado, abra o **SQL Editor** e cole o conteúdo de
`supabase/migrations/0001_inicial.sql` inteiro, e depois o
`0002_catalogo_e_acesso_publico.sql`.

É um arquivo só, e a única coisa a editar está na primeira linha dele: a senha que você vai
usar no painel `/admin`. Ela é guardada com hash bcrypt, não em texto puro.

```sql
select set_config('integrador.senha_admin', 'troque-esta-senha', false);
```

Para trocar a senha depois, edite essa linha e rode o arquivo de novo — pode rodar quantas
vezes quiser, os dados já cadastrados não se perdem. Ou rode só isto no SQL Editor:

```sql
delete from public.admin_tokens where descricao = 'Núcleo WIT';
insert into public.admin_tokens (senha_hash, descricao)
values (extensions.crypt('SUA-SENHA-AQUI', extensions.gen_salt('bf')), 'Núcleo WIT');
```

Quem preferir a CLI: `supabase db push` faz o mesmo.

### E-mail (opcional)

```bash
supabase functions deploy enviar-confirmacao
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set EMAIL_REMETENTE="Núcleo WIT <projetos@seudominio.com.br>"
supabase secrets set EMAIL_COPIA_WIT=voce@nucleowit.org   # opcional
```

E no `.env` do front: `VITE_EMAIL_CONFIRMACAO=true`.

## Uso

**Você (admin), em `/admin`:** entra com a senha definida na instalação, cadastra a escola,
copia os dois links, cadastra os horários vagos daquela escola. Os links são entregues à coordenação, que repassa o de professor.

**Professor:** abre o link e cai no mês corrente. Os dias em verde têm horário livre; as setas
levam para os meses seguintes, até um ano à frente. Clica no dia, escolhe o horário, escreve o
nome (pode incluir a turma: "Ana Ribeiro — 7º ano B") e confirma. Recebe o protocolo.

Cada reserva vale **para uma data só**. Quem quer levar a turma toda quarta-feira do mês marca as
quatro quartas, uma a uma — assim cada data pode ser cancelada ou passada para outro professor sem
mexer nas demais.

**Coordenação:** mesmo link-portal, com uma aba de histórico a mais, ordenada por data de aula.
Cancela quando a reserva não se confirma na prática — aquela data volta a aparecer como disponível
para os outros professores, sem afetar as outras semanas, e a reserva fica no histórico marcada
como cancelada, com data e autor do cancelamento. Aulas que já aconteceram não podem ser
canceladas: só apagariam o registro do que rolou.

## Modelo de dados

```
escolas       id, nome, criado_em
horarios      id, escola_id, dia_semana, hora_inicio, hora_fim,
              capacidade, ocupacao_wit, status, ativo, criado_em
reservas      id, horario_id, data_aula, protocolo, nome_professor, turma,
              email_contato, aula_id, aula_livre, relato, status,
              criado_em, cancelado_em, cancelado_por

materias      id, nome, cor, ordem
habilidades   id, codigo (BNCC), descricao, materia_id, ano
aulas         id, titulo, tema, resumo, descricao, objetivos, materiais,
              materia_id, anos[], duracao_min, publicada
aulas_habilidades   aula_id, habilidade_id
```

**`horarios` é o molde, `reservas` é a ocorrência.** O horário descreve o que se repete toda
semana ("toda quarta, 14h às 15h30"); a reserva aponta para uma data concreta. Nenhuma tabela
guarda a lista de datas: `agenda_escola` expande o molde no período pedido, então o calendário
anda para frente sem nada ser pré-gerado.

**Toda reserva tem uma aula**, e só de duas formas: `aula_id` apontando para o catálogo, ou
`aula_livre` com o que o professor escreveu. Uma constraint garante que uma das duas existe —
sem isso a vitrine de aulas realizadas teria linhas sem assunto.

`horarios.ocupacao_wit` é quantos alunos do Núcleo já estão matriculados naquele horário: é o
que faz existir o status `parcial`, o caso que motiva o projeto (2–3 alunos numa sala de
18–20 ainda vale ser oferecida). Horários `parcial` continuam agendáveis.

`horarios.ativo` tira um horário do calendário sem apagar o histórico dele. Remover de vez só
é permitido enquanto o horário nunca teve reserva.

### Travas

- Índice único parcial em `(horario_id, data_aula)` para reservas confirmadas: duas
  requisições simultâneas na mesma data — a segunda recebe "Este horário acabou de ser
  reservado por outra pessoa". Datas diferentes do mesmo horário não competem entre si.
- Um trigger recusa reserva cuja data não caia no dia da semana do molde, mesmo que alguém
  contorne a RPC.
- Não se reserva no passado, e o horizonte é de 12 meses (`limite_agendamento()`).
- Aula que já aconteceu não pode ser cancelada — só apagaria o registro do que rolou.
- Aula do catálogo já usada por alguma turma não é apagada, é despublicada: o histórico
  perderia o título dela.

### Fuso horário

O banco roda em UTC, mas "hoje" é calculado em `America/Sao_Paulo`. Com `current_date` o dia
viraria às 21h no horário de Brasília. No front, datas andam como string `AAAA-MM-DD` e nunca
passam por `new Date(iso)`, que interpretaria a string como UTC e exibiria o dia anterior.

## Identidade visual

Tema escuro por padrão (o mesmo clima do material dos Núcleos), com os verdes do logo —
lima `#A6CE39`, vivo `#39B54A`, `#00A651` e `#007236` — num gradiente reaproveitado em
botões, destaques e números. Tema claro no botão do topo, guardado no navegador.

A marca está em `src/componentes/LogoWit.tsx`, desenhada em SVG (quadradinhos em degradê +
wordmark). Se você tiver o arquivo oficial, coloque em `public/` e troque o componente por
uma `<img>` — nada mais muda.

## Fora do escopo (Fase 2)

Fotos e vídeos nas aulas realizadas, notificações além de e-mail, e relatório de ocupação
para a Secretaria.

## Estrutura

```
src/
  lib/          cliente Supabase, chamadas de API tipadas, formatação
  componentes/  marca, layout, diálogos, editor de aula
  paginas/      Inicio, PortalEscola (/e/:token), Admin (/admin)
supabase/
  migrations/   0001 (base) + 0002 (catálogo e acesso público)
  functions/    Edge Function de e-mail
```

## Deploy

`npm run build` gera `dist/`. É uma SPA com rotas no cliente, então o host precisa devolver
`index.html` para qualquer caminho — sem isso o Vercel responde 404 justamente em `/e/<token>`,
que é como todo professor entra. O `vercel.json` na raiz já faz esse rewrite (o
`public/_redirects` cobre o mesmo caso no Netlify).

No painel do Vercel, em Settings > Environment Variables, defina `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` (e `VITE_EMAIL_CONFIRMACAO=true`, se for usar e-mail). São lidas no
build, não em runtime: mudou variável, precisa fazer redeploy para valer.

## Notas

- `npm audit` acusa um aviso `moderate` no esbuild que vem com o Vite 5. Afeta só o servidor
  de desenvolvimento (`npm run dev`), não o bundle publicado; some ao subir para Vite 6+, o
  que foge do stack combinado.

# Projeto Integrador · Núcleo WIT

Quando uma sala de tecnologia do Núcleo WIT fica ociosa, a escola e o Núcleo são cobrados
igual pela Secretaria. A saída informal já existia — o professor da escola "empresta" a
turma dele para uma aula dada pelo Núcleo WIT — mas dependia do instrutor caçar coordenador
de porta em porta para descobrir quem toparia.

Este sistema resolve a **descoberta de disponibilidade**: cada escola recebe um link, o
professor abre, navega pelo calendário, escolhe a data e reserva. Sem login, sem senha, sem app.

## Como funciona o acesso

Não existe cadastro de usuário. Cada escola tem **dois links**, gerados no cadastro:

| Link | Quem recebe | O que pode fazer |
| --- | --- | --- |
| `/e/<token_professor>` | professores da escola | ver o calendário, reservar uma data |
| `/e/<token_coordenacao>` | coordenação | tudo do link do professor + histórico completo + cancelar/editar reservas |

O nome do professor é **texto livre, sem validação de identidade**. É um trade-off
consciente: exigir cadastro mataria a adoção, e o público (professores de uma mesma escola,
com o link entregue pela coordenação) não justifica o atrito. O custo é que uma reserva pode
ser feita em nome de outra pessoa — daí a coordenação ter poder de cancelar e o histórico
registrar tudo.

O link **é** a credencial. Se um deles vazar, use "Novos links" no painel admin: os tokens
são trocados e os antigos param de funcionar na hora.

### Por que nenhuma tabela é exposta ao cliente

O `anon key` do Supabase vai no bundle do navegador — é público por definição. Se as tabelas
fossem legíveis pelo `anon`, qualquer pessoa com esse key listaria as escolas e seus tokens.

Então o RLS é **deny-all** em todas as tabelas (sem policy nenhuma) e todo acesso passa por
funções RPC `SECURITY DEFINER` que recebem o token como argumento e derivam o escopo dele.
Um token da escola A não alcança dados da escola B nem passando o `escola_id` da B na
chamada — o `escola_id` sai sempre do token, nunca do parâmetro.

## Confirmação da reserva

O escopo pedia "confirmação por e-mail (ou definir mecanismo alternativo)". A escolha aqui:

1. **Protocolo na tela** (`WIT-XXXXXX`) é a confirmação que vale. Fica gravado no banco,
   aparece na hora para a coordenação e para o Núcleo WIT, e é imprimível.
2. **E-mail é camada opcional**, via Edge Function (`supabase/functions/enviar-confirmacao`)
   usando a Resend. Se a chave não estiver configurada, a função responde
   `{ enviado: false, motivo: 'email_nao_configurado' }` e o resto segue igual.

O motivo de não pendurar o MVP no e-mail: com escola pública e e-mail de professor, entrega
é incerta (spam, caixa cheia, endereço errado, campo em branco). Uma reserva legítima nunca
pode falhar porque o provedor de e-mail estava fora do ar.

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha com o projeto Supabase
npm run dev
```

### Supabase

Crie um projeto **novo** (não reaproveite o do WIT Dungeon — domínio de dados diferente). No
projeto criado, abra o **SQL Editor** e cole o conteúdo de
`supabase/migrations/0001_inicial.sql` inteiro.

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
escolas    id, nome, token_professor, token_coordenacao, criado_em
horarios   id, escola_id, dia_semana, hora_inicio, hora_fim,
           capacidade, ocupacao_wit, status, ativo, criado_em
reservas   id, horario_id, data_aula, protocolo, nome_professor,
           email_contato, status, criado_em, cancelado_em, cancelado_por
```

**`horarios` é o molde, `reservas` é a ocorrência.** O horário descreve o que se repete toda
semana ("toda quarta, 14h às 15h30"); a reserva aponta para uma data concreta ("quarta,
19/08/2026"). Nenhuma tabela guarda a lista de datas: `listar_ocorrencias` expande o molde no
período pedido, então o calendário anda para frente indefinidamente sem nada ser pré-gerado.

Desvios do modelo do escopo, todos deliberados:

- **`reservas.data_aula`** — o que faz o calendário existir. Sem ela uma reserva ocuparia o
  slot semanal para sempre, e marcar outra semana ou outro mês seria impossível.
- **`horarios.ocupacao_wit`** — quantos alunos do Núcleo WIT já estão matriculados naquele
  horário. Sem esse campo o status `parcial` não teria como existir, e ele é justamente o
  caso que motiva o projeto: 2–3 alunos numa sala de 18–20 ainda vale ser oferecida.
  Horários `parcial` continuam reserváveis.
- **`horarios.ativo`** — tira o horário do calendário sem apagar o histórico dele. Remover de
  vez só é permitido enquanto o horário nunca teve reserva.
- **`reservas.protocolo`** — o código da confirmação (ver acima).
- **`reservas.cancelado_em` / `cancelado_por`** — sem isso, "a coordenação pode cancelar"
  viraria uma ação sem rastro no histórico.

O `status` do horário nunca é escrito à mão: um trigger o deriva de `ocupacao_wit` (`parcial`
se há aluno matriculado, senão `vago`). Estar reservado ou não é propriedade **da data**, não
do molde, e sai calculado em `listar_ocorrencias`.

### Travas

- Índice único parcial em `(horario_id, data_aula)` para reservas confirmadas: duas
  requisições simultâneas na mesma data — a segunda recebe "Este horário acabou de ser
  reservado por outra pessoa". Datas diferentes do mesmo horário não competem entre si.
- Um trigger recusa reserva cuja data não caia no dia da semana do molde, mesmo que alguém
  contorne a RPC.
- Não se reserva no passado, e o horizonte é de 12 meses (`limite_agendamento()`).

### Fuso horário

O banco roda em UTC, mas "hoje" é calculado em `America/Sao_Paulo`. Com `current_date` o dia
viraria às 21h no horário de Brasília e as aulas do dia seguinte apareceriam cedo demais — e
as de hoje sumiriam. No front, datas andam como string `AAAA-MM-DD` e nunca passam por
`new Date(iso)`, que interpretaria a string como UTC e exibiria o dia anterior.

## Fora do escopo (Fase 2)

Catálogo de conteúdos prontos (a segunda dor: o professor nunca fica sabendo que a aula de
hortaliças existe), vitrine de projetos com foto/vídeo, notificações além de e-mail.

## Estrutura

```
src/
  lib/          cliente Supabase, chamadas de API tipadas, formatação
  componentes/  peças de UI (calendário, lista do dia, diálogos, painéis)
  paginas/      Inicio, PortalEscola (/e/:token), Admin (/admin)
supabase/
  migrations/   0001_inicial.sql — banco inteiro num arquivo
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

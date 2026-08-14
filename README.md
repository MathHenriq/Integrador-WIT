# Projeto Integrador · Núcleo WIT

Quando uma sala de tecnologia do Núcleo WIT fica ociosa, a escola e o Núcleo são cobrados
igual pela Secretaria. A saída informal já existia — o professor da escola "empresta" a
turma dele para uma aula dada pelo Núcleo WIT — mas dependia do instrutor caçar coordenador
de porta em porta para descobrir quem toparia.

Este sistema resolve a **descoberta de disponibilidade**: cada escola recebe um link, o
professor abre, vê os horários vagos e reserva. Sem login, sem senha, sem app.

## Como funciona o acesso

Não existe cadastro de usuário. Cada escola tem **dois links**, gerados no cadastro:

| Link | Quem recebe | O que pode fazer |
| --- | --- | --- |
| `/e/<token_professor>` | professores da escola | ver a grade, reservar um horário vago |
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

Crie um projeto **novo** (não reaproveite o do WIT Dungeon — domínio de dados diferente) e
aplique as migrations em ordem, pelo SQL Editor ou pela CLI:

```bash
supabase db push
```

| Arquivo | O que faz |
| --- | --- |
| `0001_schema.sql` | tabelas, tipos, triggers de status, RLS deny-all |
| `0002_rpc.sql` | toda a API pública (as funções que o front chama) |
| `0003_admin_inicial.sql` | cria o primeiro token de administração |

Pegue o token de admin depois de aplicar:

```sql
select token from public.admin_tokens;
```

Ele é a senha do `/admin`. Guarde num gerenciador de senhas — não há como recuperá-lo, só
gerar outro.

### E-mail (opcional)

```bash
supabase functions deploy enviar-confirmacao
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set EMAIL_REMETENTE="Núcleo WIT <projetos@seudominio.com.br>"
supabase secrets set EMAIL_COPIA_WIT=voce@nucleowit.org   # opcional
```

E no `.env` do front: `VITE_EMAIL_CONFIRMACAO=true`.

## Uso

**Você (admin), em `/admin`:** cadastra a escola, copia os dois links, cadastra os horários
vagos daquela escola. Os links são entregues à coordenação, que repassa o de professor.

**Professor:** abre o link, vê os horários disponíveis, clica em Reservar, escreve o nome
(pode incluir a turma: "Ana Ribeiro — 7º ano B"), confirma. Recebe o protocolo.

**Coordenação:** mesmo link-portal, com uma aba de histórico a mais. Cancela quando a
reserva não se confirma na prática — o horário volta a aparecer como disponível para os
outros professores, e a reserva fica no histórico marcada como cancelada, com data e autor
do cancelamento.

## Modelo de dados

```
escolas    id, nome, token_professor, token_coordenacao, criado_em
horarios   id, escola_id, dia_semana, hora_inicio, hora_fim,
           capacidade, ocupacao_wit, status, criado_em
reservas   id, horario_id, protocolo, nome_professor, email_contato,
           status, criado_em, cancelado_em, cancelado_por
```

Três desvios do modelo do escopo, todos deliberados:

- **`horarios.ocupacao_wit`** — quantos alunos do Núcleo WIT já estão matriculados naquele
  horário. Sem esse campo o status `parcial` não teria como existir, e ele é justamente o
  caso que motiva o projeto: 2–3 alunos numa sala de 18–20 ainda vale ser oferecida. O
  `status` nunca é escrito à mão: é derivado por trigger (`cheio` se há reserva confirmada,
  senão `parcial` se `ocupacao_wit > 0`, senão `vago`) e horários `parcial` continuam
  reserváveis.
- **`reservas.protocolo`** — o código da confirmação (ver acima).
- **`reservas.cancelado_em` / `cancelado_por`** — sem isso, "a coordenação pode cancelar"
  viraria uma ação sem rastro no histórico.

Uma trava impede corrida entre dois professores: índice único parcial garante no máximo uma
reserva `confirmado` por horário. Duas requisições simultâneas para o mesmo horário — a
segunda recebe "Este horário acabou de ser reservado por outra pessoa".

### Limitação conhecida: horário é semanal, não datado

Conforme o escopo, `horarios` guarda `dia_semana` + hora, sem data. Na prática isso significa
que **uma reserva ocupa aquele slot semanal indefinidamente**, até alguém cancelar — não dá
para reservar "terça 14h da semana que vem" e liberar a terça seguinte. Para o piloto isso
funciona (o Projeto Integrador costuma ser um combinado de continuidade), mas se a operação
pedir reserva por data específica, o caminho é adicionar `reservas.data_aula` e trocar o
índice único para `(horario_id, data_aula)`. Ficou fora daqui para não estourar o escopo da
Fase 1.

## Fora do escopo (Fase 2)

Catálogo de conteúdos prontos (a segunda dor: o professor nunca fica sabendo que a aula de
hortaliças existe), vitrine de projetos com foto/vídeo, notificações além de e-mail.

## Estrutura

```
src/
  lib/          cliente Supabase, chamadas de API tipadas, formatação
  componentes/  peças de UI (lista de horários, diálogos, painéis)
  paginas/      Inicio, PortalEscola (/e/:token), Admin (/admin)
supabase/
  migrations/   schema + RPC + token inicial
  functions/    Edge Function de e-mail
```

## Deploy

`npm run build` gera `dist/`. É uma SPA com rotas no cliente, então o host precisa devolver
`index.html` para qualquer caminho — o `public/_redirects` já cobre Netlify; na Vercel, um
`vercel.json` com rewrite `/(.*) -> /index.html`.

## Notas

- `npm audit` acusa um aviso `moderate` no esbuild que vem com o Vite 5. Afeta só o servidor
  de desenvolvimento (`npm run dev`), não o bundle publicado; some ao subir para Vite 6+, o
  que foge do stack combinado.

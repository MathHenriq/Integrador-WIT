// =====================================================================
// Edge Function: notificar-equipe
// =====================================================================
// Manda para os professores do Núcleo WIT o aviso de que uma escola
// pediu a sala. Ela não decide nada: só drena a fila que a migration
// 0027 montou (`public.notificacoes`) e transforma cada linha em
// e-mail.
//
// Quem chama:
//   - o cron do banco, de minuto em minuto (pg_cron + pg_net) — é o
//     caminho que garante a entrega;
//   - o próprio site, logo depois de gravar a reserva — é o caminho que
//     a torna rápida, e é só isso: se falhar, o cron pega na volta.
//
// Por isso a fila é reivindicada com `for update skip locked` lá no
// banco: as duas chamadas podem chegar juntas na mesma linha e só uma
// leva. E-mail repetido é o jeito mais rápido de ensinar a equipe a
// ignorar o aviso.
//
// Variáveis de ambiente (supabase secrets set ...):
//   RESEND_API_KEY   - chave da Resend. Ausente => a função não toca na
//                      fila (nada se perde; sai quando configurar).
//   EMAIL_REMETENTE  - ex: "Núcleo WIT <avisos@seudominio.com.br>"
//   SITE_URL         - opcional. Endereço do site, para o link do
//                      painel dentro do e-mail.
//
// Chamada: POST, sem corpo. Responde com o que aconteceu na varredura.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Quantos avisos por varredura. O cron roda a cada minuto; um lote
 *  pequeno mantém a função dentro do tempo dela e o resto espera o
 *  minuto seguinte, sem perder nada. */
const LOTE = 20

type Aviso = {
  id: string
  tipo: string
  tentativas: number
  destinatarios: string[]
  protocolo: string
  nome_professor: string
  turma: string | null
  email_contato: string | null
  whatsapp_contato: string | null
  quantidade_alunos: number | null
  data_aula: string
  hora_inicio: string
  hora_fim: string
  dia_semana: number
  escola: string
  grupo: string | null
  atividade: string
  objetivos: string | null
  materiais: string | null
}

function responder(corpo: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function horaCurta(hora: string) {
  return String(hora).slice(0, 5)
}

/** "19 de agosto de 2026" a partir de "2026-08-19", sem passar por Date
 *  (que leria a string como UTC e devolveria o dia anterior no fuso do
 *  Brasil — a regra que vale no projeto inteiro). */
function dataExtensa(iso: string) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-')
  return `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}`
}

/** O texto do professor da escola entra no corpo do e-mail. Ele digitou
 *  livremente num formulário público: escapar é obrigatório, senão um
 *  "<" no nome da turma quebra o HTML e um `<script>` vira problema de
 *  verdade na caixa de entrada de quem lê. */
function escapar(texto: unknown) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function linha(rotulo: string, valor: string) {
  return `<tr>
    <td style="padding:5px 16px 5px 0;color:#57534e;white-space:nowrap;vertical-align:top">${rotulo}</td>
    <td style="padding:5px 0;vertical-align:top">${valor}</td>
  </tr>`
}

function montarEmail(aviso: Aviso, siteUrl: string | undefined) {
  const quando = `${DIAS[aviso.dia_semana]}, ${dataExtensa(aviso.data_aula)}, das ${horaCurta(
    aviso.hora_inicio,
  )} às ${horaCurta(aviso.hora_fim)}`

  // O contato é o motivo do e-mail existir: é com ele que o professor do
  // dia liga/escreve para combinar a aula antes de confirmar.
  const contatos = [
    aviso.email_contato
      ? `<a href="mailto:${escapar(aviso.email_contato)}" style="color:#00A651">${escapar(aviso.email_contato)}</a>`
      : null,
    aviso.whatsapp_contato
      ? `<a href="https://wa.me/55${String(aviso.whatsapp_contato).replace(/\D/g, '')}" style="color:#00A651">${escapar(
          aviso.whatsapp_contato,
        )}</a> (WhatsApp)`
      : null,
  ].filter(Boolean)

  const opcionais = [
    aviso.turma ? linha('Turma', escapar(aviso.turma)) : '',
    aviso.quantidade_alunos ? linha('Alunos', `${aviso.quantidade_alunos}`) : '',
    aviso.objetivos ? linha('Objetivos', escapar(aviso.objetivos).replace(/\n/g, '<br>')) : '',
    aviso.materiais ? linha('Materiais', escapar(aviso.materiais).replace(/\n/g, '<br>')) : '',
  ].join('')

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917;line-height:1.6;max-width:560px">
      <p style="margin:0 0 4px;color:#00A651;font-size:13px;letter-spacing:.06em;text-transform:uppercase">
        Projeto Integrador &middot; Núcleo WIT${aviso.grupo ? ` &middot; Grupo ${escapar(aviso.grupo)}` : ''}
      </p>
      <h2 style="margin:0 0 4px;font-size:21px">Reserva nova esperando confirmação</h2>
      <p style="margin:0 0 20px;color:#57534e">
        ${escapar(aviso.escola)}
      </p>

      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">
        ${linha('Quando', escapar(quando))}
        ${linha('Professor(a)', escapar(aviso.nome_professor))}
        ${opcionais}
        ${linha('Tema', escapar(aviso.atividade))}
        ${linha('Contato', contatos.length ? contatos.join('<br>') : '<em>não informado</em>')}
        ${linha('Protocolo', `<strong>${escapar(aviso.protocolo)}</strong>`)}
      </table>

      <p style="margin:22px 0 0;font-size:15px">
        O horário já está travado — ninguém mais consegue reservar essa data.
        Falta combinar a aula com o professor e confirmar no painel, na aba
        <strong>Reservas</strong>.
      </p>
      <p style="margin:10px 0 0;color:#57534e;font-size:14px">
        Vale lembrar na conversa: o conteúdo é o que ele já vai dar. A gente
        entra com a tecnologia e monta a aula junto com ele.
      </p>
      ${
        siteUrl
          ? `<p style="margin:22px 0 0">
              <a href="${escapar(siteUrl.replace(/\/+$/, ''))}/admin"
                 style="display:inline-block;background:#00A651;color:#fff;text-decoration:none;
                        padding:10px 18px;border-radius:6px;font-weight:600;font-size:15px">
                Abrir o painel
              </a>
            </p>`
          : ''
      }
    </div>`

  const assunto = `Reserva nova · ${aviso.escola} · ${dataExtensa(aviso.data_aula)}, ${horaCurta(aviso.hora_inicio)}`

  return { html, assunto }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const chaveResend = Deno.env.get('RESEND_API_KEY')
  const remetente = Deno.env.get('EMAIL_REMETENTE')
  const siteUrl = Deno.env.get('SITE_URL')

  // Conferido ANTES de encostar na fila, de propósito. Se reivindicasse
  // primeiro, cada aviso gastaria tentativa contra uma chave que ainda
  // nem existe e morreria como "falhou" antes de a equipe terminar de
  // configurar o provedor.
  if (!chaveResend || !remetente) {
    return responder({ ok: true, enviados: 0, motivo: 'email_nao_configurado' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase.rpc('reivindicar_notificacoes', { p_limite: LOTE })

  if (error) {
    console.error('Falha ao reivindicar a fila', error)
    return responder({ ok: false, motivo: 'fila_indisponivel' }, 500)
  }

  const avisos = (data ?? []) as Aviso[]
  if (avisos.length === 0) return responder({ ok: true, enviados: 0 })

  let enviados = 0
  let adiados = 0
  let falhas = 0

  for (const aviso of avisos) {
    // Ninguém cadastrado na equipe (ou todo mundo inativo). Não é falha
    // de envio: é cadastro faltando. Volta para a fila sem gastar
    // tentativa e sai sozinho assim que alguém for cadastrado.
    if (!aviso.destinatarios || aviso.destinatarios.length === 0) {
      adiados++
      await supabase.rpc('adiar_notificacao', {
        p_id: aviso.id,
        p_motivo: 'Nenhum professor ativo cadastrado na aba "Equipe" para receber o aviso.',
      })
      continue
    }

    const { html, assunto } = montarEmail(aviso, siteUrl)

    try {
      const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chaveResend}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: remetente,
          to: aviso.destinatarios,
          subject: assunto,
          // Responder o e-mail cai direto no professor da escola, que é
          // o que o professor do dia precisa fazer a seguir.
          ...(aviso.email_contato ? { reply_to: aviso.email_contato } : {}),
          html,
        }),
      })

      if (!resposta.ok) {
        const detalhe = await resposta.text()
        console.error('Resend respondeu', resposta.status, detalhe)
        falhas++
        await supabase.rpc('concluir_notificacao', {
          p_id: aviso.id,
          p_ok: false,
          p_erro: `Resend ${resposta.status}: ${detalhe.slice(0, 300)}`,
        })
        continue
      }

      enviados++
      await supabase.rpc('concluir_notificacao', { p_id: aviso.id, p_ok: true, p_erro: null })
    } catch (erro) {
      console.error('Falha ao chamar a Resend', erro)
      falhas++
      await supabase.rpc('concluir_notificacao', {
        p_id: aviso.id,
        p_ok: false,
        p_erro: String(erro).slice(0, 300),
      })
    }
  }

  return responder({ ok: true, enviados, adiados, falhas })
})

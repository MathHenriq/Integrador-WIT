// =====================================================================
// Edge Function: enviar-confirmacao
// =====================================================================
// Camada OPCIONAL de confirmação por e-mail. A confirmação que vale é a
// da tela (protocolo gravado no banco); este envio é um extra.
//
// Por isso a função nunca devolve erro para o cliente quando o e-mail
// falha: ela responde 200 com `enviado: false` e um motivo. Uma reserva
// legítima jamais pode ser desfeita por indisponibilidade do provedor de
// e-mail.
//
// Variáveis de ambiente (supabase secrets set ...):
//   RESEND_API_KEY   - chave da Resend. Ausente => função vira no-op.
//   EMAIL_REMETENTE  - ex: "Núcleo WIT <projetos@seudominio.com.br>"
//   EMAIL_COPIA_WIT  - opcional, recebe cópia de toda reserva.
//
// Chamada: POST { "protocolo": "WIT-XXXXXX" }
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
 *  (que interpretaria a string como UTC e voltaria um dia). */
function dataExtensa(iso: string) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-')
  return `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let protocolo: string
  try {
    const corpo = await req.json()
    protocolo = String(corpo.protocolo ?? '')
  } catch {
    return responder({ enviado: false, motivo: 'requisicao_invalida' })
  }

  if (!protocolo) return responder({ enviado: false, motivo: 'requisicao_invalida' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // O protocolo é a credencial da reserva (mesma regra do cancelamento).
  // Mesmo que alguém adivinhasse um, a função só envia para o endereço
  // gravado na própria reserva — não dá para redirecionar o e-mail.
  const { data: reserva } = await supabase
    .from('reservas')
    .select('protocolo, nome_professor, turma, email_contato, whatsapp_contato, status, data_aula, aula_livre, aulas(titulo), horarios(dia_semana, hora_inicio, hora_fim, escolas(nome))')
    .eq('protocolo', protocolo.trim().toUpperCase())
    .maybeSingle()

  const horario = reserva?.horarios as
    | { dia_semana: number; hora_inicio: string; hora_fim: string; escolas: { nome: string } }
    | undefined

  if (!reserva || !horario) return responder({ enviado: false, motivo: 'reserva_nao_encontrada' })

  const escola = horario.escolas
  const aula = (reserva.aulas as { titulo: string } | null)?.titulo ?? reserva.aula_livre ?? 'Aula'

  const chaveResend = Deno.env.get('RESEND_API_KEY')
  const remetente = Deno.env.get('EMAIL_REMETENTE')
  if (!chaveResend || !remetente) {
    return responder({ enviado: false, motivo: 'email_nao_configurado' })
  }

  const destinatarios = [reserva.email_contato, Deno.env.get('EMAIL_COPIA_WIT')]
    .filter((e): e is string => typeof e === 'string' && e.includes('@'))

  if (destinatarios.length === 0) return responder({ enviado: false, motivo: 'sem_destinatario' })

  const quando = `${DIAS[horario.dia_semana]}, ${dataExtensa(reserva.data_aula)}, das ${horaCurta(
    horario.hora_inicio,
  )} às ${horaCurta(horario.hora_fim)}`
  const pendente = reserva.status === 'aguardando_confirmacao'
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917;line-height:1.6">
      <h2 style="margin:0 0 4px">${pendente ? 'Pedido de agendamento recebido' : 'Reserva confirmada'}</h2>
      <p style="margin:0 0 20px;color:#57534e">Projeto Integrador &middot; Núcleo WIT</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0;color:#57534e">Protocolo</td><td style="padding:4px 0"><strong>${reserva.protocolo}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#57534e">Escola</td><td style="padding:4px 0">${escola.nome}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#57534e">Aula</td><td style="padding:4px 0">${quando}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#57534e">Atividade</td><td style="padding:4px 0">${aula}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#57534e">Professor(a)</td><td style="padding:4px 0">${reserva.nome_professor}${reserva.turma ? ` &middot; ${reserva.turma}` : ''}</td></tr>
      </table>
      ${
        pendente
          ? `<p style="margin:20px 0 0;color:#57534e;font-size:14px">
              Este horário está reservado para você, mas ainda <strong>aguardando confirmação da
              equipe WIT</strong>. Alguém do Núcleo vai entrar em contato pelo e-mail ou WhatsApp
              informado para entender a aula antes de confirmar.
            </p>`
          : `<p style="margin:20px 0 0;color:#57534e;font-size:14px">
              Esta reserva vale apenas para a data acima. Para consultar ou cancelar, use o
              protocolo na página "Minha reserva" do site.
            </p>`
      }
    </div>`

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chaveResend}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remetente,
        to: destinatarios,
        subject: `${pendente ? 'Pedido recebido' : 'Reserva confirmada'} ${reserva.protocolo} — ${escola.nome}, ${dataExtensa(reserva.data_aula)}`,
        html,
      }),
    })

    if (!resposta.ok) {
      console.error('Resend respondeu', resposta.status, await resposta.text())
      return responder({ enviado: false, motivo: 'falha_no_envio' })
    }
  } catch (erro) {
    console.error('Falha ao chamar a Resend', erro)
    return responder({ enviado: false, motivo: 'falha_no_envio' })
  }

  return responder({ enviado: true, destinatarios: destinatarios.length })
})

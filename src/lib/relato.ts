import { adminRegistrarRelato } from './api'
import type { ReservaAdmin } from './tipos'

/**
 * O relato e as fotos de uma aula que já aconteceu, perguntados em duas
 * caixas do navegador. Mora aqui porque duas abas do painel pedem a
 * mesma coisa — a de reservas e a dos integradores realizados — e um
 * texto perguntado de dois jeitos diferentes viraria dois formatos de
 * registro.
 *
 * Devolve `true` quando gravou; `false` quando a pessoa desistiu no meio.
 */
export async function pedirRelatoEFotos(senha: string, reserva: ReservaAdmin) {
  const relato = window.prompt(
    'Conte em poucas linhas como foi a aula. Isso aparece na vitrine pública de aulas realizadas.',
    reserva.relato ?? '',
  )
  if (relato === null) return false

  const fotos = window.prompt(
    'Endereços das fotos da aula, um por linha.\n\nCole o link direto da imagem (Drive, Storage do Supabase, etc.). Elas aparecem na vitrine e na página da atividade.',
    reserva.fotos.join('\n'),
  )
  if (fotos === null) return false

  await adminRegistrarRelato(
    senha,
    reserva.id,
    relato,
    fotos
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean),
  )
  return true
}

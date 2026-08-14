import { emailHabilitado, supabase } from './supabase'
import type {
  Acesso,
  Comprovante,
  EscolaAdmin,
  Horario,
  HorarioAdmin,
  Reserva,
  ReservaAdmin,
} from './tipos'

/**
 * As RPCs levantam exceções com mensagens já escritas para o usuário
 * final (em português). Repassamos essa mensagem e guardamos um fallback
 * para erros de rede/infra, que não têm texto apresentável.
 */
export class ErroApi extends Error {}

async function chamar<T>(funcao: string, argumentos: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(funcao, argumentos)

  if (error) {
    const mensagem = error.message?.trim()
    const semTexto = !mensagem || /fetch|network|failed to/i.test(mensagem)
    throw new ErroApi(
      semTexto ? 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.' : mensagem,
    )
  }

  return data as T
}

// ---------------------------------------------------------------------
// Portal da escola
// ---------------------------------------------------------------------

/** Retorna null quando o link não corresponde a nenhuma escola. */
export function acessarEscola(token: string) {
  return chamar<Acesso | null>('acessar_escola', { p_token: token })
}

export function listarHorarios(token: string) {
  return chamar<Horario[]>('listar_horarios', { p_token: token })
}

export async function criarReserva(
  token: string,
  horarioId: string,
  nomeProfessor: string,
  emailContato: string | null,
) {
  const comprovante = await chamar<Comprovante>('criar_reserva', {
    p_token: token,
    p_horario_id: horarioId,
    p_nome_professor: nomeProfessor,
    p_email_contato: emailContato,
  })

  // Disparo do e-mail depois da reserva já estar gravada, e sem await no
  // caminho de erro: a confirmação que vale é o protocolo na tela.
  if (emailHabilitado && comprovante?.protocolo) {
    void supabase.functions
      .invoke('enviar-confirmacao', { body: { token, protocolo: comprovante.protocolo } })
      .catch((erro) => console.warn('Falha ao enviar e-mail de confirmação', erro))
  }

  return comprovante
}

// ---------------------------------------------------------------------
// Coordenação
// ---------------------------------------------------------------------

export function listarReservas(token: string) {
  return chamar<Reserva[]>('listar_reservas', { p_token: token })
}

export function cancelarReserva(token: string, reservaId: string, canceladoPor: string | null) {
  return chamar<unknown>('cancelar_reserva', {
    p_token: token,
    p_reserva_id: reservaId,
    p_cancelado_por: canceladoPor,
  })
}

export function editarReserva(
  token: string,
  reservaId: string,
  nomeProfessor: string,
  emailContato: string | null,
) {
  return chamar<unknown>('editar_reserva', {
    p_token: token,
    p_reserva_id: reservaId,
    p_nome_professor: nomeProfessor,
    p_email_contato: emailContato,
  })
}

// ---------------------------------------------------------------------
// Administração
// ---------------------------------------------------------------------

export function adminListarEscolas(adminToken: string) {
  return chamar<EscolaAdmin[]>('admin_listar_escolas', { p_admin_token: adminToken })
}

export function adminCriarEscola(adminToken: string, nome: string) {
  return chamar<EscolaAdmin>('admin_criar_escola', { p_admin_token: adminToken, p_nome: nome })
}

export function adminRenomearEscola(adminToken: string, escolaId: string, nome: string) {
  return chamar<unknown>('admin_renomear_escola', {
    p_admin_token: adminToken,
    p_escola_id: escolaId,
    p_nome: nome,
  })
}

export function adminRenovarTokens(adminToken: string, escolaId: string) {
  return chamar<unknown>('admin_renovar_tokens', { p_admin_token: adminToken, p_escola_id: escolaId })
}

export function adminListarHorarios(adminToken: string, escolaId: string) {
  return chamar<HorarioAdmin[]>('admin_listar_horarios', {
    p_admin_token: adminToken,
    p_escola_id: escolaId,
  })
}

export function adminCriarHorario(
  adminToken: string,
  escolaId: string,
  dados: {
    diaSemana: number
    horaInicio: string
    horaFim: string
    capacidade: number
    ocupacaoWit: number
  },
) {
  return chamar<unknown>('admin_criar_horario', {
    p_admin_token: adminToken,
    p_escola_id: escolaId,
    p_dia_semana: dados.diaSemana,
    p_hora_inicio: dados.horaInicio,
    p_hora_fim: dados.horaFim,
    p_capacidade: dados.capacidade,
    p_ocupacao_wit: dados.ocupacaoWit,
  })
}

export function adminAtualizarHorario(
  adminToken: string,
  horarioId: string,
  capacidade: number,
  ocupacaoWit: number,
) {
  return chamar<unknown>('admin_atualizar_horario', {
    p_admin_token: adminToken,
    p_horario_id: horarioId,
    p_capacidade: capacidade,
    p_ocupacao_wit: ocupacaoWit,
  })
}

export function adminRemoverHorario(adminToken: string, horarioId: string) {
  return chamar<unknown>('admin_remover_horario', {
    p_admin_token: adminToken,
    p_horario_id: horarioId,
  })
}

export function adminListarReservas(adminToken: string, escolaId: string | null) {
  return chamar<ReservaAdmin[]>('admin_listar_reservas', {
    p_admin_token: adminToken,
    p_escola_id: escolaId,
  })
}

import { emailHabilitado, supabase } from './supabase'
import type {
  Acesso,
  Comprovante,
  DataIso,
  EscolaAdmin,
  HorarioAdmin,
  Ocorrencia,
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
export async function acessarEscola(token: string) {
  const acesso = await chamar<Acesso | null>('acessar_escola', { p_token: token })
  if (!acesso) return null
  return {
    ...acesso,
    hoje: soData(acesso.hoje),
    limite_agendamento: soData(acesso.limite_agendamento),
  }
}

/**
 * O calendário casa ocorrência com célula por igualdade exata de string,
 * então uma data que chegue como "2026-08-19T00:00:00Z" faria a grade
 * aparecer vazia sem erro nenhum. Normalizar aqui mantém esse acoplamento
 * num lugar só.
 */
function soData(valor: string): DataIso {
  return valor.slice(0, 10)
}

/** Aulas concretas do período: o molde semanal expandido em datas. */
export async function listarOcorrencias(token: string, inicio: DataIso, fim: DataIso) {
  const ocorrencias = await chamar<Ocorrencia[]>('listar_ocorrencias', {
    p_token: token,
    p_inicio: inicio,
    p_fim: fim,
  })
  return ocorrencias.map((o) => ({ ...o, data_aula: soData(o.data_aula) }))
}

export async function criarReserva(
  token: string,
  horarioId: string,
  dataAula: DataIso,
  nomeProfessor: string,
  emailContato: string | null,
) {
  const comprovante = await chamar<Comprovante>('criar_reserva', {
    p_token: token,
    p_horario_id: horarioId,
    p_data_aula: dataAula,
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

  return { ...comprovante, data_aula: soData(comprovante.data_aula) }
}

// ---------------------------------------------------------------------
// Coordenação
// ---------------------------------------------------------------------

export async function listarReservas(token: string) {
  const reservas = await chamar<Reserva[]>('listar_reservas', { p_token: token })
  return reservas.map((r) => ({ ...r, data_aula: soData(r.data_aula) }))
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
  dados: { capacidade?: number | null; ocupacaoWit?: number | null; ativo?: boolean | null },
) {
  return chamar<unknown>('admin_atualizar_horario', {
    p_admin_token: adminToken,
    p_horario_id: horarioId,
    p_capacidade: dados.capacidade ?? null,
    p_ocupacao_wit: dados.ocupacaoWit ?? null,
    p_ativo: dados.ativo ?? null,
  })
}

export function adminRemoverHorario(adminToken: string, horarioId: string) {
  return chamar<unknown>('admin_remover_horario', {
    p_admin_token: adminToken,
    p_horario_id: horarioId,
  })
}

export async function adminListarReservas(
  adminToken: string,
  escolaId: string | null,
  de: DataIso | null = null,
  ate: DataIso | null = null,
) {
  const reservas = await chamar<ReservaAdmin[]>('admin_listar_reservas', {
    p_admin_token: adminToken,
    p_escola_id: escolaId,
    p_de: de,
    p_ate: ate,
  })
  return reservas.map((r) => ({ ...r, data_aula: soData(r.data_aula) }))
}

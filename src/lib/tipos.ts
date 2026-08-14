export type PapelAcesso = 'professor' | 'coordenacao'
export type StatusHorario = 'vago' | 'parcial' | 'cheio'
export type StatusReserva = 'confirmado' | 'cancelado'

/** Data no formato ISO curto, "2026-08-19". Nunca um Date serializado. */
export type DataIso = string

export type Acesso = {
  escola_id: string
  escola_nome: string
  papel: PapelAcesso
  /** Hoje no fuso de Brasília, segundo o servidor. */
  hoje: DataIso
  /** Última data que aceita reserva. */
  limite_agendamento: DataIso
}

/**
 * Uma aula concreta: o molde semanal (`horario_id`) numa data específica.
 * É a unidade que o professor reserva.
 */
export type Ocorrencia = {
  horario_id: string
  data_aula: DataIso
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  capacidade: number
  ocupacao_wit: number
  status: StatusHorario
  /** Livre, ainda não começou e dentro do horizonte de agendamento. */
  reservavel: boolean
  reserva_id: string | null
  reserva_protocolo: string | null
  reserva_professor: string | null
  /** Só vem preenchido no link da coordenação. */
  reserva_email: string | null
  reserva_criado_em: string | null
}

export type Reserva = {
  id: string
  protocolo: string
  nome_professor: string
  email_contato: string | null
  status: StatusReserva
  criado_em: string
  cancelado_em: string | null
  cancelado_por: string | null
  horario_id: string
  data_aula: DataIso
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  ja_aconteceu: boolean
}

export type Comprovante = {
  reserva_id: string
  protocolo: string
  nome_professor: string
  email_contato: string | null
  criado_em: string
  data_aula: DataIso
  escola_nome: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
}

export type EscolaAdmin = {
  id: string
  nome: string
  token_professor: string
  token_coordenacao: string
  criado_em: string
  total_horarios: number
  horarios_ativos: number
  reservas_futuras: number
}

export type HorarioAdmin = {
  id: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  capacidade: number
  ocupacao_wit: number
  status: StatusHorario
  ativo: boolean
  reservas_futuras: number
  total_reservas: number
}

export type ReservaAdmin = {
  id: string
  protocolo: string
  escola_id: string
  escola_nome: string
  nome_professor: string
  email_contato: string | null
  status: StatusReserva
  criado_em: string
  cancelado_em: string | null
  cancelado_por: string | null
  data_aula: DataIso
  dia_semana: number
  hora_inicio: string
  hora_fim: string
}

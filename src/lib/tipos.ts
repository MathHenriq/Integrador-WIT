export type StatusHorario = 'vago' | 'parcial' | 'cheio'
export type StatusReserva = 'confirmado' | 'cancelado'

/** Data no formato ISO curto, "2026-08-19". Nunca um Date serializado. */
export type DataIso = string

export type EscolaResumo = { id: string; nome: string }
export type Materia = { id: string; nome: string; cor: string }

export type ContextoPublico = {
  hoje: DataIso
  limite_agendamento: DataIso
  escolas: EscolaResumo[]
  materias: Materia[]
}

/** Uma aula concreta: o molde semanal numa data específica. */
export type Ocorrencia = {
  horario_id: string
  data_aula: DataIso
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  capacidade: number
  ocupacao_wit: number
  status: StatusHorario
  reservavel: boolean
  reserva_id: string | null
  reserva_professor: string | null
  reserva_turma: string | null
  aula_titulo: string | null
  aula_id: string | null
}

export type HabilidadeResumo = { codigo: string; descricao: string }

export type AulaCatalogo = {
  id: string
  titulo: string
  tema: string | null
  resumo: string
  materia_id: string | null
  materia_nome: string | null
  materia_cor: string | null
  anos: number[]
  duracao_min: number
  habilidades: HabilidadeResumo[]
  vezes_dada: number
}

export type AulaDetalhe = {
  id: string
  titulo: string
  tema: string | null
  resumo: string
  descricao: string | null
  objetivos: string | null
  materiais: string | null
  anos: number[]
  duracao_min: number
  materia_nome: string | null
  materia_cor: string | null
  habilidades: HabilidadeResumo[]
  vezes_dada: number
}

export type Habilidade = {
  id: string
  codigo: string
  descricao: string
  materia_id: string | null
  ano: number | null
}

export type Realizada = {
  id: string
  data_aula: DataIso
  escola_nome: string
  nome_professor: string
  turma: string | null
  titulo: string
  tema: string | null
  resumo: string | null
  relato: string | null
  materia_nome: string | null
  materia_cor: string | null
  aula_id: string | null
  do_catalogo: boolean
}

export type Comprovante = {
  protocolo: string
  nome_professor: string
  turma: string | null
  data_aula: DataIso
  escola_nome: string
  hora_inicio: string
  hora_fim: string
  aula_titulo: string
}

export type ReservaConsulta = {
  protocolo: string
  status: StatusReserva
  data_aula: DataIso
  hora_inicio: string
  hora_fim: string
  escola_nome: string
  nome_professor: string
  turma: string | null
  aula_titulo: string
  cancelado_em: string | null
  ja_aconteceu: boolean
}

// --------------------------------------------------------------- admin

export type EscolaAdmin = {
  id: string
  nome: string
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

export type AulaAdmin = {
  id: string
  titulo: string
  tema: string | null
  resumo: string
  descricao: string | null
  objetivos: string | null
  materiais: string | null
  materia_id: string | null
  materia_nome: string | null
  anos: number[]
  duracao_min: number
  publicada: boolean
  habilidades: { id: string; codigo: string; descricao: string }[]
  vezes_dada: number
}

export type ReservaAdmin = {
  id: string
  protocolo: string
  escola_id: string
  escola_nome: string
  nome_professor: string
  turma: string | null
  email_contato: string | null
  status: StatusReserva
  criado_em: string
  cancelado_em: string | null
  cancelado_por: string | null
  data_aula: DataIso
  hora_inicio: string
  hora_fim: string
  aula_titulo: string | null
  relato: string | null
  ja_aconteceu: boolean
}

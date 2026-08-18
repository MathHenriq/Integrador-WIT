export type StatusHorario = 'vago' | 'parcial' | 'cheio'
export type StatusReserva = 'confirmado' | 'cancelado'

/**
 * Situação de um integrador aos olhos da coordenação. Sai do cruzamento
 * de status + data + registro, e não de uma coluna do banco: uma reserva
 * confirmada que já passou sem relato nem foto não é a mesma coisa que
 * uma que passou e virou vitrine.
 */
export type SituacaoIntegrador = 'registrada' | 'sem-registro' | 'agendada' | 'cancelada'

/** Como anda o projeto integrador numa escola. */
export type SituacaoEscola = 'em-atividade' | 'parada' | 'primeira-marcada' | 'sem-projeto'

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
  fotos: string[]
  vezes_dada: number
}

export type Habilidade = {
  id: string
  codigo: string
  descricao: string
  materia_id: string | null
  ano: number | null
  /** Quantas atendem ao filtro no total, não só as devolvidas. */
  total: number
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
  fotos: string[]
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

/** O que a Edge Function conseguiu ler do documento do Canva. */
export type CamposCanva = {
  tema: string | null
  curso: string | null
  turma: string | null
  data: DataIso | null
  /** O texto cru da data, para mostrar quando não deu para entender. */
  data_lida: string | null
  professor: string | null
  escola: string | null
  objetivos: string | null
  descricao: string | null
  materiais: string | null
}

export type ImportacaoCanva = {
  importacao_id: string | null
  campos: CamposCanva
  relato: string
  fotos: string[]
  avisos: string[]
  paginas: number
  /** Vezes que este mesmo arquivo já virou aula publicada. */
  anteriores: { criado_em: string; status: string; protocolo: string | null; data_aula: DataIso | null }[]
}

export type AulaImportada = {
  reserva_id: string
  protocolo: string
  /** Entrou numa reserva que já existia, em vez de criar uma nova. */
  anexada: boolean
  data_aula: DataIso
  hora_inicio: string
  hora_fim: string
  escola_nome: string
  titulo: string
  fotos: string[]
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
  fotos: string[]
  ja_aconteceu: boolean
}

/** Uma linha do panorama: uma escola e o que já aconteceu nela. */
export type PanoramaEscola = {
  escola_id: string
  escola_nome: string
  realizadas: number
  com_registro: number
  sem_registro: number
  agendadas: number
  canceladas: number
  /** Professores diferentes que já fizeram integrador na escola. */
  professores: number
  primeira_data: DataIso | null
  ultima_data: DataIso | null
  proxima_data: DataIso | null
  dias_desde_ultima: number | null
}

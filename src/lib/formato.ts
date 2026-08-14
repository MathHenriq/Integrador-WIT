import type { StatusHorario, StatusReserva } from './tipos'

export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const

export function nomeDia(dia: number) {
  return DIAS_SEMANA[dia] ?? '—'
}

/** O Postgres devolve `time` como "14:00:00"; a tela mostra "14:00". */
export function hora(valor: string | null) {
  return valor ? valor.slice(0, 5) : '—'
}

export function faixaHoraria(inicio: string, fim: string) {
  return `${hora(inicio)} às ${hora(fim)}`
}

export function dataHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const ROTULO_STATUS_HORARIO: Record<StatusHorario, string> = {
  vago: 'Vago',
  parcial: 'Parcialmente ocupado',
  cheio: 'Reservado',
}

export const ROTULO_STATUS_RESERVA: Record<StatusReserva, string> = {
  confirmado: 'Confirmada',
  cancelado: 'Cancelada',
}

/** Um horário 'parcial' ainda aceita turma parceira — só 'cheio' bloqueia. */
export function podeReservar(status: StatusHorario) {
  return status !== 'cheio'
}

export function emailValido(valor: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)
}

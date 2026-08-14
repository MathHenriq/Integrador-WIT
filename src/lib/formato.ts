import type { DataIso, StatusHorario, StatusReserva } from './tipos'

export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const

export const DIAS_SIGLA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
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

// ---------------------------------------------------------------------
// Datas de calendário
// ---------------------------------------------------------------------
// Toda data de aula anda como string "AAAA-MM-DD". `new Date('2026-08-19')`
// é interpretado como meia-noite UTC e, num fuso negativo como o do
// Brasil, exibe 18/08 — o dia anterior. Por isso a conversão para Date
// aqui é sempre explícita, componente a componente.

export function paraData(iso: DataIso): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

export function paraIso(data: Date): DataIso {
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

/** "19/08/2026" */
export function dataCurta(iso: DataIso) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** "quarta-feira, 19 de agosto de 2026" */
export function dataExtensa(iso: DataIso) {
  const data = paraData(iso)
  return `${nomeDia(data.getDay()).toLowerCase()}, ${data.getDate()} de ${
    MESES[data.getMonth()]
  } de ${data.getFullYear()}`
}

/** "19 de agosto" */
export function diaEMes(iso: DataIso) {
  const data = paraData(iso)
  return `${data.getDate()} de ${MESES[data.getMonth()]}`
}

/** "Agosto de 2026" */
export function rotuloMes(mes: Date) {
  const nome = MESES[mes.getMonth()]
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${mes.getFullYear()}`
}

export function primeiroDiaDoMes(mes: Date) {
  return new Date(mes.getFullYear(), mes.getMonth(), 1)
}

export function ultimoDiaDoMes(mes: Date) {
  return new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
}

export function somarMeses(mes: Date, quantidade: number) {
  return new Date(mes.getFullYear(), mes.getMonth() + quantidade, 1)
}

/** Compara só ano+mês, ignorando o dia. */
export function mesEhAnteriorA(a: Date, b: Date) {
  return a.getFullYear() * 12 + a.getMonth() < b.getFullYear() * 12 + b.getMonth()
}

/**
 * As 42 células da grade do mês (6 semanas), começando no domingo.
 * `null` nas posições que pertencem a outro mês.
 */
export function celulasDoMes(mes: Date): (DataIso | null)[] {
  const primeiro = primeiroDiaDoMes(mes)
  const total = ultimoDiaDoMes(mes).getDate()
  const celulas: (DataIso | null)[] = Array(primeiro.getDay()).fill(null)

  for (let dia = 1; dia <= total; dia++) {
    celulas.push(paraIso(new Date(mes.getFullYear(), mes.getMonth(), dia)))
  }
  while (celulas.length % 7 !== 0) celulas.push(null)

  return celulas
}

// ---------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------

export const ROTULO_STATUS_HORARIO: Record<StatusHorario, string> = {
  vago: 'Vago',
  parcial: 'Parcialmente ocupado',
  cheio: 'Reservado',
}

export const ROTULO_STATUS_RESERVA: Record<StatusReserva, string> = {
  confirmado: 'Confirmada',
  cancelado: 'Cancelada',
}

export function emailValido(valor: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)
}

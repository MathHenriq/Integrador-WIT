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

export const DIAS_SIGLA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

export const MESES = [
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

export const ANOS_ESCOLARES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

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

export function somarDias(iso: DataIso, dias: number): DataIso {
  const data = paraData(iso)
  data.setDate(data.getDate() + dias)
  return paraIso(data)
}

/** Domingo da semana que contém a data. */
export function inicioDaSemana(iso: DataIso): DataIso {
  const data = paraData(iso)
  data.setDate(data.getDate() - data.getDay())
  return paraIso(data)
}

/** Os sete dias da semana que começa em `inicio`. */
export function diasDaSemana(inicio: DataIso): DataIso[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))
}

/** "17 a 23 de agosto de 2026" — encurta quando cruza mês ou ano. */
export function rotuloSemana(inicio: DataIso) {
  const fim = somarDias(inicio, 6)
  const a = paraData(inicio)
  const b = paraData(fim)

  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} a ${b.getDate()} de ${MESES[a.getMonth()]} de ${a.getFullYear()}`
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} de ${MESES[a.getMonth()]} a ${b.getDate()} de ${
      MESES[b.getMonth()]
    } de ${a.getFullYear()}`
  }
  return `${dataCurta(inicio)} a ${dataCurta(fim)}`
}

// ---------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------

export const ROTULO_STATUS_HORARIO: Record<StatusHorario, string> = {
  vago: 'Sala livre',
  parcial: 'Parcialmente ocupada',
  cheio: 'Reservada',
}

export const ROTULO_STATUS_RESERVA: Record<StatusReserva, string> = {
  confirmado: 'Confirmada',
  cancelado: 'Cancelada',
}

export function emailValido(valor: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)
}

/** "6º ao 9º ano" a partir de [6,7,8,9]; lista solta quando há buracos. */
export function rotuloAnos(anos: number[]) {
  if (!anos || anos.length === 0) return 'Todos os anos'
  const ordenados = [...anos].sort((a, b) => a - b)
  const sequencial = ordenados.every((n, i) => i === 0 || n === ordenados[i - 1] + 1)
  if (ordenados.length === 1) return `${ordenados[0]}º ano`
  if (sequencial) return `${ordenados[0]}º ao ${ordenados[ordenados.length - 1]}º ano`
  return ordenados.map((n) => `${n}º`).join(', ') + ' ano'
}

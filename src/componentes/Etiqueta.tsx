import { ROTULO_STATUS_HORARIO, ROTULO_STATUS_RESERVA } from '../lib/formato'
import type { StatusHorario, StatusReserva } from '../lib/tipos'

export function EtiquetaHorario({ status }: { status: StatusHorario }) {
  return <span className={`etiqueta ${status}`}>{ROTULO_STATUS_HORARIO[status]}</span>
}

export function EtiquetaReserva({ status }: { status: StatusReserva }) {
  return <span className={`etiqueta ${status}`}>{ROTULO_STATUS_RESERVA[status]}</span>
}

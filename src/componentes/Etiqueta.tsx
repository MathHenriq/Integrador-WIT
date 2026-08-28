import { ROTULO_ORIGEM, ROTULO_SITUACAO, ROTULO_STATUS_HORARIO, ROTULO_STATUS_RESERVA } from '../lib/formato'
import type { OrigemReserva, SituacaoIntegrador, StatusHorario, StatusReserva } from '../lib/tipos'

export function EtiquetaHorario({ status }: { status: StatusHorario }) {
  return <span className={`etiqueta ${status}`}>{ROTULO_STATUS_HORARIO[status]}</span>
}

export function EtiquetaReserva({ status }: { status: StatusReserva }) {
  return <span className={`etiqueta ${status}`}>{ROTULO_STATUS_RESERVA[status]}</span>
}

export function EtiquetaSituacao({ situacao }: { situacao: SituacaoIntegrador }) {
  return <span className={`etiqueta ${situacao}`}>{ROTULO_SITUACAO[situacao]}</span>
}

/** Quem conseguiu o projeto integrador: a Equipe WIT ou a escola. */
export function EtiquetaOrigem({ origem }: { origem: OrigemReserva }) {
  return <span className={`etiqueta ${origem}`}>{ROTULO_ORIGEM[origem]}</span>
}

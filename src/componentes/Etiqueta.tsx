import {
  ROTULO_SITUACAO,
  ROTULO_SITUACAO_ESCOLA,
  ROTULO_STATUS_HORARIO,
  ROTULO_STATUS_RESERVA,
} from '../lib/formato'
import type {
  SituacaoEscola,
  SituacaoIntegrador,
  StatusHorario,
  StatusReserva,
} from '../lib/tipos'

export function EtiquetaHorario({ status }: { status: StatusHorario }) {
  return <span className={`etiqueta ${status}`}>{ROTULO_STATUS_HORARIO[status]}</span>
}

export function EtiquetaReserva({ status }: { status: StatusReserva }) {
  return <span className={`etiqueta ${status}`}>{ROTULO_STATUS_RESERVA[status]}</span>
}

export function EtiquetaSituacao({ situacao }: { situacao: SituacaoIntegrador }) {
  return <span className={`etiqueta ${situacao}`}>{ROTULO_SITUACAO[situacao]}</span>
}

export function EtiquetaEscola({
  situacao,
  detalhe,
}: {
  situacao: SituacaoEscola
  /** Complemento curto, tipo "há 62 dias". */
  detalhe?: string | null
}) {
  return (
    <span className={`etiqueta ${situacao}`}>
      {ROTULO_SITUACAO_ESCOLA[situacao]}
      {detalhe ? ` ${detalhe}` : ''}
    </span>
  )
}

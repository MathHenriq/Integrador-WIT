import { dataExtensa, dataHora, faixaHoraria } from '../lib/formato'
import type { DataIso, Ocorrencia } from '../lib/tipos'
import { EtiquetaHorario } from './Etiqueta'

type Props = {
  dia: DataIso
  ocorrencias: Ocorrencia[]
  aoReservar: (ocorrencia: Ocorrencia) => void
}

export function ListaDoDia({ dia, ocorrencias, aoReservar }: Props) {
  return (
    <section className="secao" style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 17 }}>{dataExtensa(dia)}</h2>
      <p className="descricao">
        {ocorrencias.length === 0
          ? 'Sem aulas do Núcleo WIT neste dia.'
          : `${ocorrencias.length} horário${ocorrencias.length > 1 ? 's' : ''} neste dia.`}
      </p>

      <div className="lista">
        {ocorrencias.map((ocorrencia) => (
          <LinhaOcorrencia
            key={`${ocorrencia.horario_id}-${ocorrencia.data_aula}`}
            ocorrencia={ocorrencia}
            aoReservar={aoReservar}
          />
        ))}
      </div>
    </section>
  )
}

function LinhaOcorrencia({
  ocorrencia,
  aoReservar,
}: {
  ocorrencia: Ocorrencia
  aoReservar: (o: Ocorrencia) => void
}) {
  const vagasRestantes = ocorrencia.capacidade - ocorrencia.ocupacao_wit

  return (
    <div className={`horario ${ocorrencia.reservavel ? '' : 'reservado'}`}>
      <div className="quando">
        <div className="dia">{faixaHoraria(ocorrencia.hora_inicio, ocorrencia.hora_fim)}</div>
        <div className="faixa">
          {ocorrencia.status === 'parcial'
            ? `${ocorrencia.ocupacao_wit} de ${ocorrencia.capacidade} lugares ocupados · ${vagasRestantes} livres`
            : `Capacidade: ${ocorrencia.capacidade} alunos`}
        </div>
        {ocorrencia.reserva_professor && (
          <div className="detalhe">
            Reservado por <strong>{ocorrencia.reserva_professor}</strong>
            {ocorrencia.reserva_criado_em ? ` em ${dataHora(ocorrencia.reserva_criado_em)}` : ''}
            {ocorrencia.reserva_protocolo ? ` · ${ocorrencia.reserva_protocolo}` : ''}
            {ocorrencia.reserva_email ? ` · ${ocorrencia.reserva_email}` : ''}
          </div>
        )}
        {/* Sem reserva e sem poder reservar = a aula já passou. */}
        {!ocorrencia.reserva_professor && !ocorrencia.reservavel && (
          <div className="detalhe">Esta aula já passou.</div>
        )}
      </div>

      <div className="acoes">
        <EtiquetaHorario status={ocorrencia.status} />
        {ocorrencia.reservavel && (
          <button type="button" onClick={() => aoReservar(ocorrencia)}>
            Reservar
          </button>
        )}
      </div>
    </div>
  )
}

import { dataHora, faixaHoraria, nomeDia, podeReservar } from '../lib/formato'
import type { Horario } from '../lib/tipos'
import { EtiquetaHorario } from './Etiqueta'

type Props = {
  horarios: Horario[]
  aoReservar: (horario: Horario) => void
}

export function ListaHorarios({ horarios, aoReservar }: Props) {
  if (horarios.length === 0) {
    return (
      <div className="vazio">
        Nenhum horário para mostrar aqui. Se a escola tem salas ociosas que não aparecem nesta lista,
        avise o Núcleo WIT.
      </div>
    )
  }

  const dias = [...new Set(horarios.map((h) => h.dia_semana))]

  return (
    <>
      {dias.map((dia) => (
        <div key={dia} className="secao" style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>{nomeDia(dia)}</h3>
          <div className="lista">
            {horarios
              .filter((h) => h.dia_semana === dia)
              .map((horario) => (
                <LinhaHorario key={horario.id} horario={horario} aoReservar={aoReservar} />
              ))}
          </div>
        </div>
      ))}
    </>
  )
}

function LinhaHorario({ horario, aoReservar }: { horario: Horario; aoReservar: (h: Horario) => void }) {
  const livre = podeReservar(horario.status)
  const vagasRestantes = horario.capacidade - horario.ocupacao_wit

  return (
    <div className={`horario ${livre ? '' : 'reservado'}`}>
      <div className="quando">
        <div className="dia">{faixaHoraria(horario.hora_inicio, horario.hora_fim)}</div>
        <div className="faixa">
          {horario.status === 'parcial'
            ? `${horario.ocupacao_wit} de ${horario.capacidade} lugares ocupados · ${vagasRestantes} livres`
            : `Capacidade: ${horario.capacidade} alunos`}
        </div>
        {horario.reserva_professor && (
          <div className="detalhe">
            Reservado por <strong>{horario.reserva_professor}</strong>
            {horario.reserva_criado_em ? ` em ${dataHora(horario.reserva_criado_em)}` : ''}
            {horario.reserva_protocolo ? ` · ${horario.reserva_protocolo}` : ''}
            {horario.reserva_email ? ` · ${horario.reserva_email}` : ''}
          </div>
        )}
      </div>

      <div className="acoes">
        <EtiquetaHorario status={horario.status} />
        {livre && (
          <button type="button" onClick={() => aoReservar(horario)}>
            Reservar
          </button>
        )}
      </div>
    </div>
  )
}

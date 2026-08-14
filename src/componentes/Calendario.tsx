import { celulasDoMes, DIAS_SIGLA, paraData } from '../lib/formato'
import type { DataIso, Ocorrencia } from '../lib/tipos'

type Props = {
  mes: Date
  ocorrencias: Ocorrencia[]
  diaSelecionado: DataIso | null
  hoje: DataIso
  aoSelecionar: (dia: DataIso) => void
}

export function Calendario({ mes, ocorrencias, diaSelecionado, hoje, aoSelecionar }: Props) {
  // Três contagens por dia. `total` separa "sem aula nesse dia" (célula
  // apagada) de "tem aula"; `livres` destaca o que dá para marcar; e
  // `reservados` distingue um horário tomado por alguém de um que só
  // deixou de aceitar reserva porque a aula já começou.
  const porDia = new Map<DataIso, { total: number; livres: number; reservados: number }>()
  for (const ocorrencia of ocorrencias) {
    const atual = porDia.get(ocorrencia.data_aula) ?? { total: 0, livres: 0, reservados: 0 }
    atual.total += 1
    if (ocorrencia.reservavel) atual.livres += 1
    if (ocorrencia.reserva_id) atual.reservados += 1
    porDia.set(ocorrencia.data_aula, atual)
  }

  return (
    <div className="calendario">
      <div className="calendario-semana" aria-hidden="true">
        {DIAS_SIGLA.map((sigla, indice) => (
          <span key={indice}>{sigla}</span>
        ))}
      </div>

      <div className="calendario-grade">
        {celulasDoMes(mes).map((dia, indice) => {
          if (!dia) return <span key={`vazio-${indice}`} className="dia-vazio" />

          const contagem = porDia.get(dia)
          const temAula = (contagem?.total ?? 0) > 0
          const livres = contagem?.livres ?? 0
          const classes = [
            'dia',
            temAula ? 'com-aula' : 'sem-aula',
            livres > 0 ? 'livre' : '',
            dia < hoje ? 'passado' : '',
            dia === diaSelecionado ? 'selecionado' : '',
            dia === hoje ? 'hoje' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={dia}
              type="button"
              className={classes}
              disabled={!temAula}
              aria-pressed={dia === diaSelecionado}
              aria-label={rotuloAcessivel(dia, contagem)}
              onClick={() => aoSelecionar(dia)}
            >
              <span className="numero">{paraData(dia).getDate()}</span>
              {/* Sem vaga e sem reserva significa apenas que a aula já
                  começou — aí a célula fica sem rótulo, porque nem "livre"
                  nem "reservado" descreveriam o caso. */}
              {marcador(livres, contagem?.reservados ?? 0) && (
                <span className="marca">{marcador(livres, contagem?.reservados ?? 0)}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function marcador(livres: number, reservados: number) {
  if (livres > 0) return `${livres} livre${livres > 1 ? 's' : ''}`
  if (reservados > 0) return 'reservado'
  return ''
}

function rotuloAcessivel(
  dia: DataIso,
  contagem: { total: number; livres: number; reservados: number } | undefined,
) {
  const numero = paraData(dia).getDate()
  if (!contagem) return `Dia ${numero}, sem aulas`
  if (contagem.livres > 0) return `Dia ${numero}, ${contagem.livres} horário(s) disponível(eis)`
  if (contagem.reservados > 0) return `Dia ${numero}, ${contagem.reservados} horário(s) reservado(s)`
  return `Dia ${numero}, ${contagem.total} horário(s), nenhum disponível`
}

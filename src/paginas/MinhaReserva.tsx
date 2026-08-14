import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { cancelarPorProtocolo, obterReserva } from '../lib/api'
import { dataExtensa, faixaHoraria } from '../lib/formato'
import type { ReservaConsulta } from '../lib/tipos'

/**
 * Sem login, o protocolo é o que prova que a reserva é sua. Quem tem o
 * comprovante consulta e cancela; quem não tem, não.
 */
export function MinhaReserva() {
  const [protocolo, setProtocolo] = useState('')
  const [reserva, setReserva] = useState<ReservaConsulta | null>(null)
  const [buscou, setBuscou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      const achada = await obterReserva(protocolo.trim().toUpperCase())
      setReserva(achada)
      setBuscou(true)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível consultar o protocolo.')
    } finally {
      setOcupado(false)
    }
  }

  async function cancelar() {
    if (!reserva) return
    const motivo = window.prompt(
      'Quer deixar um motivo do cancelamento? (opcional)\n\nO horário volta a ficar livre para outros professores.',
      '',
    )
    if (motivo === null) return

    setErro(null)
    setOcupado(true)
    try {
      await cancelarPorProtocolo(reserva.protocolo, motivo.trim() || null)
      setReserva(await obterReserva(reserva.protocolo))
      setAviso('Reserva cancelada. O horário voltou a ficar disponível.')
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível cancelar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main className="conteudo estreito">
      <h1 style={{ fontSize: 'clamp(26px, 4vw, 34px)' }}>Minha reserva</h1>
      <p style={{ color: 'var(--texto-suave)', marginTop: 8 }}>
        Digite o protocolo que apareceu quando você agendou (aquele código{' '}
        <span className="mono">WIT-XXXXXX</span>) para consultar ou cancelar.
      </p>

      <form onSubmit={buscar} className="cartao" style={{ marginTop: 24 }}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {aviso && <Aviso tipo="sucesso">{aviso}</Aviso>}

        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="protocolo">Protocolo</label>
          <input
            id="protocolo"
            value={protocolo}
            onChange={(e) => setProtocolo(e.target.value.toUpperCase())}
            placeholder="WIT-XXXXXX"
            className="mono"
            maxLength={12}
            required
          />
        </div>

        <div className="acoes-formulario">
          <button type="submit" disabled={ocupado || protocolo.trim().length < 4}>
            {ocupado ? 'Consultando…' : 'Consultar'}
          </button>
        </div>
      </form>

      {buscou && !reserva && (
        <div className="vazio" style={{ marginTop: 24 }}>
          <span className="emoji">🔎</span>
          Nenhuma reserva com esse protocolo. Confira o código do comprovante.
        </div>
      )}

      {reserva && (
        <div className="cartao" style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <span className={`etiqueta ${reserva.status}`}>
              {reserva.status === 'confirmado' ? 'Confirmada' : 'Cancelada'}
            </span>
            {reserva.status === 'confirmado' && reserva.ja_aconteceu && (
              <span className="etiqueta cheio" style={{ marginLeft: 6 }}>
                Aula já realizada
              </span>
            )}
          </div>

          <dl className="definicoes">
            <dt>Protocolo</dt>
            <dd className="mono">{reserva.protocolo}</dd>
            <dt>Escola</dt>
            <dd>{reserva.escola_nome}</dd>
            <dt>Data</dt>
            <dd>{dataExtensa(reserva.data_aula)}</dd>
            <dt>Horário</dt>
            <dd>{faixaHoraria(reserva.hora_inicio, reserva.hora_fim)}</dd>
            <dt>Aula</dt>
            <dd>{reserva.aula_titulo}</dd>
            <dt>Professor(a)</dt>
            <dd>
              {reserva.nome_professor}
              {reserva.turma ? ` · ${reserva.turma}` : ''}
            </dd>
          </dl>

          {reserva.status === 'confirmado' && !reserva.ja_aconteceu && (
            <div className="acoes-formulario">
              <button type="button" className="perigo" onClick={() => void cancelar()} disabled={ocupado}>
                Cancelar esta reserva
              </button>
            </div>
          )}

          {reserva.status === 'confirmado' && reserva.ja_aconteceu && (
            <p className="ajuda" style={{ marginTop: 16 }}>
              Esta aula já aconteceu, então não dá mais para cancelar — ela faz parte do histórico.
            </p>
          )}

          {reserva.status === 'cancelado' && (
            <p className="ajuda" style={{ marginTop: 16 }}>
              Esta reserva foi cancelada.{' '}
              <Link to="/agendar">Quer agendar de novo?</Link>
            </p>
          )}
        </div>
      )}
    </main>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { cancelarPorProtocolo, obterReserva } from '../lib/api'
import { dataExtensa, faixaHoraria } from '../lib/formato'
import type { ReservaConsulta } from '../lib/tipos'

const GUARDADOS = 'wit:protocolos'

function lerGuardados(): string[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(GUARDADOS) ?? '[]')
    return Array.isArray(bruto) ? bruto.filter((p) => typeof p === 'string') : []
  } catch {
    return []
  }
}

function guardar(protocolo: string) {
  const lista = lerGuardados().filter((p) => p !== protocolo)
  localStorage.setItem(GUARDADOS, JSON.stringify([protocolo, ...lista].slice(0, 30)))
}

/**
 * Sem login, o protocolo é o que prova que a reserva é sua. Mas guardar
 * os protocolos consultados neste navegador deixa a tela útil de cara:
 * quem já usou o site vê as próprias aulas sem digitar nada.
 */
export function MinhaReserva() {
  const [protocolo, setProtocolo] = useState('')
  const [reservas, setReservas] = useState<ReservaConsulta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    const guardados = lerGuardados()
    if (guardados.length === 0) {
      setCarregando(false)
      return
    }
    Promise.all(guardados.map((p) => obterReserva(p).catch(() => null)))
      .then((lista) => setReservas(lista.filter((r): r is ReservaConsulta => r !== null)))
      .finally(() => setCarregando(false))
  }, [])

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      const achada = await obterReserva(protocolo.trim().toUpperCase())
      if (!achada) {
        setErro('Nenhuma reserva com esse protocolo. Confira o código do comprovante.')
        return
      }
      guardar(achada.protocolo)
      setReservas((atuais) => [achada, ...atuais.filter((r) => r.protocolo !== achada.protocolo)])
      setProtocolo('')
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível consultar.')
    } finally {
      setOcupado(false)
    }
  }

  async function cancelar(reserva: ReservaConsulta) {
    if (!window.confirm(`Cancelar a aula de ${dataExtensa(reserva.data_aula)}?`)) return
    setErro(null)
    setOcupado(true)
    try {
      await cancelarPorProtocolo(reserva.protocolo, null)
      const atualizada = await obterReserva(reserva.protocolo)
      if (atualizada) {
        setReservas((atuais) =>
          atuais.map((r) => (r.protocolo === reserva.protocolo ? atualizada : r)),
        )
      }
      setAviso('Aula cancelada. O horário voltou a ficar livre para outros professores.')
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível cancelar.')
    } finally {
      setOcupado(false)
    }
  }

  const proximas = reservas
    .filter((r) => r.status !== 'cancelado' && !r.ja_aconteceu)
    .sort((a, b) => a.data_aula.localeCompare(b.data_aula))

  const anteriores = reservas
    .filter((r) => r.status === 'cancelado' || r.ja_aconteceu)
    .sort((a, b) => b.data_aula.localeCompare(a.data_aula))

  return (
    <main className="conteudo estreito">
      <h1 className="titulo-pagina">Minha reserva</h1>
      <p className="linha-fina">
        Aqui ficam as aulas que você marcou. Se estiver em outro computador, digite o protocolo do
        comprovante para trazê-las de volta.
      </p>

      <form onSubmit={buscar} className="cartao" style={{ marginTop: 24 }}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {aviso && <Aviso tipo="sucesso">{aviso}</Aviso>}

        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="protocolo">Protocolo do comprovante</label>
          <input
            id="protocolo"
            value={protocolo}
            onChange={(e) => setProtocolo(e.target.value.toUpperCase())}
            placeholder="WIT-XXXXXX"
            className="mono"
            maxLength={12}
          />
        </div>

        <div className="acoes-formulario">
          <button type="submit" disabled={ocupado || protocolo.trim().length < 4}>
            {ocupado ? 'Consultando…' : 'Buscar aula'}
          </button>
        </div>
      </form>

      {carregando ? (
        <p className="carregando">Carregando as suas aulas…</p>
      ) : reservas.length === 0 ? (
        <div className="vazio" style={{ marginTop: 24 }}>
          Você ainda não tem nenhuma aula marcada neste navegador.
          <div style={{ marginTop: 16 }}>
            <Link to="/agendar" className="botao">
              Agendar uma aula
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="secao">
            <h2 style={{ fontSize: 21, marginBottom: 4 }}>Próximas aulas</h2>
            <p style={{ color: 'var(--texto-suave)', fontSize: 15, marginBottom: 14 }}>
              {proximas.length === 0
                ? 'Nenhuma aula marcada daqui para frente.'
                : proximas.length === 1
                  ? 'Você tem 1 aula marcada.'
                  : `Você tem ${proximas.length} aulas marcadas.`}
            </p>

            {proximas.length === 0 ? (
              <div className="vazio">
                <Link to="/agendar" className="botao">
                  Marcar uma aula
                </Link>
              </div>
            ) : (
              <div className="linha-tempo">
                {proximas.map((r) => (
                  <CartaoReserva
                    key={r.protocolo}
                    reserva={r}
                    aoCancelar={() => void cancelar(r)}
                    ocupado={ocupado}
                  />
                ))}
              </div>
            )}
          </section>

          {anteriores.length > 0 && (
            <section className="secao">
              <h2 style={{ fontSize: 21, marginBottom: 4 }}>Aulas anteriores</h2>
              <p style={{ color: 'var(--texto-suave)', fontSize: 15, marginBottom: 14 }}>
                O que já aconteceu ou foi cancelado.
              </p>
              <div className="linha-tempo">
                {anteriores.map((r) => (
                  <CartaoReserva key={r.protocolo} reserva={r} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

function CartaoReserva({
  reserva,
  aoCancelar,
  ocupado,
}: {
  reserva: ReservaConsulta
  aoCancelar?: () => void
  ocupado?: boolean
}) {
  const cancelada = reserva.status === 'cancelado'
  const aguardando = reserva.status === 'aguardando_confirmacao'

  return (
    <article className={`cartao reserva-simples ${cancelada ? 'passado' : ''}`}>
      <div className="topo-reserva">
        <div>
          <div className="quando">{dataExtensa(reserva.data_aula)}</div>
          <div className="hora">{faixaHoraria(reserva.hora_inicio, reserva.hora_fim)}</div>
        </div>
        <span
          className={`etiqueta ${
            cancelada ? 'cancelado' : aguardando ? 'aguardando_confirmacao' : reserva.ja_aconteceu ? 'cheio' : 'confirmado'
          }`}
        >
          {cancelada
            ? 'Cancelada'
            : aguardando
              ? 'Aguardando confirmação do WIT'
              : reserva.ja_aconteceu
                ? 'Já aconteceu'
                : 'Confirmada'}
        </span>
      </div>
      {aguardando && (
        <p className="ajuda" style={{ marginTop: 10 }}>
          A equipe WIT vai entrar em contato para confirmar os detalhes da aula.
        </p>
      )}

      <dl className="definicoes" style={{ marginTop: 14 }}>
        <dt>Aula</dt>
        <dd>{reserva.aula_titulo}</dd>
        <dt>Escola</dt>
        <dd>{reserva.escola_nome}</dd>
        <dt>Turma</dt>
        <dd>{reserva.turma ?? '—'}</dd>
        <dt>Protocolo</dt>
        <dd className="mono">{reserva.protocolo}</dd>
      </dl>

      {aoCancelar && !cancelada && !reserva.ja_aconteceu && (
        <div className="acoes-formulario">
          <button type="button" className="perigo pequeno" onClick={aoCancelar} disabled={ocupado}>
            Cancelar esta aula
          </button>
        </div>
      )}
    </article>
  )
}

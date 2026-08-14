import { useState } from 'react'
import { cancelarReserva, editarReserva } from '../lib/api'
import { dataHora, emailValido, faixaHoraria, nomeDia } from '../lib/formato'
import type { Reserva } from '../lib/tipos'
import { Aviso } from './Aviso'
import { EtiquetaReserva } from './Etiqueta'
import { Modal } from './Modal'

type Props = {
  token: string
  reservas: Reserva[]
  aoAtualizar: () => Promise<void> | void
}

export function PainelCoordenacao({ token, reservas, aoAtualizar }: Props) {
  const [cancelando, setCancelando] = useState<Reserva | null>(null)
  const [editando, setEditando] = useState<Reserva | null>(null)

  if (reservas.length === 0) {
    return (
      <div className="vazio">
        Nenhuma reserva registrada nesta escola até agora. Quando um professor reservar um horário
        pelo link, a reserva aparece aqui.
      </div>
    )
  }

  return (
    <>
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>Protocolo</th>
              <th>Horário</th>
              <th>Professor(a)</th>
              <th>Reservado em</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reservas.map((reserva) => (
              <tr key={reserva.id}>
                <td className="mono">{reserva.protocolo}</td>
                <td>
                  {nomeDia(reserva.dia_semana)}
                  <br />
                  <span style={{ color: 'var(--texto-suave)' }}>
                    {faixaHoraria(reserva.hora_inicio, reserva.hora_fim)}
                  </span>
                </td>
                <td>
                  {reserva.nome_professor}
                  {reserva.email_contato && (
                    <>
                      <br />
                      <span style={{ color: 'var(--texto-suave)' }}>{reserva.email_contato}</span>
                    </>
                  )}
                </td>
                <td>{dataHora(reserva.criado_em)}</td>
                <td>
                  <EtiquetaReserva status={reserva.status} />
                  {reserva.status === 'cancelado' && (
                    <div style={{ color: 'var(--texto-suave)', fontSize: 13, marginTop: 4 }}>
                      {dataHora(reserva.cancelado_em)}
                      {reserva.cancelado_por ? ` por ${reserva.cancelado_por}` : ''}
                    </div>
                  )}
                </td>
                <td>
                  {reserva.status === 'confirmado' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="discreto" onClick={() => setEditando(reserva)}>
                        Editar
                      </button>
                      <button type="button" className="discreto" onClick={() => setCancelando(reserva)}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cancelando && (
        <DialogoCancelamento
          token={token}
          reserva={cancelando}
          aoFechar={() => setCancelando(null)}
          aoConcluir={async () => {
            setCancelando(null)
            await aoAtualizar()
          }}
        />
      )}

      {editando && (
        <DialogoEdicao
          token={token}
          reserva={editando}
          aoFechar={() => setEditando(null)}
          aoConcluir={async () => {
            setEditando(null)
            await aoAtualizar()
          }}
        />
      )}
    </>
  )
}

function DialogoCancelamento({
  token,
  reserva,
  aoFechar,
  aoConcluir,
}: {
  token: string
  reserva: Reserva
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [responsavel, setResponsavel] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await cancelarReserva(token, reserva.id, responsavel.trim() || null)
      aoConcluir()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível cancelar a reserva.')
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo="Cancelar reserva"
      subtitulo={`${reserva.protocolo} · ${reserva.nome_professor}`}
      aoFechar={aoFechar}
    >
      <form onSubmit={confirmar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <p style={{ marginTop: 0, color: 'var(--texto-suave)', fontSize: 14 }}>
          O horário volta a ficar disponível para outros professores. A reserva continua no histórico
          como cancelada.
        </p>

        <div className="campo">
          <label htmlFor="responsavel">
            Quem está cancelando <span className="opcional">(opcional)</span>
          </label>
          <input
            id="responsavel"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Ex.: Coordenação — Marta"
            maxLength={120}
          />
        </div>

        <div className="acoes-formulario">
          <button type="button" className="secundario" onClick={aoFechar} disabled={enviando}>
            Voltar
          </button>
          <button type="submit" className="perigo" disabled={enviando}>
            {enviando ? 'Cancelando…' : 'Cancelar reserva'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DialogoEdicao({
  token,
  reserva,
  aoFechar,
  aoConcluir,
}: {
  token: string
  reserva: Reserva
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [nome, setNome] = useState(reserva.nome_professor)
  const [email, setEmail] = useState(reserva.email_contato ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    if (nome.trim().length < 3) {
      setErro('Informe o nome do professor responsável.')
      return
    }
    if (email.trim() && !emailValido(email.trim())) {
      setErro('O e-mail informado não parece válido.')
      return
    }

    setEnviando(true)
    try {
      await editarReserva(token, reserva.id, nome.trim(), email.trim() || null)
      aoConcluir()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a reserva.')
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Editar reserva" subtitulo={reserva.protocolo} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="campo">
          <label htmlFor="edicao-nome">Professor(a) responsável</label>
          <input
            id="edicao-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="edicao-email">
            E-mail de contato <span className="opcional">(opcional)</span>
          </label>
          <input
            id="edicao-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={160}
          />
        </div>

        <div className="acoes-formulario">
          <button type="button" className="secundario" onClick={aoFechar} disabled={enviando}>
            Voltar
          </button>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

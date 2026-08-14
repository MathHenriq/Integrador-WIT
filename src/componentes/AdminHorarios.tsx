import { useCallback, useEffect, useState } from 'react'
import {
  adminAtualizarHorario,
  adminCriarHorario,
  adminListarHorarios,
  adminRemoverHorario,
} from '../lib/api'
import { DIAS_SEMANA, faixaHoraria } from '../lib/formato'
import type { HorarioAdmin } from '../lib/tipos'
import { Aviso } from './Aviso'
import { EtiquetaHorario } from './Etiqueta'

type Props = {
  adminToken: string
  escolaId: string
}

export function AdminHorarios({ adminToken, escolaId }: Props) {
  const [horarios, setHorarios] = useState<HorarioAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [diaSemana, setDiaSemana] = useState(1)
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [capacidade, setCapacidade] = useState(18)
  const [ocupacaoWit, setOcupacaoWit] = useState(0)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      setHorarios(await adminListarHorarios(adminToken, escolaId))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar os horários.')
    } finally {
      setCarregando(false)
    }
  }, [adminToken, escolaId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function criar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    if (!horaInicio || !horaFim) {
      setErro('Informe o horário de início e de término.')
      return
    }
    if (horaFim <= horaInicio) {
      setErro('O horário de término precisa ser depois do início.')
      return
    }
    if (ocupacaoWit > capacidade) {
      setErro('A ocupação do Núcleo WIT não pode ser maior que a capacidade da sala.')
      return
    }

    setSalvando(true)
    try {
      await adminCriarHorario(adminToken, escolaId, {
        diaSemana,
        horaInicio,
        horaFim,
        capacidade,
        ocupacaoWit,
      })
      setHoraInicio('')
      setHoraFim('')
      setOcupacaoWit(0)
      await carregar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar o horário.')
    } finally {
      setSalvando(false)
    }
  }

  async function alterarOcupacao(horario: HorarioAdmin, valor: number) {
    setErro(null)
    try {
      await adminAtualizarHorario(adminToken, horario.id, horario.capacidade, valor)
      await carregar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar o horário.')
    }
  }

  async function remover(horario: HorarioAdmin) {
    if (!window.confirm(`Remover ${DIAS_SEMANA[horario.dia_semana]} ${faixaHoraria(horario.hora_inicio, horario.hora_fim)}?`)) {
      return
    }
    setErro(null)
    try {
      await adminRemoverHorario(adminToken, horario.id)
      await carregar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível remover o horário.')
    }
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--borda)', paddingTop: 16 }}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <form onSubmit={criar} style={{ marginBottom: 20 }}>
        <div className="linha-campos">
          <div>
            <label htmlFor={`dia-${escolaId}`}>Dia</label>
            <select
              id={`dia-${escolaId}`}
              value={diaSemana}
              onChange={(e) => setDiaSemana(Number(e.target.value))}
            >
              {DIAS_SEMANA.map((nome, indice) => (
                <option key={nome} value={indice}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`inicio-${escolaId}`}>Início</label>
            <input
              id={`inicio-${escolaId}`}
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor={`fim-${escolaId}`}>Término</label>
            <input
              id={`fim-${escolaId}`}
              type="time"
              value={horaFim}
              onChange={(e) => setHoraFim(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor={`capacidade-${escolaId}`}>Capacidade</label>
            <input
              id={`capacidade-${escolaId}`}
              type="number"
              min={1}
              max={99}
              value={capacidade}
              onChange={(e) => setCapacidade(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor={`ocupacao-${escolaId}`}>Alunos WIT</label>
            <input
              id={`ocupacao-${escolaId}`}
              type="number"
              min={0}
              max={99}
              value={ocupacaoWit}
              onChange={(e) => setOcupacaoWit(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="ajuda" style={{ marginTop: 8 }}>
          "Alunos WIT" é quantos alunos já estão matriculados nesse horário. Zero = sala vazia;
          qualquer número acima disso marca o horário como parcialmente ocupado — ele continua
          aberto para uma turma parceira.
        </p>
        <div className="acoes-formulario">
          <button type="submit" disabled={salvando}>
            {salvando ? 'Adicionando…' : 'Adicionar horário'}
          </button>
        </div>
      </form>

      {carregando ? (
        <p className="carregando">Carregando…</p>
      ) : horarios.length === 0 ? (
        <div className="vazio">Nenhum horário cadastrado nesta escola ainda.</div>
      ) : (
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Horário</th>
                <th>Capacidade</th>
                <th>Alunos WIT</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {horarios.map((horario) => (
                <tr key={horario.id}>
                  <td>{DIAS_SEMANA[horario.dia_semana]}</td>
                  <td>{faixaHoraria(horario.hora_inicio, horario.hora_fim)}</td>
                  <td>{horario.capacidade}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={horario.capacidade}
                      defaultValue={horario.ocupacao_wit}
                      onBlur={(e) => {
                        const valor = Number(e.target.value)
                        if (valor !== horario.ocupacao_wit) void alterarOcupacao(horario, valor)
                      }}
                      style={{ width: 72 }}
                      aria-label="Alunos do Núcleo WIT neste horário"
                    />
                  </td>
                  <td>
                    <EtiquetaHorario status={horario.status} />
                    {horario.reserva_professor && (
                      <div style={{ color: 'var(--texto-suave)', fontSize: 13, marginTop: 4 }}>
                        {horario.reserva_professor} · {horario.reserva_protocolo}
                      </div>
                    )}
                  </td>
                  <td>
                    <button type="button" className="discreto" onClick={() => void remover(horario)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

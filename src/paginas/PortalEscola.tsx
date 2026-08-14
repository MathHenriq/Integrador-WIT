import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { DialogoComprovante, DialogoReserva } from '../componentes/DialogoReserva'
import { ListaHorarios } from '../componentes/ListaHorarios'
import { PainelCoordenacao } from '../componentes/PainelCoordenacao'
import { acessarEscola, listarHorarios, listarReservas } from '../lib/api'
import { podeReservar } from '../lib/formato'
import type { Acesso, Comprovante, Horario, Reserva } from '../lib/tipos'

type Aba = 'horarios' | 'historico'

export function PortalEscola() {
  const { token = '' } = useParams()

  const [acesso, setAcesso] = useState<Acesso | null>(null)
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [linkInvalido, setLinkInvalido] = useState(false)

  const [aba, setAba] = useState<Aba>('horarios')
  const [somenteDisponiveis, setSomenteDisponiveis] = useState(true)
  const [reservando, setReservando] = useState<Horario | null>(null)
  const [comprovante, setComprovante] = useState<Comprovante | null>(null)

  const coordenacao = acesso?.papel === 'coordenacao'

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const dados = await acessarEscola(token)
      if (!dados) {
        setLinkInvalido(true)
        return
      }
      setAcesso(dados)

      // O histórico completo só existe para a coordenação; pedir isso com
      // o link do professor levantaria erro na RPC.
      const [listaHorarios, listaReservas] = await Promise.all([
        listarHorarios(token),
        dados.papel === 'coordenacao' ? listarReservas(token) : Promise.resolve<Reserva[]>([]),
      ])
      setHorarios(listaHorarios)
      setReservas(listaReservas)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar os horários.')
    } finally {
      setCarregando(false)
    }
  }, [token])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (linkInvalido) {
    return (
      <div className="pagina">
        <div className="cartao">
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Link inválido</h1>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
            Este link não corresponde a nenhuma escola. Ele pode ter sido substituído por um novo.
            Peça o link atualizado ao Núcleo WIT ou à coordenação da sua escola.
          </p>
        </div>
      </div>
    )
  }

  if (carregando) {
    return (
      <div className="pagina">
        <p className="carregando">Carregando horários…</p>
      </div>
    )
  }

  // Falha antes de saber sequer qual é a escola: mostrar a grade vazia
  // aqui faria parecer que a escola não tem horário nenhum.
  if (!acesso) {
    return (
      <div className="pagina">
        <div className="cartao">
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Não foi possível abrir a página</h1>
          <p style={{ color: 'var(--texto-suave)' }}>{erro}</p>
          <div className="acoes-formulario">
            <button
              type="button"
              onClick={() => {
                setCarregando(true)
                void carregar()
              }}
            >
              Tentar de novo
            </button>
          </div>
        </div>
      </div>
    )
  }

  const horariosVisiveis = somenteDisponiveis ? horarios.filter((h) => podeReservar(h.status)) : horarios
  const totalDisponiveis = horarios.filter((h) => podeReservar(h.status)).length

  return (
    <div className="pagina">
      <header className="cabecalho">
        <div>
          <div className="selo">Projeto Integrador · Núcleo WIT</div>
          <h1>{acesso.escola_nome}</h1>
          <p>
            {coordenacao
              ? 'Acesso da coordenação: você vê a grade, o histórico completo e pode cancelar ou editar reservas.'
              : 'Escolha um horário vago e traga a sua turma para uma aula do Núcleo WIT.'}
          </p>
        </div>
      </header>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {coordenacao && (
        <div className="abas" role="tablist">
          <button role="tab" aria-selected={aba === 'horarios'} onClick={() => setAba('horarios')}>
            Horários
          </button>
          <button role="tab" aria-selected={aba === 'historico'} onClick={() => setAba('historico')}>
            Histórico ({reservas.length})
          </button>
        </div>
      )}

      {aba === 'horarios' && (
        <section>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <p style={{ margin: 0, color: 'var(--texto-suave)', fontSize: 14 }}>
              {totalDisponiveis === 0
                ? 'Nenhum horário disponível no momento.'
                : `${totalDisponiveis} horário${totalDisponiveis > 1 ? 's' : ''} disponível${
                    totalDisponiveis > 1 ? 'eis' : ''
                  } para reserva.`}
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={somenteDisponiveis}
                onChange={(e) => setSomenteDisponiveis(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Mostrar apenas disponíveis
            </label>
          </div>

          <ListaHorarios horarios={horariosVisiveis} aoReservar={setReservando} />
        </section>
      )}

      {aba === 'historico' && coordenacao && (
        <section className="secao" style={{ marginTop: 0 }}>
          <h2>Histórico de reservas</h2>
          <p className="descricao">
            Todas as reservas já feitas nesta escola, inclusive as canceladas.
          </p>
          <PainelCoordenacao token={token} reservas={reservas} aoAtualizar={carregar} />
        </section>
      )}

      {reservando && (
        <DialogoReserva
          token={token}
          horario={reservando}
          aoFechar={() => setReservando(null)}
          aoConfirmar={async (novo) => {
            setReservando(null)
            setComprovante(novo)
            await carregar()
          }}
        />
      )}

      {comprovante && (
        <DialogoComprovante comprovante={comprovante} aoFechar={() => setComprovante(null)} />
      )}
    </div>
  )
}

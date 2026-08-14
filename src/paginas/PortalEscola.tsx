import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { Calendario } from '../componentes/Calendario'
import { DialogoComprovante, DialogoReserva } from '../componentes/DialogoReserva'
import { ListaDoDia } from '../componentes/ListaDoDia'
import { PainelCoordenacao } from '../componentes/PainelCoordenacao'
import { acessarEscola, listarOcorrencias, listarReservas } from '../lib/api'
import {
  mesEhAnteriorA,
  paraData,
  paraIso,
  primeiroDiaDoMes,
  rotuloMes,
  somarMeses,
  ultimoDiaDoMes,
} from '../lib/formato'
import type { Acesso, Comprovante, DataIso, Ocorrencia, Reserva } from '../lib/tipos'

type Aba = 'calendario' | 'historico'

export function PortalEscola() {
  const { token = '' } = useParams()

  const [acesso, setAcesso] = useState<Acesso | null>(null)
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoMes, setCarregandoMes] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [linkInvalido, setLinkInvalido] = useState(false)

  const [aba, setAba] = useState<Aba>('calendario')
  const [mes, setMes] = useState<Date | null>(null)
  const [diaSelecionado, setDiaSelecionado] = useState<DataIso | null>(null)
  const [reservando, setReservando] = useState<Ocorrencia | null>(null)
  const [comprovante, setComprovante] = useState<Comprovante | null>(null)

  const coordenacao = acesso?.papel === 'coordenacao'

  // Passo 1: resolver o token. Define a escola, o papel e a janela de
  // meses que o calendário pode percorrer.
  const carregarAcesso = useCallback(async () => {
    setErro(null)
    try {
      const dados = await acessarEscola(token)
      if (!dados) {
        setLinkInvalido(true)
        return
      }
      setAcesso(dados)
      setMes((atual) => atual ?? primeiroDiaDoMes(paraData(dados.hoje)))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a página.')
    } finally {
      setCarregando(false)
    }
  }, [token])

  useEffect(() => {
    void carregarAcesso()
  }, [carregarAcesso])

  // Passo 2: buscar as aulas do mês visível. Roda de novo a cada troca de
  // mês — o servidor expande o molde semanal nas datas do período.
  const carregarMes = useCallback(async () => {
    if (!acesso || !mes) return
    setCarregandoMes(true)
    setErro(null)
    try {
      const [doMes, historico] = await Promise.all([
        listarOcorrencias(token, paraIso(primeiroDiaDoMes(mes)), paraIso(ultimoDiaDoMes(mes))),
        // O histórico completo só existe para a coordenação; pedir isso
        // com o link do professor levantaria erro na RPC.
        acesso.papel === 'coordenacao' ? listarReservas(token) : Promise.resolve<Reserva[]>([]),
      ])
      setOcorrencias(doMes)
      setReservas(historico)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as aulas do mês.')
    } finally {
      setCarregandoMes(false)
    }
  }, [acesso, mes, token])

  useEffect(() => {
    void carregarMes()
  }, [carregarMes])

  // Ao entrar num mês, cai no primeiro dia com vaga — poupa o professor
  // de procurar célula por célula.
  useEffect(() => {
    if (ocorrencias.length === 0) {
      setDiaSelecionado(null)
      return
    }
    setDiaSelecionado((atual) => {
      if (atual && ocorrencias.some((o) => o.data_aula === atual)) return atual
      return (ocorrencias.find((o) => o.reservavel) ?? ocorrencias[0]).data_aula
    })
  }, [ocorrencias])

  const ocorrenciasDoDia = useMemo(
    () => ocorrencias.filter((o) => o.data_aula === diaSelecionado),
    [ocorrencias, diaSelecionado],
  )

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
        <p className="carregando">Carregando…</p>
      </div>
    )
  }

  // Falha antes de saber sequer qual é a escola: mostrar o calendário
  // vazio aqui faria parecer que a escola não tem aula nenhuma.
  if (!acesso || !mes) {
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
                void carregarAcesso()
              }}
            >
              Tentar de novo
            </button>
          </div>
        </div>
      </div>
    )
  }

  const mesDeHoje = primeiroDiaDoMes(paraData(acesso.hoje))
  const mesLimite = primeiroDiaDoMes(paraData(acesso.limite_agendamento))
  const podeVoltar = mesEhAnteriorA(mesDeHoje, mes)
  const podeAvancar = mesEhAnteriorA(mes, mesLimite)
  const livresNoMes = ocorrencias.filter((o) => o.reservavel).length

  return (
    <div className="pagina">
      <header className="cabecalho">
        <div>
          <div className="selo">Projeto Integrador · Núcleo WIT</div>
          <h1>{acesso.escola_nome}</h1>
          <p>
            {coordenacao
              ? 'Acesso da coordenação: você vê o calendário, o histórico completo e pode cancelar ou editar reservas.'
              : 'Escolha uma data no calendário e traga a sua turma para uma aula do Núcleo WIT.'}
          </p>
        </div>
      </header>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {coordenacao && (
        <div className="abas" role="tablist">
          <button role="tab" aria-selected={aba === 'calendario'} onClick={() => setAba('calendario')}>
            Calendário
          </button>
          <button role="tab" aria-selected={aba === 'historico'} onClick={() => setAba('historico')}>
            Histórico ({reservas.length})
          </button>
        </div>
      )}

      {aba === 'calendario' && (
        <section>
          <div className="navegacao-mes">
            <button
              type="button"
              className="secundario"
              onClick={() => setMes(somarMeses(mes, -1))}
              disabled={!podeVoltar}
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <div className="mes-atual">
              <strong>{rotuloMes(mes)}</strong>
              <span>
                {carregandoMes
                  ? 'Carregando…'
                  : livresNoMes === 0
                    ? 'Nenhum horário disponível neste mês'
                    : livresNoMes === 1
                      ? '1 horário disponível'
                      : `${livresNoMes} horários disponíveis`}
              </span>
            </div>
            <button
              type="button"
              className="secundario"
              onClick={() => setMes(somarMeses(mes, 1))}
              disabled={!podeAvancar}
              aria-label="Próximo mês"
            >
              ›
            </button>
          </div>

          <Calendario
            mes={mes}
            ocorrencias={ocorrencias}
            diaSelecionado={diaSelecionado}
            hoje={acesso.hoje}
            aoSelecionar={setDiaSelecionado}
          />

          {ocorrencias.length === 0 && !carregandoMes && (
            <div className="vazio" style={{ marginTop: 20 }}>
              Nenhuma aula do Núcleo WIT neste mês. Use as setas para ver outros meses — dá para
              marcar até {rotuloMes(mesLimite).toLowerCase()}.
            </div>
          )}

          {diaSelecionado && (
            <ListaDoDia
              dia={diaSelecionado}
              ocorrencias={ocorrenciasDoDia}
              aoReservar={setReservando}
            />
          )}
        </section>
      )}

      {aba === 'historico' && coordenacao && (
        <section className="secao" style={{ marginTop: 0 }}>
          <h2>Histórico de reservas</h2>
          <p className="descricao">
            Todas as reservas já feitas nesta escola, de qualquer data, inclusive as canceladas.
          </p>
          <PainelCoordenacao token={token} reservas={reservas} aoAtualizar={carregarMes} />
        </section>
      )}

      {reservando && (
        <DialogoReserva
          token={token}
          ocorrencia={reservando}
          aoFechar={() => setReservando(null)}
          aoConfirmar={async (novo) => {
            setReservando(null)
            setComprovante(novo)
            await carregarMes()
          }}
        />
      )}

      {comprovante && (
        <DialogoComprovante comprovante={comprovante} aoFechar={() => setComprovante(null)} />
      )}
    </div>
  )
}

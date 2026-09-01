import { useCallback, useEffect, useMemo, useState } from 'react'
import { Aviso } from '../componentes/Aviso'
import { DialogoAgendamento, DialogoComprovante } from '../componentes/DialogoAgendamento'
import { agendaEscola, carregarContexto } from '../lib/api'
import {
  DIAS_SIGLA,
  diasUteis,
  faixaHoraria,
  inicioDaSemana,
  paraData,
  rotuloSemana,
  somarDias,
} from '../lib/formato'
import type { Comprovante, ContextoPublico, DataIso, Ocorrencia } from '../lib/tipos'

const CHAVE_ESCOLA = 'wit:escola'

export function Agendar() {
  const [ctx, setCtx] = useState<ContextoPublico | null>(null)
  const [escolaId, setEscolaId] = useState<string>('')
  // A agenda só aparece depois que a escola é confirmada de propósito —
  // quem dá aula em mais de uma escola do Núcleo pode nem perceber que a
  // lembrada de uma visita anterior é a errada, se a semana já vier
  // aberta na tela.
  const [escolaConfirmada, setEscolaConfirmada] = useState(false)
  const [semana, setSemana] = useState<DataIso | null>(null)
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoSemana, setCarregandoSemana] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [agendando, setAgendando] = useState<Ocorrencia | null>(null)
  const [comprovante, setComprovante] = useState<Comprovante | null>(null)

  useEffect(() => {
    carregarContexto()
      .then((dados) => {
        setCtx(dados)
        // Pré-preenche com a última escola usada, só para poupar rolagem
        // na lista — mas quem confirma a escolha continua sendo o
        // professor, clicando em "Ver agenda desta escola".
        const lembrada = localStorage.getItem(CHAVE_ESCOLA)
        const valida = dados.escolas.find((e) => e.id === lembrada)
        setEscolaId(valida?.id ?? dados.escolas[0]?.id ?? '')
        // Só uma escola cadastrada: não existe escolha nenhuma a fazer.
        if (dados.escolas.length === 1) setEscolaConfirmada(true)
      })
      .catch((falha) =>
        setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as escolas.'),
      )
      .finally(() => setCarregando(false))
  }, [])

  // Abrir sempre na semana corrente costuma cair numa tela vazia — numa
  // sexta, quase toda ela já passou. Então a primeira semana mostrada é a
  // primeira que realmente tem horário livre.
  useEffect(() => {
    if (!ctx || !escolaId || !escolaConfirmada) return
    let cancelado = false

    agendaEscola(escolaId, ctx.hoje, somarDias(ctx.hoje, 34))
      .then((proximas) => {
        if (cancelado) return
        const primeira = proximas.find((o) => o.reservavel)
        setSemana(inicioDaSemana(primeira?.data_aula ?? ctx.hoje))
      })
      .catch(() => {
        if (!cancelado) setSemana(inicioDaSemana(ctx.hoje))
      })

    return () => {
      cancelado = true
    }
  }, [ctx, escolaId, escolaConfirmada])

  useEffect(() => {
    if (escolaId && escolaConfirmada) localStorage.setItem(CHAVE_ESCOLA, escolaId)
  }, [escolaId, escolaConfirmada])

  const carregarSemana = useCallback(async () => {
    if (!escolaId || !semana || !escolaConfirmada) return
    setCarregandoSemana(true)
    setErro(null)
    try {
      setOcorrencias(await agendaEscola(escolaId, somarDias(semana, 1), somarDias(semana, 5)))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a agenda.')
      setOcorrencias([])
    } finally {
      setCarregandoSemana(false)
    }
  }, [escolaId, semana, escolaConfirmada])

  function trocarDeEscola() {
    setEscolaConfirmada(false)
    setSemana(null)
    setOcorrencias([])
  }

  useEffect(() => {
    void carregarSemana()
  }, [carregarSemana])

  const porDia = useMemo(() => {
    const mapa = new Map<DataIso, Ocorrencia[]>()
    for (const o of ocorrencias) {
      mapa.set(o.data_aula, [...(mapa.get(o.data_aula) ?? []), o])
    }
    return mapa
  }, [ocorrencias])

  if (carregando) {
    return (
      <main className="conteudo">
        <p className="carregando">Carregando…</p>
      </main>
    )
  }

  if (erro && !ctx) {
    return (
      <main className="conteudo estreito">
        <div className="cartao">
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Não foi possível abrir a agenda</h1>
          <p style={{ color: 'var(--texto-suave)' }}>{erro}</p>
          <div className="acoes-formulario">
            <button type="button" onClick={() => window.location.reload()}>
              Tentar de novo
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (ctx && ctx.escolas.length === 0) {
    return (
      <main className="conteudo estreito">
        <div className="vazio">
          <span className="emoji">🏫</span>
          Nenhuma escola tem horários cadastrados ainda. Assim que a equipe WIT abrir a grade de uma
          escola, ela aparece aqui.
        </div>
      </main>
    )
  }

  // Passo 1: qual escola. Só depois de confirmar é que a agenda da
  // semana abre — quem dá aula em mais de um Núcleo precisa escolher de
  // propósito, em vez de cair direto na semana de uma escola errada.
  if (ctx && !escolaConfirmada) {
    return (
      <main className="conteudo estreito">
        <div className="secao-titulo" style={{ marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 34px)' }}>Agendar uma aula</h1>
            <p style={{ color: 'var(--texto-suave)' }}>
              De qual escola é a sua turma? A agenda que abre em seguida é só dessa escola.
            </p>
          </div>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <form
          className="cartao"
          style={{ marginTop: 20 }}
          onSubmit={(evento) => {
            evento.preventDefault()
            setEscolaConfirmada(true)
          }}
        >
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="escola">Escola</label>
            <select id="escola" value={escolaId} onChange={(e) => setEscolaId(e.target.value)}>
              {ctx.escolas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="acoes-formulario">
            <button type="submit" disabled={!escolaId}>
              Ver agenda desta escola
            </button>
          </div>
        </form>
      </main>
    )
  }

  // Enquanto a semana inicial não foi decidida não dá para desenhar a
  // grade: sem data, todos os dias virariam a mesma chave inválida e o
  // React manteria colunas velhas na tela.
  if (!semana) {
    return (
      <main className="conteudo">
        <p className="carregando">Carregando…</p>
      </main>
    )
  }

  const escola = ctx?.escolas.find((e) => e.id === escolaId)
  const semanaAtual = semana ?? ''
  const primeiraSemana = ctx ? inicioDaSemana(ctx.hoje) : ''
  const podeVoltar = semanaAtual > primeiraSemana
  const podeAvancar = ctx ? semanaAtual < inicioDaSemana(ctx.limite_agendamento) : false
  const livres = ocorrencias.filter((o) => o.reservavel).length

  return (
    <main className="conteudo">
      <div className="secao-titulo" style={{ marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 34px)' }}>Agendar uma aula</h1>
          <p style={{ color: 'var(--texto-suave)' }}>
            Ache um horário livre e traga a sua turma.
          </p>
        </div>
      </div>

      <div className="escola-atual" style={{ marginTop: 20 }}>
        <span>
          Agenda de <strong>{escola?.nome}</strong>
        </span>
        {ctx && ctx.escolas.length > 1 && (
          <button type="button" className="fantasma pequeno" onClick={trocarDeEscola}>
            Trocar de escola
          </button>
        )}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="navegacao-semana">
        <button
          type="button"
          className="secundario icone-so"
          onClick={() => setSemana(somarDias(semanaAtual, -7))}
          disabled={!podeVoltar}
          aria-label="Semana anterior"
        >
          ‹
        </button>
        <div className="periodo">
          <strong>{rotuloSemana(semanaAtual)}</strong>
          <span>
            {carregandoSemana
              ? 'Carregando…'
              : livres === 0
                ? 'Nenhum horário livre nesta semana'
                : livres === 1
                  ? '1 horário livre'
                  : `${livres} horários livres`}
          </span>
        </div>
        <button
          type="button"
          className="secundario icone-so"
          onClick={() => setSemana(somarDias(semanaAtual, 7))}
          disabled={!podeAvancar}
          aria-label="Próxima semana"
        >
          ›
        </button>
      </div>

      <div className="semana">
        {diasUteis(semanaAtual).map((dia) => {
          const doDia = porDia.get(dia) ?? []
          const passado = ctx ? dia < ctx.hoje : false
          const data = paraData(dia)

          return (
            <div
              key={dia}
              className={`dia-coluna ${dia === ctx?.hoje ? 'hoje' : ''} ${passado ? 'passado' : ''}`}
            >
              <div className="cabeca">
                <div className="sigla">{DIAS_SIGLA[data.getDay()]}</div>
                <div className="numero">{data.getDate()}</div>
              </div>

              {doDia.length === 0 ? (
                <div className="sem-aula">—</div>
              ) : (
                doDia.map((o) => (
                  <button
                    key={o.horario_id}
                    type="button"
                    className={`slot ${o.reservavel ? 'livre' : 'ocupado'}`}
                    disabled={!o.reservavel}
                    onClick={() => o.reservavel && setAgendando(o)}
                  >
                    <span className="hora">{faixaHoraria(o.hora_inicio, o.hora_fim)}</span>
                    <span className="detalhe">
                      {o.reserva_professor
                        ? `${o.aula_titulo ?? 'Aula'} · ${o.reserva_professor}`
                        : o.reservavel
                          ? o.status === 'parcial'
                            ? `${o.capacidade - o.ocupacao_wit} vagas livres`
                            : 'Sala livre'
                          : 'Já passou'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )
        })}
      </div>

      {!carregandoSemana && ocorrencias.length === 0 && (
        <div className="vazio" style={{ marginTop: 20 }}>
          <span className="emoji">🗓️</span>
          {escola?.nome} não tem aulas nesta semana. Use as setas para ver as próximas.
        </div>
      )}

      {agendando && escola && (
        <DialogoAgendamento
          escolaId={escola.id}
          escolaNome={escola.nome}
          ocorrencia={agendando}
          aoFechar={() => setAgendando(null)}
          aoConfirmar={async (novo) => {
            setAgendando(null)
            setComprovante(novo)
            await carregarSemana()
          }}
        />
      )}

      {comprovante && (
        <DialogoComprovante comprovante={comprovante} aoFechar={() => setComprovante(null)} />
      )}
    </main>
  )
}

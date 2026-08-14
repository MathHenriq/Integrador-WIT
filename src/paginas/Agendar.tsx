import { useCallback, useEffect, useMemo, useState } from 'react'
import { Aviso } from '../componentes/Aviso'
import { DialogoAgendamento, DialogoComprovante } from '../componentes/DialogoAgendamento'
import { agendaEscola, carregarContexto } from '../lib/api'
import {
  DIAS_SIGLA,
  diasDaSemana,
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
        // Lembra a última escola: quem usa o site normalmente é sempre da
        // mesma, e escolher de novo toda visita é atrito puro.
        const lembrada = localStorage.getItem(CHAVE_ESCOLA)
        const valida = dados.escolas.find((e) => e.id === lembrada)
        setEscolaId(valida?.id ?? dados.escolas[0]?.id ?? '')
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
    if (!ctx || !escolaId) return
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
  }, [ctx, escolaId])

  useEffect(() => {
    if (escolaId) localStorage.setItem(CHAVE_ESCOLA, escolaId)
  }, [escolaId])

  const carregarSemana = useCallback(async () => {
    if (!escolaId || !semana) return
    setCarregandoSemana(true)
    setErro(null)
    try {
      setOcorrencias(await agendaEscola(escolaId, semana, somarDias(semana, 6)))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a agenda.')
      setOcorrencias([])
    } finally {
      setCarregandoSemana(false)
    }
  }, [escolaId, semana])

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

  // Enquanto a semana inicial não foi decidida não dá para desenhar a
  // grade: sem data, todos os dias virariam a mesma chave inválida e o
  // React manteria colunas velhas na tela.
  if (carregando || (ctx && ctx.escolas.length > 0 && !semana)) {
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
            Escolha a escola, ache um horário livre e traga a sua turma.
          </p>
        </div>
      </div>

      <div className="campo" style={{ maxWidth: 420, marginTop: 20 }}>
        <label htmlFor="escola">Escola</label>
        <select id="escola" value={escolaId} onChange={(e) => setEscolaId(e.target.value)}>
          {ctx?.escolas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
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
        {diasDaSemana(semanaAtual).map((dia) => {
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

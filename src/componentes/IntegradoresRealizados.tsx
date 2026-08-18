import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EtiquetaEscola, EtiquetaSituacao } from './Etiqueta'
import { adminListarReservas, adminPanoramaEscolas } from '../lib/api'
import { dataCurta, faixaHoraria, situacaoDaEscola, situacaoDoIntegrador } from '../lib/formato'
import { pedirRelatoEFotos } from '../lib/relato'
import type { PanoramaEscola, ReservaAdmin, SituacaoIntegrador } from '../lib/tipos'

/** Os recortes da lista, na ordem em que aparecem como filtro. */
const VISTAS = [
  { chave: 'realizadas', rotulo: 'Realizadas' },
  { chave: 'agendadas', rotulo: 'Agendadas' },
  { chave: 'canceladas', rotulo: 'Canceladas' },
  { chave: 'tudo', rotulo: 'Tudo' },
] as const

type Vista = (typeof VISTAS)[number]['chave']

const SITUACAO_DA_VISTA: Record<Vista, SituacaoIntegrador | null> = {
  realizadas: 'realizada',
  agendadas: 'agendada',
  canceladas: 'cancelada',
  tudo: null,
}

export function IntegradoresRealizados({
  senha,
  aoErro,
}: {
  senha: string
  aoErro: (e: string | null) => void
}) {
  const [panorama, setPanorama] = useState<PanoramaEscola[]>([])
  const [reservas, setReservas] = useState<ReservaAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [escolaId, setEscolaId] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('realizadas')
  const lista = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    aoErro(null)
    try {
      const [linhas, aulas] = await Promise.all([
        adminPanoramaEscolas(senha),
        adminListarReservas(senha, null),
      ])
      setPanorama(linhas)
      setReservas(aulas)
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível carregar os integradores.')
    } finally {
      setCarregando(false)
    }
  }, [senha, aoErro])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /**
   * Todas as escolas aparecem, inclusive as zeradas — são elas que dão o
   * senso de urgência. As que ainda não entraram vêm primeiro.
   */
  const escolas = useMemo(
    () =>
      panorama
        .map((linha) => ({ linha, situacao: situacaoDaEscola(linha) }))
        .sort((a, b) => {
          if (a.situacao !== b.situacao) return a.situacao === 'sem-projeto' ? -1 : 1
          return a.linha.escola_nome.localeCompare(b.linha.escola_nome, 'pt-BR')
        }),
    [panorama],
  )

  const realizando = escolas.filter((e) => e.situacao === 'realizando').length

  /** A lista já chega do banco da aula mais recente para a mais antiga. */
  const aulas = useMemo(() => {
    const permitida = SITUACAO_DA_VISTA[vista]
    return reservas
      .map((r) => ({ reserva: r, situacao: situacaoDoIntegrador(r) }))
      .filter(
        (a) =>
          (escolaId === null || a.reserva.escola_id === escolaId) &&
          (permitida === null || a.situacao === permitida),
      )
  }, [reservas, escolaId, vista])

  const escolaAberta = escolaId ? panorama.find((l) => l.escola_id === escolaId) : null

  function verAulasDa(id: string) {
    setEscolaId(escolaId === id ? null : id)
    lista.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function relatar(reserva: ReservaAdmin) {
    try {
      if (await pedirRelatoEFotos(senha, reserva)) await carregar()
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível salvar o relato.')
    }
  }

  if (carregando) return <p className="carregando">Carregando…</p>

  return (
    <>
      <div className="cartao realizando-agora">
        <span className="valor">
          {realizando}
          <span className="de">/{panorama.length}</span>
        </span>
        <span className="rotulo">
          escolas realizando projeto integrador agora — com aula já dada ou marcada
        </span>
      </div>

      <div className="secao-titulo" style={{ marginTop: 32 }}>
        <div>
          <h2>Escola por escola</h2>
          <p>As que ainda não entraram vêm primeiro.</p>
        </div>
      </div>

      <div className="grade-escolas">
        {escolas.map(({ linha, situacao }) => (
          <article
            key={linha.escola_id}
            className={`cartao escola-panorama${escolaId === linha.escola_id ? ' aberta' : ''}`}
          >
            <div className="topo-cartao" style={{ marginBottom: 10 }}>
              <EtiquetaEscola situacao={situacao} />
            </div>

            <h3 style={{ fontSize: 16.5 }}>{linha.escola_nome}</h3>

            {situacao === 'realizando' && (
              <div className="numeros-escola">
                <div>
                  <strong>{linha.realizadas}</strong>
                  <span>realizada{linha.realizadas === 1 ? '' : 's'}</span>
                </div>
                {linha.agendadas > 0 && (
                  <div>
                    <strong>{linha.agendadas}</strong>
                    <span>marcada{linha.agendadas === 1 ? '' : 's'}</span>
                  </div>
                )}
                {linha.professores > 0 && (
                  <div>
                    <strong>{linha.professores}</strong>
                    <span>professor{linha.professores === 1 ? '' : 'es'}</span>
                  </div>
                )}
              </div>
            )}

            <div className="rodape-cartao" style={{ marginTop: 12 }}>
              {linha.ultima_data && <span>última em {dataCurta(linha.ultima_data)}</span>}
              {linha.proxima_data && <span>próxima em {dataCurta(linha.proxima_data)}</span>}
              {linha.canceladas > 0 && (
                <span>
                  {linha.canceladas} cancelada{linha.canceladas === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {linha.realizadas + linha.agendadas + linha.canceladas > 0 && (
              <div className="acoes-linha" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="secundario pequeno"
                  onClick={() => verAulasDa(linha.escola_id)}
                >
                  {escolaId === linha.escola_id ? 'Mostrar todas' : 'Ver as aulas'}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="secao-titulo" style={{ marginTop: 40 }} ref={lista}>
        <div>
          <h2>{escolaAberta ? escolaAberta.escola_nome : 'Todas as escolas'}</h2>
          <p>
            {aulas.length === 0
              ? 'Nenhuma aula neste filtro.'
              : `${aulas.length} aula${aulas.length === 1 ? '' : 's'} neste filtro`}
          </p>
        </div>
      </div>

      <div className="filtros-integradores">
        <div className="campo" style={{ marginBottom: 0, minWidth: 280, flex: '1 1 280px' }}>
          <label htmlFor="filtro-escola">Escola</label>
          <select
            id="filtro-escola"
            value={escolaId ?? ''}
            onChange={(e) => setEscolaId(e.target.value || null)}
          >
            <option value="">Todas as escolas</option>
            {[...panorama]
              .sort((a, b) => a.escola_nome.localeCompare(b.escola_nome, 'pt-BR'))
              .map((l) => (
                <option key={l.escola_id} value={l.escola_id}>
                  {l.escola_nome} ({l.realizadas} realizada{l.realizadas === 1 ? '' : 's'})
                </option>
              ))}
          </select>
        </div>

        <div className="campo" style={{ marginBottom: 0 }}>
          <label>Situação da aula</label>
          <div className="chips">
            {VISTAS.map((v) => (
              <button
                type="button"
                key={v.chave}
                className="chip"
                aria-pressed={vista === v.chave}
                onClick={() => setVista(v.chave)}
              >
                {v.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {aulas.length === 0 ? (
        <div className="vazio" style={{ marginTop: 20 }}>
          <span className="emoji">🧩</span>
          {vista === 'realizadas' && escolaId === null
            ? 'Nenhum integrador realizado ainda. Quando a primeira turma passar pela sala, ela aparece aqui.'
            : 'Nenhuma aula com esses filtros. Troque a escola ou a situação.'}
        </div>
      ) : (
        <div className="rolagem" style={{ marginTop: 20 }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Escola</th>
                <th>Professor(a)</th>
                <th>Aula</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {aulas.map(({ reserva, situacao }) => (
                <tr key={reserva.id} className={situacao === 'cancelada' ? 'passado' : undefined}>
                  <td>
                    {dataCurta(reserva.data_aula)}
                    <br />
                    <span style={{ color: 'var(--texto-suave)' }}>
                      {faixaHoraria(reserva.hora_inicio, reserva.hora_fim)}
                    </span>
                  </td>
                  <td>{reserva.escola_nome}</td>
                  <td>
                    {reserva.nome_professor}
                    {reserva.turma && (
                      <>
                        <br />
                        <span style={{ color: 'var(--texto-suave)' }}>{reserva.turma}</span>
                      </>
                    )}
                  </td>
                  <td>
                    {reserva.aula_titulo ?? '—'}
                    {reserva.fotos.length > 0 && (
                      <>
                        <br />
                        <span style={{ color: 'var(--texto-fraco)', fontSize: 13 }}>
                          {reserva.fotos.length} foto{reserva.fotos.length === 1 ? '' : 's'}
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <EtiquetaSituacao situacao={situacao} />
                  </td>
                  <td>
                    {situacao === 'realizada' && (
                      <button
                        type="button"
                        className="fantasma pequeno"
                        onClick={() => void relatar(reserva)}
                      >
                        {reserva.relato || reserva.fotos.length > 0
                          ? 'Relato e fotos'
                          : '+ Relato e fotos'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

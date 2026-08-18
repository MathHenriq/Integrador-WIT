import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EtiquetaEscola, EtiquetaSituacao } from './Etiqueta'
import { adminListarReservas, adminPanoramaEscolas } from '../lib/api'
import {
  dataCurta,
  faixaHoraria,
  situacaoDaEscola,
  situacaoDoIntegrador,
} from '../lib/formato'
import { pedirRelatoEFotos } from '../lib/relato'
import type { PanoramaEscola, ReservaAdmin, SituacaoEscola, SituacaoIntegrador } from '../lib/tipos'

/** Os recortes da lista, na ordem em que aparecem como filtro. */
const VISTAS = [
  { chave: 'realizados', rotulo: 'Realizados' },
  { chave: 'sem-registro', rotulo: 'Falta o registro' },
  { chave: 'agendados', rotulo: 'Agendados' },
  { chave: 'cancelados', rotulo: 'Cancelados' },
  { chave: 'tudo', rotulo: 'Tudo' },
] as const

type Vista = (typeof VISTAS)[number]['chave']

const SITUACOES_DA_VISTA: Record<Vista, SituacaoIntegrador[] | null> = {
  realizados: ['registrada', 'sem-registro'],
  'sem-registro': ['sem-registro'],
  agendados: ['agendada'],
  cancelados: ['cancelada'],
  tudo: null,
}

/**
 * Quem precisa de atenção primeiro. A escola que nunca fez nada é a que
 * a coordenação mais precisa enxergar, e ela é justamente a que não tem
 * linha nenhuma na lista de aulas — por isso o panorama vem do panorama
 * de escolas, e não da soma das reservas.
 */
const PESO_DA_SITUACAO: Record<SituacaoEscola, number> = {
  'sem-projeto': 0,
  parada: 1,
  'primeira-marcada': 2,
  'em-atividade': 3,
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
  const [vista, setVista] = useState<Vista>('realizados')
  const [ordem, setOrdem] = useState<'atencao' | 'nome'>('atencao')
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
   * Escola que nunca teve nada — nem aula dada, nem marcada, nem
   * cancelada — não rende um cartão: renderia onze cartões iguais
   * dizendo "nada aqui", empurrando para baixo justamente o que a
   * coordenação precisa ler. Elas viram uma lista só, no topo.
   */
  const zeradas = useMemo(
    () => panorama.filter((l) => l.realizadas + l.agendadas + l.canceladas === 0),
    [panorama],
  )

  const escolas = useMemo(() => {
    const comSituacao = panorama
      .filter((l) => l.realizadas + l.agendadas + l.canceladas > 0)
      .map((linha) => ({ linha, situacao: situacaoDaEscola(linha) }))
    if (ordem === 'nome') {
      return comSituacao.sort((a, b) => a.linha.escola_nome.localeCompare(b.linha.escola_nome, 'pt-BR'))
    }
    return comSituacao.sort((a, b) => {
      const peso = PESO_DA_SITUACAO[a.situacao] - PESO_DA_SITUACAO[b.situacao]
      if (peso !== 0) return peso
      const parado = (b.linha.dias_desde_ultima ?? 0) - (a.linha.dias_desde_ultima ?? 0)
      if (parado !== 0) return parado
      return a.linha.escola_nome.localeCompare(b.linha.escola_nome, 'pt-BR')
    })
  }, [panorama, ordem])

  const totais = useMemo(() => {
    const soma = (campo: keyof PanoramaEscola) =>
      panorama.reduce((total, l) => total + (l[campo] as number), 0)
    return {
      realizados: soma('realizadas'),
      semRegistro: soma('sem_registro'),
      agendados: soma('agendadas'),
      escolas: panorama.length,
      comProjeto: panorama.filter((l) => l.realizadas > 0).length,
      semProjeto: panorama.filter((l) => situacaoDaEscola(l) === 'sem-projeto').length,
    }
  }, [panorama])

  /** A lista já chega do banco da aula mais recente para a mais antiga. */
  const aulas = useMemo(() => {
    const permitidas = SITUACOES_DA_VISTA[vista]
    return reservas
      .map((r) => ({ reserva: r, situacao: situacaoDoIntegrador(r) }))
      .filter(
        (a) =>
          (escolaId === null || a.reserva.escola_id === escolaId) &&
          (permitidas === null || permitidas.includes(a.situacao)),
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
      <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
        Quem já fez integrador, quem ainda não fez e como está o andamento de cada escola. Cada
        aula daqui saiu de um professor que trouxe o conteúdo dele e montou a proposta junto com a
        equipe WIT.
      </p>

      <div className="numeros">
        <div className="cartao numero">
          <span className="valor">{totais.realizados}</span>
          <span className="rotulo">
            integrador{totais.realizados === 1 ? '' : 'es'} já realizado
            {totais.realizados === 1 ? '' : 's'}
          </span>
        </div>
        <div className="cartao numero">
          <span className="valor">
            {totais.comProjeto}
            <span className="de">/{totais.escolas}</span>
          </span>
          <span className="rotulo">escolas que já receberam pelo menos uma aula</span>
        </div>
        <div className="cartao numero">
          <span className="valor">{totais.semProjeto}</span>
          <span className="rotulo">escolas sem nenhuma aula realizada, nem marcada</span>
        </div>
        <div className="cartao numero">
          <span className="valor">{totais.agendados}</span>
          <span className="rotulo">aulas marcadas daqui para a frente</span>
        </div>
        <div className="cartao numero">
          <span className="valor">{totais.semRegistro}</span>
          <span className="rotulo">aulas que aconteceram e ainda não têm relato nem foto</span>
        </div>
      </div>

      <div className="secao-titulo" style={{ marginTop: 34 }}>
        <div>
          <h2>Escola por escola</h2>
          <p>
            {escolas.length === 0
              ? 'Nenhuma escola tem aula realizada, marcada ou cancelada por enquanto.'
              : ordem === 'atencao'
                ? 'As que já têm movimento, da que mais precisa de atenção para a que está em dia.'
                : 'As que já têm movimento, em ordem alfabética.'}
          </p>
        </div>
        {escolas.length > 1 && (
          <div className="chips">
            <button
              type="button"
              className="chip"
              aria-pressed={ordem === 'atencao'}
              onClick={() => setOrdem('atencao')}
            >
              Precisa de atenção
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={ordem === 'nome'}
              onClick={() => setOrdem('nome')}
            >
              Ordem alfabética
            </button>
          </div>
        )}
      </div>

      {zeradas.length > 0 && (
        <article className="cartao escolas-zeradas">
          <div className="topo-cartao">
            <EtiquetaEscola situacao="sem-projeto" />
            <strong>
              {zeradas.length} nunca receberam uma turma
            </strong>
          </div>
          <p>
            Nenhuma turma destas escolas passou pela sala, e não há nada marcado. É a lista para
            levar à coordenação: basta um professor topar trazer o conteúdo dele para montarmos a
            aula junto.
          </p>
          <ul>
            {[...zeradas]
              .sort((a, b) => a.escola_nome.localeCompare(b.escola_nome, 'pt-BR'))
              .map((l) => (
                <li key={l.escola_id}>{l.escola_nome}</li>
              ))}
          </ul>
        </article>
      )}

      <div className="grade-escolas">
        {escolas.map(({ linha, situacao }) => (
          <article
            key={linha.escola_id}
            className={`cartao escola-panorama${escolaId === linha.escola_id ? ' aberta' : ''}`}
          >
            <div className="topo-cartao" style={{ marginBottom: 10 }}>
              <EtiquetaEscola
                situacao={situacao}
                detalhe={
                  situacao === 'parada' && linha.dias_desde_ultima
                    ? `há ${linha.dias_desde_ultima} dias`
                    : null
                }
              />
            </div>

            <h3 style={{ fontSize: 16.5 }}>{linha.escola_nome}</h3>

            {linha.realizadas === 0 && linha.agendadas === 0 ? (
              <p className="sem-nada">
                Nada realizado nem marcado — só cancelamento. Vale retomar a conversa com a escola.
              </p>
            ) : (
              <div className="numeros-escola">
                <div>
                  <strong>{linha.realizadas}</strong>
                  <span>realizado{linha.realizadas === 1 ? '' : 's'}</span>
                </div>
                {linha.agendadas > 0 && (
                  <div>
                    <strong>{linha.agendadas}</strong>
                    <span>marcado{linha.agendadas === 1 ? '' : 's'}</span>
                  </div>
                )}
                {linha.professores > 0 && (
                  <div>
                    <strong>{linha.professores}</strong>
                    <span>professor{linha.professores === 1 ? '' : 'es'}</span>
                  </div>
                )}
                {linha.sem_registro > 0 && (
                  <div className="atencao">
                    <strong>{linha.sem_registro}</strong>
                    <span>sem registro</span>
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
                  {l.escola_nome} ({l.realizadas} realizado{l.realizadas === 1 ? '' : 's'})
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
          {vista === 'realizados' && escolaId === null
            ? 'Nenhum integrador realizado ainda. Quando a primeira turma passar pela sala, ela aparece aqui — e as escolas do começo do panorama são as que ainda não começaram.'
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
                    {(situacao === 'registrada' || situacao === 'sem-registro') && (
                      <button
                        type="button"
                        className="fantasma pequeno"
                        onClick={() => void relatar(reserva)}
                      >
                        {situacao === 'registrada' ? 'Relato e fotos' : '+ Relato e fotos'}
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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EtiquetaSituacao } from './Etiqueta'
import { adminListarReservas } from '../lib/api'
import { dataCurta, faixaHoraria, situacaoDoIntegrador } from '../lib/formato'
import { pedirRelatoEFotos } from '../lib/relato'
import type { ReservaAdmin, SituacaoIntegrador } from '../lib/tipos'

/** Os recortes da lista, na ordem em que aparecem como filtro. */
const VISTAS = [
  { chave: 'tudo', rotulo: 'Tudo' },
  { chave: 'realizadas', rotulo: 'Realizadas' },
  { chave: 'agendadas', rotulo: 'Agendadas' },
  { chave: 'canceladas', rotulo: 'Canceladas' },
] as const

type Vista = (typeof VISTAS)[number]['chave']

const SITUACAO_DA_VISTA: Record<Vista, SituacaoIntegrador | null> = {
  tudo: null,
  realizadas: 'realizada',
  agendadas: 'agendada',
  canceladas: 'cancelada',
}

export function IntegradoresRealizados({
  senha,
  aoErro,
}: {
  senha: string
  aoErro: (e: string | null) => void
}) {
  const [reservas, setReservas] = useState<ReservaAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [escolaId, setEscolaId] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('tudo')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const carregar = useCallback(async () => {
    aoErro(null)
    try {
      setReservas(await adminListarReservas(senha, null))
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
   * Quem está no projeto agora: escola com aula confirmada, dada ou
   * marcada. Some da tela quando não há nenhuma — um "0 de 17" não diz
   * nada a ninguém.
   */
  const agora = useMemo(() => {
    const nomes = reservas
      .filter((r) => r.status === 'confirmado')
      .map((r) => r.escola_nome)
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [reservas])

  /** Só as escolas que têm aula na lista entram no filtro. */
  const escolas = useMemo(() => {
    const porId = new Map(reservas.map((r) => [r.escola_id, r.escola_nome]))
    return [...porId.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [reservas])

  /**
   * A lista já chega do banco da aula mais recente para a mais antiga.
   * As datas são comparadas como string "AAAA-MM-DD" de propósito: passar
   * por `new Date` mostraria o dia anterior no fuso do Brasil.
   */
  const aulas = useMemo(() => {
    const permitida = SITUACAO_DA_VISTA[vista]
    return reservas
      .map((r) => ({ reserva: r, situacao: situacaoDoIntegrador(r) }))
      .filter(
        (a) =>
          (escolaId === null || a.reserva.escola_id === escolaId) &&
          (permitida === null || a.situacao === permitida) &&
          (de === '' || a.reserva.data_aula >= de) &&
          (ate === '' || a.reserva.data_aula <= ate),
      )
  }, [reservas, escolaId, vista, de, ate])

  const filtrando = escolaId !== null || vista !== 'tudo' || de !== '' || ate !== ''

  function limpar() {
    setEscolaId(null)
    setVista('tudo')
    setDe('')
    setAte('')
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
      {agora.length > 0 && (
        <div className="cartao em-projeto-agora">
          <span className="rotulo">Em projeto integrador agora</span>
          <ul>
            {agora.map((nome) => (
              <li key={nome}>{nome}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cartao filtros-integradores">
        <div className="campo">
          <label htmlFor="filtro-escola">Escola</label>
          <select
            id="filtro-escola"
            value={escolaId ?? ''}
            onChange={(e) => setEscolaId(e.target.value || null)}
          >
            <option value="">Todas as escolas</option>
            {escolas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="filtro-de">De</label>
          <input id="filtro-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>

        <div className="campo">
          <label htmlFor="filtro-ate">Até</label>
          <input id="filtro-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>

        <div className="campo situacao">
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

        <div className="campo resultado">
          <span>
            {aulas.length === 0
              ? 'Nenhuma aula'
              : `${aulas.length} aula${aulas.length === 1 ? '' : 's'}`}
          </span>
          {filtrando && (
            <button type="button" className="fantasma pequeno" onClick={limpar}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {aulas.length === 0 ? (
        <div className="vazio" style={{ marginTop: 20 }}>
          <span className="emoji">🧩</span>
          {filtrando
            ? 'Nenhuma aula com esses filtros. Troque a escola, a data ou a situação.'
            : 'Nenhum integrador ainda. Quando a primeira turma passar pela sala, ela aparece aqui.'}
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

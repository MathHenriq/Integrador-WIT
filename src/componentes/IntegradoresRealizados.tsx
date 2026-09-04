import { useCallback, useEffect, useMemo, useState } from 'react'
import { EditorReserva } from './EditorReserva'
import { EtiquetaOrigem, EtiquetaSituacao } from './Etiqueta'
import { RelatarAula } from './RelatarAula'
import { adminListarEscolas, adminListarReservas, adminRemoverReserva } from '../lib/api'
import { dataCurta, faixaHoraria, situacaoDoIntegrador } from '../lib/formato'
import type { EscolaAdmin, ReservaAdmin, SituacaoIntegrador } from '../lib/tipos'

/** Os recortes da lista, na ordem em que aparecem como filtro. */
const VISTAS = [
  { chave: 'tudo', rotulo: 'Tudo' },
  { chave: 'realizadas', rotulo: 'Realizadas' },
  { chave: 'agendadas', rotulo: 'Agendadas' },
  { chave: 'aguardando', rotulo: 'Aguardando confirmação' },
  { chave: 'canceladas', rotulo: 'Canceladas' },
] as const

type Vista = (typeof VISTAS)[number]['chave']

const SITUACAO_DA_VISTA: Record<Vista, SituacaoIntegrador | null> = {
  tudo: null,
  realizadas: 'realizada',
  agendadas: 'agendada',
  aguardando: 'aguardando',
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
  const [escolas, setEscolas] = useState<EscolaAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [escolaId, setEscolaId] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('tudo')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [editando, setEditando] = useState<ReservaAdmin | null>(null)
  const [relatando, setRelatando] = useState<ReservaAdmin | null>(null)

  const carregar = useCallback(async () => {
    aoErro(null)
    try {
      const [aulas, todas] = await Promise.all([
        adminListarReservas(senha, null),
        adminListarEscolas(senha),
      ])
      setReservas(aulas)
      setEscolas(todas)
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
   * Quem está no projeto agora: escola com aula **marcada daqui para a
   * frente**. Aula que já aconteceu não conta — importar um documento de
   * maio não pode fazer a escola parecer em atividade hoje. Some da tela
   * quando não há nenhuma: um "0 de 17" não diz nada a ninguém.
   */
  const agora = useMemo(() => {
    const nomes = reservas
      .filter((r) => r.status === 'confirmado' && !r.ja_aconteceu)
      .map((r) => r.escola_nome)
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
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

  async function remover(reserva: ReservaAdmin) {
    const tema = reserva.aula_titulo ?? 'sem tema definido'
    if (
      !window.confirm(
        `Você tem certeza que quer apagar o projeto integrador do dia ${dataCurta(
          reserva.data_aula,
        )} sobre "${tema}"?`,
      )
    ) {
      return
    }

    aoErro(null)
    try {
      await adminRemoverReserva(senha, reserva.id)
      await carregar()
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível remover o projeto integrador.')
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
            {[...escolas]
              .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
              .map((e) => (
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
                <th>Origem</th>
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
                    <EtiquetaOrigem origem={reserva.origem} />
                  </td>
                  <td>
                    <EtiquetaSituacao situacao={situacao} />
                  </td>
                  <td>
                    <div className="acoes-linha">
                      {situacao === 'realizada' && (
                        <button
                          type="button"
                          className="fantasma pequeno"
                          onClick={() => setRelatando(reserva)}
                        >
                          {reserva.relato || reserva.fotos.length > 0
                            ? 'Relato e fotos'
                            : '+ Relato e fotos'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="fantasma pequeno"
                        onClick={() => setEditando(reserva)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="perigo pequeno"
                        onClick={() => void remover(reserva)}
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <EditorReserva
          senha={senha}
          reserva={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            void carregar()
          }}
        />
      )}

      {relatando && (
        <RelatarAula
          senha={senha}
          reserva={relatando}
          aoFechar={() => setRelatando(null)}
          aoSalvar={() => {
            setRelatando(null)
            void carregar()
          }}
        />
      )}
    </>
  )
}

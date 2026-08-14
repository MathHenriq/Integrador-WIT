import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { carregarContexto, listarRealizadas } from '../lib/api'
import { MESES, paraData } from '../lib/formato'
import type { EscolaResumo, Materia, Realizada } from '../lib/tipos'

export function Realizadas() {
  const [materias, setMaterias] = useState<Materia[]>([])
  const [escolas, setEscolas] = useState<EscolaResumo[]>([])
  const [itens, setItens] = useState<Realizada[]>([])
  const [materiaId, setMateriaId] = useState<string | null>(null)
  const [escolaId, setEscolaId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    carregarContexto()
      .then((ctx) => {
        setMaterias(ctx.materias)
        setEscolas(ctx.escolas)
      })
      .catch(() => {
        /* filtros são um extra */
      })
  }, [])

  useEffect(() => {
    setCarregando(true)
    listarRealizadas({ materiaId, escolaId })
      .then(setItens)
      .catch((f) =>
        setErro(f instanceof Error ? f.message : 'Não foi possível carregar o histórico.'),
      )
      .finally(() => setCarregando(false))
  }, [materiaId, escolaId])

  return (
    <main className="conteudo">
      <div className="secao-titulo" style={{ marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 34px)' }}>Aulas já realizadas</h1>
          <p style={{ color: 'var(--texto-suave)' }}>
            Tudo que já aconteceu nas salas do Núcleo WIT, aberto para todo mundo ver — e para dar
            ideia para a próxima.
          </p>
        </div>
      </div>

      <div className="cartao" style={{ marginTop: 22 }}>
        <div className="campo" style={{ marginBottom: escolas.length > 1 ? 14 : 0 }}>
          <label>Matéria</label>
          <div className="chips">
            <button
              type="button"
              className="chip"
              aria-pressed={materiaId === null}
              onClick={() => setMateriaId(null)}
            >
              Todas
            </button>
            {materias.map((m) => (
              <button
                type="button"
                key={m.id}
                className="chip"
                aria-pressed={materiaId === m.id}
                onClick={() => setMateriaId(materiaId === m.id ? null : m.id)}
              >
                {m.nome}
              </button>
            ))}
          </div>
        </div>

        {escolas.length > 1 && (
          <div className="campo" style={{ marginBottom: 0, maxWidth: 420 }}>
            <label htmlFor="escola">Escola</label>
            <select
              id="escola"
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
        )}
      </div>

      {erro && (
        <div style={{ marginTop: 20 }}>
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      <div className="secao" style={{ marginTop: 28 }}>
        {carregando ? (
          <p className="carregando">Carregando histórico…</p>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <span className="emoji">🌱</span>
            Ainda não há aulas realizadas por aqui.
            <div style={{ marginTop: 16 }}>
              <Link to="/agendar" className="botao secundario">
                Seja a primeira turma
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="subtitulo-secao">
              {itens.length === 1 ? '1 aula realizada' : `${itens.length} aulas realizadas`}
            </p>
            <div className="linha-tempo">
              {itens.map((item) => {
                const data = paraData(item.data_aula)
                return (
                  <article key={item.id} className="item-realizada">
                    <div className="data">
                      <div className="dia">{data.getDate()}</div>
                      <div className="mes">{MESES[data.getMonth()].slice(0, 3)}</div>
                      <div className="ano">{data.getFullYear()}</div>
                    </div>

                    <div>
                      <div className="topo-cartao" style={{ marginBottom: 8 }}>
                        {item.materia_nome && (
                          <span className="etiqueta materia">{item.materia_nome}</span>
                        )}
                        {!item.do_catalogo && (
                          <span className="etiqueta parcial">Aula do professor</span>
                        )}
                      </div>

                      <h3 style={{ fontSize: 18 }}>{item.titulo}</h3>

                      <p style={{ color: 'var(--texto-suave)', fontSize: 14.5, marginTop: 4 }}>
                        {item.escola_nome} · {item.nome_professor}
                        {item.turma ? ` · ${item.turma}` : ''}
                      </p>

                      {item.relato ? (
                        <p style={{ marginTop: 10, fontSize: 15 }}>{item.relato}</p>
                      ) : item.resumo ? (
                        <p style={{ marginTop: 10, fontSize: 15, color: 'var(--texto-suave)' }}>
                          {item.resumo}
                        </p>
                      ) : null}

                      {item.aula_id && (
                        <div style={{ marginTop: 12 }}>
                          <Link to={`/atividades/${item.aula_id}`}>ver esta atividade →</Link>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

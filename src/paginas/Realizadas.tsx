import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { carregarContexto, listarRealizadas } from '../lib/api'
import { MESES, paraData } from '../lib/formato'
import type { Materia, Realizada } from '../lib/tipos'

export function Realizadas() {
  const [materias, setMaterias] = useState<Materia[]>([])
  const [itens, setItens] = useState<Realizada[]>([])
  const [materiaId, setMateriaId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    carregarContexto()
      .then((ctx) => setMaterias(ctx.materias))
      .catch(() => setMaterias([]))
  }, [])

  useEffect(() => {
    setCarregando(true)
    listarRealizadas({ materiaId })
      .then(setItens)
      .catch((f) => setErro(f instanceof Error ? f.message : 'Não foi possível carregar.'))
      .finally(() => setCarregando(false))
  }, [materiaId])

  // Só oferece filtro de matéria que realmente tem aula realizada: menu
  // com opção que não leva a lugar nenhum é perda de tempo.
  const materiasComAula = materias.filter((m) =>
    itens.length === 0 || materiaId !== null ? true : itens.some((i) => i.materia_nome === m.nome),
  )

  return (
    <main className="conteudo">
      <h1 className="titulo-pagina">Aulas já realizadas</h1>
      <p className="linha-fina">
        O que professores de todas as escolas já fizeram no Núcleo. Serve de ideia para a próxima —
        e mostra que dá certo.
      </p>

      {materiasComAula.length > 1 && (
        <div className="chips" style={{ marginTop: 24 }}>
          <button
            type="button"
            className="chip"
            aria-pressed={materiaId === null}
            onClick={() => setMateriaId(null)}
          >
            Todas
          </button>
          {materiasComAula.map((m) => (
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
      )}

      {erro && (
        <div style={{ marginTop: 20 }}>
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      <div className="secao" style={{ marginTop: 26 }}>
        {carregando ? (
          <p className="carregando">Carregando…</p>
        ) : itens.length === 0 ? (
          <div className="vazio">
            Ainda não há aulas realizadas por aqui.
            <div style={{ marginTop: 16 }}>
              <Link to="/agendar" className="botao secundario">
                Seja a primeira turma
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--texto-suave)', marginBottom: 16 }}>
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
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {item.materia_nome && (
                          <span className="etiqueta materia">{item.materia_nome}</span>
                        )}
                        {!item.do_catalogo && (
                          <span className="etiqueta parcial">Aula do professor</span>
                        )}
                      </div>

                      <h3 style={{ fontSize: 18 }}>{item.titulo}</h3>

                      <p style={{ color: 'var(--texto-suave)', fontSize: 15, marginTop: 4 }}>
                        {item.escola_nome} · {item.nome_professor}
                        {item.turma ? ` · ${item.turma}` : ''}
                      </p>

                      {item.relato ? (
                        <p style={{ marginTop: 10 }}>{item.relato}</p>
                      ) : item.resumo ? (
                        <p style={{ marginTop: 10, color: 'var(--texto-suave)' }}>{item.resumo}</p>
                      ) : null}

                      {item.fotos.length > 0 && (
                        <div className="fotos">
                          {item.fotos.map((url) => (
                            <img
                              key={url}
                              src={url}
                              alt={`Aula "${item.titulo}" na ${item.escola_nome}`}
                              loading="lazy"
                            />
                          ))}
                        </div>
                      )}

                      {item.aula_id && (
                        <div style={{ marginTop: 12 }}>
                          <Link to={`/atividades/${item.aula_id}`}>
                            quero fazer esta atividade →
                          </Link>
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

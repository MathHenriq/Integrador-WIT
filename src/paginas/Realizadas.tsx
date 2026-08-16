import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { MotivoMateria, degradeMateria } from '../componentes/MotivoMateria'
import { carregarContexto, listarRealizadas } from '../lib/api'
import { MESES, paraData } from '../lib/formato'
import type { Materia, Realizada } from '../lib/tipos'

/** "14 de maio de 2026", sem passar a string ISO por `new Date`. */
function porExtenso(iso: string) {
  const data = paraData(iso)
  return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`
}

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

  // Uma caixa por matéria, igual ao catálogo: o professor procura pela
  // matéria que ele dá, não por data. A ordem dentro da caixa é a que veio
  // do banco — da aula mais recente para a mais antiga.
  const porMateria = useMemo(() => {
    const mapa = new Map<string, { nome: string; cor: string | null; itens: Realizada[] }>()

    for (const item of itens) {
      const chave = item.materia_nome ?? 'Outras aulas'
      const atual =
        mapa.get(chave) ?? { nome: chave, cor: item.materia_cor, itens: [] }
      atual.itens.push(item)
      mapa.set(chave, atual)
    }

    return [...mapa.values()].sort((a, b) => b.itens.length - a.itens.length)
  }, [itens])

  return (
    <main className="conteudo">
      <h1 className="titulo-pagina">Aulas já realizadas</h1>
      <p className="linha-fina">
        O que professores de todas as escolas já fizeram no Núcleo, organizado por matéria. Serve de
        ideia para a próxima — e mostra que dá certo.
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

            <div className="grade-materias">
              {porMateria.map((materia) => (
                <article key={materia.nome} className="cartao-materia">
                  <div className="capa" style={{ background: degradeMateria(materia.cor) }}>
                    <MotivoMateria nome={materia.nome} className="motivo" />
                    <h3>{materia.nome}</h3>
                    <div className="contagem">
                      {materia.itens.length === 1
                        ? '1 aula realizada'
                        : `${materia.itens.length} aulas realizadas`}
                    </div>
                  </div>

                  <div className="corpo">
                    {materia.itens.map((item) => (
                      <article key={item.id} className="atividade feita">
                        <span className="quando">{porExtenso(item.data_aula)}</span>
                        <span className="nome">{item.titulo}</span>
                        <span className="trabalha">
                          {item.escola_nome} · {item.nome_professor}
                          {item.turma ? ` · ${item.turma}` : ''}
                        </span>

                        {item.relato ? (
                          <span className="relato">{item.relato}</span>
                        ) : item.resumo ? (
                          <span className="relato">{item.resumo}</span>
                        ) : null}

                        {item.fotos.length > 0 && (
                          <span className="fotos">
                            {item.fotos.map((url) => (
                              <img
                                key={url}
                                src={url}
                                alt={`Aula "${item.titulo}" na ${item.escola_nome}`}
                                loading="lazy"
                              />
                            ))}
                          </span>
                        )}

                        <span className="marcas">
                          {!item.do_catalogo && (
                            <span className="etiqueta parcial">Aula do professor</span>
                          )}
                          {item.aula_id && (
                            <Link to={`/atividades/${item.aula_id}`} className="etiqueta codigo">
                              quero fazer esta →
                            </Link>
                          )}
                        </span>
                      </article>
                    ))}
                  </div>

                  <div className="rodape">
                    Toda aula daqui saiu de um professor que trouxe o conteúdo dele.
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { MotivoMateria, degradeMateria, textoDaMateria } from '../componentes/MotivoMateria'
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

  /**
   * Uma caixa por matéria, igual ao catálogo: o professor procura pela
   * matéria que ele dá, não por data.
   *
   * As caixas saem da lista de matérias, não das aulas — então a página
   * tem o que mostrar desde o primeiro dia, quando ainda não aconteceu
   * nada. Matéria sem aula vira convite; página vazia não convida
   * ninguém. A ordem dentro da caixa é a que veio do banco, da aula mais
   * recente para a mais antiga.
   */
  const porMateria = useMemo(() => {
    const caixas = materias.map((m) => ({
      chave: m.id,
      nome: m.nome,
      cor: m.cor as string | null,
      itens: itens.filter((i) => i.materia_nome === m.nome),
    }))

    // Aula cuja matéria saiu do cadastro não pode sumir da tela.
    const orfas = itens.filter((i) => !materias.some((m) => m.nome === i.materia_nome))
    if (orfas.length > 0) {
      caixas.push({
        chave: 'sem-materia',
        nome: 'Outras aulas',
        cor: orfas[0].materia_cor,
        itens: orfas,
      })
    }

    const visiveis = materiaId === null ? caixas : caixas.filter((c) => c.chave === materiaId)
    return visiveis.sort((a, b) => b.itens.length - a.itens.length)
  }, [materias, itens, materiaId])

  return (
    <main className="conteudo">
      <h1 className="titulo-pagina">Aulas já realizadas</h1>
      <p className="linha-fina">
        O que professores de todas as escolas já fizeram no Núcleo, organizado por matéria. Serve de
        ideia para a próxima — e mostra que dá certo.
      </p>

      {materias.length > 1 && (
        <div className="chips" style={{ marginTop: 24 }}>
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
      )}

      {erro && (
        <div style={{ marginTop: 20 }}>
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      <div className="secao" style={{ marginTop: 26 }}>
        {carregando ? (
          <p className="carregando">Carregando…</p>
        ) : porMateria.length === 0 ? (
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
              {itens.length === 0
                ? 'Nenhuma aula realizada ainda — a primeira pode ser a sua.'
                : itens.length === 1
                  ? '1 aula realizada'
                  : `${itens.length} aulas realizadas`}
            </p>

            <div className="grade-materias">
              {porMateria.map((materia) => (
                <article key={materia.chave} className="cartao-materia">
                  <div
                    className="capa"
                    style={{
                      background: degradeMateria(materia.nome, materia.cor),
                      color: textoDaMateria(materia.nome, materia.cor),
                    }}
                  >
                    <MotivoMateria nome={materia.nome} className="motivo" />
                    <h3>{materia.nome}</h3>
                    <div className="contagem">
                      {materia.itens.length === 0
                        ? 'nenhuma aula ainda'
                        : materia.itens.length === 1
                          ? '1 aula realizada'
                          : `${materia.itens.length} aulas realizadas`}
                    </div>
                  </div>

                  <div className="corpo">
                    {materia.itens.length === 0 && (
                      <div className="convite">
                        <p>Nenhuma turma passou por aqui com esta matéria ainda.</p>
                        <Link to="/agendar">seja o primeiro →</Link>
                      </div>
                    )}

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

                  {materia.itens.length > 0 && (
                    <div className="rodape">
                      Toda aula daqui saiu de um professor que trouxe o conteúdo dele.
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

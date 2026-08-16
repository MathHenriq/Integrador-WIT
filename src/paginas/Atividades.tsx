import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { MotivoMateria, degradeMateria } from '../componentes/MotivoMateria'
import { listarAulas, obterAula } from '../lib/api'
import type { AulaCatalogo, AulaDetalhe } from '../lib/tipos'

export function Atividades() {
  const [aulas, setAulas] = useState<AulaCatalogo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    listarAulas({})
      .then(setAulas)
      .catch((f) =>
        setErro(f instanceof Error ? f.message : 'Não foi possível carregar as atividades.'),
      )
      .finally(() => setCarregando(false))
  }, [])

  // Uma caixa por matéria. Sem separar por ano: por ora tudo junto, como
  // foi pedido — o professor lê o que trabalha e decide.
  const porMateria = useMemo(() => {
    const mapa = new Map<
      string,
      { nome: string; cor: string; aulas: AulaCatalogo[] }
    >()

    for (const aula of aulas) {
      const id = aula.materia_id ?? 'sem-materia'
      const atual =
        mapa.get(id) ??
        {
          nome: aula.materia_nome ?? 'Outras atividades',
          cor: aula.materia_cor ?? '#00a651',
          aulas: [],
        }
      atual.aulas.push(aula)
      mapa.set(id, atual)
    }

    return [...mapa.values()].sort((a, b) => b.aulas.length - a.aulas.length)
  }, [aulas])

  return (
    <main className="conteudo">
      <h1 className="titulo-pagina">Atividades</h1>
      <p className="linha-fina">
        Aulas que a equipe WIT já tem prontas, organizadas por matéria. Elas servem de{' '}
        <strong>base e exemplo</strong>: você traz o conteúdo que já vai trabalhar, escolhe um ponto
        de partida daqui e <strong>montamos a aula junto com você</strong>.
      </p>

      {erro && (
        <div style={{ marginTop: 22 }}>
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      <div className="secao" style={{ marginTop: 30 }}>
        {carregando ? (
          <p className="carregando">Carregando atividades…</p>
        ) : porMateria.length === 0 ? (
          <div className="vazio">
            O catálogo ainda está vazio. A equipe WIT cadastra as atividades pelo painel.
          </div>
        ) : (
          <div className="grade-materias">
            {porMateria.map((materia) => (
              <article key={materia.nome} className="cartao-materia">
                <div className="capa" style={{ background: degradeMateria(materia.cor) }}>
                  <MotivoMateria nome={materia.nome} className="motivo" />
                  <h3>{materia.nome}</h3>
                  <div className="contagem">
                    {materia.aulas.length === 1
                      ? '1 atividade pronta'
                      : `${materia.aulas.length} atividades prontas`}
                  </div>
                </div>

                <div className="corpo">
                  {materia.aulas.map((aula) => (
                    <Link key={aula.id} to={`/atividades/${aula.id}`} className="atividade">
                      <span className="nome">{aula.titulo}</span>
                      <span className="trabalha">
                        {aula.tema ? `${aula.tema} · ` : ''}
                        {aula.resumo}
                      </span>
                      {aula.habilidades.length > 0 && (
                        <span className="marcas">
                          {aula.habilidades.slice(0, 4).map((h) => (
                            <span key={h.codigo} className="etiqueta codigo">
                              {h.codigo}
                            </span>
                          ))}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>

                <div className="rodape">Clique em uma atividade para ver o plano completo.</div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

export function AtividadeDetalhe() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const [aula, setAula] = useState<AulaDetalhe | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    obterAula(id)
      .then(setAula)
      .catch(() => setAula(null))
      .finally(() => setCarregando(false))
  }, [id])

  if (carregando) {
    return (
      <main className="conteudo">
        <p className="carregando">Carregando…</p>
      </main>
    )
  }

  if (!aula) {
    return (
      <main className="conteudo estreito">
        <div className="vazio">
          Esta atividade não está mais disponível.
          <div style={{ marginTop: 16 }}>
            <Link to="/atividades" className="botao secundario">
              Ver as atividades
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="conteudo estreito">
      <button type="button" className="fantasma pequeno" onClick={() => navegar(-1)}>
        ← Voltar
      </button>

      <header className="capa-atividade" style={{ background: degradeMateria(aula.materia_cor) }}>
        <MotivoMateria nome={aula.materia_nome} className="motivo" />
        <div className="capa-texto">
          {aula.materia_nome && <span className="materia">{aula.materia_nome}</span>}
          <h1>{aula.titulo}</h1>
          {aula.tema && <p className="tema">{aula.tema}</p>}
        </div>
      </header>

      <div className="cartao" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 17, marginBottom: 8 }}>O que a turma trabalha</h2>
        <p style={{ fontSize: 16.5 }}>{aula.resumo}</p>
        <p style={{ color: 'var(--texto-suave)', fontSize: 14.5, marginTop: 12 }}>
          Duração de {aula.duracao_min} minutos — cabe em uma aula do Núcleo.
        </p>
      </div>

      {aula.habilidades.length > 0 && (
        <section className="secao">
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>Habilidades trabalhadas</h2>
          <p className="linha-fina" style={{ marginBottom: 14, fontSize: 15 }}>
            São habilidades da BNCC que você provavelmente já precisa cumprir. Aqui elas saem da
            lista e viram atividade prática.
          </p>
          <div className="linha-tempo">
            {aula.habilidades.map((h) => (
              <div key={h.codigo} className="cartao" style={{ padding: 16 }}>
                <span className="etiqueta codigo">{h.codigo}</span>
                <p style={{ color: 'var(--texto-suave)', marginTop: 8, fontSize: 15 }}>
                  {h.descricao}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {aula.descricao && (
        <section className="secao">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Como a aula acontece</h2>
          <p style={{ color: 'var(--texto-suave)', whiteSpace: 'pre-wrap' }}>{aula.descricao}</p>
        </section>
      )}

      {aula.objetivos && (
        <section className="secao">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Objetivos</h2>
          <p style={{ color: 'var(--texto-suave)', whiteSpace: 'pre-wrap' }}>{aula.objetivos}</p>
        </section>
      )}

      {aula.materiais && (
        <section className="secao">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>O que já está na sala</h2>
          <p style={{ color: 'var(--texto-suave)', whiteSpace: 'pre-wrap' }}>{aula.materiais}</p>
        </section>
      )}

      {aula.fotos.length > 0 && (
        <section className="secao">
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>Como ficou com outras turmas</h2>
          <p className="linha-fina" style={{ marginBottom: 14, fontSize: 15 }}>
            Fotos de aulas que já aconteceram com esta atividade.
          </p>
          <div className="fotos grande">
            {aula.fotos.map((url) => (
              <img key={url} src={url} alt="Aula realizada no Núcleo WIT" loading="lazy" />
            ))}
          </div>
        </section>
      )}

      <div className="cartao chamada-final">
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Quer dar esta aula com a sua turma?</h2>
        <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
          {aula.vezes_dada > 0
            ? `Já foi dada ${aula.vezes_dada}${aula.vezes_dada === 1 ? ' vez' : ' vezes'}. Escolha um horário livre e a equipe prepara a sala.`
            : 'Escolha um horário livre na sala do Núcleo da sua escola e a equipe prepara tudo.'}
        </p>
        <Link to="/agendar" className="botao grande">
          Ver horários livres
        </Link>
      </div>
    </main>
  )
}

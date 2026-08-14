import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { carregarContexto, listarAulas, listarHabilidades, obterAula } from '../lib/api'
import { ANOS_ESCOLARES, rotuloAnos } from '../lib/formato'
import type { AulaCatalogo, AulaDetalhe, Habilidade, Materia } from '../lib/tipos'

export function Atividades() {
  const [materias, setMaterias] = useState<Materia[]>([])
  const [habilidades, setHabilidades] = useState<Habilidade[]>([])
  const [aulas, setAulas] = useState<AulaCatalogo[]>([])

  const [materiaId, setMateriaId] = useState<string | null>(null)
  const [ano, setAno] = useState<number | null>(null)
  const [habilidadeId, setHabilidadeId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([carregarContexto(), listarHabilidades()])
      .then(([ctx, habs]) => {
        setMaterias(ctx.materias)
        setHabilidades(habs)
      })
      .catch(() => {
        /* filtros são um extra; a lista de aulas abaixo é o essencial */
      })
  }, [])

  useEffect(() => {
    setCarregando(true)
    setErro(null)
    const t = setTimeout(() => {
      listarAulas({ materiaId, ano, habilidadeId, busca: busca.trim() || null })
        .then(setAulas)
        .catch((f) =>
          setErro(f instanceof Error ? f.message : 'Não foi possível carregar as atividades.'),
        )
        .finally(() => setCarregando(false))
    }, busca ? 300 : 0)
    return () => clearTimeout(t)
  }, [materiaId, ano, habilidadeId, busca])

  // Habilidades do filtro acompanham matéria e ano já escolhidos: mostrar
  // as 300 da BNCC de uma vez não ajudaria ninguém.
  const habilidadesVisiveis = useMemo(
    () =>
      habilidades.filter(
        (h) =>
          (!materiaId || h.materia_id === materiaId) && (ano === null || h.ano === null || h.ano === ano),
      ),
    [habilidades, materiaId, ano],
  )

  const temFiltro = materiaId !== null || ano !== null || habilidadeId !== null || busca.trim() !== ''

  return (
    <main className="conteudo">
      <div className="secao-titulo" style={{ marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 34px)' }}>Atividades</h1>
          <p style={{ color: 'var(--texto-suave)' }}>
            Aulas prontas da equipe WIT. Filtre por matéria, ano ou habilidade da BNCC e leve para a
            sua turma.
          </p>
        </div>
      </div>

      <div className="cartao" style={{ marginTop: 22 }}>
        <div className="campo" style={{ marginBottom: 16 }}>
          <label htmlFor="busca">Buscar</label>
          <input
            id="busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Tema, título ou palavra-chave — ex.: horta, robótica, frações"
          />
        </div>

        <div className="campo" style={{ marginBottom: 14 }}>
          <label>Matéria</label>
          <div className="chips">
            <button
              type="button"
              className="chip"
              aria-pressed={materiaId === null}
              onClick={() => {
                setMateriaId(null)
                setHabilidadeId(null)
              }}
            >
              Todas
            </button>
            {materias.map((m) => (
              <button
                type="button"
                key={m.id}
                className="chip"
                aria-pressed={materiaId === m.id}
                onClick={() => {
                  setMateriaId(materiaId === m.id ? null : m.id)
                  setHabilidadeId(null)
                }}
              >
                {m.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="campo" style={{ marginBottom: habilidadesVisiveis.length > 0 ? 14 : 0 }}>
          <label>Ano escolar</label>
          <div className="chips">
            <button
              type="button"
              className="chip"
              aria-pressed={ano === null}
              onClick={() => setAno(null)}
            >
              Todos
            </button>
            {ANOS_ESCOLARES.map((n) => (
              <button
                type="button"
                key={n}
                className="chip"
                aria-pressed={ano === n}
                onClick={() => setAno(ano === n ? null : n)}
              >
                {n}º
              </button>
            ))}
          </div>
        </div>

        {habilidadesVisiveis.length > 0 && (
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="habilidade">
              Habilidade da BNCC <span className="opcional">(opcional)</span>
            </label>
            <select
              id="habilidade"
              value={habilidadeId ?? ''}
              onChange={(e) => setHabilidadeId(e.target.value || null)}
            >
              <option value="">Qualquer habilidade</option>
              {habilidadesVisiveis.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.codigo} — {h.descricao.slice(0, 90)}
                  {h.descricao.length > 90 ? '…' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {temFiltro && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="fantasma pequeno"
              onClick={() => {
                setMateriaId(null)
                setAno(null)
                setHabilidadeId(null)
                setBusca('')
              }}
            >
              Limpar filtros
            </button>
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
          <p className="carregando">Carregando atividades…</p>
        ) : aulas.length === 0 ? (
          <div className="vazio">
            <span className="emoji">🔍</span>
            {temFiltro
              ? 'Nenhuma atividade com esses filtros. Tente afrouxar a busca.'
              : 'O catálogo ainda está vazio. A equipe WIT cadastra as aulas pelo painel.'}
          </div>
        ) : (
          <>
            <p className="subtitulo-secao">
              {aulas.length === 1 ? '1 atividade encontrada' : `${aulas.length} atividades encontradas`}
            </p>
            <div className="grade">
              {aulas.map((aula) => (
                <Link key={aula.id} to={`/atividades/${aula.id}`} className="cartao-aula">
                  <div
                    className="barra-materia"
                    style={{ background: aula.materia_cor ?? 'var(--verde)' }}
                  />
                  <h3>{aula.titulo}</h3>
                  {aula.tema && (
                    <p style={{ color: 'var(--texto-fraco)', fontSize: 13.5 }}>{aula.tema}</p>
                  )}
                  <p className="resumo">{aula.resumo}</p>
                  <div className="rodape-cartao">
                    {aula.materia_nome && (
                      <span className="etiqueta materia">{aula.materia_nome}</span>
                    )}
                    <span>{rotuloAnos(aula.anos)}</span>
                    <span>{aula.duracao_min} min</span>
                    {aula.vezes_dada > 0 && (
                      <span>
                        já dada {aula.vezes_dada}
                        {aula.vezes_dada === 1 ? ' vez' : ' vezes'}
                      </span>
                    )}
                  </div>
                  {aula.habilidades.length > 0 && (
                    <div className="chips" style={{ gap: 5 }}>
                      {aula.habilidades.slice(0, 3).map((h) => (
                        <span key={h.codigo} className="etiqueta codigo">
                          {h.codigo}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </>
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
          <span className="emoji">🤔</span>
          Esta atividade não está mais disponível.
          <div style={{ marginTop: 16 }}>
            <Link to="/atividades" className="botao secundario">
              Ver o catálogo
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

      <div style={{ marginTop: 20 }}>
        <div
          className="barra-materia"
          style={{ background: aula.materia_cor ?? 'var(--verde)', width: 70, marginBottom: 16 }}
        />
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)' }}>{aula.titulo}</h1>
        {aula.tema && (
          <p style={{ color: 'var(--texto-suave)', marginTop: 8, fontSize: 17 }}>{aula.tema}</p>
        )}

        <div className="chips" style={{ marginTop: 16 }}>
          {aula.materia_nome && <span className="etiqueta materia">{aula.materia_nome}</span>}
          <span className="etiqueta materia">{rotuloAnos(aula.anos)}</span>
          <span className="etiqueta materia">{aula.duracao_min} minutos</span>
          {aula.vezes_dada > 0 && (
            <span className="etiqueta confirmado">
              já dada {aula.vezes_dada}
              {aula.vezes_dada === 1 ? ' vez' : ' vezes'}
            </span>
          )}
        </div>
      </div>

      <div className="cartao" style={{ marginTop: 26 }}>
        <p style={{ fontSize: 17 }}>{aula.resumo}</p>
      </div>

      {aula.descricao && (
        <section className="secao">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Como funciona</h2>
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
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Materiais</h2>
          <p style={{ color: 'var(--texto-suave)', whiteSpace: 'pre-wrap' }}>{aula.materiais}</p>
        </section>
      )}

      {aula.habilidades.length > 0 && (
        <section className="secao">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Habilidades da BNCC</h2>
          <div className="linha-tempo">
            {aula.habilidades.map((h) => (
              <div key={h.codigo} className="cartao" style={{ padding: 16 }}>
                <span className="etiqueta codigo">{h.codigo}</span>
                <p style={{ color: 'var(--texto-suave)', marginTop: 8, fontSize: 14.5 }}>
                  {h.descricao}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="cartao" style={{ marginTop: 36, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Quer dar esta aula com a sua turma?</h2>
        <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
          Escolha um horário livre na sala do Núcleo WIT da sua escola.
        </p>
        <Link to="/agendar" className="botao">
          Ver horários disponíveis
        </Link>
      </div>
    </main>
  )
}

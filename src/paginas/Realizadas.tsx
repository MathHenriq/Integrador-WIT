import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { MotivoMateria, degradeMateria, textoDaMateria } from '../componentes/MotivoMateria'
import { carregarContexto, listarRealizadas } from '../lib/api'
import { MESES, diaEMes, paraData } from '../lib/formato'
import type { Materia, Realizada } from '../lib/tipos'

/** "14 de maio de 2026", sem passar a string ISO por `new Date`. */
function porExtenso(iso: string) {
  const data = paraData(iso)
  return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`
}

/**
 * O tema sem acento, sem pontuação e sem caixa: "ARTES COM IA" e
 * "Artes com IA." são o mesmo projeto. Mesma régua da `_texto_chave` do
 * banco, que é a que decide quando um registro reaproveita a atividade
 * do catálogo.
 */
function chaveDoTema(titulo: string) {
  return titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Um projeto na vitrine: o mesmo tema dado para várias turmas vira um
 * cartão só, com cada turma numa linha e as fotos de todas juntas.
 *
 * Os registros continuam separados no banco, e é assim que tem que ser:
 * 5B, 5C e 5F foram três aulas de verdade, cada uma com seu horário, suas
 * fotos e seu documento — o coordenador manda as três para o gestor.
 * Repetido era só o que o professor via aqui: três cartões iguais em
 * sequência, que parecem erro e escondem os outros projetos.
 */
type Projeto = {
  chave: string
  titulo: string
  aulas: Realizada[]
  texto: string | null
  fotos: string[]
  aulaId: string | null
  doCatalogo: boolean
}

function agruparPorProjeto(itens: Realizada[]): Projeto[] {
  const projetos = new Map<string, Projeto>()

  // A lista vem da mais recente para a mais antiga; o primeiro que chega
  // define a posição do projeto, então o projeto dado ontem fica em cima.
  for (const item of itens) {
    const chave = chaveDoTema(item.titulo) || item.id
    let projeto = projetos.get(chave)
    if (!projeto) {
      projeto = {
        chave,
        titulo: item.titulo,
        aulas: [],
        texto: null,
        fotos: [],
        aulaId: null,
        doCatalogo: false,
      }
      projetos.set(chave, projeto)
    }

    projeto.aulas.push(item)
    // Um relato só, o mais recente: três relatos quase iguais seguidos
    // são justamente a repetição que este agrupamento tira da tela.
    projeto.texto ??= item.relato || null
    projeto.aulaId ??= item.aula_id
    projeto.doCatalogo ||= item.do_catalogo
    // A mesma foto anexada em duas turmas aparece uma vez.
    for (const url of item.fotos) {
      if (!projeto.fotos.includes(url)) projeto.fotos.push(url)
    }
  }

  for (const projeto of projetos.values()) {
    projeto.texto ??= projeto.aulas.find((a) => a.resumo)?.resumo ?? null
  }

  return [...projetos.values()]
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
    return visiveis
      .map((c) => ({ ...c, projetos: agruparPorProjeto(c.itens) }))
      .sort((a, b) => b.itens.length - a.itens.length)
  }, [materias, itens, materiaId])

  const totalDeProjetos = useMemo(
    () => new Set(itens.map((i) => chaveDoTema(i.titulo) || i.id)).size,
    [itens],
  )

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
                  : totalDeProjetos === itens.length
                    ? `${itens.length} aulas realizadas`
                    : `${totalDeProjetos} projetos, em ${itens.length} aulas realizadas`}
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

                    {materia.projetos.map((projeto) => {
                      const [maisRecente] = projeto.aulas
                      const variasTurmas = projeto.aulas.length > 1
                      return (
                        <article key={projeto.chave} className="atividade feita">
                          <span className="quando">
                            {variasTurmas
                              ? `${projeto.aulas.length} turmas · a última em ${porExtenso(maisRecente.data_aula)}`
                              : porExtenso(maisRecente.data_aula)}
                          </span>
                          <span className="nome">{projeto.titulo}</span>

                          {variasTurmas ? (
                            <ul className="turmas-do-projeto">
                              {projeto.aulas.map((aula) => (
                                <li key={aula.id}>
                                  {diaEMes(aula.data_aula)} · {aula.escola_nome} ·{' '}
                                  {aula.nome_professor}
                                  {aula.turma ? ` · ${aula.turma}` : ''}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="trabalha">
                              {maisRecente.escola_nome} · {maisRecente.nome_professor}
                              {maisRecente.turma ? ` · ${maisRecente.turma}` : ''}
                            </span>
                          )}

                          {projeto.texto && <span className="relato">{projeto.texto}</span>}

                          {projeto.fotos.length > 0 && (
                            <span className="fotos">
                              {projeto.fotos.map((url) => (
                                <img
                                  key={url}
                                  src={url}
                                  alt={`Aula "${projeto.titulo}"`}
                                  loading="lazy"
                                />
                              ))}
                            </span>
                          )}

                          <span className="marcas">
                            {!projeto.doCatalogo && (
                              <span className="etiqueta parcial">Aula do professor</span>
                            )}
                            {projeto.aulaId && (
                              <Link to={`/atividades/${projeto.aulaId}`} className="etiqueta codigo">
                                quero fazer esta →
                              </Link>
                            )}
                          </span>
                        </article>
                      )
                    })}
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

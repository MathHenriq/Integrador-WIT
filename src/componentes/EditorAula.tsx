import { useEffect, useMemo, useState } from 'react'
import { adminSalvarAula, listarHabilidades } from '../lib/api'
import { ANOS_ESCOLARES } from '../lib/formato'
import type { AulaAdmin, Habilidade, Materia } from '../lib/tipos'
import { Aviso } from './Aviso'
import { Modal } from './Modal'

/** Quantas habilidades a lista mostra de uma vez, antes de exigir busca. */
const TETO_DA_LISTA = 60

type Props = {
  senha: string
  materias: Materia[]
  /** null = criando uma aula nova. */
  aula: AulaAdmin | null
  aoFechar: () => void
  aoSalvar: () => void
}

/**
 * Formulário único de aula. Só título e resumo são obrigatórios — o
 * resto pode ser preenchido depois, para cadastrar uma aula não virar
 * um projeto.
 */
export function EditorAula({ senha, materias, aula, aoFechar, aoSalvar }: Props) {
  const [titulo, setTitulo] = useState(aula?.titulo ?? '')
  const [tema, setTema] = useState(aula?.tema ?? '')
  const [resumo, setResumo] = useState(aula?.resumo ?? '')
  const [descricao, setDescricao] = useState(aula?.descricao ?? '')
  const [objetivos, setObjetivos] = useState(aula?.objetivos ?? '')
  const [materiais, setMateriais] = useState(aula?.materiais ?? '')
  const [materiaId, setMateriaId] = useState(aula?.materia_id ?? '')
  const [anos, setAnos] = useState<number[]>(aula?.anos ?? [])
  const [duracao, setDuracao] = useState(aula?.duracao_min ?? 90)
  const [publicada, setPublicada] = useState(aula?.publicada ?? true)
  const [habIds, setHabIds] = useState<string[]>(aula?.habilidades.map((h) => h.id) ?? [])

  const [habilidades, setHabilidades] = useState<Habilidade[]>([])
  const [buscaHab, setBuscaHab] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  /**
   * Busca no servidor, com um respiro depois da última tecla. É lá que
   * ela precisa acontecer: são 1.303 habilidades e o PostgREST corta em
   * mil, então filtrar aqui deixaria 303 invisíveis sem avisar ninguém.
   */
  useEffect(() => {
    const relogio = setTimeout(() => {
      listarHabilidades({ materiaId: materiaId || null, busca: buscaHab })
        .then(setHabilidades)
        .catch(() => setHabilidades([]))
    }, 250)
    return () => clearTimeout(relogio)
  }, [materiaId, buscaHab])

  /**
   * As marcadas ficam guardadas inteiras, não só pelo id. A busca vai ao
   * servidor e devolve outra lista a cada tecla; sem isto, marcar uma
   * habilidade e procurar a próxima fazia a primeira sumir da tela — o
   * vínculo continuava salvo, mas quem estava usando não via mais.
   */
  const [marcadas, setMarcadas] = useState<Habilidade[]>(
    () => (aula?.habilidades ?? []).map((h) => ({ ...h, materia_id: null, ano: null, total: 0 })),
  )

  /**
   * O que está marcado aparece sempre, no topo: sumir da vista o que a
   * pessoa acabou de escolher seria pior que a rolagem.
   */
  const habilidadesVisiveis = useMemo(
    () => ({
      marcadas: marcadas.filter((h) => habIds.includes(h.id)),
      achadas: habilidades.filter((h) => !habIds.includes(h.id)),
      total: habilidades[0]?.total ?? 0,
    }),
    [habilidades, marcadas, habIds],
  )

  function alternarAno(n: number) {
    setAnos((atual) => (atual.includes(n) ? atual.filter((a) => a !== n) : [...atual, n].sort()))
  }

  function alternarHabilidade(h: Habilidade) {
    setHabIds((atual) => (atual.includes(h.id) ? atual.filter((x) => x !== h.id) : [...atual, h.id]))
    setMarcadas((atual) => (atual.some((x) => x.id === h.id) ? atual : [...atual, h]))
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    if (titulo.trim().length < 3) {
      setErro('Dê um título para a aula.')
      return
    }
    if (resumo.trim().length < 10) {
      setErro('Escreva um resumo de pelo menos 10 caracteres — é ele que o professor lê primeiro.')
      return
    }

    setSalvando(true)
    try {
      await adminSalvarAula(senha, {
        id: aula?.id ?? null,
        titulo: titulo.trim(),
        resumo: resumo.trim(),
        tema: tema.trim() || null,
        descricao: descricao.trim() || null,
        objetivos: objetivos.trim() || null,
        materiais: materiais.trim() || null,
        materiaId: materiaId || null,
        anos,
        duracaoMin: duracao,
        publicada,
        habilidades: habIds,
      })
      aoSalvar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a aula.')
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={aula ? 'Editar aula' : 'Nova aula'}
      subtitulo="Só título e resumo são obrigatórios. O resto dá para completar depois."
      aoFechar={aoFechar}
      largo
    >
      <form onSubmit={salvar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="campo">
          <label htmlFor="titulo">Título da aula *</label>
          <input
            id="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Horta digital com sensores"
            maxLength={140}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="resumo">Resumo *</label>
          <textarea
            id="resumo"
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            placeholder="Duas linhas explicando o que a turma faz na aula."
            maxLength={400}
            required
          />
          <p className="ajuda">É o texto que aparece no cartão do catálogo.</p>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="materia">Matéria</label>
            <select id="materia" value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
              <option value="">Sem matéria definida</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="tema">Tema</label>
            <input
              id="tema"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="Ex.: Sustentabilidade"
              maxLength={120}
            />
          </div>
          <div className="campo">
            <label htmlFor="duracao">Duração (min)</label>
            <input
              id="duracao"
              type="number"
              min={15}
              max={300}
              step={5}
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
            />
          </div>
        </div>

        <fieldset>
          <legend>Anos escolares</legend>
          <div className="caixas">
            {ANOS_ESCOLARES.map((n) => (
              <label key={n} className="caixa">
                <input type="checkbox" checked={anos.includes(n)} onChange={() => alternarAno(n)} />
                {n}º ano
              </label>
            ))}
          </div>
          <p className="ajuda" style={{ marginTop: 8 }}>
            Deixe tudo desmarcado se a aula serve para qualquer ano.
          </p>
        </fieldset>

        <fieldset>
          <legend>Habilidades da BNCC</legend>
          {habilidades.length === 0 && !buscaHab.trim() ? (
            <p className="ajuda" style={{ margin: 0 }}>
              Nenhuma habilidade cadastrada
              {materiaId ? ' para esta matéria' : ''}. Cadastre na aba <strong>BNCC</strong> e volte
              aqui — dá para salvar a aula sem isso.
            </p>
          ) : (
            <>
              <div className="campo" style={{ marginBottom: 10 }}>
                <input
                  type="search"
                  value={buscaHab}
                  onChange={(e) => setBuscaHab(e.target.value)}
                  placeholder="Buscar por código ou por palavra da habilidade…"
                  aria-label="Buscar habilidade da BNCC"
                />
                <p className="ajuda">
                  {habIds.length > 0 && `${habIds.length} marcada(s) · `}
                  {buscaHab.trim()
                    ? `${habilidadesVisiveis.total} encontrada(s)`
                    : `${habilidadesVisiveis.total} disponível(is) — escreva para achar a sua`}
                </p>
              </div>

              <div className="lista-habilidades">
                {[...habilidadesVisiveis.marcadas, ...habilidadesVisiveis.achadas].map((h) => (
                  <label key={h.id} className="caixa" style={{ alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={habIds.includes(h.id)}
                      onChange={() => alternarHabilidade(h)}
                      style={{ marginTop: 4 }}
                    />
                    <span>
                      <span className="etiqueta codigo">{h.codigo}</span>{' '}
                      <span style={{ fontWeight: 400 }}>{h.descricao}</span>
                    </span>
                  </label>
                ))}

                {habilidadesVisiveis.achadas.length === 0 && buscaHab.trim() && (
                  <p className="ajuda" style={{ margin: 0 }}>
                    Nenhuma habilidade com esse termo. Tente o código (EF06CI11) ou uma palavra do
                    texto.
                  </p>
                )}
              </div>

              {habilidadesVisiveis.total > TETO_DA_LISTA && (
                <p className="ajuda">
                  Mostrando as primeiras {TETO_DA_LISTA} de {habilidadesVisiveis.total}. Escreva
                  mais para estreitar.
                </p>
              )}
            </>
          )}
        </fieldset>

        <div className="campo">
          <label htmlFor="descricao">Como funciona a aula</label>
          <textarea
            id="descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Passo a passo, o que os alunos fazem, como o instrutor conduz."
          />
        </div>

        <div className="campo">
          <label htmlFor="objetivos">Objetivos</label>
          <textarea
            id="objetivos"
            value={objetivos}
            onChange={(e) => setObjetivos(e.target.value)}
            placeholder="O que a turma sai sabendo ou sabendo fazer."
          />
        </div>

        <div className="campo">
          <label htmlFor="materiais">Materiais</label>
          <textarea
            id="materiais"
            value={materiais}
            onChange={(e) => setMateriais(e.target.value)}
            placeholder="Equipamentos, insumos, softwares."
          />
        </div>

        <label className="caixa" style={{ marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={publicada}
            onChange={(e) => setPublicada(e.target.checked)}
          />
          Publicada — aparece no catálogo para os professores
        </label>
        <p className="ajuda">Desmarque para deixar em rascunho enquanto você termina de escrever.</p>

        <div className="acoes-formulario">
          <button type="button" className="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar aula'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from './Aviso'
import { adminImportarAulaRealizada, adminListarEscolas, importarDocumentoCanva } from '../lib/api'
import { dataExtensa, faixaHoraria } from '../lib/formato'
import type { AulaImportada, EscolaAdmin } from '../lib/tipos'

/** Os cinco cursos do Núcleo. O campo aceita outro, se for o caso. */
const CURSOS = [
  'Inteligência Artificial',
  'Games',
  'Metaverso',
  'Ambientes Inteligentes (IoT)',
  'Comunicação Digital',
]

/** Foto grande demais atrasa o envio e não melhora o documento. */
const LADO_MAXIMO = 1600

/**
 * Toda foto vira JPEG antes de sair do navegador: é o formato que entra
 * no PDF sem conversão nenhuma do outro lado, e o mesmo arquivo que sobe
 * para o site é o que vai para dentro do documento.
 */
async function paraJpeg(arquivo: File): Promise<Blob> {
  const desenho = await createImageBitmap(arquivo)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(desenho.width, desenho.height))
  const tela = document.createElement('canvas')
  tela.width = Math.round(desenho.width * escala)
  tela.height = Math.round(desenho.height * escala)

  const pincel = tela.getContext('2d')
  if (!pincel) throw new Error('Este navegador não conseguiu preparar a foto.')
  // Fundo branco: PNG com transparência viraria preto no JPEG.
  pincel.fillStyle = '#ffffff'
  pincel.fillRect(0, 0, tela.width, tela.height)
  pincel.drawImage(desenho, 0, 0, tela.width, tela.height)
  desenho.close()

  return await new Promise<Blob>((resolver, recusar) => {
    tela.toBlob(
      (blob) => (blob ? resolver(blob) : recusar(new Error('Não consegui preparar a foto.'))),
      'image/jpeg',
      0.82,
    )
  })
}

type FotoEscolhida = { nome: string; blob: Blob; previa: string }

export function CriarDocumento({
  senha,
  aoErro,
}: {
  senha: string
  aoErro: (e: string | null) => void
}) {
  const [escolas, setEscolas] = useState<EscolaAdmin[]>([])
  const [escolaId, setEscolaId] = useState('')
  const [data, setData] = useState('')
  const [turma, setTurma] = useState('')
  const [curso, setCurso] = useState(CURSOS[0])
  const [professor, setProfessor] = useState('')
  const [tema, setTema] = useState('')
  const [objetivos, setObjetivos] = useState('')
  const [descricao, setDescricao] = useState('')
  const [materiais, setMateriais] = useState('')
  const [fotos, setFotos] = useState<FotoEscolhida[]>([])
  const [preparando, setPreparando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [pronto, setPronto] = useState<{ pdf: string; nome: string; aula: AulaImportada } | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    adminListarEscolas(senha)
      .then(setEscolas)
      .catch(() => setEscolas([]))
  }, [senha])

  // As prévias são endereços temporários do navegador; soltar evita
  // deixar a memória presa em foto que já saiu da tela.
  useEffect(() => () => fotos.forEach((f) => URL.revokeObjectURL(f.previa)), [fotos])

  const escolaEscolhida = escolas.find((e) => e.id === escolaId)

  const podeGerar =
    !!escolaEscolhida &&
    /^\d{4}-\d{2}-\d{2}$/.test(data) &&
    professor.trim().length >= 3 &&
    tema.trim().length >= 3 &&
    !gerando &&
    !preparando

  /** O relato da vitrine, montado como o importador do Canva monta. */
  const relato = useMemo(() => {
    const partes: string[] = []
    if (descricao.trim()) partes.push(descricao.trim())
    if (objetivos.trim()) partes.push(`Objetivos de aprendizagem\n${objetivos.trim()}`)
    if (materiais.trim()) partes.push(`Materiais e recursos\n${materiais.trim()}`)
    return partes.join('\n\n')
  }, [descricao, objetivos, materiais])

  async function receberFotos(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    aoErro(null)
    setPreparando(true)
    try {
      const novas: FotoEscolhida[] = []
      for (const arquivo of Array.from(lista)) {
        const blob = await paraJpeg(arquivo)
        novas.push({ nome: arquivo.name, blob, previa: URL.createObjectURL(blob) })
      }
      setFotos((atuais) => [...atuais, ...novas])
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não consegui preparar as fotos.')
    } finally {
      setPreparando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  /**
   * O documento é montado aqui mesmo, no navegador, e sobe pelo caminho
   * por onde entra um PDF do Canva: é o mesmo importador que hospeda as
   * fotos e registra o arquivo. Um caminho só para os dois sentidos, e
   * já testado — se o importador lê o que o gerador escreve, o documento
   * é do mesmo tipo que o exportado de lá.
   */
  async function gerar() {
    if (!escolaEscolhida) return
    aoErro(null)
    setGerando(true)
    try {
      const { montarDocumento } = await import('../lib/documento/montar.ts')

      const bytes = montarDocumento(
        {
          escola: escolaEscolhida.nome,
          data,
          turma: turma.trim(),
          curso: curso.trim(),
          professor: professor.trim(),
          tema: tema.trim(),
          objetivos: objetivos.trim(),
          descricao: descricao.trim(),
          materiais: materiais.trim(),
        },
        await Promise.all(
          fotos.map(async (f) => ({ bytes: new Uint8Array(await f.blob.arrayBuffer()) })),
        ),
      )

      const nome = `Projeto Integrador - ${escolaEscolhida.nome} - ${data}.pdf`
      const arquivo = new File([bytes as BlobPart], nome, { type: 'application/pdf' })

      // O importador devolve as fotos já hospedadas, prontas para a vitrine.
      const lida = await importarDocumentoCanva(senha, arquivo)

      const aula = await adminImportarAulaRealizada(senha, {
        importacaoId: lida.importacao_id,
        escolaId,
        dataAula: data,
        nomeProfessor: professor.trim(),
        turma: turma.trim() || null,
        titulo: tema.trim(),
        relato: relato || null,
        fotos: lida.fotos,
        descricao: descricao.trim() || null,
        objetivos: objetivos.trim() || null,
        materiais: materiais.trim() || null,
        virarAtividade: true,
      })

      setPronto({ pdf: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })), nome, aula })
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não foi possível gerar o documento.')
    } finally {
      setGerando(false)
    }
  }

  if (pronto) {
    return (
      <Pronta
        pdf={pronto.pdf}
        nome={pronto.nome}
        aula={pronto.aula}
        aoRecomecar={() => {
          setPronto(null)
          setFotos([])
          setTema('')
          setObjetivos('')
          setDescricao('')
          setMateriais('')
        }}
      />
    )
  }

  return (
    <>
      <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
        Preencha aqui o que você preencheria no Canva. Sai o documento em PDF, no mesmo desenho de
        sempre e com as fotos já dentro, e a aula entra no site como realizada — e como atividade
        para outro professor escolher.
      </p>

      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="doc-escola">Escola *</label>
            <select id="doc-escola" value={escolaId} onChange={(e) => setEscolaId(e.target.value)}>
              <option value="">Escolha a escola</option>
              {escolas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="doc-data">Data da aula *</label>
            <input id="doc-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="doc-turma">Turma</label>
            <input
              id="doc-turma"
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
              placeholder="8C"
              maxLength={60}
            />
          </div>
          <div className="campo">
            <label htmlFor="doc-curso">Curso</label>
            <input
              id="doc-curso"
              list="cursos-do-wit"
              value={curso}
              onChange={(e) => setCurso(e.target.value)}
              maxLength={60}
            />
            <datalist id="cursos-do-wit">
              {CURSOS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="campo">
            <label htmlFor="doc-professor">Prof. *</label>
            <input
              id="doc-professor"
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              maxLength={120}
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="doc-tema">Tema da aula *</label>
          <input
            id="doc-tema"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Criação de sites sobre vegetais com IA"
            maxLength={160}
          />
        </div>

        <div className="campo">
          <label htmlFor="doc-objetivos">Objetivos de aprendizagem</label>
          <textarea
            id="doc-objetivos"
            value={objetivos}
            onChange={(e) => setObjetivos(e.target.value)}
            rows={4}
            placeholder={'Um objetivo por linha.'}
          />
          <p className="ajuda">Cada linha vira um item da lista, com marcador, como no Canva.</p>
        </div>

        <div className="campo">
          <label htmlFor="doc-descricao">Descrição da aula</label>
          <textarea
            id="doc-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={6}
            placeholder="Como foi a aula, do começo ao fim."
          />
        </div>

        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="doc-materiais">Materiais e recursos necessários</label>
          <textarea
            id="doc-materiais"
            value={materiais}
            onChange={(e) => setMateriais(e.target.value)}
            rows={3}
            placeholder={'Um material por linha.'}
          />
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Fotos da aula</h3>
        <p className="ajuda" style={{ marginBottom: 14 }}>
          Seis por página do documento, duas por linha, no mesmo lugar em que ficam hoje. Elas
          também vão para a vitrine do site.
        </p>

        <input
          ref={entrada}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void receberFotos(e.target.files)}
        />
        <button
          type="button"
          className="secundario"
          onClick={() => entrada.current?.click()}
          disabled={preparando}
        >
          {preparando ? 'Preparando…' : '+ Escolher fotos'}
        </button>

        {fotos.length > 0 && (
          <div className="fotos-importadas" style={{ marginTop: 14 }}>
            {fotos.map((foto) => (
              <figure key={foto.previa}>
                <img src={foto.previa} alt={foto.nome} loading="lazy" />
                <button
                  type="button"
                  className="fantasma pequeno"
                  aria-label={`Tirar ${foto.nome}`}
                  onClick={() => setFotos((atuais) => atuais.filter((f) => f !== foto))}
                >
                  ×
                </button>
              </figure>
            ))}
          </div>
        )}
      </div>

      <div className="acoes-formulario" style={{ marginTop: 0 }}>
        <button type="button" onClick={() => void gerar()} disabled={!podeGerar}>
          {gerando ? 'Gerando o documento…' : 'Gerar o documento e publicar a aula'}
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- pronto

function Pronta({
  pdf,
  nome,
  aula,
  aoRecomecar,
}: {
  pdf: string
  nome: string
  aula: AulaImportada
  aoRecomecar: () => void
}) {
  // O download começa sozinho: o arquivo é o que a pessoa veio buscar, e
  // o endereço do blob morre junto com a tela.
  useEffect(() => {
    const gatilho = document.createElement('a')
    gatilho.href = pdf
    gatilho.download = nome
    gatilho.click()
  }, [pdf, nome])

  return (
    <div className="cartao">
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Documento pronto</h2>
      <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
        <strong>{aula.titulo}</strong> — {aula.escola_nome}, {dataExtensa(aula.data_aula)}, das{' '}
        {faixaHoraria(aula.hora_inicio, aula.hora_fim)}.
      </p>

      <div className="acoes-linha" style={{ marginBottom: 18 }}>
        <a className="botao" href={pdf} download={nome}>
          Baixar o PDF
        </a>
        <Link className="botao secundario" to="/realizadas">
          Ver na vitrine
        </Link>
      </div>

      <Aviso tipo="sucesso">
        {aula.anexada
          ? `Entrou na reserva ${aula.protocolo}, que já existia para esta turma nesta data.`
          : `Registrada como ${aula.protocolo}, com ${aula.fotos.length} foto(s).`}
      </Aviso>

      {aula.aviso && <Aviso tipo="info">{aula.aviso}</Aviso>}

      {aula.aula_id && (
        <Aviso tipo="info">
          {aula.aula_nova
            ? 'Também abriu uma atividade no catálogo: outro professor já pode escolher esta aula ao agendar.'
            : 'Entrou na atividade que já existia com este tema, no catálogo.'}{' '}
          <Link to={`/atividades/${aula.aula_id}`}>ver a atividade →</Link>
        </Aviso>
      )}

      <div className="acoes-formulario" style={{ marginTop: 6 }}>
        <button type="button" onClick={aoRecomecar}>
          Fazer outro documento
        </button>
      </div>
    </div>
  )
}

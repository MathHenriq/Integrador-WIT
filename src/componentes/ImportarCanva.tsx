import { useCallback, useEffect, useRef, useState } from 'react'
import { Aviso } from './Aviso'
import { adminImportarAulaRealizada, adminListarEscolas, importarDocumentoCanva } from '../lib/api'
import { dataCurta, dataExtensa, faixaHoraria } from '../lib/formato'
import type { AulaImportada, EscolaAdmin, ImportacaoCanva } from '../lib/tipos'

/**
 * Sobe o PDF que a equipe exporta do Canva e transforma em aula
 * realizada. O trabalho pesado (ler o arquivo, separar foto de moldura,
 * hospedar as imagens) acontece na Edge Function; aqui é a conferência
 * antes de publicar.
 *
 * A conferência existe porque documento é documento: um campo pode vir
 * escrito de um jeito que ninguém previu, e é melhor a equipe corrigir
 * numa tela já preenchida do que descobrir o erro na vitrine pública.
 */
export function ImportarCanva({ senha, aoErro }: { senha: string; aoErro: (e: string | null) => void }) {
  const [escolas, setEscolas] = useState<EscolaAdmin[]>([])
  const [lendo, setLendo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [lida, setLida] = useState<ImportacaoCanva | null>(null)
  const [publicada, setPublicada] = useState<AulaImportada | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    adminListarEscolas(senha)
      .then(setEscolas)
      .catch(() => setEscolas([]))
  }, [senha])

  const receber = useCallback(
    async (arquivo: File | null | undefined) => {
      if (!arquivo) return

      aoErro(null)
      setPublicada(null)
      setLida(null)

      if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== 'application/pdf') {
        aoErro('Escolha o PDF do documento. No Canva: Compartilhar → Baixar → PDF.')
        return
      }

      setLendo(true)
      try {
        setLida(await importarDocumentoCanva(senha, arquivo))
      } catch (falha) {
        aoErro(falha instanceof Error ? falha.message : 'Não foi possível ler o documento.')
      } finally {
        setLendo(false)
        if (entrada.current) entrada.current.value = ''
      }
    },
    [senha, aoErro],
  )

  if (publicada) {
    return (
      <Publicada
        aula={publicada}
        aoRecomecar={() => {
          setPublicada(null)
          setLida(null)
        }}
      />
    )
  }

  if (lida) {
    return (
      <Conferencia
        senha={senha}
        escolas={escolas}
        lida={lida}
        aoErro={aoErro}
        aoCancelar={() => setLida(null)}
        aoPublicar={setPublicada}
      />
    )
  }

  return (
    <>
      <div
        className={`solta-arquivo${arrastando ? ' sobre' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          void receber(e.dataTransfer.files?.[0])
        }}
      >
        <span className="emoji">📄</span>
        <h2>Arraste aqui o PDF do documento da aula</h2>
        <p>
          É o mesmo documento que a equipe já preenche no Canva. Os campos e as fotos saem dele
          prontos — o cabeçalho e o rodapé do template ficam de fora.
        </p>

        <input
          ref={entrada}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => void receber(e.target.files?.[0])}
        />
        <button type="button" onClick={() => entrada.current?.click()} disabled={lendo}>
          {lendo ? 'Lendo o documento…' : 'Escolher o arquivo'}
        </button>
      </div>

      <p className="ajuda" style={{ marginTop: 14 }}>
        No Canva: <strong>Compartilhar → Baixar → PDF padrão</strong>. Até 10 MB.
      </p>
    </>
  )
}

// ---------------------------------------------------------------- escola

/** Sem acento, sem pontuação e sem as siglas que toda escola repete. */
function chave(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(EMEIEF|EMEF|EMEI|ESCOLA|MUNICIPAL|PROF|PROFA|COMPL)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/**
 * Acha a escola do documento na lista do cadastro. "EMEF Rita de Jesus"
 * tem que encontrar "EMEF RITA DE JESUS", e o nome do cadastro às vezes
 * traz um complemento que o documento não tem.
 */
function acharEscola(escolas: EscolaAdmin[], lido: string | null) {
  if (!lido) return ''

  const alvo = chave(lido)
  if (!alvo) return ''

  const exata = escolas.find((e) => chave(e.nome) === alvo)
  if (exata) return exata.id

  const contida = escolas.find((e) => chave(e.nome).includes(alvo) || alvo.includes(chave(e.nome)))
  if (contida) return contida.id

  // Último recurso: a escola que compartilha mais palavras com o que foi
  // lido. Duas palavras em comum já separam as 17 com folga.
  const palavras = new Set(alvo.split(' ').filter((p) => p.length > 2))
  let melhor = { id: '', pontos: 0 }

  for (const escola of escolas) {
    const pontos = chave(escola.nome)
      .split(' ')
      .filter((p) => p.length > 2 && palavras.has(p)).length
    if (pontos > melhor.pontos) melhor = { id: escola.id, pontos }
  }

  return melhor.pontos >= 2 ? melhor.id : ''
}

/**
 * A frase que aparece embaixo de um campo que o documento não entregou.
 * Curta de propósito: a tela já vem preenchida, e o que a equipe precisa
 * saber é só qual dos campos ficou por conta dela.
 */
/** Os campos que o documento do Canva carrega, na ordem da tela. */
const CAMPOS_DO_DOCUMENTO = [
  'escola',
  'data',
  'professor',
  'turma',
  'tema',
  'objetivos',
  'descricao',
  'materiais',
] as const

const TOTAL_DE_CAMPOS = CAMPOS_DO_DOCUMENTO.length

function Faltou({ o }: { o: string }) {
  return <p className="ajuda falta">{o} não veio no documento — preencha aqui.</p>
}

/** "a, b e c" — a vírgula até o penúltimo, o "e" só no fim. */
function emLista(itens: string[]) {
  if (itens.length <= 1) return itens.join('')
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

// ----------------------------------------------------------- conferência

function Conferencia({
  senha,
  escolas,
  lida,
  aoErro,
  aoCancelar,
  aoPublicar,
}: {
  senha: string
  escolas: EscolaAdmin[]
  lida: ImportacaoCanva
  aoErro: (e: string | null) => void
  aoCancelar: () => void
  aoPublicar: (a: AulaImportada) => void
}) {
  const [escolaId, setEscolaId] = useState('')
  const [data, setData] = useState(lida.campos.data ?? '')
  const [professor, setProfessor] = useState(lida.campos.professor ?? '')
  const [turma, setTurma] = useState(lida.campos.turma ?? '')
  const [titulo, setTitulo] = useState(lida.campos.tema ?? '')
  const [relato, setRelato] = useState(lida.relato)
  const [fotos, setFotos] = useState(lida.fotos)
  const [publicando, setPublicando] = useState(false)

  // A lista de escolas chega depois do documento, então o casamento
  // acontece quando as duas coisas existem.
  useEffect(() => {
    if (escolas.length > 0) setEscolaId((atual) => atual || acharEscola(escolas, lida.campos.escola))
  }, [escolas, lida.campos.escola])

  const c = lida.campos
  const lidos = CAMPOS_DO_DOCUMENTO.filter((campo) => c[campo]).length

  const faltaNoRelato = [
    c.descricao ? null : 'a descrição da aula',
    c.objetivos ? null : 'os objetivos de aprendizagem',
    c.materiais ? null : 'os materiais e recursos',
  ].filter((f): f is string => f !== null)

  const faltaEscola = !escolaId
  const podePublicar = !!escolaId && !!data && professor.trim().length >= 3 && titulo.trim().length >= 3

  async function publicar() {
    aoErro(null)
    setPublicando(true)
    try {
      aoPublicar(
        await adminImportarAulaRealizada(senha, {
          importacaoId: lida.importacao_id,
          escolaId,
          dataAula: data,
          nomeProfessor: professor.trim(),
          turma: turma.trim() || null,
          titulo: titulo.trim(),
          relato: relato.trim() || null,
          fotos,
        }),
      )
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não foi possível publicar a aula.')
    } finally {
      setPublicando(false)
    }
  }

  return (
    <>
      <div className="secao-titulo" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 20 }}>Confira antes de publicar</h2>
          <p style={{ color: 'var(--texto-suave)' }}>
            {lida.paginas} página(s) lidas · {lida.fotos.length} foto(s) · {lidos} de{' '}
            {TOTAL_DE_CAMPOS} campos preenchidos pelo documento
          </p>
        </div>
        <button type="button" className="secundario" onClick={aoCancelar}>
          Trocar de arquivo
        </button>
      </div>

      {lida.anteriores.length > 0 && (
        <Aviso tipo="info">
          Este mesmo documento já foi importado
          {lida.anteriores[0].data_aula ? ` (aula de ${dataCurta(lida.anteriores[0].data_aula)}` : ''}
          {lida.anteriores[0].protocolo ? `, ${lida.anteriores[0].protocolo})` : lida.anteriores[0].data_aula ? ')' : ''}.
          Publicar de novo vai atualizar o relato e as fotos daquela aula.
        </Aviso>
      )}

      {lida.avisos.map((aviso) => (
        <Aviso key={aviso} tipo="info">
          {aviso}
        </Aviso>
      ))}

      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="imp-escola">Escola *</label>
            <select id="imp-escola" value={escolaId} onChange={(e) => setEscolaId(e.target.value)}>
              <option value="">Escolha a escola</option>
              {escolas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            {!c.escola && <Faltou o="A escola" />}
            {faltaEscola && c.escola && (
              <p className="ajuda falta">
                No documento está escrito “{c.escola}”, que não bateu com nenhuma escola do
                cadastro. Escolha na lista.
              </p>
            )}
          </div>

          <div className="campo">
            <label htmlFor="imp-data">Data da aula *</label>
            <input id="imp-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            {!c.data && !c.data_lida && <Faltou o="A data" />}
            {!c.data && c.data_lida && (
              <p className="ajuda falta">
                Não entendi a data “{c.data_lida}” do documento — escolha no calendário.
              </p>
            )}
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="imp-professor">Professor(a) *</label>
            <input
              id="imp-professor"
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              maxLength={120}
            />
            {!c.professor && <Faltou o="O nome do professor" />}
          </div>
          <div className="campo">
            <label htmlFor="imp-turma">Turma</label>
            <input id="imp-turma" value={turma} onChange={(e) => setTurma(e.target.value)} maxLength={60} />
            {!c.turma && <Faltou o="A turma" />}
          </div>
        </div>

        <div className="campo">
          <label htmlFor="imp-titulo">Tema da aula *</label>
          <input
            id="imp-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={160}
          />
          {!c.tema && <Faltou o="O tema da aula" />}
          <p className="ajuda">
            É o título que aparece na vitrine de aulas realizadas.
            {c.curso ? ` No documento, o curso é “${c.curso}”.` : ''}
          </p>
        </div>

        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="imp-relato">Como foi a aula</label>
          <textarea id="imp-relato" value={relato} onChange={(e) => setRelato(e.target.value)} rows={10} />
          {faltaNoRelato.length > 0 && (
            <p className="ajuda falta">
              O documento não trouxe {emLista(faltaNoRelato)} — escreva aqui o que faltar.
            </p>
          )}
          <p className="ajuda">
            Montado com a descrição, os objetivos e os materiais do documento. É o que outro
            professor lê para se inspirar — ajuste à vontade.
          </p>
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Fotos da aula</h3>
        <p className="ajuda" style={{ marginBottom: fotos.length > 0 ? 14 : 0 }}>
          {fotos.length === 0
            ? 'Nenhuma foto veio deste documento. A aula pode ser publicada assim mesmo.'
            : 'Sobrou alguma imagem do template? Tire dela clicando no ×.'}
        </p>

        {fotos.length > 0 && (
          <div className="fotos-importadas">
            {fotos.map((endereco) => (
              <figure key={endereco}>
                <img src={endereco} alt="" loading="lazy" />
                <button
                  type="button"
                  className="fantasma pequeno"
                  aria-label="Tirar esta foto"
                  onClick={() => setFotos(fotos.filter((f) => f !== endereco))}
                >
                  ×
                </button>
              </figure>
            ))}
          </div>
        )}
      </div>

      <div className="acoes-formulario" style={{ marginTop: 0 }}>
        <button type="button" className="secundario" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="button" onClick={() => void publicar()} disabled={publicando || !podePublicar}>
          {publicando ? 'Publicando…' : 'Publicar aula realizada'}
        </button>
      </div>
    </>
  )
}

// ------------------------------------------------------------- publicada

function Publicada({ aula, aoRecomecar }: { aula: AulaImportada; aoRecomecar: () => void }) {
  return (
    <div className="cartao">
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Aula publicada</h2>
      <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
        <strong>{aula.titulo}</strong> — {aula.escola_nome}, {dataExtensa(aula.data_aula)}, das{' '}
        {faixaHoraria(aula.hora_inicio, aula.hora_fim)}. Já está na página de aulas realizadas com{' '}
        {aula.fotos.length} foto(s).
      </p>

      <Aviso tipo="sucesso">
        {aula.anexada
          ? `Entrou na reserva ${aula.protocolo}, que já existia para esta turma nesta data.`
          : `Registrada como ${aula.protocolo}.`}
      </Aviso>

      <div className="acoes-formulario" style={{ marginTop: 6 }}>
        <button type="button" onClick={aoRecomecar}>
          Importar outro documento
        </button>
      </div>
    </div>
  )
}

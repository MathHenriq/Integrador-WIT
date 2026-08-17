// =====================================================================
// O documento de aula do Canva
// =====================================================================
// Lê o PDF que a equipe exporta do Canva e devolve os campos e as fotos.
//
// Nada aqui derruba a importação: campo que não foi encontrado volta
// nulo e vira um espaço em branco na tela de conferência. Um documento
// fora do padrão tem que virar formulário meio preenchido, nunca uma
// parede — mesmo com o texto todo ilegível, extrair as fotos já poupa a
// maior parte do trabalho.
// =====================================================================

import { Documento, nomeDe } from './pdf.ts'
import { fotosDoDocumento, type FotoExtraida } from './imagens.ts'
import { textoDaPagina } from './texto.ts'

export type CamposCanva = {
  tema: string | null
  curso: string | null
  turma: string | null
  data: string | null
  data_lida: string | null
  professor: string | null
  escola: string | null
  objetivos: string | null
  descricao: string | null
  materiais: string | null
}

export type Extracao = {
  campos: CamposCanva
  relato: string
  fotos: FotoExtraida[]
  avisos: string[]
  paginas: number
  texto: string
}

// ---------------------------------------------------------------------
// Comparar texto sem depender de acento nem de caixa
// ---------------------------------------------------------------------

const COM_ACENTO = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇñÑ'
const SEM_ACENTO = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUCnN'

/**
 * Versão para busca: maiúsculas e sem acento, **com o mesmo tamanho** do
 * original. É o que permite achar o rótulo aqui e recortar o valor lá,
 * usando a mesma posição nos dois.
 */
function chaveDeBusca(texto: string) {
  let saida = ''
  for (const c of texto) {
    const k = COM_ACENTO.indexOf(c)
    saida += (k >= 0 ? SEM_ACENTO[k] : c).toUpperCase()
  }
  return saida
}

// ---------------------------------------------------------------------
// Os rótulos
// ---------------------------------------------------------------------

type Rotulo = { campo: keyof CamposCanva | 'fotos'; marca: RegExp; bloco: boolean }

const ROTULOS: Rotulo[] = [
  { campo: 'tema',       marca: /TEMA\s+DA\s+AULA/,                     bloco: false },
  { campo: 'curso',      marca: /\bCURSO\b/,                            bloco: false },
  { campo: 'turma',      marca: /\bTURMA\b/,                            bloco: false },
  { campo: 'data',       marca: /\bDATA\b/,                             bloco: false },
  { campo: 'professor',  marca: /\bPROF(?:\.|ESSOR(?:\(A\)|A)?)?/,      bloco: false },
  { campo: 'escola',     marca: /\bESCOLA\b/,                           bloco: false },
  { campo: 'objetivos',  marca: /OBJETIVOS\s+DE\s+APRENDIZAGEM/,        bloco: true  },
  { campo: 'descricao',  marca: /DESCRICAO\s+DA\s+AULA/,                bloco: true  },
  { campo: 'materiais',  marca: /MATERIAIS\s+E\s+RECURSOS\s+NECESSARIOS/, bloco: true },
  { campo: 'fotos',      marca: /\bFOTOS\b/,                            bloco: true  },
]

function limpar(valor: string, bloco: boolean) {
  let texto = valor
    .replace(/^[\s:;.\-–—]+/, '')
    .replace(/[\s]+$/, '')

  if (!bloco) {
    // Campo de uma linha: o que vier depois da quebra é de outro campo.
    texto = texto.split('\n')[0]
  }

  texto = texto
    .split('\n')
    .map((linha) => linha.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return texto || null
}

function lerCampos(texto: string) {
  const chave = chaveDeBusca(texto)

  const achados: { rotulo: Rotulo; inicio: number; fim: number }[] = []
  for (const rotulo of ROTULOS) {
    const marca = rotulo.marca.exec(chave)
    if (marca) achados.push({ rotulo, inicio: marca.index, fim: marca.index + marca[0].length })
  }

  achados.sort((a, b) => a.inicio - b.inicio)

  const campos: Record<string, string | null> = {}
  achados.forEach((achado, k) => {
    // O valor vai daqui até o próximo rótulo, seja ele qual for: a ordem
    // dos campos no documento pode mudar sem quebrar a leitura.
    const limite = achados[k + 1]?.inicio ?? texto.length
    campos[achado.rotulo.campo] = limpar(texto.slice(achado.fim, limite), achado.rotulo.bloco)
  })

  return campos
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------

const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * Devolve "AAAA-MM-DD" como string, montada na mão. Passar por `new
 * Date` traria de volta o bug do dia anterior no fuso do Brasil, que
 * este projeto já pagou uma vez.
 */
function lerData(bruto: string | null): string | null {
  if (!bruto) return null
  const texto = chaveDeBusca(bruto).toLowerCase()

  const numerica = texto.match(/(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})/)
  if (numerica) {
    const [, d, m, a] = numerica
    const ano = a.length === 2 ? 2000 + Number(a) : Number(a)
    return montar(ano, Number(m), Number(d))
  }

  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return montar(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const extensa = texto.match(/(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+)?(\d{4})/)
  if (extensa) {
    const mes = MESES.findIndex((m) => m.startsWith(extensa[2].slice(0, 3)))
    if (mes >= 0) return montar(Number(extensa[3]), mes + 1, Number(extensa[1]))
  }

  return null
}

function montar(ano: number, mes: number, dia: number) {
  if (!(ano >= 2000 && ano <= 2100) || !(mes >= 1 && mes <= 12) || !(dia >= 1 && dia <= 31)) return null
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// ---------------------------------------------------------------------
// O relato da vitrine
// ---------------------------------------------------------------------
// A descrição vem primeiro porque é o que conta como a aula foi. Os
// objetivos e os materiais entram embaixo, com título, porque é isso que
// ajuda outro professor a repetir a proposta na turma dele.

function montarRelato(campos: Record<string, string | null>) {
  const partes: string[] = []

  if (campos.descricao) partes.push(campos.descricao)
  if (campos.objetivos) partes.push(`Objetivos de aprendizagem\n${campos.objetivos}`)
  if (campos.materiais) partes.push(`Materiais e recursos\n${campos.materiais}`)

  return partes.join('\n\n')
}

function limparNome(valor: string | null) {
  if (!valor) return null
  const texto = valor.replace(/^\s*prof(?:\.|essor)?\s*\(?a?\)?\.?\s*/i, '').trim()
  return texto || null
}

// ---------------------------------------------------------------------
// A extração
// ---------------------------------------------------------------------

export async function extrairDoPdf(bytes: Uint8Array): Promise<Extracao> {
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') {
    throw new ErroDeLeitura('Este arquivo não parece um PDF. Exporte o documento do Canva em PDF e tente de novo.')
  }

  const doc = await Documento.abrir(bytes)

  // Documento cifrado: os fluxos vêm embaralhados e o que sairia daqui
  // seria lixo com cara de texto. O dicionário de cifra é reconhecível
  // pelo /Filter /Standard junto das chaves /O e /U.
  for (const [, objeto] of doc.todos()) {
    const dic = objeto.valor
    if (dic.tipo === 'dic' && nomeDe(dic.itens.Filter) === 'Standard' && dic.itens.O && dic.itens.U) {
      throw new ErroDeLeitura('Este PDF está protegido por senha. Exporte de novo, sem proteção.')
    }
  }

  const paginas = doc.paginas()
  if (paginas.length === 0) {
    throw new ErroDeLeitura('Não consegui abrir nenhuma página deste PDF. Ele pode estar corrompido.')
  }

  const avisos: string[] = []

  const pedacos: string[] = []
  for (const pagina of paginas) {
    try {
      pedacos.push(await textoDaPagina(doc, pagina.dic))
    } catch {
      avisos.push('Uma das páginas não pôde ser lida; o texto dela ficou de fora.')
    }
  }
  const texto = pedacos.join('\n').replace(/ /g, ' ')

  const lidos = lerCampos(texto)
  const { fotos, avisos: avisosDasFotos } = await fotosDoDocumento(doc)
  avisos.push(...avisosDasFotos)

  const campos: CamposCanva = {
    tema: lidos.tema ?? null,
    curso: lidos.curso ?? null,
    turma: lidos.turma ?? null,
    data: lerData(lidos.data ?? null),
    data_lida: lidos.data ?? null,
    professor: limparNome(lidos.professor ?? null),
    escola: lidos.escola ?? null,
    objetivos: lidos.objetivos ?? null,
    descricao: lidos.descricao ?? null,
    materiais: lidos.materiais ?? null,
  }

  const encontrados = Object.entries(campos).filter(
    ([nome, valor]) => nome !== 'data_lida' && valor !== null,
  ).length

  if (encontrados === 0) {
    avisos.unshift(
      'Não encontrei os rótulos do documento do Canva neste PDF. Confira todos os campos antes de publicar.',
    )
  } else if (encontrados < 4) {
    avisos.unshift('Reconheci poucos campos neste documento. Confira o que ficou em branco.')
  }

  if (campos.data_lida && !campos.data) {
    avisos.push(`Não entendi a data "${campos.data_lida}". Escolha no calendário.`)
  }
  if (fotos.length === 0) {
    avisos.push('Nenhuma foto foi encontrada no documento.')
  }

  return { campos, relato: montarRelato(lidos), fotos, avisos, paginas: paginas.length, texto }
}

export class ErroDeLeitura extends Error {}

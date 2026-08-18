// =====================================================================
// As fotos da aula
// =====================================================================
// O documento do Canva tem duas famílias de imagem misturadas: o
// cabeçalho e o rodapé do template, que se repetem em todas as páginas,
// e as fotos da aula, que aparecem uma vez só.
//
// A separação é por conteúdo, e não por objeto. A ideia original era
// contar em quantas páginas cada objeto aparece — apareceu em todas, é
// moldura —, mas o PDF de verdade do Canva grava o MESMO logo como um
// objeto por página. Cada um aparecia numa página só, nenhum era
// "repetido", e os dois logos subiam como se fossem foto da aula.
//
// Contando pelos bytes, o logo volta a ser o que é: uma imagem que
// aparece em todas as páginas. De quebra resolve a foto que o Canva
// duplica dentro do arquivo — ela entra uma vez só.
// =====================================================================

import { Documento, FILTROS_DE_IMAGEM, ehDic, nomeDe, numeroDe, type Valor } from './pdf.ts'

export type FotoExtraida = {
  objeto: number
  largura: number
  altura: number
  tipo: string
  extensao: string
  bytes: Uint8Array
}

/** Abaixo disto é ícone, marca d'água ou fio de moldura — não é foto. */
const LADO_MINIMO = 120

// ---------------------------------------------------------------------
// Quem usa o quê
// ---------------------------------------------------------------------

/**
 * As imagens de uma página. O /XObject de uma página pode apontar para
 * um formulário, que por sua vez tem os seus próprios recursos — daí a
 * descida recursiva, com limite para não girar em arquivo com ciclo.
 */
function imagensDaPagina(doc: Documento, pagina: Valor, achadas = new Set<number>(), nivel = 0) {
  if (nivel > 6) return achadas

  for (const referencia of Object.values(doc.recursos(pagina, 'XObject'))) {
    if (referencia.tipo !== 'ref') continue
    const alvo = doc.resolver(referencia)
    if (!ehDic(alvo)) continue

    const subtipo = nomeDe(alvo.itens.Subtype)
    if (subtipo === 'Image') {
      achadas.add(referencia.num)
    } else if (subtipo === 'Form') {
      imagensDaPagina(doc, alvo, achadas, nivel + 1)
    }
  }

  return achadas
}

// ---------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------
// Imagem que veio comprimida em Flate são amostras cruas, não um
// arquivo. Empacotar em PNG é barato: o IDAT é exatamente um fluxo zlib,
// que é o que o CompressionStream produz.

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[n] = c >>> 0
  }
  return tabela
})()

function crc32(dados: Uint8Array) {
  let c = 0xffffffff
  for (const b of dados) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pedaco(tipo: string, dados: Uint8Array) {
  const corpo = new Uint8Array(4 + dados.length)
  for (let k = 0; k < 4; k++) corpo[k] = tipo.charCodeAt(k)
  corpo.set(dados, 4)

  const saida = new Uint8Array(corpo.length + 8)
  const visao = new DataView(saida.buffer)
  visao.setUint32(0, dados.length)
  saida.set(corpo, 4)
  visao.setUint32(saida.length - 4, crc32(corpo))
  return saida
}

async function montarPng(largura: number, altura: number, cores: number, amostras: Uint8Array) {
  const porLinha = largura * cores
  // Cada linha do PNG começa com o byte que diz o filtro usado nela;
  // aqui é sempre 0, "sem filtro".
  const comFiltro = new Uint8Array((porLinha + 1) * altura)
  for (let l = 0; l < altura; l++) {
    comFiltro[l * (porLinha + 1)] = 0
    comFiltro.set(amostras.subarray(l * porLinha, (l + 1) * porLinha), l * (porLinha + 1) + 1)
  }

  const comprimido = new Uint8Array(
    await new Response(
      new Blob([comFiltro as BlobPart]).stream().pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  )

  const cabecalho = new Uint8Array(13)
  const visao = new DataView(cabecalho.buffer)
  visao.setUint32(0, largura)
  visao.setUint32(4, altura)
  cabecalho[8] = 8 // bits por componente
  cabecalho[9] = cores === 1 ? 0 : cores === 4 ? 6 : 2 // cinza, RGBA ou RGB
  // 10, 11 e 12 ficam em zero: compressão, filtro e entrelaçamento padrão.

  const partes = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', cabecalho),
    pedaco('IDAT', comprimido),
    pedaco('IEND', new Uint8Array()),
  ]

  const total = partes.reduce((soma, p) => soma + p.length, 0)
  const png = new Uint8Array(total)
  let posicao = 0
  for (const parte of partes) {
    png.set(parte, posicao)
    posicao += parte.length
  }
  return png
}

// ---------------------------------------------------------------------
// Espaço de cor
// ---------------------------------------------------------------------

function componentes(doc: Documento, espaco: Valor | undefined): number | null {
  const nome = nomeDe(espaco)
  if (nome === 'DeviceRGB' || nome === 'CalRGB') return 3
  if (nome === 'DeviceGray' || nome === 'CalGray') return 1
  if (nome === 'DeviceCMYK') return 4

  if (espaco?.tipo === 'lista' && espaco.itens.length > 0) {
    const familia = nomeDe(espaco.itens[0])
    if (familia === 'ICCBased') {
      return numeroDe(doc.item(doc.resolver(espaco.itens[1]), 'N')) ?? null
    }
    if (familia === 'DeviceN' || familia === 'Separation') return null
    if (familia === 'Indexed') return null
    if (familia === 'CalRGB') return 3
    if (familia === 'CalGray') return 1
  }

  return null
}

// ---------------------------------------------------------------------
// A extração
// ---------------------------------------------------------------------

export async function fotosDoDocumento(doc: Documento) {
  const paginas = doc.paginas()
  const paginasPorObjeto = new Map<number, Set<number>>()

  paginas.forEach((pagina, indice) => {
    for (const num of imagensDaPagina(doc, pagina.dic)) {
      const onde = paginasPorObjeto.get(num) ?? new Set<number>()
      onde.add(indice)
      paginasPorObjeto.set(num, onde)
    }
  })

  const avisos: string[] = []
  let descartadasPorTamanho = 0

  /** Uma imagem já decodificada, pronta para virar foto — ou para ser descartada. */
  type Candidata = FotoExtraida & { chave: string; paginas: Set<number> }
  const candidatas: Candidata[] = []

  for (const [num, onde] of [...paginasPorObjeto].sort((a, b) => a[0] - b[0])) {
    const objeto = doc.objeto(num)
    if (!objeto?.bruto || !ehDic(objeto.valor)) continue

    const largura = numeroDe(doc.resolver(objeto.valor.itens.Width)) ?? 0
    const altura = numeroDe(doc.resolver(objeto.valor.itens.Height)) ?? 0

    if (largura < LADO_MINIMO || altura < LADO_MINIMO) {
      descartadasPorTamanho++
      continue
    }

    // Máscara de transparência é um objeto de imagem como outro
    // qualquer; entraria na lista como se fosse foto.
    if (nomeDe(doc.resolver(objeto.valor.itens.ImageMask)) || objeto.valor.itens.ImageMask?.tipo === 'bool') {
      continue
    }

    const filtros = objeto.valor.itens.Filter
    const nomesFiltro = filtros
      ? filtros.tipo === 'lista'
        ? filtros.itens.map((f) => nomeDe(f)).filter((n): n is string => !!n)
        : [nomeDe(filtros)].filter((n): n is string => !!n)
      : []
    const filtroDeImagem = nomesFiltro.find((f) => FILTROS_DE_IMAGEM.has(f))

    if (filtroDeImagem && filtroDeImagem !== 'DCTDecode') {
      avisos.push(`Uma imagem de ${largura}×${altura} veio num formato que não sei ler (${filtroDeImagem}).`)
      continue
    }

    let dados: Uint8Array
    try {
      dados = await doc.conteudo(objeto)
    } catch {
      avisos.push(`Uma imagem de ${largura}×${altura} veio corrompida e ficou de fora.`)
      continue
    }

    let bytes: Uint8Array
    let tipo: string
    let extensao: string

    if (filtroDeImagem === 'DCTDecode') {
      // Os bytes já são um JPEG completo.
      bytes = dados
      tipo = 'image/jpeg'
      extensao = 'jpg'
    } else {
      const bits = numeroDe(doc.resolver(objeto.valor.itens.BitsPerComponent)) ?? 8
      const cores = componentes(doc, doc.resolver(objeto.valor.itens.ColorSpace))

      if (bits !== 8 || cores === null || cores === 4) {
        avisos.push(`Uma imagem de ${largura}×${altura} usa um espaço de cor que não sei converter.`)
        continue
      }

      if (dados.length < largura * altura * cores) {
        avisos.push(`Uma imagem de ${largura}×${altura} veio incompleta e ficou de fora.`)
        continue
      }

      try {
        bytes = await montarPng(largura, altura, cores, dados)
        tipo = 'image/png'
        extensao = 'png'
      } catch {
        avisos.push(`Não consegui converter uma imagem de ${largura}×${altura}.`)
        continue
      }
    }

    candidatas.push({
      objeto: num,
      largura,
      altura,
      tipo,
      extensao,
      bytes,
      chave: await impressaoDigital(bytes),
      paginas: onde,
    })
  }

  // Em quantas páginas cada CONTEÚDO aparece — não cada objeto.
  const paginasPorConteudo = new Map<string, Set<number>>()
  for (const c of candidatas) {
    const onde = paginasPorConteudo.get(c.chave) ?? new Set<number>()
    for (const p of c.paginas) onde.add(p)
    paginasPorConteudo.set(c.chave, onde)
  }

  const fotos: FotoExtraida[] = []
  const jaEntraram = new Set<string>()
  let descartadasPorRepeticao = 0
  let descartadasPorCopia = 0

  for (const candidata of candidatas) {
    // A regra do template. Num documento de página única não há
    // "repetir em todas", então ela não se aplica.
    const espalhada = (paginasPorConteudo.get(candidata.chave)?.size ?? 0) >= paginas.length
    if (paginas.length >= 2 && espalhada) {
      if (!jaEntraram.has(candidata.chave)) descartadasPorRepeticao++
      jaEntraram.add(candidata.chave)
      continue
    }

    if (jaEntraram.has(candidata.chave)) {
      descartadasPorCopia++
      continue
    }

    jaEntraram.add(candidata.chave)
    const { chave: _chave, paginas: _paginas, ...foto } = candidata
    fotos.push(foto)
  }

  if (descartadasPorRepeticao > 0) {
    avisos.push(
      `${descartadasPorRepeticao} imagem(ns) apareciam em todas as páginas e foram tratadas como ` +
        'cabeçalho e rodapé do template.',
    )
  }
  if (descartadasPorCopia > 0) {
    avisos.push(`${descartadasPorCopia} foto(s) estavam repetidas no arquivo e entraram uma vez só.`)
  }
  if (descartadasPorTamanho > 0) {
    avisos.push(`${descartadasPorTamanho} imagem(ns) pequenas demais para serem foto ficaram de fora.`)
  }

  return { fotos, avisos }
}

/** Os bytes resumidos em hexadecimal, para reconhecer imagem repetida. */
async function impressaoDigital(bytes: Uint8Array) {
  const digestao = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  return [...new Uint8Array(digestao)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

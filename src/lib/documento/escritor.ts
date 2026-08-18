// =====================================================================
// Escritor de PDF — só o suficiente para o documento do Núcleo WIT
// =====================================================================
// A contrapartida do `importar-canva/pdf.ts`: aquele lê, este escreve.
// Também sem biblioteca, pelos mesmos motivos — e por mais um: escrever
// é muito mais simples do que ler. O documento precisa de quatro coisas:
// retângulos, texto, fotos em JPEG e páginas.
//
// A fonte é a Helvetica-Bold, uma das 14 que todo visualizador de PDF
// tem, escolhida por medida: o documento do Canva usa Arial-BoldMT em
// 98% do texto, e Arial e Helvetica têm **as mesmas larguras de glifo**.
// O texto cai onde caía, sem embutir arquivo de fonte nenhum.
// =====================================================================

/** Larguras da Helvetica-Bold, em milésimos, do espaço ao "~". */
const LARGURAS_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/**
 * A letra com acento tem a largura da letra sem acento — é assim na
 * Helvetica e na Arial. Uma tabela de equivalência resolve o português
 * inteiro sem repetir número nenhum.
 */
const SEM_ACENTO: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i', ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u', ç: 'c', ñ: 'n',
  Á: 'A', À: 'A', Â: 'A', Ã: 'A', Ä: 'A', É: 'E', È: 'E', Ê: 'E', Ë: 'E',
  Í: 'I', Ì: 'I', Î: 'I', Ï: 'I', Ó: 'O', Ò: 'O', Ô: 'O', Õ: 'O', Ö: 'O',
  Ú: 'U', Ù: 'U', Û: 'U', Ü: 'U', Ç: 'C', Ñ: 'N',
  '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '.',
  º: 'o', ª: 'a', '•': 'o',
}

/** Códigos do WinAnsi que não são o próprio Unicode. */
const WINANSI_ESPECIAIS: Record<string, number> = {
  '–': 0x96, '—': 0x97, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92,
  '…': 0x85, '•': 0x95, '€': 0x80,
}

function larguraDaLetra(c: string) {
  const base = SEM_ACENTO[c] ?? c
  const codigo = base.charCodeAt(0)
  return LARGURAS_ASCII[codigo - 32] ?? 556
}

/** Quanto o texto ocupa, em pontos. */
export function larguraDoTexto(texto: string, tamanho: number) {
  let total = 0
  for (const c of texto) total += larguraDaLetra(c)
  return (total / 1000) * tamanho
}

/**
 * Quebra o texto na largura disponível, respeitando as quebras que já
 * vieram digitadas. Palavra maior que a linha é cortada na força — vale
 * mais partir o miolo de um endereço do que deixar o texto sair da caixa.
 */
export function quebrarLinhas(texto: string, tamanho: number, largura: number) {
  const linhas: string[] = []

  for (const paragrafo of texto.split('\n')) {
    let atual = ''
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual === '' ? palavra : `${atual} ${palavra}`
      if (larguraDoTexto(tentativa, tamanho) <= largura) {
        atual = tentativa
        continue
      }
      if (atual !== '') linhas.push(atual)
      atual = palavra
      while (larguraDoTexto(atual, tamanho) > largura && atual.length > 1) {
        let corte = atual.length - 1
        while (corte > 1 && larguraDoTexto(atual.slice(0, corte), tamanho) > largura) corte--
        linhas.push(atual.slice(0, corte))
        atual = atual.slice(corte)
      }
    }
    linhas.push(atual)
  }

  return linhas
}

/** O texto como string literal de PDF, em WinAnsi. */
function comoTextoPdf(texto: string) {
  let saida = '('
  for (const c of texto) {
    let codigo = WINANSI_ESPECIAIS[c] ?? c.charCodeAt(0)
    if (codigo > 255) {
      // Fora do WinAnsi: cai para a letra sem acento, que existe sempre.
      codigo = (SEM_ACENTO[c] ?? '?').charCodeAt(0)
    }
    if (codigo === 0x28 || codigo === 0x29 || codigo === 0x5c) saida += '\\'
    saida += codigo < 32 || codigo > 126 ? `\\${codigo.toString(8).padStart(3, '0')}` : String.fromCharCode(codigo)
  }
  return saida + ')'
}

function n(valor: number) {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(3)
}

// ---------------------------------------------------------------------
// O conteúdo de uma página
// ---------------------------------------------------------------------

export class Conteudo {
  private partes: string[] = []

  /** Retângulo com borda preta e miolo branco, como as caixas do modelo. */
  caixa(x: number, y: number, largura: number, altura: number, espessura = 1) {
    this.partes.push(
      `1 1 1 rg 0 0 0 RG ${n(espessura)} w`,
      `${n(x)} ${n(y)} ${n(largura)} ${n(altura)} re B`,
    )
    return this
  }

  /** Uma linha de texto, com a base à esquerda em (x, y). */
  texto(x: number, y: number, tamanho: number, texto: string) {
    if (texto === '') return this
    this.partes.push(
      'BT 0 0 0 rg',
      `/F1 ${n(tamanho)} Tf`,
      `1 0 0 1 ${n(x)} ${n(y)} Tm`,
      `${comoTextoPdf(texto)} Tj`,
      'ET',
    )
    return this
  }

  /**
   * Um bloco que se quebra sozinho na largura dada. Devolve a altura em
   * que parou, para quem chamou saber se ainda cabe alguma coisa.
   */
  bloco(
    x: number,
    y: number,
    tamanho: number,
    largura: number,
    entrelinha: number,
    texto: string,
    comMarcador = false,
  ) {
    let altura = y
    for (const paragrafo of texto.split('\n')) {
      if (paragrafo.trim() === '') continue
      const linhas = quebrarLinhas(paragrafo, tamanho, comMarcador ? largura - 9 : largura)
      linhas.forEach((linha, k) => {
        if (comMarcador && k === 0) this.texto(x - 9, altura, tamanho, '•')
        this.texto(x, altura, tamanho, linha)
        altura -= entrelinha
      })
    }
    return altura
  }

  /** A foto, já no lugar e no tamanho certos. */
  imagem(apelido: string, x: number, y: number, largura: number, altura: number) {
    this.partes.push(`q ${n(largura)} 0 0 ${n(altura)} ${n(x)} ${n(y)} cm /${apelido} Do Q`)
    return this
  }

  fluxo() {
    return new TextEncoder().encode(this.partes.join('\n') + '\n')
  }
}

// ---------------------------------------------------------------------
// O arquivo
// ---------------------------------------------------------------------

type Objeto = { dicionario: string; fluxo?: Uint8Array }

export type ImagemPdf = {
  apelido: string
  /** Já no formato final: o JPEG inteiro, ou as amostras em Flate. */
  bytes: Uint8Array
  largura: number
  altura: number
  /** 1 = cinza, 3 = RGB. */
  cores: number
  /** JPEG entra como veio; amostras cruas entram comprimidas em Flate. */
  filtro: 'DCTDecode' | 'FlateDecode'
}

export class Documento {
  private objetos: Objeto[] = []
  private paginas: { conteudo: Conteudo; imagens: ImagemPdf[] }[] = []

  readonly largura: number
  readonly altura: number

  constructor(largura: number, altura: number) {
    this.largura = largura
    this.altura = altura
  }

  pagina(conteudo: Conteudo, imagens: ImagemPdf[] = []) {
    this.paginas.push({ conteudo, imagens })
  }

  private novo(dicionario: string, fluxo?: Uint8Array) {
    this.objetos.push({ dicionario, fluxo })
    return this.objetos.length
  }

  /** Fecha o documento e devolve os bytes do arquivo. */
  montar(): Uint8Array {
    const numFonte = this.novo(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    )

    // O nó das páginas precisa existir antes delas (é o /Parent), mas o
    // dicionário só fica pronto no fim, quando se sabe quem são os filhos.
    const numPaginas = this.novo('')
    const numsDePagina: number[] = []

    for (const { conteudo, imagens } of this.paginas) {
      const fluxo = conteudo.fluxo()
      const numConteudo = this.novo(`<< /Length ${fluxo.length} >>`, fluxo)

      const recursos: string[] = []
      for (const imagem of imagens) {
        const num = this.novo(
          `<< /Type /XObject /Subtype /Image /Width ${imagem.largura} /Height ${imagem.altura} ` +
            `/ColorSpace /${imagem.cores === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 ` +
            `/Filter /${imagem.filtro} /Length ${imagem.bytes.length} >>`,
          imagem.bytes,
        )
        recursos.push(`/${imagem.apelido} ${num} 0 R`)
      }

      numsDePagina.push(
        this.novo(
          `<< /Type /Page /Parent ${numPaginas} 0 R /MediaBox [0 0 ${n(this.largura)} ${n(this.altura)}] ` +
            `/Contents ${numConteudo} 0 R /Resources << /Font << /F1 ${numFonte} 0 R >> ` +
            `/XObject << ${recursos.join(' ')} >> >> >>`,
        ),
      )
    }

    this.objetos[numPaginas - 1].dicionario =
      `<< /Type /Pages /Count ${numsDePagina.length} /Kids [${numsDePagina.map((p) => `${p} 0 R`).join(' ')}] >>`

    return this.serializar(this.novo(`<< /Type /Catalog /Pages ${numPaginas} 0 R >>`))
  }

  private serializar(numCatalogo: number) {
    const partes: Uint8Array[] = []
    const codificar = (s: string) => new TextEncoder().encode(s)
    let posicao = 0
    const empurrar = (bytes: Uint8Array) => {
      partes.push(bytes)
      posicao += bytes.length
    }

    empurrar(codificar('%PDF-1.7\n'))
    // A linha de bytes altos que todo PDF traz para dizer "isto é binário".
    empurrar(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

    const enderecos: number[] = []
    this.objetos.forEach((objeto, k) => {
      enderecos.push(posicao)
      empurrar(codificar(`${k + 1} 0 obj\n${objeto.dicionario}\n`))
      if (objeto.fluxo) {
        empurrar(codificar('stream\n'))
        empurrar(objeto.fluxo)
        empurrar(codificar('\nendstream\n'))
      }
      empurrar(codificar('endobj\n'))
    })

    const inicioXref = posicao
    let xref = `xref\n0 ${this.objetos.length + 1}\n0000000000 65535 f \n`
    for (const endereco of enderecos) xref += `${String(endereco).padStart(10, '0')} 00000 n \n`
    xref += `trailer\n<< /Size ${this.objetos.length + 1} /Root ${numCatalogo} 0 R >>\n`
    xref += `startxref\n${inicioXref}\n%%EOF\n`
    empurrar(codificar(xref))

    const total = partes.reduce((soma, p) => soma + p.length, 0)
    const arquivo = new Uint8Array(total)
    let onde = 0
    for (const parte of partes) {
      arquivo.set(parte, onde)
      onde += parte.length
    }
    return arquivo
  }
}

// ---------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------

/**
 * Largura, altura e número de cores de um JPEG, lidos do marcador SOF.
 * É a única coisa que precisamos saber do arquivo: os bytes entram
 * inteiros no PDF, com o filtro /DCTDecode, sem descompactar nada.
 */
export function medidasDoJpeg(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let k = 2
  while (k + 9 < bytes.length) {
    if (bytes[k] !== 0xff) {
      k++
      continue
    }
    const marcador = bytes[k + 1]
    // SOF0..SOF15, menos os três que não carregam medidas (DHT, JPG, DAC).
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      const altura = (bytes[k + 5] << 8) | bytes[k + 6]
      const largura = (bytes[k + 7] << 8) | bytes[k + 8]
      const cores = bytes[k + 9] === 1 ? 1 : 3
      return largura > 0 && altura > 0 ? { largura, altura, cores } : null
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      k += 2
      continue
    }
    const tamanho = (bytes[k + 2] << 8) | bytes[k + 3]
    if (tamanho < 2) return null
    k += 2 + tamanho
  }

  return null
}

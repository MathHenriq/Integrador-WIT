// =====================================================================
// Leitor de PDF — só o suficiente para o documento do Canva
// =====================================================================
// Não é uma biblioteca de PDF: é o pedaço do formato que este projeto
// precisa (texto das páginas e imagens embutidas), escrito à mão e sem
// dependência nenhuma. Três motivos para não trazer o pdf.js:
//
//   1. ele resolve o texto mas não entrega as imagens sem um canvas;
//   2. custa cerca de um megabyte no arranque frio da Edge Function;
//   3. este arquivo usa só APIs da plataforma (DecompressionStream,
//      TextDecoder), então roda igual no Deno e no Node — é o que
//      permite testar o extrator sem deployar nada.
//
// Referência do formato: PDF 32000-1:2008, seções 7.3 (objetos), 7.4
// (filtros), 8.9 (imagens) e 9.10 (extração de texto).
// =====================================================================

export type Valor =
  | { tipo: 'num'; valor: number }
  | { tipo: 'nome'; valor: string }
  | { tipo: 'texto'; valor: string }
  | { tipo: 'bool'; valor: boolean }
  | { tipo: 'nulo' }
  | { tipo: 'ref'; num: number }
  | { tipo: 'lista'; itens: Valor[] }
  | { tipo: 'dic'; itens: Record<string, Valor> }

export type Objeto = {
  valor: Valor
  /** Bytes crus do stream, ainda com os filtros aplicados. */
  bruto: Uint8Array | null
}

const ESPACOS = new Set([' ', '\t', '\r', '\n', '\f', '\0'])
const DELIMITADORES = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%'])

// ---------------------------------------------------------------------
// Leitura de valores
// ---------------------------------------------------------------------
// O arquivo inteiro vira uma string "latin1" (um byte, um caractere), o
// que mantém as posições idênticas às do arquivo e ainda permite usar
// regex e indexOf para achar as marcas do formato. Os bytes de verdade
// continuam disponíveis no Uint8Array original.

export class Leitor {
  s: string
  i: number

  constructor(s: string, i = 0) {
    this.s = s
    this.i = i
  }

  fim() {
    return this.i >= this.s.length
  }

  pularBranco() {
    for (;;) {
      while (this.i < this.s.length && ESPACOS.has(this.s[this.i])) this.i++
      // Comentário vai até o fim da linha.
      if (this.s[this.i] === '%') {
        while (this.i < this.s.length && this.s[this.i] !== '\n' && this.s[this.i] !== '\r') this.i++
      } else {
        return
      }
    }
  }

  /** Palavra crua: usada para operadores de content stream e para `R`. */
  lerPalavra() {
    this.pularBranco()
    const inicio = this.i
    while (this.i < this.s.length && !ESPACOS.has(this.s[this.i]) && !DELIMITADORES.has(this.s[this.i])) {
      this.i++
    }
    return this.s.slice(inicio, this.i)
  }

  lerValor(): Valor {
    this.pularBranco()
    if (this.fim()) return { tipo: 'nulo' }

    const c = this.s[this.i]

    if (c === '/') return { tipo: 'nome', valor: this.lerNome() }
    if (c === '(') return { tipo: 'texto', valor: this.lerTextoLiteral() }
    if (c === '[') return this.lerLista()
    if (c === '<') {
      return this.s[this.i + 1] === '<'
        ? this.lerDicionario()
        : { tipo: 'texto', valor: this.lerTextoHex() }
    }

    const palavra = this.lerPalavra()
    if (palavra === 'true') return { tipo: 'bool', valor: true }
    if (palavra === 'false') return { tipo: 'bool', valor: false }
    if (palavra === 'null' || palavra === '') return { tipo: 'nulo' }

    const numero = Number(palavra)
    if (!Number.isFinite(numero)) return { tipo: 'nulo' }

    // "12 0 R" é uma referência; "12 0" seguido de outra coisa são dois
    // números. Só dá para saber olhando à frente e voltando se não for.
    if (Number.isInteger(numero) && numero > 0) {
      const volta = this.i
      const geracao = this.lerPalavra()
      if (/^\d+$/.test(geracao)) {
        const marca = this.lerPalavra()
        if (marca === 'R') return { tipo: 'ref', num: numero }
      }
      this.i = volta
    }

    return { tipo: 'num', valor: numero }
  }

  lerNome() {
    this.i++ // a barra
    let saida = ''
    while (this.i < this.s.length) {
      const c = this.s[this.i]
      if (ESPACOS.has(c) || DELIMITADORES.has(c)) break
      if (c === '#') {
        saida += String.fromCharCode(parseInt(this.s.substr(this.i + 1, 2), 16) || 0)
        this.i += 3
      } else {
        saida += c
        this.i++
      }
    }
    return saida
  }

  lerTextoLiteral() {
    this.i++ // o parêntese
    let saida = ''
    let nivel = 1

    while (this.i < this.s.length) {
      const c = this.s[this.i++]

      if (c === '\\') {
        const e = this.s[this.i++]
        if (e === 'n') saida += '\n'
        else if (e === 'r') saida += '\r'
        else if (e === 't') saida += '\t'
        else if (e === 'b') saida += '\b'
        else if (e === 'f') saida += '\f'
        else if (e === '\n') continue
        else if (e === '\r') {
          if (this.s[this.i] === '\n') this.i++
          continue
        } else if (e >= '0' && e <= '7') {
          let oct = e
          while (oct.length < 3 && this.s[this.i] >= '0' && this.s[this.i] <= '7') oct += this.s[this.i++]
          saida += String.fromCharCode(parseInt(oct, 8))
        } else {
          saida += e
        }
        continue
      }

      if (c === '(') nivel++
      if (c === ')') {
        nivel--
        if (nivel === 0) break
      }
      saida += c
    }

    return saida
  }

  lerTextoHex() {
    this.i++ // o menor-que
    let hex = ''
    while (this.i < this.s.length && this.s[this.i] !== '>') {
      const c = this.s[this.i++]
      if (!ESPACOS.has(c)) hex += c
    }
    this.i++ // o maior-que

    if (hex.length % 2 === 1) hex += '0'
    let saida = ''
    for (let k = 0; k < hex.length; k += 2) saida += String.fromCharCode(parseInt(hex.substr(k, 2), 16) || 0)
    return saida
  }

  lerLista(): Valor {
    this.i++ // o colchete
    const itens: Valor[] = []
    for (;;) {
      this.pularBranco()
      if (this.fim() || this.s[this.i] === ']') {
        this.i++
        break
      }
      const antes = this.i
      itens.push(this.lerValor())
      if (this.i === antes) {
        this.i++ // destrava em arquivo corrompido
      }
    }
    return { tipo: 'lista', itens }
  }

  lerDicionario(): Valor {
    this.i += 2 // os dois menor-que
    const itens: Record<string, Valor> = {}
    for (;;) {
      this.pularBranco()
      if (this.fim()) break
      if (this.s[this.i] === '>' && this.s[this.i + 1] === '>') {
        this.i += 2
        break
      }
      if (this.s[this.i] !== '/') {
        // Chave estranha: pula um byte para não travar.
        this.i++
        continue
      }
      const chave = this.lerNome()
      itens[chave] = this.lerValor()
    }
    return { tipo: 'dic', itens }
  }
}

// ---------------------------------------------------------------------
// Atalhos de leitura
// ---------------------------------------------------------------------

export function ehDic(v: Valor | undefined): v is { tipo: 'dic'; itens: Record<string, Valor> } {
  return !!v && v.tipo === 'dic'
}

export function nomeDe(v: Valor | undefined): string | null {
  return v && v.tipo === 'nome' ? v.valor : null
}

export function numeroDe(v: Valor | undefined): number | null {
  return v && v.tipo === 'num' ? v.valor : null
}

// ---------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  // Quase todo PDF usa zlib; alguns produtores gravam deflate cru. Tenta
  // os dois em vez de decidir pelo primeiro byte, que nem sempre ajuda.
  for (const formato of ['deflate', 'deflate-raw'] as const) {
    try {
      const fluxo = new Blob([dados as BlobPart]).stream().pipeThrough(new DecompressionStream(formato))
      return new Uint8Array(await new Response(fluxo).arrayBuffer())
    } catch {
      // tenta o próximo
    }
  }
  throw new Error('fluxo comprimido ilegível')
}

/**
 * Desfaz o preditor PNG (Predictor >= 10). Os dados chegam em linhas de
 * `colunas * cores` bytes, cada uma precedida do byte que diz qual
 * filtro foi usado nela.
 */
function desfazerPreditor(dados: Uint8Array, colunas: number, cores: number, bits: number) {
  const porPixel = Math.max(1, Math.ceil((cores * bits) / 8))
  const porLinha = Math.ceil((colunas * cores * bits) / 8)
  const linhas = Math.floor(dados.length / (porLinha + 1))
  const saida = new Uint8Array(linhas * porLinha)

  let anterior = new Uint8Array(porLinha)

  for (let l = 0; l < linhas; l++) {
    const tipo = dados[l * (porLinha + 1)]
    const linha = dados.subarray(l * (porLinha + 1) + 1, (l + 1) * (porLinha + 1))
    const atual = new Uint8Array(porLinha)

    for (let k = 0; k < porLinha; k++) {
      const cru = linha[k] ?? 0
      const a = k >= porPixel ? atual[k - porPixel] : 0
      const b = anterior[k]
      const c = k >= porPixel ? anterior[k - porPixel] : 0

      let valor: number
      switch (tipo) {
        case 0: valor = cru; break
        case 1: valor = cru + a; break
        case 2: valor = cru + b; break
        case 3: valor = cru + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          valor = cru + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: valor = cru
      }
      atual[k] = valor & 0xff
    }

    saida.set(atual, l * porLinha)
    anterior = atual
  }

  return saida
}

function deHex(dados: Uint8Array) {
  let hex = ''
  for (const b of dados) {
    const c = String.fromCharCode(b)
    if (c === '>') break
    if (!ESPACOS.has(c)) hex += c
  }
  if (hex.length % 2 === 1) hex += '0'
  const saida = new Uint8Array(hex.length / 2)
  for (let k = 0; k < saida.length; k++) saida[k] = parseInt(hex.substr(k * 2, 2), 16) || 0
  return saida
}

/** Filtros de imagem: os bytes já são um arquivo, não há o que desfazer. */
export const FILTROS_DE_IMAGEM = new Set(['DCTDecode', 'JPXDecode', 'JBIG2Decode', 'CCITTFaxDecode'])

function listaDeNomes(v: Valor | undefined): string[] {
  if (!v) return []
  if (v.tipo === 'nome') return [v.valor]
  if (v.tipo === 'lista') return v.itens.map((i) => nomeDe(i)).filter((n): n is string => !!n)
  return []
}

// ---------------------------------------------------------------------
// O documento
// ---------------------------------------------------------------------

export class Documento {
  bytes: Uint8Array
  bin: string
  private objetos = new Map<number, Objeto>()

  private constructor(bytes: Uint8Array, bin: string) {
    this.bytes = bytes
    this.bin = bin
  }

  static async abrir(bytes: Uint8Array) {
    const doc = new Documento(bytes, paraBinario(bytes))
    doc.varrer()
    await doc.expandirFluxosDeObjetos()
    return doc
  }

  /**
   * Varre o arquivo inteiro atrás de "N G obj" em vez de seguir a tabela
   * xref. É mais tolerante: PDF com xref quebrada, incremental ou com
   * lixo no fim continua legível, e o custo é uma passada só.
   */
  private varrer() {
    const marca = /(\d+)\s+(\d+)\s+obj\b/g
    let achado: RegExpExecArray | null

    while ((achado = marca.exec(this.bin)) !== null) {
      const num = Number(achado[1])
      const corpo = achado.index + achado[0].length
      const objeto = this.lerCorpo(corpo)
      // Atualização incremental grava o objeto de novo mais adiante no
      // arquivo; a última versão é a que vale.
      if (objeto) this.objetos.set(num, objeto)
    }
  }

  private lerCorpo(inicio: number): Objeto | null {
    const leitor = new Leitor(this.bin, inicio)
    let valor: Valor
    try {
      valor = leitor.lerValor()
    } catch {
      return null
    }

    leitor.pularBranco()
    if (!this.bin.startsWith('stream', leitor.i)) return { valor, bruto: null }

    let p = leitor.i + 'stream'.length
    if (this.bin[p] === '\r') p++
    if (this.bin[p] === '\n') p++

    // O /Length às vezes é uma referência, e há arquivo por aí com
    // /Length errado. Confere contra o "endstream" e, na dúvida, procura.
    let tamanho = -1
    if (ehDic(valor)) {
      const declarado = valor.itens.Length
      if (declarado?.tipo === 'num') tamanho = declarado.valor
      else if (declarado?.tipo === 'ref') tamanho = numeroDe(this.objetos.get(declarado.num)?.valor) ?? -1
    }

    const confere = tamanho >= 0 && /^\s*endstream/.test(this.bin.substr(p + tamanho, 20))
    if (!confere) {
      const fim = this.bin.indexOf('endstream', p)
      tamanho = fim < 0 ? this.bin.length - p : fim - p
      // O "endstream" vem depois da quebra de linha que fecha os dados.
      if (this.bin[p + tamanho - 1] === '\n') tamanho--
      if (this.bin[p + tamanho - 1] === '\r') tamanho--
    }

    return { valor, bruto: this.bytes.subarray(p, p + Math.max(0, tamanho)) }
  }

  /**
   * PDF moderno guarda a maioria dos dicionários dentro de fluxos
   * comprimidos (/ObjStm). Sem abrir esses fluxos, as páginas e as
   * fontes simplesmente não existem para quem só varreu o arquivo.
   */
  private async expandirFluxosDeObjetos() {
    for (const [, objeto] of [...this.objetos]) {
      if (!ehDic(objeto.valor) || nomeDe(objeto.valor.itens.Type) !== 'ObjStm') continue

      let dados: Uint8Array
      try {
        dados = await this.conteudo(objeto)
      } catch {
        continue
      }

      const bin = paraBinario(dados)
      const quantos = numeroDe(this.resolver(objeto.valor.itens.N)) ?? 0
      const primeiro = numeroDe(this.resolver(objeto.valor.itens.First)) ?? 0

      // O cabeçalho é uma sequência de pares "número deslocamento".
      const cabecalho = new Leitor(bin, 0)
      const pares: { num: number; desloc: number }[] = []
      for (let k = 0; k < quantos; k++) {
        const num = Number(cabecalho.lerPalavra())
        const desloc = Number(cabecalho.lerPalavra())
        if (!Number.isFinite(num) || !Number.isFinite(desloc)) break
        pares.push({ num, desloc })
      }

      for (const { num, desloc } of pares) {
        // Objeto solto no arquivo ganha do que veio de dentro do fluxo:
        // é o que uma atualização incremental teria reescrito.
        if (this.objetos.has(num)) continue
        try {
          this.objetos.set(num, { valor: new Leitor(bin, primeiro + desloc).lerValor(), bruto: null })
        } catch {
          // objeto ilegível dentro do fluxo: ignora e segue
        }
      }
    }
  }

  resolver(v: Valor | undefined): Valor | undefined {
    let atual = v
    // Referência para referência é raro mas existe; o limite evita ciclo.
    for (let voltas = 0; atual?.tipo === 'ref' && voltas < 16; voltas++) {
      atual = this.objetos.get(atual.num)?.valor
    }
    return atual
  }

  objeto(num: number) {
    return this.objetos.get(num)
  }

  todos() {
    return this.objetos
  }

  /** Item de dicionário já resolvido. */
  item(dic: Valor | undefined, chave: string) {
    return ehDic(dic) ? this.resolver(dic.itens[chave]) : undefined
  }

  /**
   * Aplica os filtros e devolve os bytes utilizáveis. Filtro de imagem
   * (DCTDecode e companhia) fica para quem chamou: ali os bytes já são
   * um arquivo pronto.
   */
  async conteudo(objeto: Objeto): Promise<Uint8Array> {
    if (!objeto.bruto) return new Uint8Array()

    let dados = objeto.bruto
    const filtros = listaDeNomes(ehDic(objeto.valor) ? this.resolver(objeto.valor.itens.Filter) : undefined)
    const parametros = ehDic(objeto.valor) ? this.resolver(objeto.valor.itens.DecodeParms) : undefined

    for (const filtro of filtros) {
      if (FILTROS_DE_IMAGEM.has(filtro)) break

      if (filtro === 'FlateDecode') dados = await inflar(dados)
      else if (filtro === 'ASCIIHexDecode') dados = deHex(dados)
      else throw new Error(`filtro não suportado: ${filtro}`)

      const parm = parametros?.tipo === 'lista' ? this.resolver(parametros.itens[0]) : parametros
      const preditor = numeroDe(this.item(parm, 'Predictor')) ?? 1
      if (preditor >= 10) {
        dados = desfazerPreditor(
          dados,
          numeroDe(this.item(parm, 'Columns')) ?? 1,
          numeroDe(this.item(parm, 'Colors')) ?? 1,
          numeroDe(this.item(parm, 'BitsPerComponent')) ?? 8,
        )
      }
    }

    return dados
  }

  /** As páginas, na ordem em que aparecem no arquivo. */
  paginas(): { num: number; dic: Valor }[] {
    const saida: { num: number; dic: Valor }[] = []
    for (const [num, objeto] of this.objetos) {
      if (ehDic(objeto.valor) && nomeDe(objeto.valor.itens.Type) === 'Page') {
        saida.push({ num, dic: objeto.valor })
      }
    }
    return saida.sort((a, b) => a.num - b.num)
  }

  /**
   * Um recurso (/Font, /XObject) pode estar na própria página ou herdado
   * do nó pai da árvore de páginas.
   */
  recursos(pagina: Valor, especie: string): Record<string, Valor> {
    const juntos: Record<string, Valor> = {}
    let atual: Valor | undefined = pagina

    for (let nivel = 0; atual && nivel < 16; nivel++) {
      const grupo = this.item(this.item(atual, 'Resources'), especie)
      if (ehDic(grupo)) {
        for (const [nome, valor] of Object.entries(grupo.itens)) {
          if (!(nome in juntos)) juntos[nome] = valor
        }
      }
      atual = this.item(atual, 'Parent')
    }

    return juntos
  }
}

// ---------------------------------------------------------------------
// Bytes <-> string de um byte por caractere
// ---------------------------------------------------------------------

export function paraBinario(bytes: Uint8Array) {
  // Em pedaços: String.fromCharCode com centenas de milhares de
  // argumentos estoura a pilha.
  const pedaco = 0x8000
  const partes: string[] = []
  for (let k = 0; k < bytes.length; k += pedaco) {
    partes.push(String.fromCharCode(...bytes.subarray(k, k + pedaco)))
  }
  return partes.join('')
}

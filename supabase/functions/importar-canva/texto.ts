// =====================================================================
// Texto das páginas, com a posição de cada pedaço
// =====================================================================
// Duas coisas que este arquivo aprendeu com o PDF de verdade do Canva:
//
// 1. As fontes vêm recortadas: o byte no arquivo não é a letra, é o
//    índice do desenho dentro do pedaço de fonte embutido. Sem o
//    /ToUnicode de cada fonte, "TEMA DA AULA" sai como símbolos.
//
// 2. O Canva desenha **uma letra por vez**, cada uma com o seu `Td`.
//    Quem só olha "mudou o x, então cabe um espaço" devolve
//    "T E M A  D A  A U L A" — e aí nenhum rótulo casa. O jeito certo é
//    somar a largura dos glifos: espaço é o buraco que sobra além do
//    avanço natural da letra anterior.
//
// Por isso a saída daqui não é um texto corrido, é uma lista de linhas
// com x e y na página. A ordem dos objetos dentro do PDF não é a ordem
// de leitura — no documento do Canva os rótulos são desenhados primeiro
// e os valores depois —, então quem lê os campos precisa da geometria.
// =====================================================================

import { Documento, Leitor, ehDic, nomeDe, numeroDe, paraBinario, type Valor } from './pdf.ts'

/** Uma linha de texto da página, já remontada, em coordenadas da página. */
export type Linha = {
  texto: string
  /** Onde a linha começa e termina, da esquerda para a direita. */
  x: number
  fim: number
  /** Altura na página; maior é mais para cima, como no PDF. */
  y: number
  /** Tamanho da letra, em unidades da página. */
  altura: number
}

type Fonte = {
  /** Quantos bytes formam um código: 1 nas fontes simples, 2 nas Type0. */
  bytesPorCodigo: number
  paraTexto: Map<number, string>
  /** Largura de cada glifo, em milésimos do tamanho da fonte. */
  larguras: Map<number, number>
  larguraPadrao: number
}

const FONTE_PADRAO: Fonte = {
  bytesPorCodigo: 1,
  paraTexto: new Map(),
  larguras: new Map(),
  larguraPadrao: 500,
}

// ---------------------------------------------------------------------
// Matrizes
// ---------------------------------------------------------------------
// [a b c d e f] é a matriz do PDF. Multiplicar é o que leva um ponto do
// espaço do texto até a página, passando por todos os `cm` e por dentro
// dos formulários.

type Matriz = [number, number, number, number, number, number]

const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0]

function multiplicar(m: Matriz, n: Matriz): Matriz {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ]
}

/** Quanto a matriz estica na horizontal e na vertical. */
function escalas(m: Matriz) {
  return { x: Math.hypot(m[0], m[1]) || 1, y: Math.hypot(m[2], m[3]) || 1 }
}

// ---------------------------------------------------------------------
// A tabela de tradução e as larguras da fonte
// ---------------------------------------------------------------------

function hexParaTexto(hex: string) {
  // O destino vem em UTF-16BE, e pode ter mais de um caractere (ligadura
  // "fi" costuma vir assim).
  let saida = ''
  for (let k = 0; k + 3 < hex.length + 1; k += 4) {
    const unidade = parseInt(hex.substr(k, 4), 16)
    if (Number.isFinite(unidade)) saida += String.fromCharCode(unidade)
  }
  return saida
}

function lerToUnicode(cmap: string): Map<number, string> {
  const paraTexto = new Map<number, string>()

  for (const bloco of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    const itens = [...bloco[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)]
    for (const [, origem, destino] of itens) {
      paraTexto.set(parseInt(origem, 16), hexParaTexto(destino))
    }
  }

  for (const bloco of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // Duas formas: "<de> <ate> <destino>" e "<de> <ate> [<d1> <d2> …]".
    const linhas = bloco[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]*)>|\[([\s\S]*?)\])/g,
    )

    for (const [, de, ate, destino, lista] of linhas) {
      const inicio = parseInt(de, 16)
      const fim = parseInt(ate, 16)
      if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) continue
      // Faixa gigante é sinal de arquivo estranho; não vale estourar a
      // memória por causa dela.
      if (fim - inicio > 65535) continue

      if (destino !== undefined) {
        const base = parseInt(destino, 16)
        const prefixo = destino.slice(0, Math.max(0, destino.length - 4))
        for (let c = inicio; c <= fim; c++) {
          // Só o último par de bytes anda dentro da faixa.
          const ultimo = ((base & 0xffff) + (c - inicio)).toString(16).padStart(4, '0')
          paraTexto.set(c, hexParaTexto(prefixo + ultimo))
        }
      } else if (lista !== undefined) {
        const itens = [...lista.matchAll(/<([0-9A-Fa-f]*)>/g)]
        itens.forEach((item, k) => paraTexto.set(inicio + k, hexParaTexto(item[1])))
      }
    }
  }

  return paraTexto
}

/** /Widths de uma fonte simples: um número por código, a partir de /FirstChar. */
function lerLargurasSimples(doc: Documento, fonte: Valor) {
  const larguras = new Map<number, number>()
  const lista = doc.item(fonte, 'Widths')
  const primeiro = numeroDe(doc.item(fonte, 'FirstChar')) ?? 0
  if (lista?.tipo === 'lista') {
    lista.itens.forEach((item, k) => {
      const largura = numeroDe(doc.resolver(item))
      if (largura !== null) larguras.set(primeiro + k, largura)
    })
  }
  const descritor = doc.item(fonte, 'FontDescriptor')
  const faltante = numeroDe(doc.item(descritor, 'MissingWidth'))
  return { larguras, padrao: faltante ?? (larguras.size > 0 ? 0 : 500) }
}

/**
 * /W de uma CIDFont: pares "código [larguras…]" e trios "de até largura",
 * misturados na mesma lista. O padrão é /DW, e o padrão do padrão é 1000
 * — a letra de largura cheia, como manda a especificação.
 */
function lerLargurasCid(doc: Documento, descendente: Valor) {
  const larguras = new Map<number, number>()
  const lista = doc.item(descendente, 'W')

  if (lista?.tipo === 'lista') {
    const itens = lista.itens.map((item) => doc.resolver(item))
    for (let k = 0; k < itens.length; ) {
      const primeiro = numeroDe(itens[k])
      const seguinte = itens[k + 1]
      if (primeiro === null || seguinte === undefined) break

      if (seguinte.tipo === 'lista') {
        seguinte.itens.forEach((largura, j) => {
          const valor = numeroDe(doc.resolver(largura))
          if (valor !== null) larguras.set(primeiro + j, valor)
        })
        k += 2
      } else {
        const ultimo = numeroDe(seguinte)
        const largura = numeroDe(itens[k + 2])
        if (ultimo === null || largura === null) break
        // Faixa absurda seria arquivo estranho; não vale encher a memória.
        if (ultimo >= primeiro && ultimo - primeiro <= 65535) {
          for (let c = primeiro; c <= ultimo; c++) larguras.set(c, largura)
        }
        k += 3
      }
    }
  }

  return { larguras, padrao: numeroDe(doc.item(descendente, 'DW')) ?? 1000 }
}

async function lerFontes(doc: Documento, pagina: Valor): Promise<Record<string, Fonte>> {
  const saida: Record<string, Fonte> = {}

  for (const [apelido, referencia] of Object.entries(doc.recursos(pagina, 'Font'))) {
    const fonte = doc.resolver(referencia)
    if (!ehDic(fonte)) continue

    // A largura do código vem do TIPO da fonte, não do CMap: fonte
    // simples usa sempre um byte por código, só a Type0 usa dois. O CMap
    // não serve de pista — a Adobe grava `<0000> <FFFF>` no codespace e
    // às vezes uma entrada de 4 dígitos mesmo numa fonte de um byte.
    // Inferir dali fazia a fonte inteira decodificar como lixo, e foi
    // isso que deixou a BNCC oficial (600 páginas) sair vazia.
    const type0 = nomeDe(fonte.itens.Subtype) === 'Type0'
    let paraTexto = new Map<number, string>()

    const referenciaCmap = fonte.itens.ToUnicode
    if (referenciaCmap?.tipo === 'ref') {
      const objeto = doc.objeto(referenciaCmap.num)
      if (objeto?.bruto) {
        try {
          paraTexto = lerToUnicode(paraBinario(await doc.conteudo(objeto)))
        } catch {
          // sem tradução: cai no palpite de `traduzir`
        }
      }
    }

    let medidas = { larguras: new Map<number, number>(), padrao: 500 }
    if (type0) {
      const descendentes = doc.item(fonte, 'DescendantFonts')
      const primeiro =
        descendentes?.tipo === 'lista' ? doc.resolver(descendentes.itens[0]) : undefined
      if (primeiro) medidas = lerLargurasCid(doc, primeiro)
    } else {
      medidas = lerLargurasSimples(doc, fonte)
    }

    saida[apelido] = {
      bytesPorCodigo: type0 ? 2 : 1,
      paraTexto,
      larguras: medidas.larguras,
      larguraPadrao: medidas.padrao,
    }
  }

  return saida
}

/**
 * Sem /ToUnicode não há o que consultar; o palpite é que o código seja o
 * próprio caractere, que é verdade nas fontes não recortadas (a maioria
 * dos PDFs que não vêm de editor gráfico).
 */
function traduzir(fonte: Fonte, codigo: number) {
  const achado = fonte.paraTexto.get(codigo)
  if (achado !== undefined) return achado
  if (fonte.paraTexto.size > 0) return '' // fonte recortada: código fora da tabela não é letra
  return codigo >= 32 && codigo < 0x3000 ? String.fromCharCode(codigo) : ''
}

function codigosDe(fonte: Fonte, bruto: string) {
  const codigos: number[] = []
  if (fonte.bytesPorCodigo === 2) {
    for (let k = 0; k + 1 < bruto.length; k += 2) {
      codigos.push((bruto.charCodeAt(k) << 8) | bruto.charCodeAt(k + 1))
    }
  } else {
    for (let k = 0; k < bruto.length; k++) codigos.push(bruto.charCodeAt(k))
  }
  return codigos
}

// ---------------------------------------------------------------------
// A varredura do content stream
// ---------------------------------------------------------------------

/** Buraco maior que isto, em relação ao tamanho da letra, é um espaço. */
const ESPACO_MINIMO = 0.16

/** Quanto dois pedaços podem se afastar na vertical e ainda ser a mesma linha. */
const MESMA_LINHA = 0.5

type Pedaco = { texto: string; x: number; y: number; largura: number; altura: number }

type Estado = {
  pedacos: Pedaco[]
  ctm: Matriz
  /** Pilha do `q`/`Q`. */
  pilhaCtm: Matriz[]
  tm: Matriz
  tlm: Matriz
  fonte: Fonte
  tamanho: number
  espacoCaractere: number
  espacoPalavra: number
  escalaHorizontal: number
  entrelinha: number
}

type Recursos = { fontes: Record<string, Fonte>; formularios: Record<string, Valor> }

/**
 * As linhas de texto da página, de cima para baixo, incluindo o que está
 * dentro de formulários (`/XObject` de subtipo `Form`).
 *
 * Essa descida não é preciosismo: editor gráfico costuma embrulhar a
 * página inteira num formulário, e aí o `/Contents` da página só tem
 * `/Fm0 Do`. Sem entrar ali, o documento devolve as imagens todas — o
 * código das fotos já descia — e nenhuma letra.
 */
export async function linhasDaPagina(doc: Documento, pagina: Valor): Promise<Linha[]> {
  const estado: Estado = {
    pedacos: [],
    ctm: IDENTIDADE,
    pilhaCtm: [],
    tm: IDENTIDADE,
    tlm: IDENTIDADE,
    fonte: FONTE_PADRAO,
    tamanho: 0,
    espacoCaractere: 0,
    espacoPalavra: 0,
    escalaHorizontal: 1,
    entrelinha: 0,
  }

  await varrerConteudoDe(doc, pagina, estado, { fontes: {}, formularios: {} }, new Set(), 0)
  return montarLinhas(estado.pedacos)
}

/** O texto da página em linhas, de cima para baixo. */
export async function textoDaPagina(doc: Documento, pagina: Valor): Promise<string> {
  return (await linhasDaPagina(doc, pagina)).map((l) => l.texto).join('\n')
}

/**
 * Junta os pedaços em linhas: mesma altura vira a mesma linha, e o
 * espaço entre duas palavras só entra quando o buraco é maior do que o
 * avanço natural da letra anterior.
 */
function montarLinhas(pedacos: Pedaco[]): Linha[] {
  const uteis = pedacos.filter((p) => p.texto.trim() !== '' || p.texto === ' ')
  uteis.sort((a, b) => b.y - a.y || a.x - b.x)

  const linhas: Linha[] = []
  let atual: Pedaco[] = []

  const fechar = () => {
    if (atual.length === 0) return
    const ordenados = [...atual].sort((a, b) => a.x - b.x)

    let texto = ''
    let anterior: Pedaco | null = null
    for (const p of ordenados) {
      if (anterior) {
        const buraco = p.x - (anterior.x + anterior.largura)
        const cabeEspaco = buraco > ESPACO_MINIMO * Math.max(p.altura, anterior.altura)
        if (cabeEspaco && !texto.endsWith(' ') && !p.texto.startsWith(' ')) texto += ' '
      }
      texto += p.texto
      anterior = p
    }

    texto = texto.replace(/\s+/g, ' ').trim()
    if (texto !== '') {
      linhas.push({
        texto,
        x: ordenados[0].x,
        fim: ordenados[ordenados.length - 1].x + ordenados[ordenados.length - 1].largura,
        y: ordenados[0].y,
        altura: Math.max(...ordenados.map((p) => p.altura)),
      })
    }
    atual = []
  }

  for (const pedaco of uteis) {
    const referencia = atual[0]
    if (referencia && Math.abs(referencia.y - pedaco.y) > MESMA_LINHA * Math.max(referencia.altura, pedaco.altura, 1)) {
      fechar()
    }
    atual.push(pedaco)
  }
  fechar()

  return linhas
}

/** Fontes e formulários de um dono, por cima dos que ele herdou. */
async function recursosDe(doc: Documento, dono: Valor, herdados: Recursos): Promise<Recursos> {
  return {
    fontes: { ...herdados.fontes, ...(await lerFontes(doc, dono)) },
    formularios: { ...herdados.formularios, ...doc.recursos(dono, 'XObject') },
  }
}

/** Junta os fluxos de conteúdo de um dono (página ou formulário). */
async function fluxoDe(doc: Documento, dono: Valor): Promise<string> {
  // Formulário é ele mesmo um stream; página aponta para um ou vários.
  if (ehDic(dono) && !dono.itens.Contents) return ''

  const conteudos = doc.resolver(ehDic(dono) ? dono.itens.Contents : undefined)
  const referencias =
    conteudos?.tipo === 'lista'
      ? conteudos.itens
      : ehDic(dono) && dono.itens.Contents
        ? [dono.itens.Contents]
        : []

  const partes: string[] = []
  for (const referencia of referencias) {
    if (referencia.tipo !== 'ref') continue
    const objeto = doc.objeto(referencia.num)
    if (!objeto?.bruto) continue
    try {
      partes.push(paraBinario(await doc.conteudo(objeto)))
    } catch {
      // página ilegível não derruba as outras
    }
  }
  return partes.join('\n')
}

async function varrerConteudoDe(
  doc: Documento,
  dono: Valor,
  estado: Estado,
  herdados: Recursos,
  visitados: Set<number>,
  nivel: number,
) {
  const recursos = await recursosDe(doc, dono, herdados)
  await varrer(doc, await fluxoDe(doc, dono), estado, recursos, visitados, nivel)
}

async function varrer(
  doc: Documento,
  fluxo: string,
  estado: Estado,
  recursos: Recursos,
  visitados: Set<number>,
  nivel: number,
) {
  const leitor = new Leitor(fluxo)
  const pilha: Valor[] = []

  /** Escreve o pedaço na posição atual e anda com o cursor do texto. */
  function mostrar(bruto: string) {
    const codigos = codigosDe(estado.fonte, bruto)
    let texto = ''
    let avanco = 0

    for (const codigo of codigos) {
      texto += traduzir(estado.fonte, codigo)
      const largura = estado.fonte.larguras.get(codigo) ?? estado.fonte.larguraPadrao
      const palavra = codigo === 32 && estado.fonte.bytesPorCodigo === 1 ? estado.espacoPalavra : 0
      avanco += ((largura / 1000) * estado.tamanho + estado.espacoCaractere + palavra) * estado.escalaHorizontal
    }

    const trm = multiplicar(estado.tm, estado.ctm)
    const escala = escalas(trm)

    if (texto !== '') {
      estado.pedacos.push({
        texto,
        x: trm[4],
        y: trm[5],
        largura: avanco * escala.x,
        altura: Math.abs(estado.tamanho) * escala.y,
      })
    }

    estado.tm = multiplicar([1, 0, 0, 1, avanco, 0], estado.tm)
  }

  /** O deslocamento do TJ: número positivo aproxima, negativo afasta. */
  function ajustar(valor: number) {
    const passo = (-valor / 1000) * estado.tamanho * estado.escalaHorizontal
    estado.tm = multiplicar([1, 0, 0, 1, passo, 0], estado.tm)
  }

  function novaLinha(deslocX: number, deslocY: number) {
    estado.tlm = multiplicar([1, 0, 0, 1, deslocX, deslocY], estado.tlm)
    estado.tm = estado.tlm
  }

  while (!leitor.fim()) {
    leitor.pularBranco()
    if (leitor.fim()) break

    const c = fluxo[leitor.i]
    if (c === '/' || c === '(' || c === '<' || c === '[' || c === '+' || c === '-' || c === '.' || (c >= '0' && c <= '9')) {
      const antes = leitor.i
      pilha.push(leitor.lerValor())
      if (leitor.i === antes) leitor.i++
      continue
    }

    const operador = leitor.lerPalavra()
    if (operador === '') {
      leitor.i++
      continue
    }

    const numeros = () => pilha.map((v) => numeroDe(v) ?? 0)

    switch (operador) {
      case 'q':
        estado.pilhaCtm.push(estado.ctm)
        break

      case 'Q':
        estado.ctm = estado.pilhaCtm.pop() ?? estado.ctm
        break

      case 'cm': {
        const n = numeros().slice(-6)
        if (n.length === 6) estado.ctm = multiplicar(n as Matriz, estado.ctm)
        break
      }

      case 'BT':
        estado.tm = IDENTIDADE
        estado.tlm = IDENTIDADE
        break

      case 'Tf': {
        const apelido = pilha.length >= 2 ? pilha[pilha.length - 2] : undefined
        estado.fonte =
          (apelido?.tipo === 'nome' ? recursos.fontes[apelido.valor] : undefined) ?? FONTE_PADRAO
        estado.tamanho = numeroDe(pilha[pilha.length - 1]) ?? estado.tamanho
        break
      }

      case 'Tc':
        estado.espacoCaractere = numeroDe(pilha[pilha.length - 1]) ?? 0
        break

      case 'Tw':
        estado.espacoPalavra = numeroDe(pilha[pilha.length - 1]) ?? 0
        break

      case 'Tz':
        estado.escalaHorizontal = (numeroDe(pilha[pilha.length - 1]) ?? 100) / 100
        break

      case 'TL':
        estado.entrelinha = numeroDe(pilha[pilha.length - 1]) ?? estado.entrelinha
        break

      case 'Tm': {
        const n = numeros().slice(-6)
        if (n.length === 6) {
          estado.tlm = n as Matriz
          estado.tm = estado.tlm
        }
        break
      }

      case 'Td': {
        const n = numeros().slice(-2)
        if (n.length === 2) novaLinha(n[0], n[1])
        break
      }

      case 'TD': {
        const n = numeros().slice(-2)
        if (n.length === 2) {
          estado.entrelinha = -n[1]
          novaLinha(n[0], n[1])
        }
        break
      }

      case 'T*':
        novaLinha(0, -estado.entrelinha)
        break

      case 'Tj': {
        const texto = pilha[pilha.length - 1]
        if (texto?.tipo === 'texto') mostrar(texto.valor)
        break
      }

      case "'":
      case '"': {
        novaLinha(0, -estado.entrelinha)
        const texto = pilha[pilha.length - 1]
        if (texto?.tipo === 'texto') mostrar(texto.valor)
        break
      }

      case 'TJ': {
        const lista = pilha[pilha.length - 1]
        if (lista?.tipo === 'lista') {
          for (const item of lista.itens) {
            if (item.tipo === 'texto') mostrar(item.valor)
            else if (item.tipo === 'num') ajustar(item.valor)
          }
        }
        break
      }

      case 'BI': {
        // Imagem escrita no meio do conteúdo: os bytes dela não são
        // código e atrapalhariam a varredura. Pula até o fim dela.
        const fim = fluxo.indexOf('EI', leitor.i)
        leitor.i = fim < 0 ? fluxo.length : fim + 2
        break
      }

      case 'Do': {
        // Aqui mora o texto quando o produtor embrulha a página num
        // formulário. Entrar custa uma chamada e é o que faz a diferença
        // entre ler o documento e devolver folha em branco.
        const apelido = pilha[pilha.length - 1]
        if (apelido?.tipo !== 'nome' || nivel >= 8) break

        const referencia = recursos.formularios[apelido.valor]
        if (referencia?.tipo !== 'ref' || visitados.has(referencia.num)) break

        const forma = doc.resolver(referencia)
        if (!ehDic(forma) || nomeDe(forma.itens.Subtype) !== 'Form') break

        const objeto = doc.objeto(referencia.num)
        if (!objeto?.bruto) break

        // O mesmo formulário costuma ser desenhado em várias páginas —
        // moldura, por exemplo. Marcar evita ciclo, e a marca é limpa ao
        // sair para o texto dele poder aparecer na página seguinte.
        visitados.add(referencia.num)
        const guardado = {
          ctm: estado.ctm,
          pilha: estado.pilhaCtm,
          tm: estado.tm,
          tlm: estado.tlm,
          fonte: estado.fonte,
          tamanho: estado.tamanho,
        }
        try {
          const propria = doc.item(forma, 'Matrix')
          if (propria?.tipo === 'lista' && propria.itens.length === 6) {
            const n = propria.itens.map((v) => numeroDe(doc.resolver(v)) ?? 0) as Matriz
            estado.ctm = multiplicar(n, estado.ctm)
          }
          estado.pilhaCtm = []
          const dentro = await recursosDe(doc, forma, recursos)
          await varrer(doc, paraBinario(await doc.conteudo(objeto)), estado, dentro, visitados, nivel + 1)
        } catch {
          // formulário ilegível não derruba a página
        }
        estado.ctm = guardado.ctm
        estado.pilhaCtm = guardado.pilha
        estado.tm = guardado.tm
        estado.tlm = guardado.tlm
        estado.fonte = guardado.fonte
        estado.tamanho = guardado.tamanho
        visitados.delete(referencia.num)
        break
      }
    }

    pilha.length = 0
  }
}

// =====================================================================
// Texto das páginas
// =====================================================================
// O Canva exporta com as fontes recortadas: o byte que está no arquivo
// não é a letra, é o índice do desenho dentro do pedaço de fonte que foi
// embutido. Sem o /ToUnicode de cada fonte, o "TEMA DA AULA" sai como
// uma sequência de símbolos sem sentido — foi por isso que a tabela de
// tradução veio antes de qualquer coisa aqui.
// =====================================================================

import { Documento, Leitor, ehDic, nomeDe, numeroDe, paraBinario, type Valor } from './pdf.ts'

type Fonte = {
  /** Quantos bytes formam um código: 1 nas fontes simples, 2 nas Type0. */
  bytesPorCodigo: number
  paraTexto: Map<number, string>
}

const FONTE_PADRAO: Fonte = { bytesPorCodigo: 1, paraTexto: new Map() }

// ---------------------------------------------------------------------
// A tabela de tradução da fonte
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

function lerToUnicode(cmap: string): Fonte {
  const paraTexto = new Map<number, string>()
  let larguraCodigo = 0

  for (const bloco of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    const itens = [...bloco[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)]
    for (const [, origem, destino] of itens) {
      larguraCodigo = Math.max(larguraCodigo, Math.ceil(origem.length / 2))
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
      larguraCodigo = Math.max(larguraCodigo, Math.ceil(de.length / 2))
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

  return { bytesPorCodigo: larguraCodigo === 2 ? 2 : 1, paraTexto }
}

async function lerFontes(doc: Documento, pagina: Valor): Promise<Record<string, Fonte>> {
  const saida: Record<string, Fonte> = {}

  for (const [apelido, referencia] of Object.entries(doc.recursos(pagina, 'Font'))) {
    const fonte = doc.resolver(referencia)
    if (!ehDic(fonte)) continue

    const ehType0 = nomeDe(fonte.itens.Subtype) === 'Type0'
    let lida: Fonte = { bytesPorCodigo: ehType0 ? 2 : 1, paraTexto: new Map() }

    const referenciaCmap = fonte.itens.ToUnicode
    if (referenciaCmap?.tipo === 'ref') {
      const objeto = doc.objeto(referenciaCmap.num)
      if (objeto?.bruto) {
        try {
          const tabela = lerToUnicode(paraBinario(await doc.conteudo(objeto)))
          lida = { bytesPorCodigo: ehType0 ? 2 : tabela.bytesPorCodigo, paraTexto: tabela.paraTexto }
        } catch {
          // sem tradução: cai no palpite abaixo
        }
      }
    }

    saida[apelido] = lida
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

function decodificar(fonte: Fonte, bruto: string) {
  let saida = ''
  if (fonte.bytesPorCodigo === 2) {
    for (let k = 0; k + 1 < bruto.length; k += 2) {
      saida += traduzir(fonte, (bruto.charCodeAt(k) << 8) | bruto.charCodeAt(k + 1))
    }
  } else {
    for (let k = 0; k < bruto.length; k++) saida += traduzir(fonte, bruto.charCodeAt(k))
  }
  return saida
}

// ---------------------------------------------------------------------
// A varredura do content stream
// ---------------------------------------------------------------------

/** Espaçamento negativo maior que isto, num TJ, é um espaço de verdade. */
const ESPACO_POR_ESPACAMENTO = 180

/** Diferença de altura que separa duas linhas, em unidades do texto. */
const ALTURA_DE_LINHA = 1.5

export async function textoDaPagina(doc: Documento, pagina: Valor): Promise<string> {
  const fontes = await lerFontes(doc, pagina)

  const conteudos = doc.resolver(ehDic(pagina) ? pagina.itens.Contents : undefined)
  const referencias =
    conteudos?.tipo === 'lista'
      ? conteudos.itens
      : ehDic(pagina) && pagina.itens.Contents
        ? [pagina.itens.Contents]
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

  return varrer(partes.join('\n'), fontes)
}

function varrer(fluxo: string, fontes: Record<string, Fonte>) {
  const leitor = new Leitor(fluxo)
  const pilha: Valor[] = []
  let saida = ''

  let fonte = FONTE_PADRAO
  let x = 0
  let y = 0
  let entrelinha = 0
  let ultimoX: number | null = null
  let ultimoY: number | null = null

  /** Decide sozinho se entre o pedaço anterior e este cabe uma quebra. */
  function escrever(texto: string) {
    if (!texto) return

    if (ultimoY !== null && Math.abs(y - ultimoY) > ALTURA_DE_LINHA) {
      saida += '\n'
    } else if (ultimoX !== null && x !== ultimoX && !saida.endsWith(' ') && !saida.endsWith('\n')) {
      // Mesma linha, outra posição: o Canva quebra a frase em vários
      // pedaços posicionados, e sem isto as palavras vêm grudadas.
      saida += ' '
    }

    saida += texto
    ultimoX = x
    ultimoY = y
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

    switch (operador) {
      case 'BT':
        x = 0
        y = 0
        break

      case 'ET':
        ultimoY = null
        ultimoX = null
        if (!saida.endsWith('\n')) saida += '\n'
        break

      case 'Tf': {
        const apelido = pilha.length >= 2 ? pilha[pilha.length - 2] : undefined
        fonte = (apelido?.tipo === 'nome' ? fontes[apelido.valor] : undefined) ?? FONTE_PADRAO
        break
      }

      case 'Tm': {
        const n = pilha.slice(-6).map((v) => numeroDe(v) ?? 0)
        if (n.length === 6) {
          x = n[4]
          y = n[5]
        }
        break
      }

      case 'Td':
      case 'TD': {
        const n = pilha.slice(-2).map((v) => numeroDe(v) ?? 0)
        if (n.length === 2) {
          x += n[0]
          y += n[1]
          if (operador === 'TD') entrelinha = -n[1]
        }
        break
      }

      case 'TL':
        entrelinha = numeroDe(pilha[pilha.length - 1]) ?? entrelinha
        break

      case 'T*':
        y -= entrelinha
        break

      case 'Tj':
      case "'":
      case '"': {
        if (operador !== 'Tj') y -= entrelinha
        const texto = pilha[pilha.length - 1]
        if (texto?.tipo === 'texto') escrever(decodificar(fonte, texto.valor))
        break
      }

      case 'TJ': {
        const lista = pilha[pilha.length - 1]
        if (lista?.tipo === 'lista') {
          let junto = ''
          for (const item of lista.itens) {
            if (item.tipo === 'texto') junto += decodificar(fonte, item.valor)
            else if (item.tipo === 'num' && item.valor < -ESPACO_POR_ESPACAMENTO && !junto.endsWith(' ')) {
              junto += ' '
            }
          }
          escrever(junto)
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
    }

    pilha.length = 0
  }

  return saida
}

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
    const bytesPorCodigo = nomeDe(fonte.itens.Subtype) === 'Type0' ? 2 : 1
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

    saida[apelido] = { bytesPorCodigo, paraTexto }
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

/**
 * O texto de uma página, incluindo o que está dentro de formulários
 * (`/XObject` de subtipo `Form`).
 *
 * Essa descida não é preciosismo: editor gráfico costuma embrulhar a
 * página inteira num formulário, e aí o `/Contents` da página só tem
 * `/Fm0 Do`. Sem entrar ali, o documento devolve as imagens todas — o
 * código das fotos já descia — e nenhuma letra. Foi exatamente o que
 * aconteceu com o PDF de verdade do Canva: 8 fotos, zero campos.
 */
export async function textoDaPagina(doc: Documento, pagina: Valor): Promise<string> {
  const estado: Estado = { saida: '', ultimoX: null, ultimoY: null }
  await varrerConteudoDe(doc, pagina, estado, { fontes: {}, formularios: {} }, new Set(), 0)
  return estado.saida
}

type Estado = { saida: string; ultimoX: number | null; ultimoY: number | null }
type Recursos = { fontes: Record<string, Fonte>; formularios: Record<string, Valor> }

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

  let fonte = FONTE_PADRAO
  let x = 0
  let y = 0
  let entrelinha = 0

  /** Decide sozinho se entre o pedaço anterior e este cabe uma quebra. */
  function escrever(texto: string) {
    if (!texto) return

    if (estado.ultimoY !== null && Math.abs(y - estado.ultimoY) > ALTURA_DE_LINHA) {
      estado.saida += '\n'
    } else if (
      estado.ultimoX !== null &&
      x !== estado.ultimoX &&
      !estado.saida.endsWith(' ') &&
      !estado.saida.endsWith('\n')
    ) {
      // Mesma linha, outra posição: o Canva quebra a frase em vários
      // pedaços posicionados, e sem isto as palavras vêm grudadas.
      estado.saida += ' '
    }

    estado.saida += texto
    estado.ultimoX = x
    estado.ultimoY = y
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
        estado.ultimoY = null
        estado.ultimoX = null
        if (!estado.saida.endsWith('\n')) estado.saida += '\n'
        break

      case 'Tf': {
        const apelido = pilha.length >= 2 ? pilha[pilha.length - 2] : undefined
        fonte = (apelido?.tipo === 'nome' ? recursos.fontes[apelido.valor] : undefined) ?? FONTE_PADRAO
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
        try {
          const dentro = await recursosDe(doc, forma, recursos)
          await varrer(doc, paraBinario(await doc.conteudo(objeto)), estado, dentro, visitados, nivel + 1)
        } catch {
          // formulário ilegível não derruba a página
        }
        visitados.delete(referencia.num)
        break
      }
    }

    pilha.length = 0
  }
}

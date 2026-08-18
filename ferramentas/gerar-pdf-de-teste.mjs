// =====================================================================
// Gerador do PDF de teste do importador do Canva
// =====================================================================
//
//   node ferramentas/gerar-pdf-de-teste.mjs /tmp/canva-falso.pdf
//   node --experimental-strip-types ferramentas/conferir-extrator.mts /tmp/canva-falso.pdf
//
// Existe porque o documento de verdade tem foto de criança e não entra
// no repositório. Este aqui reproduz o que é difícil no arquivo do
// Canva, de propósito:
//
//  - fontes recortadas (código != caractere) com /ToUnicode, uma simples
//    de 1 byte e uma Type0 de 2 bytes;
//  - páginas e fontes escondidas dentro de um /ObjStm comprimido;
//  - cabeçalho e rodapé referenciados pelas 4 páginas — o que o extrator
//    tem de descartar;
//  - fotos que aparecem uma vez só, em JPEG e em Flate cru;
//  - um ícone pequeno, que tem de sair pelo tamanho;
//  - uma frase partida em vários Tm na mesma linha, como o Canva faz;
//  - uma página escrita LETRA POR LETRA, cada glifo com o seu próprio
//    `Td`, que é como o Canva exporta de verdade — quem decide o espaço
//    só por "mudou o x" devolve "T E M A  D A  A U L A" e não acha
//    rótulo nenhum;
//  - os rótulos desenhados ANTES dos valores, também como no arquivo de
//    verdade: a ordem dos objetos no PDF não é a ordem de leitura, e
//    quem confia nela lê o rótulo seguinte no lugar do valor;
//  - o mesmo logo gravado como DOIS objetos, um par de páginas cada,
//    que é como o Canva repete cabeçalho e rodapé;
//  - e o texto embrulhado num /XObject de subtipo Form, que é como o
//    editor gráfico exporta. Quem só lê o /Contents da página encontra
//    ali um `/FmTexto Do` e mais nada — foi o que fez o documento de
//    verdade voltar com 8 fotos e zero campos.
//
// O resultado esperado: 9 campos lidos e 4 fotos, não 7 — e o texto
// só aparece se o extrator entrar no formulário.
// =====================================================================
import { deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

const objetos = new Map() // num -> {corpo: string|Buffer, fluxo?: Buffer}
let proximo = 1
const reservar = () => proximo++

function bin(s) {
  return Buffer.from(s, 'latin1')
}

// ------------------------------------------------------------- fontes

function cmap(pares, bytes, comFaixa) {
  const hex = (c) => c.toString(16).padStart(bytes * 2, '0').toUpperCase()
  const uni = (s) =>
    [...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()).join('')

  let corpo = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CMapName /Recortada def
/CMapType 2 def
1 begincodespacerange
<${'00'.repeat(bytes)}> <${'FF'.repeat(bytes)}>
endcodespacerange
`

  const lista = [...pares]
  // O produtor real quebra em blocos de no máximo 100; imitar isso testa
  // a leitura de vários blocos.
  for (let k = 0; k < lista.length; k += 100) {
    const bloco = lista.slice(k, k + 100)
    corpo += `${bloco.length} beginbfchar\n`
    for (const [codigo, texto] of bloco) corpo += `<${hex(codigo)}> <${uni(texto)}>\n`
    corpo += 'endbfchar\n'
  }

  if (comFaixa) {
    // Uma faixa de dígitos, para exercitar o beginbfrange.
    corpo += `1 beginbfrange\n<${hex(0xf0)}> <${hex(0xf9)}> <0030>\nendbfrange\n`
  }

  corpo += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n'
  return bin(corpo)
}

/** Largura de cada letra, em milésimos. Chutada, mas coerente. */
function larguraDaLetra(c) {
  if (c === ' ') return 260
  if ('ilj.,:;!|'.includes(c)) return 300
  if (c === c.toUpperCase() && c !== c.toLowerCase()) return 660
  return 520
}

function montarFonte({ texto, bytes, comFaixa }) {
  const caracteres = [...new Set([...texto])].sort()
  const paraCodigo = new Map()
  const pares = []

  caracteres.forEach((c, k) => {
    // Começa longe do ASCII: se o extrator "chutar" o código como letra,
    // o teste falha, que é o que queremos.
    const codigo = bytes === 1 ? 3 + k : 0x100 + k
    paraCodigo.set(c, codigo)
    pares.push([codigo, c])
  })

  const numCmap = reservar()
  objetos.set(numCmap, { corpo: '<< /Length %L /Filter /FlateDecode >>', fluxo: deflateSync(cmap(pares, bytes, comFaixa)) })

  const larguras = caracteres.map((c) => larguraDaLetra(c))
  const numFonte = reservar()

  let dicionario
  if (bytes === 1) {
    dicionario =
      `<< /Type /Font /Subtype /TrueType /BaseFont /AAAAAA+Outfit /FirstChar 3 ` +
      `/LastChar ${3 + caracteres.length - 1} /Widths [${larguras.join(' ')}] /ToUnicode ${numCmap} 0 R >>`
  } else {
    // A Type0 guarda as larguras no /W da fonte descendente, com o /DW
    // de padrão — outro caminho de código, outro jeito de errar.
    const numDescendente = reservar()
    objetos.set(numDescendente, {
      corpo:
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /BBBBBB+SourceSans ` +
        `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
        `/DW 1000 /W [256 [${larguras.join(' ')}]] >>`,
    })
    dicionario =
      `<< /Type /Font /Subtype /Type0 /BaseFont /BBBBBB+SourceSans /Encoding /Identity-H ` +
      `/DescendantFonts [${numDescendente} 0 R] /ToUnicode ${numCmap} 0 R >>`
  }

  return {
    num: numFonte,
    dicionario,
    larguraDe: larguraDaLetra,
    /** Quanto o texto ocupa na página, no tamanho dado. */
    largura(s, tamanho) {
      return [...s].reduce((total, c) => total + (larguraDaLetra(c) / 1000) * tamanho, 0)
    },
    codificar(s) {
      let hex = ''
      for (const c of s) {
        const codigo = paraCodigo.get(c)
        if (codigo === undefined) continue
        hex += codigo.toString(16).padStart(bytes * 2, '0')
      }
      return `<${hex}>`
    },
  }
}

// ------------------------------------------------------------ imagens

function imagemFlate(largura, altura, semente) {
  const amostras = Buffer.alloc(largura * altura * 3)
  for (let k = 0; k < largura * altura; k++) {
    amostras[k * 3] = (k + semente) % 256
    amostras[k * 3 + 1] = (k * 3 + semente) % 256
    amostras[k * 3 + 2] = semente % 256
  }
  const num = reservar()
  objetos.set(num, {
    corpo: `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length %L /Filter /FlateDecode >>`,
    fluxo: deflateSync(amostras),
  })
  return num
}

function imagemJpeg(caminho, largura, altura) {
  const num = reservar()
  objetos.set(num, {
    corpo: `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length %L /Filter /DCTDecode >>`,
    fluxo: readFileSync(caminho),
  })
  return num
}

// ------------------------------------------------------------ páginas

const fonteTitulo = montarFonte({
  texto: 'TEMA DA AULA OBJETIVOS DE APRENDIZAGEM MATERIAIS E RECURSOS NECESSÁRIOS FOTOS DESCRIÇÃO',
  bytes: 1,
  comFaixa: false,
})

const fonteTexto = montarFonte({
  texto:
    'Astros e planetas no metaverso Curso: Inteligência Artificial Turma: Inclusão Data: 14/05/2026 ' +
    'Prof.: Dante Escola: EMEF Rita de Jesus Reconhecer a posição dos do Sistema Solar. ' +
    'Relacionar observação com registro escrito da pesquisa. A turma começou na roda de conversa ' +
    'retomando o que já sabia sobre os astros. Depois, em duplas, cada estudante usou os óculos ' +
    'de realidade virtual para percorrer e anotar três descobertas. No fechamento, montou um ' +
    'mural coletivo com as anotações. Óculos VR, notebook, papel kraft canetas.',
  bytes: 2,
  comFaixa: true,
})

function linhas(pares) {
  // Cada linha é um Tm próprio, como faz editor gráfico.
  let y = 760
  let saida = 'BT\n'
  for (const [fonte, texto, tamanho] of pares) {
    saida += `/F${fonte.num} ${tamanho ?? 11} Tf\n1 0 0 1 60 ${y} Tm\n${fonte.codificar(texto)} Tj\n`
    y -= texto === '' ? 12 : 26
  }
  saida += 'ET\n'
  return saida
}

/**
 * Uma linha escrita glifo a glifo, cada um com o seu `Td`, que é como o
 * Canva exporta. O `Td` anda exatamente a largura da letra: é isso que
 * diz ao extrator que ali NÃO cabe espaço nenhum.
 */
function letraPorLetra(fonte, texto, tamanho, x, y) {
  let saida = `/F${fonte.num} ${tamanho} Tf\n1 0 0 1 ${x} ${y} Tm\n`
  for (const c of texto) {
    saida += `${fonte.codificar(c)} Tj\n${((fonte.larguraDe(c) / 1000) * tamanho).toFixed(4)} 0 Td\n`
  }
  return saida
}

// O mesmo cabeçalho e o mesmo rodapé, gravados como dois objetos cada:
// a mesma semente dá os mesmos bytes. Quem separa moldura de foto
// contando objeto por página não vê repetição nenhuma aqui.
const cabecalho = imagemFlate(321, 231, 7)
const cabecalhoDeNovo = imagemFlate(321, 231, 7)
const rodape = imagemFlate(657, 489, 19)
const rodapeDeNovo = imagemFlate(657, 489, 19)
const icone = imagemFlate(40, 40, 3)

const fotos = [
  imagemJpeg(join(RAIZ, 'public', 'WIT HOME.jpg'), 1024, 682),
  imagemFlate(640, 480, 31),
  imagemFlate(800, 600, 53),
  imagemFlate(640, 480, 71),
]

/**
 * A folha de rosto do jeito difícil: os cinco rótulos primeiro, os cinco
 * valores depois, todos letra por letra. É a página que separa quem lê
 * geometria de quem lê a ordem dos objetos.
 */
function folhaDeRosto() {
  const campos = [
    ['TEMA DA AULA:', 'Astros e planetas no metaverso', 12, 760],
    ['Curso:', 'Inteligência Artificial', 11, 720],
    ['Turma:', 'Inclusão', 11, 700],
    ['Data:', '14/05/2026', 11, 680],
    ['Prof.:', 'Dante', 11, 660],
    ['Escola:', 'EMEF Rita de Jesus', 11, 640],
  ]

  let rotulos = 'BT\n'
  let valores = 'BT\n'
  for (const [rotulo, valor, tamanho, y] of campos) {
    const fonte = y === 760 ? fonteTitulo : fonteTexto
    rotulos += letraPorLetra(fonte, rotulo, tamanho, 60, y)
    // O valor começa um pouco depois do fim do rótulo: o buraco entre os
    // dois é o único espaço de verdade da linha.
    valores += letraPorLetra(fonteTexto, valor, tamanho, 60 + fonte.largura(rotulo, tamanho) + 6, y)
  }
  return `${rotulos}ET\n${valores}ET\n`
}

const conteudos = [
  folhaDeRosto(),
  linhas([
    [fonteTitulo, 'OBJETIVOS DE APRENDIZAGEM', 20],
    [fonteTexto, 'Reconhecer a posição dos planetas do Sistema Solar.'],
    [fonteTexto, 'Relacionar observação com registro escrito da pesquisa.'],
  ]),
  // A descrição vem partida em vários Tm na MESMA linha, como o Canva
  // faz: se o extrator não juntar com espaço, as palavras grudam.
  'BT\n' +
    `/F${fonteTitulo.num} 20 Tf\n1 0 0 1 60 760 Tm\n${fonteTitulo.codificar('DESCRIÇÃO DA AULA')} Tj\n` +
    `/F${fonteTexto.num} 11 Tf\n` +
    `1 0 0 1 60 720 Tm\n${fonteTexto.codificar('A turma começou na roda de conversa')} Tj\n` +
    `1 0 0 1 300 720 Tm\n${fonteTexto.codificar('retomando o que já sabia sobre os astros.')} Tj\n` +
    `1 0 0 1 60 694 Tm\n[${fonteTexto.codificar('Depois, em duplas, cada estudante usou os')} -260 ${fonteTexto.codificar('óculos')}] TJ\n` +
    `1 0 0 1 60 668 Tm\n${fonteTexto.codificar('de realidade virtual para percorrer e anotar três descobertas.')} Tj\n` +
    `1 0 0 1 60 642 Tm\n${fonteTexto.codificar('No fechamento, montou um mural coletivo com as anotações.')} Tj\n` +
    'ET\n',
  linhas([
    [fonteTitulo, 'MATERIAIS E RECURSOS NECESSÁRIOS', 20],
    [fonteTexto, 'Óculos VR, notebook, papel kraft canetas.'],
    [fonteTitulo, 'FOTOS', 20],
  ]),
]

const numPaginas = []
const numConteudos = []

const numFormularios = []

conteudos.forEach((texto, k) => {
  // O texto vai para dentro de um formulário, com os recursos de fonte
  // dele próprio; a página só manda desenhá-lo.
  const numForma = reservar()
  objetos.set(numForma, {
    corpo:
      `<< /Type /XObject /Subtype /Form /BBox [0 0 595 842] ` +
      `/Resources << /Font << /F${fonteTitulo.num} ${fonteTitulo.num} 0 R /F${fonteTexto.num} ${fonteTexto.num} 0 R >> >> ` +
      `/Length %L /Filter /FlateDecode >>`,
    fluxo: deflateSync(bin(texto)),
  })
  numFormularios.push(numForma)

  const desenho =
    `q 321 0 0 231 40 800 cm /Im${k < 2 ? cabecalho : cabecalhoDeNovo} Do Q\n` +
    `q 657 0 0 489 40 40 cm /Im${k < 2 ? rodape : rodapeDeNovo} Do Q\n` +
    (k === 0 ? `q 40 0 0 40 500 800 cm /Im${icone} Do Q\n` : '') +
    (fotos[k] !== undefined ? `q 300 0 0 200 60 300 cm /Im${fotos[k]} Do Q\n` : '') +
    `q 1 0 0 1 0 0 cm /FmTexto Do Q\n`

  const num = reservar()
  objetos.set(num, { corpo: '<< /Length %L /Filter /FlateDecode >>', fluxo: deflateSync(bin(desenho)) })
  numConteudos.push(num)
  numPaginas.push(reservar())
})

const numPaisDasPaginas = reservar()
const numCatalogo = reservar()

// As páginas, as fontes e o catálogo vão para dentro de um fluxo de
// objetos comprimido — é assim que o PDF moderno grava, e sem abrir esse
// fluxo o extrator não acharia página nenhuma.
const dentroDoFluxo = []

numPaginas.forEach((num, k) => {
  const xobjetos = [
    k < 2 ? cabecalho : cabecalhoDeNovo,
    k < 2 ? rodape : rodapeDeNovo,
    ...(k === 0 ? [icone] : []),
    ...(fotos[k] !== undefined ? [fotos[k]] : []),
  ]
  dentroDoFluxo.push([
    num,
    `<< /Type /Page /Parent ${numPaisDasPaginas} 0 R /MediaBox [0 0 595 842] /Contents ${numConteudos[k]} 0 R ` +
      `/Resources << ` +
      `/XObject << ${xobjetos.map((n) => `/Im${n} ${n} 0 R`).join(' ')} /FmTexto ${numFormularios[k]} 0 R >> >> >>`,
  ])
})

dentroDoFluxo.push([fonteTitulo.num, fonteTitulo.dicionario])
dentroDoFluxo.push([fonteTexto.num, fonteTexto.dicionario])
dentroDoFluxo.push([
  numPaisDasPaginas,
  `<< /Type /Pages /Count ${numPaginas.length} /Kids [${numPaginas.map((n) => `${n} 0 R`).join(' ')}] >>`,
])
dentroDoFluxo.push([numCatalogo, `<< /Type /Catalog /Pages ${numPaisDasPaginas} 0 R >>`])

let cabecalhoDoFluxo = ''
let corpoDoFluxo = ''
for (const [num, texto] of dentroDoFluxo) {
  cabecalhoDoFluxo += `${num} ${corpoDoFluxo.length} `
  corpoDoFluxo += texto + '\n'
}

const numFluxoDeObjetos = reservar()
objetos.set(numFluxoDeObjetos, {
  corpo: `<< /Type /ObjStm /N ${dentroDoFluxo.length} /First ${cabecalhoDoFluxo.length} /Length %L /Filter /FlateDecode >>`,
  fluxo: deflateSync(bin(cabecalhoDoFluxo + corpoDoFluxo)),
})

// ------------------------------------------------------------ escrita

const partes = [bin('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')]
for (const [num, { corpo, fluxo }] of [...objetos].sort((a, b) => a[0] - b[0])) {
  const dicionario = corpo.replace('%L', String(fluxo ? fluxo.length : 0))
  partes.push(bin(`${num} 0 obj\n${dicionario}\n`))
  if (fluxo) {
    partes.push(bin('stream\n'), fluxo, bin('\nendstream\n'))
  }
  partes.push(bin('endobj\n'))
}
partes.push(bin(`trailer\n<< /Size ${proximo} /Root ${numCatalogo} 0 R >>\nstartxref\n0\n%%EOF\n`))

const destino = process.argv[2] ?? '/tmp/canva-falso.pdf'
writeFileSync(destino, Buffer.concat(partes))
console.log('PDF escrito:', destino)
console.log('  páginas:', numPaginas.length)
console.log('  molduras (duas cópias de cada):', cabecalho, cabecalhoDeNovo, rodape, rodapeDeNovo)
console.log('  ícone pequeno (descartar por tamanho):', icone)
console.log('  fotos esperadas:', fotos.join(', '))

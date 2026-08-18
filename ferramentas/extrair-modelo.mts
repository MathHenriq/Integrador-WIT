// =====================================================================
// Tira o cabeçalho e o rodapé do documento do Canva
// =====================================================================
//
//   node --experimental-strip-types ferramentas/extrair-modelo.mts \
//        documento-do-canva.pdf [pasta-de-conferencia]
//
// Escreve `src/lib/documento/modelo.ts` com as duas
// imagens que se repetem em todas as páginas — o logo da Micro Ka, no
// alto, e a marca d'água do Núcleo WIT, no pé. São elas que fazem o
// documento gerado aqui parecer o mesmo que sai do Canva.
//
// As amostras vão cruas e comprimidas em Flate, do jeito que o PDF
// entende, sem conversão de formato pelo caminho: é o próprio pixel que
// estava no arquivo do Canva.
//
// Rode de novo quando o template mudar no Canva.
// =====================================================================

import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Documento, ehDic, nomeDe, numeroDe } from '../supabase/functions/importar-canva/pdf.ts'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const LADO_MINIMO = 100

const caminho = process.argv[2]
if (!caminho) {
  console.error('Diga qual é o PDF do Canva.')
  process.exit(1)
}

const doc = await Documento.abrir(new Uint8Array(readFileSync(caminho)))
const paginas = doc.paginas()

/** Em que páginas cada objeto de imagem aparece. */
const paginasPorObjeto = new Map<number, Set<number>>()
paginas.forEach((pagina, indice) => {
  const achadas = new Set<number>()
  const procurar = (dono: unknown, nivel: number) => {
    if (nivel > 6) return
    for (const referencia of Object.values(doc.recursos(dono as never, 'XObject'))) {
      if (referencia.tipo !== 'ref') continue
      const alvo = doc.resolver(referencia)
      if (!ehDic(alvo)) continue
      const subtipo = nomeDe(alvo.itens.Subtype)
      if (subtipo === 'Image') achadas.add(referencia.num)
      else if (subtipo === 'Form') procurar(alvo, nivel + 1)
    }
  }
  procurar(pagina.dic, 0)
  for (const num of achadas) {
    const onde = paginasPorObjeto.get(num) ?? new Set<number>()
    onde.add(indice)
    paginasPorObjeto.set(num, onde)
  }
})

type Peca = { num: number; largura: number; altura: number; cores: number; amostras: Uint8Array }

/**
 * A conta é por conteúdo, e não por objeto: o Canva grava o MESMO logo
 * como um objeto por página, então nenhum deles aparece "em todas as
 * páginas" sozinho. É a mesma armadilha que o importador já conhece.
 */
const porConteudo = new Map<string, { peca: Peca; paginas: Set<number> }>()

for (const [num, onde] of [...paginasPorObjeto].sort((a, b) => a[0] - b[0])) {
  const objeto = doc.objeto(num)
  if (!objeto?.bruto || !ehDic(objeto.valor)) continue

  const largura = numeroDe(doc.resolver(objeto.valor.itens.Width)) ?? 0
  const altura = numeroDe(doc.resolver(objeto.valor.itens.Height)) ?? 0
  if (largura < LADO_MINIMO || altura < LADO_MINIMO) continue

  const cruas = await doc.conteudo(objeto)
  const cores = Math.round(cruas.length / (largura * altura))
  if (cores !== 1 && cores !== 3) {
    console.log(`objeto ${num}: ${largura}x${altura} não é cinza nem RGB cru; pulando`)
    continue
  }

  // O logo vem com o fundo transparente, numa máscara à parte (/SMask).
  // Como a folha é branca, a transparência é resolvida aqui: cada pixel
  // some no branco na medida da máscara. Assim o PDF gerado não precisa
  // saber o que é máscara, e o desenho fica igual ao do Canva.
  const amostras = await sobreBranco(cruas, largura, altura, cores, objeto.valor.itens.SMask)

  const chave = createHash('sha1').update(amostras).digest('hex')
  const grupo = porConteudo.get(chave)
  if (grupo) {
    for (const p of onde) grupo.paginas.add(p)
  } else {
    porConteudo.set(chave, { peca: { num, largura, altura, cores, amostras }, paginas: new Set(onde) })
  }
}

const pecas = [...porConteudo.values()]
  .filter((g) => g.paginas.size >= paginas.length)
  .map((g) => g.peca)

for (const p of pecas) {
  console.log(`objeto ${p.num}: ${p.largura}x${p.altura}, ${p.cores === 1 ? 'cinza' : 'RGB'}`)
}

if (pecas.length !== 2) {
  console.error(`Esperava duas peças de template, achei ${pecas.length}. Confira o PDF.`)
  process.exit(1)
}

// A de cima é a que aparece mais alta na página. Sem entrar no fluxo de
// conteúdo: o logo da Micro Ka é o mais largo em relação à altura.
const [primeira, segunda] = pecas
const logo = primeira.altura <= segunda.altura ? primeira : segunda
const marca = logo === primeira ? segunda : primeira

const comoTexto = (nome: string, p: (typeof pecas)[number]) =>
  `export const ${nome} = {\n` +
  `  largura: ${p.largura},\n` +
  `  altura: ${p.altura},\n` +
  `  cores: ${p.cores},\n` +
  `  /** Amostras cruas, comprimidas em Flate e em base64. */\n` +
  `  dados:\n    '${Buffer.from(deflateSync(Buffer.from(p.amostras))).toString('base64')}',\n` +
  `}\n`

const saida =
  '// =====================================================================\n' +
  '// O cabeçalho e o rodapé do documento do Canva\n' +
  '// =====================================================================\n' +
  '// Gerado por `ferramentas/extrair-modelo.mts` a partir de um documento\n' +
  '// exportado do Canva. Não editar à mão: rode a ferramenta de novo\n' +
  '// quando o template mudar.\n' +
  '//\n' +
  '// São as mesmas imagens do arquivo original, pixel por pixel — é o que\n' +
  '// faz o PDF gerado aqui passar por um exportado de lá.\n' +
  '// =====================================================================\n\n' +
  comoTexto('LOGO_MICRO_KA', logo) +
  '\n' +
  comoTexto('MARCA_DAGUA_WIT', marca)

const destino = join(RAIZ, 'src', 'lib', 'documento', 'modelo.ts')
writeFileSync(destino, saida)
console.log(`\nEscrito ${destino} (${(saida.length / 1024).toFixed(0)} KB)`)

// Para conferir com o olho: as duas peças em PNG, na pasta pedida.
const pasta = process.argv[3]
if (pasta) {
  for (const [nome, p] of [['logo', logo], ['marca', marca]] as const) {
    writeFileSync(join(pasta, `${nome}.png`), montarPng(p.largura, p.altura, p.cores, p.amostras))
    console.log(`conferência: ${join(pasta, `${nome}.png`)}`)
  }
}

async function sobreBranco(
  amostras: Uint8Array,
  largura: number,
  altura: number,
  cores: number,
  referencia: unknown,
) {
  const mascara = doc.resolver(referencia as never)
  if (!ehDic(mascara)) return amostras

  const objeto = doc.objeto((referencia as { num: number }).num)
  if (!objeto?.bruto) return amostras

  const lm = numeroDe(doc.resolver(mascara.itens.Width)) ?? 0
  const am = numeroDe(doc.resolver(mascara.itens.Height)) ?? 0
  const alfa = await doc.conteudo(objeto)
  if (lm < 1 || am < 1 || alfa.length < lm * am) return amostras

  const saida = new Uint8Array(amostras.length)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      // A máscara pode ter outro tamanho; a leitura é pelo ponto
      // equivalente, sem interpolar (a diferença não aparece a olho).
      const a = alfa[Math.min(am - 1, Math.floor((y * am) / altura)) * lm + Math.min(lm - 1, Math.floor((x * lm) / largura))] / 255
      for (let c = 0; c < cores; c++) {
        const k = (y * largura + x) * cores + c
        saida[k] = Math.round(amostras[k] * a + 255 * (1 - a))
      }
    }
  }
  return saida
}

function montarPng(largura: number, altura: number, cores: number, amostras: Uint8Array) {
  const porLinha = largura * cores
  const comFiltro = Buffer.alloc((porLinha + 1) * altura)
  for (let l = 0; l < altura; l++) {
    comFiltro[l * (porLinha + 1)] = 0
    Buffer.from(amostras.subarray(l * porLinha, (l + 1) * porLinha)).copy(comFiltro, l * (porLinha + 1) + 1)
  }

  const cabecalho = Buffer.alloc(13)
  cabecalho.writeUInt32BE(largura, 0)
  cabecalho.writeUInt32BE(altura, 4)
  cabecalho[8] = 8
  cabecalho[9] = cores === 1 ? 0 : 2

  const pedaco = (tipo: string, dados: Buffer) => {
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
    const saida = Buffer.alloc(corpo.length + 8)
    saida.writeUInt32BE(dados.length, 0)
    corpo.copy(saida, 4)
    saida.writeUInt32BE(crc32(corpo), saida.length - 4)
    return saida
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', cabecalho),
    pedaco('IDAT', deflateSync(comFiltro)),
    pedaco('IEND', Buffer.alloc(0)),
  ])
}

function crc32(dados: Buffer) {
  let c = 0xffffffff
  for (const b of dados) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

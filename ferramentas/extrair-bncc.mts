// =====================================================================
// Extrai as habilidades da BNCC do PDF oficial
// =====================================================================
//
//   curl -sL -o /tmp/bncc.pdf \
//     http://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf
//   node --experimental-strip-types ferramentas/extrair-bncc.mts /tmp/bncc.pdf /tmp/bncc.json
//
// Usa o mesmo leitor de PDF do importador do Canva. São 600 páginas, e
// tudo acontece dentro do código: ninguém precisa ler o documento nem
// digitar habilidade nenhuma.
//
// Sobre o recorte: na tabela da BNCC a coluna "Objetos de conhecimento"
// fica ao lado da coluna "Habilidades", e no texto extraído ela aparece
// GRUDADA no fim da habilidade anterior. Como toda habilidade termina em
// ponto final, o que vem depois do último ponto é o objeto de
// conhecimento — e é ele que serve para agrupar a lista por tema.
// =====================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { Documento } from '../supabase/functions/importar-canva/pdf.ts'
import { textoDaPagina } from '../supabase/functions/importar-canva/texto.ts'

const entrada = process.argv[2] ?? '/tmp/bncc.pdf'
const saida = process.argv[3] ?? '/tmp/bncc.json'

const doc = await Documento.abrir(new Uint8Array(readFileSync(entrada)))
const paginas = doc.paginas()

const pedacos: string[] = []
for (const p of paginas) {
  try {
    pedacos.push(await textoDaPagina(doc, p.dic))
  } catch {
    // página ilegível não derruba as outras
  }
}
const texto = pedacos.join('\n').replace(/\t/g, ' ')

/** "(EF06CI11) Identificar…" até o próximo código. */
const blocos = [...texto.matchAll(
  /\((EF\d{2}[A-Z]{2}\d{2}[A-Z]*)\)\s*([\s\S]*?)(?=\(EF\d{2}[A-Z]{2}\d{2}|\n\s*\n\s*\n|$)/g,
)]

type Habilidade = { codigo: string; descricao: string; objeto: string | null }
const porCodigo = new Map<string, Habilidade>()

/**
 * A última habilidade de cada quadro encosta no cabeçalho da página
 * seguinte ("…do texto. CIÊNCIAS – 2º ANO UNIDADES TEMÁTICAS OBJETOS DE
 * CONHECIMENTO HABILIDADES Vida e evolução…"). Descartar o bloco
 * perderia 113 habilidades de verdade — o certo é cortar no cabeçalho e
 * ficar com o que veio antes dele.
 */
const CABECALHO = /(?:UNIDADES\s+TEM[ÁA]TICAS|OBJETOS\s+DE\s+CONHECIMENTO|\bHABILIDADES\b|[A-ZÀ-Ú]{4,}(?:\s+[A-ZÀ-Ú]+)*\s*[–—-]\s*\d\s*º?\s*ANO)/i

for (const [, codigo, corpo] of blocos) {
  let inteiro = corpo.replace(/\s+/g, ' ').trim()

  const cabecalho = CABECALHO.exec(inteiro)
  if (cabecalho) inteiro = inteiro.slice(0, cabecalho.index).trim()

  if (inteiro.length < 25 || inteiro.length > 1400) continue
  // Habilidade começa com verbo, sempre. Começar com pontuação ou
  // minúscula é sinal de que o recorte pegou o meio de outra coisa.
  if (!/^[A-ZÀ-Ú]/.test(inteiro)) continue

  let descricao = inteiro
  let objeto: string | null = null

  // Não termina em ponto? Então o rabo é a coluna do lado.
  if (!/[.)”’]\s*$/.test(inteiro) || !/\.\s*[)”’]?\s*$/.test(inteiro)) {
    const ultimoPonto = inteiro.lastIndexOf('.')
    if (ultimoPonto > 30 && ultimoPonto < inteiro.length - 1) {
      const rabo = inteiro.slice(ultimoPonto + 1).trim()
      // Rabo com ponto no meio é continuação da própria habilidade, não
      // título de coluna.
      if (rabo.length > 2 && rabo.length < 160 && !rabo.includes('.')) {
        descricao = inteiro.slice(0, ultimoPonto + 1).trim()
        objeto = rabo
      }
    }
  }

  // O mesmo código reaparece nos quadros-resumo; fica a versão maior.
  const anterior = porCodigo.get(codigo)
  if (!anterior || descricao.length > anterior.descricao.length) {
    porCodigo.set(codigo, { codigo, descricao, objeto: objeto ?? anterior?.objeto ?? null })
  }
}

const lista = [...porCodigo.values()]
  .filter((h) => /^EF\d{2}[A-Z]{2}\d{2}$/.test(h.codigo) && h.descricao.length >= 20)
  .sort((a, b) => a.codigo.localeCompare(b.codigo))

writeFileSync(saida, JSON.stringify(lista, null, 0))

const porComponente = new Map<string, number>()
for (const h of lista) porComponente.set(h.codigo.slice(4, 6), (porComponente.get(h.codigo.slice(4, 6)) ?? 0) + 1)

console.log(`páginas lidas: ${paginas.length}`)
console.log(`habilidades: ${lista.length}`)
console.log(`com objeto de conhecimento: ${lista.filter((h) => h.objeto).length}`)
console.log('por componente:', [...porComponente].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}=${n}`).join(' '))
console.log(`gravado em ${saida}`)

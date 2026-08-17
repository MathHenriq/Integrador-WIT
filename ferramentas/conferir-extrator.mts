// =====================================================================
// Confere o extrator contra os casos que não podem quebrar
// =====================================================================
//
//   node ferramentas/gerar-pdf-de-teste.mjs /tmp/canva-falso.pdf
//   node --experimental-strip-types ferramentas/conferir-extrator.mts /tmp/canva-falso.pdf
//
// O extrator usa só APIs da plataforma justamente para rodar aqui no
// Node, sem Deno e sem deploy. O que se confere: o caminho feliz e, mais
// importante, que TODA falha vira frase para o usuário em vez de erro
// cru — documento fora do padrão tem que abrir a tela de conferência
// meio preenchida, nunca uma parede.
// =====================================================================

import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { extrairDoPdf, ErroDeLeitura } from '../supabase/functions/importar-canva/extrair.ts'

let falhas = 0

async function tentar(nome: string, bytes: Uint8Array) {
  try {
    const r = await extrairDoPdf(bytes)
    const preenchidos = Object.entries(r.campos).filter(([k, v]) => k !== 'data_lida' && v).length
    console.log(`${nome}: leu — ${preenchidos} campo(s), ${r.fotos.length} foto(s), ${r.paginas} página(s)`)
    for (const a of r.avisos) console.log(`    aviso: ${a}`)
  } catch (e) {
    // Erro que não é ErroDeLeitura chegaria ao usuário como texto de
    // programador. É isso que este arquivo existe para pegar.
    const cru = !(e instanceof ErroDeLeitura)
    if (cru) falhas++
    console.log(`${nome}: recusou — ${cru ? '[ERRO CRU] ' : '[mensagem ao usuário] '}${(e as Error).message}`)
  }
}

function conferir(oQue: string, deu: unknown, esperado: unknown) {
  const certo = JSON.stringify(deu) === JSON.stringify(esperado)
  if (!certo) falhas++
  console.log(`    ${certo ? 'ok  ' : 'ERRO'} ${oQue}: ${JSON.stringify(deu)}${certo ? '' : ` (esperado ${JSON.stringify(esperado)})`}`)
}

const bom = new Uint8Array(readFileSync(process.argv[2] ?? '/tmp/canva-falso.pdf'))

// 0. O caminho feliz, campo a campo.
console.log('documento do Canva       :')
const lido = await extrairDoPdf(bom)
conferir('tema', lido.campos.tema, 'Astros e planetas no metaverso')
conferir('data', lido.campos.data, '2026-05-14')
conferir('professor', lido.campos.professor, 'Dante')
conferir('escola', lido.campos.escola, 'EMEF Rita de Jesus')
conferir('turma', lido.campos.turma, 'Inclusão')
conferir('curso', lido.campos.curso, 'Inteligência Artificial')
// As 4 fotos de verdade, sem as 2 molduras e sem o ícone.
conferir('fotos', lido.fotos.length, 4)
conferir('formatos', lido.fotos.map((f) => f.tipo), ['image/jpeg', 'image/png', 'image/png', 'image/png'])
// A frase partida em vários Tm tem que voltar inteira, com espaço.
conferir(
  'linha remontada',
  lido.texto.includes('A turma começou na roda de conversa retomando o que já sabia'),
  true,
)

// 1. não é PDF
await tentar('arquivo que não é PDF   ', new TextEncoder().encode('isto aqui é um docx qualquer'))

// 2. PDF cortado no meio (upload interrompido)
await tentar('PDF cortado pela metade  ', bom.subarray(0, Math.floor(bom.length / 2)))

// 3. PDF com miolo embaralhado
const sujo = bom.slice()
for (let k = 3000; k < Math.min(9000, sujo.length); k++) sujo[k] = (sujo[k] + 97) % 256
await tentar('PDF com bytes corrompidos', sujo)

// 4. PDF válido mas sem nenhum rótulo do Canva
const conteudo = deflateSync(Buffer.from('BT /F1 12 Tf 1 0 0 1 60 700 Tm (Relatorio de compras do trimestre) Tj ET\n', 'latin1'))
const pdf = Buffer.concat([
  Buffer.from('%PDF-1.7\n'),
  Buffer.from(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length ${conteudo.length} /Filter /FlateDecode >>\nstream\n`),
  conteudo,
  Buffer.from('\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\ntrailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF\n'),
])
await tentar('PDF sem os rótulos       ', new Uint8Array(pdf))

// 5. PDF sem página nenhuma
await tentar('PDF vazio de página      ', new TextEncoder().encode('%PDF-1.7\ntrailer\n<< >>\n%%EOF\n'))

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} problema(s).`)
process.exit(falhas === 0 ? 0 : 1)

// =====================================================================
// Confere o gerador do documento
// =====================================================================
//
//   node --experimental-strip-types ferramentas/conferir-gerador.mts /tmp/gerado.pdf
//
// Gera um documento com dados de teste e passa o resultado pelo
// **importador** — o mesmo código que lê o PDF do Canva. É a prova que
// vale: se o extrator acha os nove campos e as fotos no arquivo que
// saiu daqui, então o documento gerado é do mesmo tipo que o exportado
// do Canva, e não só parecido de longe.
// =====================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { montarDocumento } from '../src/lib/documento/montar.ts'
import { extrairDoPdf } from '../supabase/functions/importar-canva/extrair.ts'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
let falhas = 0

const dados = {
  escola: 'EMEF Armando Cavazza',
  data: '2026-05-05',
  turma: '8C',
  curso: 'Inteligência Artificial',
  professor: 'Matheus Henrique',
  tema: 'Criação de sites sobre vegetais com IA',
  objetivos:
    'Desenvolver conhecimentos de ciências naturais.\n' +
    'Compreender o funcionamento da tecnologia aliada à IA.\n' +
    'Entender a importância de usar IA na criação e na pesquisa.',
  descricao:
    'Os alunos realizaram uma pesquisa sobre temas de Ciências Naturais para auxílio dos ' +
    'professores com pesquisas e utilizaram a tecnologia como aliada para construir sites usando ' +
    'inteligência artificial. Ao desenvolver com estas tecnologias compreendem melhor seus temas, ' +
    'e desenvolvem juntamente seu conhecimento de uso de tecnologias inovadoras.',
  materiais: 'Computadores\nÓculos de realidade virtual',
}

const foto = new Uint8Array(readFileSync(join(RAIZ, 'public', 'WIT HOME.jpg')))
const bytes = montarDocumento(dados, [{ bytes: foto }, { bytes: foto.slice() }, { bytes: foto.slice() }])

const destino = process.argv[2] ?? '/tmp/gerado.pdf'
writeFileSync(destino, bytes)
console.log(`documento gerado: ${destino} (${(bytes.length / 1024).toFixed(0)} KB)\n`)

function conferir(oQue: string, deu: unknown, esperado: unknown) {
  const certo = JSON.stringify(deu) === JSON.stringify(esperado)
  if (!certo) falhas++
  console.log(
    `${certo ? 'ok  ' : 'ERRO'} ${oQue}: ${JSON.stringify(deu)}` +
      (certo ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  )
}

// O documento gerado, lido pelo importador do Canva.
const lido = await extrairDoPdf(bytes)

conferir('páginas', lido.paginas, 2)
conferir('escola', lido.campos.escola, dados.escola)
conferir('data', lido.campos.data, dados.data)
conferir('turma', lido.campos.turma, dados.turma)
conferir('curso', lido.campos.curso, dados.curso)
conferir('professor', lido.campos.professor, dados.professor)
conferir('tema', lido.campos.tema, dados.tema)
// As três fotos do teste são o mesmo arquivo, e o importador junta
// foto repetida — três desenhos no PDF, uma foto na conferência.
conferir('fotos', lido.fotos.length, 1)

// Nos blocos o que importa é o texto voltar inteiro, e não a quebra de
// linha: quem escreve as linhas é a caixa, não quem digitou.
const juntar = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()
conferir(
  'objetivos',
  juntar(lido.campos.objetivos),
  juntar(dados.objetivos),
)
conferir('descrição', juntar(lido.campos.descricao), juntar(dados.descricao))
conferir('materiais', juntar(lido.campos.materiais), juntar(dados.materiais))

for (const aviso of lido.avisos) console.log(`    aviso: ${aviso}`)

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} problema(s).`)
process.exit(falhas === 0 ? 0 : 1)

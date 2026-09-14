// =====================================================================
// Confere a exportação do documento de uma aula já registrada
// =====================================================================
//
//   node --experimental-strip-types ferramentas/conferir-exportacao.mts /tmp/exportado.pdf
//
// A aba "Integradores" baixa o documento de uma aula que já está no
// site. Como o PDF nunca é guardado, ele é **remontado** a partir do
// que ficou gravado: o relato da vitrine, os campos da reserva e, em
// último caso, a atividade do catálogo.
//
// O que este script prova, em duas partes:
//
//  1. o relato escrito pelas telas do painel volta inteiro quando é
//     lido de trás para frente (é onde moram a descrição, os objetivos,
//     os materiais e o curso de uma aula registrada);
//  2. o documento remontado passa pelo **importador do Canva** com os
//     campos no lugar — o mesmo teste que o `conferir-gerador.mts` faz
//     com o documento novo.
// =====================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { dadosDoDocumento, montarRelato, partesDoRelato } from '../src/lib/documento/dados.ts'
import { montarDocumento } from '../src/lib/documento/montar.ts'
import { extrairDoPdf } from '../supabase/functions/importar-canva/extrair.ts'
import type { ReservaAdmin } from '../src/lib/tipos.ts'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
let falhas = 0

function conferir(oQue: string, deu: unknown, esperado: unknown) {
  const certo = JSON.stringify(deu) === JSON.stringify(esperado)
  if (!certo) falhas++
  console.log(
    `${certo ? 'ok  ' : 'ERRO'} ${oQue}: ${JSON.stringify(deu)}` +
      (certo ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  )
}

// ---------------------------------------------------------------------
// 1. O relato, escrito e lido de volta
// ---------------------------------------------------------------------

const partes = {
  curso: 'Inteligência Artificial',
  descricao:
    'Os alunos pesquisaram temas de Ciências Naturais.\n\nDepois construíram um site com IA.',
  objetivos: 'Desenvolver conhecimentos de ciências naturais.\nCompreender o uso da IA.',
  materiais: 'Computadores\nÓculos de realidade virtual',
}

const relato = montarRelato(partes)
conferir('ida e volta do relato', partesDoRelato(relato), partes)

// Relato do Canva e do gerador de documento: sem a linha do curso.
const semCurso = montarRelato({ ...partes, curso: '' })
conferir('relato sem curso', partesDoRelato(semCurso), { ...partes, curso: '' })

// Relato escrito à mão, na caixinha "Relato e fotos": tudo é descrição.
conferir('relato escrito à mão', partesDoRelato('A turma adorou a aula de hoje.'), {
  curso: '',
  descricao: 'A turma adorou a aula de hoje.',
  objetivos: '',
  materiais: '',
})

// "Curso:" no meio do texto é frase de quem escreveu, e fica onde está.
conferir('"curso:" no meio da descrição', partesDoRelato('A aula abriu o ano.\nCurso: sem isso'), {
  curso: '',
  descricao: 'A aula abriu o ano.\nCurso: sem isso',
  objetivos: '',
  materiais: '',
})

conferir('relato vazio', partesDoRelato(null), {
  curso: '',
  descricao: '',
  objetivos: '',
  materiais: '',
})

// ---------------------------------------------------------------------
// 2. Os campos do documento, tirados da aula registrada
// ---------------------------------------------------------------------

const reserva = {
  id: '00000000-0000-0000-0000-000000000001',
  protocolo: 'WIT-0001',
  escola_id: '00000000-0000-0000-0000-0000000000aa',
  escola_nome: 'EMEF Professor Ézio Berzaghi',
  nome_professor: 'Guilherme Rodrigues',
  turma: '7ºB',
  email_contato: null,
  whatsapp_contato: null,
  quantidade_alunos: 28,
  status: 'confirmado',
  criado_em: '2026-09-11T10:00:00Z',
  cancelado_em: null,
  cancelado_por: null,
  data_aula: '2026-09-11',
  horario_id: '00000000-0000-0000-0000-0000000000bb',
  hora_inicio: '07:20',
  hora_fim: '08:50',
  aula_id: '00000000-0000-0000-0000-0000000000cc',
  aula_titulo: 'Introdução a Algoritmos',
  aula_objetivos: null,
  aula_materiais: null,
  relato,
  fotos: [],
  ja_aconteceu: true,
  origem: 'equipe_wit',
} satisfies ReservaAdmin

const dados = dadosDoDocumento(reserva, null)

conferir('escola', dados.escola, reserva.escola_nome)
conferir('data', dados.data, reserva.data_aula)
conferir('turma', dados.turma, reserva.turma)
conferir('professor', dados.professor, reserva.nome_professor)
conferir('tema', dados.tema, reserva.aula_titulo)
conferir('curso', dados.curso, partes.curso)
conferir('descrição', dados.descricao, partes.descricao)
conferir('objetivos', dados.objetivos, partes.objetivos)
conferir('materiais', dados.materiais, partes.materiais)

// O texto da turma manda no texto do tema: duas turmas podem ter feito a
// mesma proposta, e a atividade do catálogo guarda a descrição da
// primeira delas.
const doCatalogo = {
  descricao: 'Descrição da atividade do catálogo.',
  objetivos: 'Objetivos da atividade.',
  materiais: 'Materiais da atividade.',
}
conferir('relato na frente do catálogo', dadosDoDocumento(reserva, doCatalogo).descricao, partes.descricao)

// Aula do catálogo agendada pela escola: sem relato, o texto vem da
// reserva e, no que ela não tem, da atividade.
const agendada = {
  ...reserva,
  relato: null,
  aula_objetivos: 'O que a professora escreveu ao agendar.',
} satisfies ReservaAdmin

const dadosAgendada = dadosDoDocumento(agendada, doCatalogo)
conferir('objetivos da reserva', dadosAgendada.objetivos, agendada.aula_objetivos)
conferir('descrição do catálogo', dadosAgendada.descricao, doCatalogo.descricao)
conferir('materiais do catálogo', dadosAgendada.materiais, doCatalogo.materiais)
conferir('curso em branco quando ninguém guardou', dadosAgendada.curso, '')

// ---------------------------------------------------------------------
// 3. O documento remontado, lido pelo importador do Canva
// ---------------------------------------------------------------------

const foto = new Uint8Array(readFileSync(join(RAIZ, 'public', 'WIT HOME.jpg')))
const bytes = montarDocumento(dados, [{ bytes: foto }])

const destino = process.argv[2] ?? '/tmp/exportado.pdf'
writeFileSync(destino, bytes)
console.log(`\ndocumento remontado: ${destino} (${(bytes.length / 1024).toFixed(0)} KB)\n`)

const lido = await extrairDoPdf(bytes)
const juntar = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()

conferir('páginas', lido.paginas, 2)
conferir('escola lida', lido.campos.escola, dados.escola)
conferir('data lida', lido.campos.data, dados.data)
conferir('turma lida', lido.campos.turma, dados.turma)
conferir('curso lido', lido.campos.curso, dados.curso)
conferir('professor lido', lido.campos.professor, dados.professor)
conferir('tema lido', lido.campos.tema, dados.tema)
conferir('objetivos lidos', juntar(lido.campos.objetivos), juntar(dados.objetivos))
conferir('descrição lida', juntar(lido.campos.descricao), juntar(dados.descricao))
conferir('materiais lidos', juntar(lido.campos.materiais), juntar(dados.materiais))
conferir('fotos lidas', lido.fotos.length, 1)

for (const aviso of lido.avisos) console.log(`    aviso: ${aviso}`)

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} problema(s).`)
process.exit(falhas === 0 ? 0 : 1)

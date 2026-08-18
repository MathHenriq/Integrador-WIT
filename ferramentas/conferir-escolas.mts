// =====================================================================
// Confere o casamento entre o nome do documento e o do cadastro
// =====================================================================
//
//   node --experimental-strip-types ferramentas/conferir-escolas.mts
//
// A tela de conferência do importador já vem com a escola escolhida
// porque `acharEscola` reconhece o nome escrito no documento do Canva no
// nome oficial do cadastro. Os dois quase nunca são iguais: o documento
// abrevia, esquece o cargo e às vezes troca uma letra do sobrenome.
//
// Cada linha daqui é um jeito real de escrever, e o que tem que sair.
// =====================================================================

import { acharEscola } from '../src/lib/escolas.ts'

/** As dezoito, com os nomes oficiais. */
const NOMES = [
  'EMEF Renato Rosa',
  'EMEF Prefeito Nestor de Camargo',
  'EMEF Professor Ézio Berzaghi',
  'EMEIEF Professor Eneias Raimundo da Silva',
  'Complexo Educacional Professor Carlos Osmarinho de Lima',
  'EMEF Professor Alfredo do Carmo',
  'EMEF Professor Egídio Costa',
  'EMEF Francisco Zacarioto',
  'EMEF Rita de Jesus',
  'EMEF Professora Dalva Fogaça',
  'EMEF Prof. João Tibúrcio Silva Filho',
  'EMEIEF Anna Irene Mazaro de Freitas',
  'EMEIEF Benedito Adherbal Farbo',
  'EMEF Armando Cavazza',
  'EMEIEF Vereadora Elisabet Titto',
  'EMEIEF José Emidio de Aguiar',
  'EMEF Professora Maria Medunekas',
  'EMEF Júlio Gomes Camisão',
]

const escolas = NOMES.map((nome, k) => ({
  id: String(k),
  nome,
  criado_em: '',
  total_horarios: 20,
  horarios_ativos: 20,
  reservas_futuras: 0,
}))

/** [o que está escrito no documento, a escola que tem de sair] */
const CASOS: [string, string][] = [
  ['EMEF Armando Cavazza', 'EMEF Armando Cavazza'],
  ['Armando Cavazza', 'EMEF Armando Cavazza'],
  // Sobrenome com outra grafia: o cadastro tem "Medunekas", o documento
  // costuma trazer "Meduneckas".
  ['EMEF Maria Meduneckas', 'EMEF Professora Maria Medunekas'],
  ['EMEF MARIA MEDUNECKAS - PROF.', 'EMEF Professora Maria Medunekas'],
  ['EMEF Carlos Osmarinho de Lima', 'Complexo Educacional Professor Carlos Osmarinho de Lima'],
  ['EMEIEF Elisabet Titto', 'EMEIEF Vereadora Elisabet Titto'],
  ['EMEF João Tibúrcio', 'EMEF Prof. João Tibúrcio Silva Filho'],
  ['EMEIEF Anna Irene M. Freitas', 'EMEIEF Anna Irene Mazaro de Freitas'],
  ['EMEF Egidio Costa', 'EMEF Professor Egídio Costa'],
  ['EMEF Ezio Berzaghi', 'EMEF Professor Ézio Berzaghi'],
  ['EMEIEF Eneias Raimundo da Silva - Prof.', 'EMEIEF Professor Eneias Raimundo da Silva'],
  ['EMEIEF José Emídio de Aguiar', 'EMEIEF José Emidio de Aguiar'],
  ['EMEF Julio Gomes Camisão', 'EMEF Júlio Gomes Camisão'],
  ['EMEF Nestor de Camargo', 'EMEF Prefeito Nestor de Camargo'],
  // A sigla mudou de EMEIEF para EMEF na relação oficial.
  ['EMEIEF Francisco Zacarioto', 'EMEF Francisco Zacarioto'],
  ['EMEF Dalva Fogaça', 'EMEF Professora Dalva Fogaça'],
  ['EMEIEF Benedito Adherbal', 'EMEIEF Benedito Adherbal Farbo'],
  ['EMEF Alfredo do Carmo', 'EMEF Professor Alfredo do Carmo'],
  ['EMEF Rita de Jesus', 'EMEF Rita de Jesus'],
  ['EMEF Renato Rosa', 'EMEF Renato Rosa'],
  // Escola que não é nossa não pode casar com nenhuma: melhor a equipe
  // escolher na lista do que publicar na escola errada.
  ['Colégio Estadual Qualquer', ''],
]

let falhas = 0
for (const [escrito, esperado] of CASOS) {
  const achou = escolas.find((e) => e.id === acharEscola(escolas, escrito))?.nome ?? ''
  const certo = achou === esperado
  if (!certo) falhas++
  console.log(
    `${certo ? 'ok  ' : 'ERRO'} "${escrito}" → ${achou || '(nenhuma)'}` +
      (certo ? '' : `   (esperado ${esperado || '(nenhuma)'})`),
  )
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} problema(s).`)
process.exit(falhas === 0 ? 0 : 1)

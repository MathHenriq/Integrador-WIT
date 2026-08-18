// =====================================================================
// Achar a escola do documento na lista do cadastro
// =====================================================================
// O documento do Canva traz o nome escrito à mão — "EMEF Maria
// Meduneckas" —, e o cadastro tem o nome oficial — "EMEF Professora
// Maria Medunekas". Casar os dois é o que faz a tela de conferência já
// vir com a escola certa escolhida.
//
// Mora fora do componente porque é regra, não tela: a ferramenta
// `ferramentas/conferir-escolas.mts` roda estes casos sem abrir
// navegador nenhum.
// =====================================================================

import type { EscolaAdmin } from './tipos.ts'

/**
 * Sem acento, sem pontuação e sem as palavras que quase toda escola
 * repete — a sigla e o cargo na frente do nome. O que sobra é o nome de
 * quem dá nome à escola, que é por onde se reconhece qual é.
 */
function chave(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(
      /\b(EMEIEF|EMEF|EMEI|ESCOLA|MUNICIPAL|COMPLEXO|EDUCACIONAL|PROF|PROFA|PROFESSOR|PROFESSORA|PREFEITO|PREFEITA|VEREADOR|VEREADORA|COMPL)\b/g,
      ' ',
    )
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/**
 * As primeiras letras da palavra. É o que faz "MEDUNECKAS" do documento
 * casar com "MEDUNEKAS" do cadastro: nome próprio troca de grafia com
 * frequência, e o começo quase nunca muda.
 */
function comeco(palavra: string) {
  return palavra.slice(0, 6)
}

/**
 * Acha a escola do documento na lista do cadastro. "EMEF Rita de Jesus"
 * tem que encontrar "EMEF Rita de Jesus", e o nome do cadastro às vezes
 * traz um complemento que o documento não tem.
 */
export function acharEscola(escolas: EscolaAdmin[], lido: string | null) {
  if (!lido) return ''

  const alvo = chave(lido)
  if (!alvo) return ''

  const exata = escolas.find((e) => chave(e.nome) === alvo)
  if (exata) return exata.id

  const contida = escolas.find((e) => chave(e.nome).includes(alvo) || alvo.includes(chave(e.nome)))
  if (contida) return contida.id

  // Último recurso: a escola que compartilha mais palavras com o que foi
  // lido. Duas palavras em comum já separam as dezoito com folga.
  const palavras = new Set(
    alvo
      .split(' ')
      .filter((p) => p.length > 2)
      .map(comeco),
  )
  let melhor = { id: '', pontos: 0 }

  for (const escola of escolas) {
    const pontos = chave(escola.nome)
      .split(' ')
      .filter((p) => p.length > 2 && palavras.has(comeco(p))).length
    if (pontos > melhor.pontos) melhor = { id: escola.id, pontos }
  }

  return melhor.pontos >= 2 ? melhor.id : ''
}

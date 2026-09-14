// =====================================================================
// O relato da vitrine, escrito e lido de volta
// =====================================================================
// Três telas do painel gravam o mesmo texto — o gerador de documento, o
// registro rápido e o importador do Canva — e agora uma quarta precisa
// desfazer o que elas fizeram, para remontar o documento de uma aula que
// já está no site. Escrever e ler moram juntos de propósito: mudar o
// formato de um lado sem o outro quebraria a exportação em silêncio, e
// ninguém perceberia até abrir um PDF com a descrição faltando.
//
// Só texto aqui: nada de `fetch`, nada de `document`. É o que deixa o
// `ferramentas/conferir-exportacao.mts` rodar isto no Node, sem navegador.
// =====================================================================

import type { DadosDoDocumento } from './montar.ts'
import type { ReservaAdmin } from '../tipos'

export type PartesDoRelato = {
  /** Só existe quando a aula foi registrada pelo painel; o Canva não guarda. */
  curso: string
  descricao: string
  objetivos: string
  materiais: string
}

const VAZIO: PartesDoRelato = { curso: '', descricao: '', objetivos: '', materiais: '' }

const TITULO_OBJETIVOS = 'Objetivos de aprendizagem'
const TITULO_MATERIAIS = 'Materiais e recursos'

/** Sem acento e sem caixa: "Materiais e Recursos" tem que casar com o título. */
function chave(linha: string) {
  return linha
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * O relato como ele aparece na vitrine: a descrição primeiro, porque é o
 * que conta como a aula foi; objetivos e materiais embaixo, com título,
 * porque é isso que ajuda outro professor a repetir a proposta.
 */
export function montarRelato(partes: Partial<PartesDoRelato>) {
  const curso = (partes.curso ?? '').trim()
  const descricao = (partes.descricao ?? '').trim()
  const objetivos = (partes.objetivos ?? '').trim()
  const materiais = (partes.materiais ?? '').trim()

  const pedacos: string[] = []
  if (curso) pedacos.push(`Curso: ${curso}`)
  if (descricao) pedacos.push(descricao)
  if (objetivos) pedacos.push(`${TITULO_OBJETIVOS}\n${objetivos}`)
  if (materiais) pedacos.push(`${TITULO_MATERIAIS}\n${materiais}`)
  return pedacos.join('\n\n')
}

/**
 * O caminho de volta. Relato escrito à mão (o da caixinha "Relato e
 * fotos") não tem título nenhum: cai inteiro na descrição, que é o que
 * ele é mesmo — o texto de como a aula foi.
 */
export function partesDoRelato(relato: string | null | undefined): PartesDoRelato {
  if (!relato || !relato.trim()) return { ...VAZIO }

  const juntando: Record<'descricao' | 'objetivos' | 'materiais', string[]> = {
    descricao: [],
    objetivos: [],
    materiais: [],
  }
  let curso = ''
  let onde: keyof typeof juntando = 'descricao'

  for (const linha of relato.replace(/\r\n/g, '\n').split('\n')) {
    const marca = chave(linha)

    // "Curso: Games" só vale na abertura, onde o `montarRelato` o escreve.
    // No meio da descrição é frase da pessoa, e frase da pessoa fica.
    if (marca.startsWith('curso:') && !curso && juntando.descricao.every((l) => !l.trim())) {
      curso = linha.slice(linha.indexOf(':') + 1).trim()
      continue
    }

    if (marca === chave(TITULO_OBJETIVOS)) {
      onde = 'objetivos'
      continue
    }

    if (marca === chave(TITULO_MATERIAIS) || marca === chave(`${TITULO_MATERIAIS} necessários`)) {
      onde = 'materiais'
      continue
    }

    juntando[onde].push(linha)
  }

  return {
    curso,
    descricao: juntando.descricao.join('\n').trim(),
    objetivos: juntando.objetivos.join('\n').trim(),
    materiais: juntando.materiais.join('\n').trim(),
  }
}

/** O que o catálogo sabe do tema, quando a reserva veio de uma atividade. */
export type AulaDoDocumento = {
  descricao: string | null
  objetivos: string | null
  materiais: string | null
}

/**
 * Os campos do documento de uma aula que já está registrada.
 *
 * A ordem das fontes não é capricho: o relato é o texto **daquela
 * turma**, a atividade do catálogo é o texto **do tema**. Duas turmas
 * podem ter feito a mesma proposta, e a atividade guarda a descrição da
 * primeira — por isso ela entra só onde a aula não tem texto próprio.
 *
 * O curso pode acabar em branco: quem registrou pelo Canva não informa
 * esse campo em lugar nenhum que o site leia. Fica vazio no documento,
 * como no papel, em vez de sair inventado.
 */
export function dadosDoDocumento(reserva: ReservaAdmin, aula: AulaDoDocumento | null): DadosDoDocumento {
  const partes = partesDoRelato(reserva.relato)

  const escolher = (...candidatos: (string | null | undefined)[]) =>
    candidatos.map((c) => (c ?? '').trim()).find((c) => c !== '') ?? ''

  return {
    escola: reserva.escola_nome,
    data: reserva.data_aula,
    turma: reserva.turma ?? '',
    curso: partes.curso,
    professor: reserva.nome_professor,
    tema: reserva.aula_titulo ?? '',
    objetivos: escolher(partes.objetivos, reserva.aula_objetivos, aula?.objetivos),
    descricao: escolher(partes.descricao, aula?.descricao),
    materiais: escolher(partes.materiais, reserva.aula_materiais, aula?.materiais),
  }
}

/** O nome do arquivo, igual venha de onde vier o documento. */
export function nomeDoDocumento(escola: string, data: string) {
  return `Projeto Integrador - ${escola} - ${data}.pdf`
}

// =====================================================================
// Refazer o documento de um projeto integrador já registrado
// =====================================================================
// O PDF nunca foi guardado em lugar nenhum: ele é montado no navegador e
// vive só na tela "Documento pronto". Quem trocasse de aba, atualizasse
// a página ou tivesse o download automático bloqueado ficava sem o
// arquivo e sem nenhum jeito de pedir de novo — e quem registrou pela
// aba "Registrar projeto" nunca teve documento nenhum para começo de
// conversa.
//
// A saída é remontar: os campos e as fotos estão todos gravados, então o
// documento pode ser refeito na hora, a partir da reserva, pelo mesmo
// montador que gerou o original. Guardar o PDF no Storage resolveria só
// os próximos; refazer resolve também os que já estão lá atrás.
// =====================================================================

import { situacaoDoIntegrador } from '../formato'
import { paraJpeg } from '../imagem'
import type { FotoParaDocumento } from './montar.ts'
import type { ReservaAdmin } from '../tipos'

/**
 * Se vale a pena refazer o documento desta reserva.
 *
 * Documento é de aula que aconteceu. Cancelada não tem documento; e uma
 * aula ainda por vir só entra quando já tem relato ou foto — que é o
 * caso da aula registrada hoje, cujo tempo ainda não terminou e que por
 * isso o sistema ainda chama de "agendada".
 *
 * Mora aqui porque o botão de cada linha e o pacote em lote precisam
 * responder a mesma coisa: duas regras parecidas viravam duas respostas
 * diferentes para o mesmo projeto.
 */
export function valeDocumento(reserva: ReservaAdmin) {
  const situacao = situacaoDoIntegrador(reserva)
  if (situacao === 'cancelada') return false
  return situacao === 'realizada' || !!reserva.relato || reserva.fotos.length > 0
}

/** Os títulos que as três telas escrevem dentro do relato. */
const SECAO_OBJETIVOS = /^objetivos de aprendizagem$/i
const SECAO_MATERIAIS = /^materiais e recursos$/i
const LINHA_DO_CURSO = /^curso:\s*(.+)$/i

type PartesDoRelato = {
  curso: string
  descricao: string
  objetivos: string
  materiais: string
}

/**
 * Desmonta o relato de volta nos campos do documento.
 *
 * O relato é montado do mesmo jeito nos três caminhos que publicam uma
 * aula — o gerador de documento, o registro rápido e a importação do
 * Canva: a descrição solta, e depois os objetivos e os materiais cada um
 * embaixo do seu título. É esse formato que se lê aqui de volta.
 *
 * Relato escrito à mão (a caixa "Relato e fotos") não tem título nenhum:
 * o texto inteiro vira a descrição da aula, que é o que ele é.
 */
export function partesDoRelato(relato: string | null): PartesDoRelato {
  const partes: PartesDoRelato = { curso: '', descricao: '', objetivos: '', materiais: '' }
  if (!relato) return partes

  const descricao: string[] = []

  for (const bloco of relato.split(/\n\s*\n/)) {
    const texto = bloco.trim()
    if (!texto) continue

    const quebra = texto.indexOf('\n')
    const primeira = (quebra === -1 ? texto : texto.slice(0, quebra)).trim()
    const resto = quebra === -1 ? '' : texto.slice(quebra + 1).trim()

    const curso = primeira.match(LINHA_DO_CURSO)
    if (curso && !partes.curso) {
      partes.curso = curso[1].trim()
      // "Curso: X" costuma vir sozinho no bloco, mas se vier colado no
      // texto da aula o resto continua sendo descrição.
      if (resto) descricao.push(resto)
      continue
    }

    if (SECAO_OBJETIVOS.test(primeira)) {
      partes.objetivos = resto
      continue
    }

    if (SECAO_MATERIAIS.test(primeira)) {
      partes.materiais = resto
      continue
    }

    descricao.push(texto)
  }

  partes.descricao = descricao.join('\n\n')
  return partes
}

/**
 * Os bytes da foto em JPEG, que é o único formato que o documento sabe
 * embutir. A foto hospedada quase sempre já é JPEG (toda foto que sai do
 * painel passa pelo `paraJpeg`), mas as que vêm de dentro de um PDF do
 * Canva podem ser PNG — essas dão a volta pelo canvas.
 */
async function fotoEmJpeg(
  endereco: string,
  medidasDoJpeg: (bytes: Uint8Array) => unknown,
): Promise<Uint8Array> {
  const resposta = await fetch(endereco)
  if (!resposta.ok) throw new Error(`A foto não respondeu (${resposta.status}).`)

  const blob = await resposta.blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (medidasDoJpeg(bytes)) return bytes

  const convertida = await paraJpeg(new File([blob], 'foto', { type: blob.type || 'image/png' }))
  return new Uint8Array(await convertida.arrayBuffer())
}

/**
 * O que o documento precisa saber sobre a aula.
 *
 * Uma `ReservaAdmin` serve como está — tem todos estes campos. O tipo
 * existe mais estreito porque a tela que acabou de registrar o projeto
 * ainda não tem uma reserva na mão: tem o que ela mesma preencheu, e
 * isso basta.
 */
export type AulaParaDocumento = {
  escola_nome: string
  data_aula: string
  turma: string | null
  nome_professor: string
  aula_titulo: string | null
  aula_objetivos?: string | null
  aula_materiais?: string | null
  relato: string | null
  fotos: string[]
}

/**
 * Remonta o documento de uma aula já registrada.
 *
 * Devolve também quantas fotos ficaram de fora: foto que não abre não
 * pode derrubar o documento inteiro — o resto da aula continua valendo —
 * mas quem baixou precisa saber que o arquivo saiu incompleto.
 */
export async function refazerDocumento(reserva: AulaParaDocumento) {
  // O montador carrega junto o modelo do Canva, que é grande. Só entra
  // no navegador de quem realmente pediu um documento.
  const [{ montarDocumento }, { medidasDoJpeg }] = await Promise.all([
    import('./montar.ts'),
    import('./escritor.ts'),
  ])

  const partes = partesDoRelato(reserva.relato)

  const fotos: FotoParaDocumento[] = []
  let perdidas = 0
  for (const endereco of reserva.fotos) {
    try {
      fotos.push({ bytes: await fotoEmJpeg(endereco, medidasDoJpeg) })
    } catch {
      perdidas++
    }
  }

  const bytes = montarDocumento(
    {
      escola: reserva.escola_nome,
      data: reserva.data_aula,
      turma: reserva.turma ?? '',
      curso: partes.curso,
      professor: reserva.nome_professor,
      tema: reserva.aula_titulo ?? '',
      // Objetivos e materiais de uma reserva feita pelo site moram em
      // coluna própria; nas outras, dentro do relato. Os dois valem.
      objetivos: partes.objetivos || reserva.aula_objetivos?.trim() || '',
      descricao: partes.descricao,
      materiais: partes.materiais || reserva.aula_materiais?.trim() || '',
    },
    fotos,
  )

  return {
    bytes,
    nome: `Projeto Integrador - ${reserva.escola_nome} - ${reserva.data_aula}.pdf`,
    perdidas,
  }
}

/**
 * Entrega o arquivo ao navegador.
 *
 * O gatilho entra na página antes do clique: âncora solta funciona no
 * Chrome, mas não em todo navegador, e um download que falha calado é
 * exatamente o problema que este botão veio resolver.
 */
export function baixar(conteudo: Uint8Array | Blob, nome: string) {
  const arquivo =
    conteudo instanceof Blob
      ? conteudo
      : new Blob([conteudo as BlobPart], { type: 'application/pdf' })
  const endereco = URL.createObjectURL(arquivo)
  const gatilho = document.createElement('a')
  gatilho.href = endereco
  gatilho.download = nome
  gatilho.style.display = 'none'
  document.body.appendChild(gatilho)
  gatilho.click()
  gatilho.remove()
  // Soltar na hora cancelaria o download no Firefox, que lê o endereço
  // depois do clique.
  setTimeout(() => URL.revokeObjectURL(endereco), 30_000)
}

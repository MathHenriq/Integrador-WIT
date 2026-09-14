// =====================================================================
// O documento de uma aula que já está no site
// =====================================================================
// O PDF não é guardado em lugar nenhum: do documento do Canva o site
// guarda o hash, as fotos e os campos lidos — nunca o arquivo. Quem
// registrou pela aba "Registrar projeto" nunca teve PDF nenhum. Então
// exportar é **remontar**, com o mesmo gerador da aba "Novo documento",
// a partir do que ficou gravado na aula.
//
// Isto roda no navegador (busca as fotos hospedadas e, quando precisa,
// reconverte), e por isso é carregado sob demanda: quem só abre a aba
// dos integradores não baixa o gerador junto.
// =====================================================================

import { dadosDoDocumento, nomeDoDocumento, type AulaDoDocumento } from './dados.ts'
import { medidasDoJpeg } from './escritor.ts'
import { montarDocumento, type FotoParaDocumento } from './montar.ts'
import { paraJpeg } from '../imagem'
import type { ReservaAdmin } from '../tipos'

export type DocumentoDaAula = {
  bytes: Uint8Array
  nome: string
  /** Fotos que não deu para buscar — link de fora do site que recusa download. */
  perdidas: number
}

/**
 * As fotos do site já são JPEG, e JPEG entra no PDF inteiro, sem
 * reconversão — é o caminho fiel. A reconversão existe para o link de
 * fora que a equipe cola na caixinha "Relato e fotos": pode ser PNG, e
 * PNG o gerador não sabe embutir.
 */
async function buscarFoto(endereco: string): Promise<Uint8Array | null> {
  const resposta = await fetch(endereco)
  if (!resposta.ok) return null

  const blob = await resposta.blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (medidasDoJpeg(bytes)) return bytes

  const jpeg = await paraJpeg(blob, 'a foto da aula')
  return new Uint8Array(await jpeg.arrayBuffer())
}

export async function exportarDocumento(
  reserva: ReservaAdmin,
  aula: AulaDoDocumento | null,
): Promise<DocumentoDaAula> {
  const buscadas = await Promise.all(
    reserva.fotos.map(async (endereco) => {
      try {
        return await buscarFoto(endereco)
      } catch {
        // Link de fora sem permissão de download derruba o `fetch`. Uma
        // foto a menos não pode custar o documento inteiro: a tela avisa
        // quantas ficaram de fora, e o resto sai como sempre.
        return null
      }
    }),
  )

  const fotos: FotoParaDocumento[] = buscadas
    .filter((bytes): bytes is Uint8Array => bytes !== null)
    .map((bytes) => ({ bytes }))

  const dados = dadosDoDocumento(reserva, aula)

  return {
    bytes: montarDocumento(dados, fotos),
    nome: nomeDoDocumento(dados.escola, dados.data),
    perdidas: buscadas.length - fotos.length,
  }
}

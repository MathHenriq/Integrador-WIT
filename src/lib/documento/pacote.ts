// =====================================================================
// Pacote de documentos — vários projetos integradores num arquivo só
// =====================================================================
// O coordenador precisa mandar ao gestor da prefeitura todos os projetos
// de um período. Baixar um por um é o que este arquivo existe para
// evitar: escolhe-se o período (e a escola, se for o caso) e sai um ZIP
// com um PDF por projeto.
//
// Por que um ZIP e não vários downloads seguidos: o navegador bloqueia
// download automático em série — o Chrome pergunta "permitir vários
// downloads?" e o Safari simplesmente ignora o resto. E um anexo só é o
// que o coordenador manda por e-mail de qualquer jeito.
//
// O ZIP é escrito aqui, sem biblioteca, pelo mesmo motivo do leitor e do
// escritor de PDF: é pouca coisa. Os arquivos entram **guardados**, sem
// compressão — PDF já é comprimido por dentro, e espremer de novo custa
// tempo para ganhar quase nada.
// =====================================================================

import { refazerDocumento } from './refazer'
import type { ReservaAdmin } from '../tipos'

export type ArquivoDoPacote = { nome: string; bytes: Uint8Array }

// ------------------------------------------------------------ o ZIP

/** Tabela do CRC-32, que o ZIP exige para cada arquivo. */
const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[n] = c >>> 0
  }
  return tabela
})()

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Data e hora no formato do DOS, que é o que o ZIP guarda. */
function momentoDos(quando: Date) {
  return {
    hora: (quando.getHours() << 11) | (quando.getMinutes() << 5) | (quando.getSeconds() >> 1),
    data: ((quando.getFullYear() - 1980) << 9) | ((quando.getMonth() + 1) << 5) | quando.getDate(),
  }
}

/**
 * Monta o ZIP. Cada arquivo entra duas vezes na conta: uma no corpo
 * (cabeçalho local + bytes) e outra no diretório central do fim, que é
 * por onde o descompactador lê a lista.
 *
 * O bit 11 das flags marca o nome em UTF-8 — sem ele, "Egídio" e
 * "Camisão" chegam quebrados no Windows.
 */
export function montarZip(arquivos: ArquivoDoPacote[]): Blob {
  const codificador = new TextEncoder()
  const corpo: BlobPart[] = []
  const centrais: Uint8Array[] = []
  const { hora, data } = momentoDos(new Date())
  let deslocamento = 0

  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.nome)
    const crc = crc32(arquivo.bytes)
    const tamanho = arquivo.bytes.length

    const local = new Uint8Array(30 + nome.length)
    const l = new DataView(local.buffer)
    l.setUint32(0, 0x04034b50, true)
    l.setUint16(4, 20, true)
    l.setUint16(6, 0x0800, true)
    l.setUint16(8, 0, true)
    l.setUint16(10, hora, true)
    l.setUint16(12, data, true)
    l.setUint32(14, crc, true)
    l.setUint32(18, tamanho, true)
    l.setUint32(22, tamanho, true)
    l.setUint16(26, nome.length, true)
    local.set(nome, 30)
    corpo.push(local, arquivo.bytes as BlobPart)

    const central = new Uint8Array(46 + nome.length)
    const c = new DataView(central.buffer)
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, hora, true)
    c.setUint16(14, data, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, tamanho, true)
    c.setUint32(24, tamanho, true)
    c.setUint16(28, nome.length, true)
    c.setUint32(42, deslocamento, true)
    central.set(nome, 46)
    centrais.push(central)

    deslocamento += local.length + tamanho
  }

  const tamanhoCentral = centrais.reduce((soma, c) => soma + c.length, 0)

  const fim = new Uint8Array(22)
  const f = new DataView(fim.buffer)
  f.setUint32(0, 0x06054b50, true)
  f.setUint16(8, arquivos.length, true)
  f.setUint16(10, arquivos.length, true)
  f.setUint32(12, tamanhoCentral, true)
  f.setUint32(16, deslocamento, true)

  return new Blob([...corpo, ...(centrais as BlobPart[]), fim], { type: 'application/zip' })
}

// ------------------------------------------------------- os nomes

/** Caracteres que o Windows não aceita em nome de arquivo. */
function nomeSeguro(texto: string) {
  return texto.replace(/[\\/:*?"<>|]/g, '-').trim()
}

/**
 * O nome de cada PDF: **Projeto Integrador - Escola - Data**, o mesmo
 * padrão do documento baixado avulso. A data fica em AAAA-MM-DD de
 * propósito: assim a pasta ordena sozinha na ordem em que as aulas
 * aconteceram.
 *
 * Duas aulas da mesma escola no mesmo dia dariam o mesmo nome — nesse
 * caso, e só nele, o horário entra no fim das duas. Desempatar com "(2)"
 * diria qual é a segunda, mas não qual aula ela é.
 */
export function nomesDoPacote(reservas: ReservaAdmin[]) {
  const quantos = new Map<string, number>()
  for (const r of reservas) {
    const base = `Projeto Integrador - ${nomeSeguro(r.escola_nome)} - ${r.data_aula}`
    quantos.set(base, (quantos.get(base) ?? 0) + 1)
  }

  const usados = new Set<string>()
  return reservas.map((r) => {
    const base = `Projeto Integrador - ${nomeSeguro(r.escola_nome)} - ${r.data_aula}`
    let nome = `${base}.pdf`

    if ((quantos.get(base) ?? 0) > 1) {
      nome = `${base} - ${r.hora_inicio.slice(0, 5).replace(':', 'h')}.pdf`
    }

    // Rede de segurança: mesmo com o horário, dois registros podem cair
    // no mesmo nome. Nenhum arquivo pode sumir dentro do pacote.
    let n = 2
    while (usados.has(nome)) nome = `${base} (${n++}).pdf`
    usados.add(nome)
    return nome
  })
}

// ---------------------------------------------------- o pacote todo

export type Andamento = { feitos: number; total: number; atual: string }

/**
 * Remonta o documento de cada projeto e devolve o ZIP.
 *
 * Projeto que falha não derruba o pacote: o nome dele volta na lista de
 * falhas, e os outros continuam. Um pacote com 11 de 12 documentos, e a
 * tela dizendo qual faltou, serve; um erro na tela e nenhum arquivo, não.
 */
export async function montarPacote(
  reservas: ReservaAdmin[],
  aoAndar: (andamento: Andamento) => void,
) {
  const nomes = nomesDoPacote(reservas)
  const arquivos: ArquivoDoPacote[] = []
  const falhas: string[] = []
  let fotosPerdidas = 0

  for (const [indice, reserva] of reservas.entries()) {
    aoAndar({ feitos: indice, total: reservas.length, atual: reserva.escola_nome })
    try {
      const { bytes, perdidas } = await refazerDocumento(reserva)
      arquivos.push({ nome: nomes[indice], bytes })
      fotosPerdidas += perdidas
    } catch {
      falhas.push(`${reserva.escola_nome}, ${reserva.data_aula}`)
    }
  }

  aoAndar({ feitos: reservas.length, total: reservas.length, atual: '' })
  return { zip: montarZip(arquivos), arquivos: arquivos.length, falhas, fotosPerdidas }
}

// =====================================================================
// O documento de aula, do jeito que sai do Canva
// =====================================================================
// Todas as medidas daqui foram lidas do PDF que a equipe exporta hoje:
// as caixas são os retângulos brancos do próprio arquivo, as posições do
// logo e da marca d'água são as matrizes com que o Canva os desenha, e
// os tamanhos de letra são os do texto de lá. Nada foi estimado a olho.
//
// A folha tem 595,5 × 842,2 pontos — não é o A4 redondo, é a medida do
// documento original, e é ela que faz o arquivo gerado aqui abrir do
// mesmo tamanho que o exportado.
//
// Quando o template mudar no Canva, rode `ferramentas/extrair-modelo.mts`
// para trocar o logo e a marca, e confira estas medidas com
// `ferramentas/conferir-gerador.mts`.
//
// Isto roda no navegador: o documento é montado na máquina de quem
// preencheu o formulário e sobe pronto, pelo mesmo caminho por onde
// entra um PDF do Canva. Nenhuma linha daqui usa API de servidor.
// =====================================================================

import { Conteudo, Documento, type ImagemPdf, larguraDoTexto, medidasDoJpeg, quebrarLinhas } from './escritor.ts'
import { LOGO_MICRO_KA, MARCA_DAGUA_WIT } from './modelo.ts'

const PAGINA = { largura: 595.5, altura: 842.2 }

/** O logo entra sangrando na margem esquerda, como no original. */
const LOGO = { x: -7.1, y: 748.1, largura: 133.6, altura: 96 }
const MARCA = { x: 404.2, y: 57.5, largura: 165.8, altura: 123.8 }
const MARCA_DAS_FOTOS = { x: 402.1, y: 50.2, largura: 165.8, altura: 123.8 }

type Caixa = { x: number; y: number; largura: number; altura: number }

const CAIXAS: Record<string, Caixa> = {
  escola: { x: 135.61, y: 805.67, largura: 268.42, altura: 28.95 },
  data: { x: 411.84, y: 807.07, largura: 157.98, altura: 27.85 },
  turma: { x: 135.61, y: 771.87, largura: 116.26, altura: 28.95 },
  curso: { x: 257.16, y: 771.7, largura: 139.7, altura: 28.95 },
  professor: { x: 404.03, y: 771.22, largura: 165.79, altura: 28.95 },
  tema: { x: 115.51, y: 721.39, largura: 458.14, altura: 33.19 },
  objetivos: { x: 18.54, y: 551.78, largura: 557.52, altura: 114.97 },
  descricao: { x: 18.54, y: 396.65, largura: 559.31, altura: 126.66 },
  materiais: { x: 18.54, y: 292.05, largura: 559.31, altura: 73.43 },
  fotos: { x: 16.05, y: 52.55, largura: 561.7, altura: 208.24 },
}

/** A caixa que ocupa a página das fotos, e o quadro de cada foto nela. */
const CAIXA_DAS_FOTOS: Caixa = { x: 19.2, y: 44.5, largura: 554.9, altura: 700.1 }
const QUADRO = { largura: 252.8, altura: 189.8, esquerda: 26.2, direita: 315.4, topo: 731.9, respiro: 12.7 }

const RECUO = 6.4
const TAMANHO_ROTULO = 12
const TAMANHO_CAMPO = 11

export type DadosDoDocumento = {
  escola: string
  /** "AAAA-MM-DD"; sai no documento como "DD/MM/AAAA". */
  data: string
  turma: string
  curso: string
  professor: string
  tema: string
  objetivos: string
  descricao: string
  materiais: string
}

export type FotoParaDocumento = { bytes: Uint8Array }

/** "2026-05-05" vira "05/05/2026", sem passar por Date. */
function dataCurta(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}

function imagemDoModelo(apelido: string, peca: typeof LOGO_MICRO_KA): ImagemPdf {
  const binario = atob(peca.dados)
  const bytes = new Uint8Array(binario.length)
  for (let k = 0; k < binario.length; k++) bytes[k] = binario.charCodeAt(k)
  return {
    apelido,
    bytes,
    largura: peca.largura,
    altura: peca.altura,
    cores: peca.cores,
    filtro: 'FlateDecode',
  }
}

/**
 * Escreve o bloco dentro da caixa, diminuindo a letra até caber. O
 * documento do Canva quebra quando o professor escreve demais — aqui o
 * texto sempre entra, e é a única liberdade que este arquivo toma em
 * relação ao original.
 */
function blocoQueCabe(
  conteudo: Conteudo,
  caixa: Caixa,
  texto: string,
  opcoes: { tamanho: number; entrelinha: number; recuoX: number; recuoTopo: number; marcadores?: boolean },
) {
  const limpo = texto.trim()
  if (limpo === '') return

  const largura = caixa.largura - opcoes.recuoX - RECUO

  let tamanho = opcoes.tamanho
  let entrelinha = opcoes.entrelinha
  for (; tamanho > 7.5; tamanho -= 0.5, entrelinha = (opcoes.entrelinha / opcoes.tamanho) * tamanho) {
    const linhas = limpo
      .split('\n')
      .filter((l) => l.trim() !== '')
      .reduce(
        (soma, paragrafo) =>
          soma + quebrarLinhas(paragrafo, tamanho, opcoes.marcadores ? largura - 9 : largura).length,
        0,
      )
    // Da primeira base até a última, mais o rabo das letras que descem.
    const precisa = opcoes.recuoTopo + (linhas - 1) * entrelinha + tamanho * 0.3
    if (precisa <= caixa.altura) break
  }

  conteudo.bloco(
    caixa.x + opcoes.recuoX,
    caixa.y + caixa.altura - opcoes.recuoTopo,
    tamanho,
    largura,
    entrelinha,
    limpo,
    opcoes.marcadores,
  )
}

/** Um campo do cabeçalho: o rótulo em negrito e o valor na sequência. */
function campo(conteudo: Conteudo, caixa: Caixa, rotulo: string, valor: string, alturaDaLinha: number) {
  const y = caixa.y + alturaDaLinha
  conteudo.texto(caixa.x + RECUO, y, TAMANHO_CAMPO, rotulo)

  const inicio = caixa.x + RECUO + larguraDoTexto(rotulo, TAMANHO_CAMPO)
  const sobra = caixa.x + caixa.largura - RECUO - inicio

  // Nome de escola comprido não pode sair da caixa nem empurrar o
  // vizinho: encolhe a letra até caber, como o Canva faz na mão.
  let tamanho = TAMANHO_CAMPO
  while (tamanho > 6 && larguraDoTexto(valor, tamanho) > sobra) tamanho -= 0.25
  conteudo.texto(inicio, y, tamanho, valor)
}

export function montarDocumento(dados: DadosDoDocumento, fotos: FotoParaDocumento[]) {
  const pdf = new Documento(PAGINA.largura, PAGINA.altura)
  const logo = imagemDoModelo('Logo', LOGO_MICRO_KA)
  const marca = imagemDoModelo('Marca', MARCA_DAGUA_WIT)

  // ------------------------------------------------------------------
  // Página 1: os campos
  // ------------------------------------------------------------------

  const capa = new Conteudo()
  for (const caixa of Object.values(CAIXAS)) capa.caixa(caixa.x, caixa.y, caixa.largura, caixa.altura)
  capa.imagem(logo.apelido, LOGO.x, LOGO.y, LOGO.largura, LOGO.altura)
  capa.imagem(marca.apelido, MARCA.x, MARCA.y, MARCA.largura, MARCA.altura)

  campo(capa, CAIXAS.escola, 'Escola: ', dados.escola, 10.7)
  campo(capa, CAIXAS.data, 'Data: ', dataCurta(dados.data), 9.3)
  campo(capa, CAIXAS.turma, 'Turma: ', dados.turma, 11.1)
  campo(capa, CAIXAS.curso, 'Curso: ', dados.curso, 11.3)
  campo(capa, CAIXAS.professor, 'Prof.: ', dados.professor, 11.8)

  capa.texto(19, CAIXAS.tema.y + 13.6, TAMANHO_ROTULO, 'TEMA DA AULA:')
  blocoQueCabe(capa, CAIXAS.tema, dados.tema, {
    tamanho: TAMANHO_ROTULO,
    entrelinha: 14,
    recuoX: RECUO,
    recuoTopo: 19.6,
  })

  const rotuloDaSecao = (caixa: Caixa, texto: string) =>
    capa.texto(19, caixa.y + caixa.altura + 9.3, TAMANHO_ROTULO, texto)

  rotuloDaSecao(CAIXAS.objetivos, 'OBJETIVOS DE APRENDIZAGEM')
  blocoQueCabe(capa, CAIXAS.objetivos, dados.objetivos, {
    tamanho: TAMANHO_CAMPO,
    entrelinha: 15,
    recuoX: 27.5,
    recuoTopo: 13.7,
    marcadores: true,
  })

  rotuloDaSecao(CAIXAS.descricao, 'DESCRIÇÃO DA AULA')
  blocoQueCabe(capa, CAIXAS.descricao, dados.descricao, {
    tamanho: 14,
    entrelinha: 19.5,
    recuoX: 12.5,
    recuoTopo: 19.3,
  })

  rotuloDaSecao(CAIXAS.materiais, 'MATERIAIS E RECURSOS NECESSÁRIOS')
  blocoQueCabe(capa, CAIXAS.materiais, dados.materiais, {
    tamanho: TAMANHO_CAMPO,
    entrelinha: 15,
    recuoX: 27.5,
    recuoTopo: 17.5,
    marcadores: true,
  })

  rotuloDaSecao(CAIXAS.fotos, 'FOTOS')

  pdf.pagina(capa, [logo, marca])

  // ------------------------------------------------------------------
  // Página 2 em diante: as fotos
  // ------------------------------------------------------------------
  // Seis por página, duas por linha, cada uma no quadro em que o Canva
  // as coloca. Foto que não é 4:3 entra inteira e centralizada: cortar
  // pedaço de foto de criança sem ninguém pedir seria pior.

  const linhasPorPagina = Math.floor(
    (QUADRO.topo - CAIXA_DAS_FOTOS.y + QUADRO.respiro) / (QUADRO.altura + QUADRO.respiro),
  )
  const porPagina = linhasPorPagina * 2

  for (let inicio = 0; inicio === 0 || inicio < fotos.length; inicio += porPagina) {
    const pagina = new Conteudo()
    pagina.caixa(CAIXA_DAS_FOTOS.x, CAIXA_DAS_FOTOS.y, CAIXA_DAS_FOTOS.largura, CAIXA_DAS_FOTOS.altura)
    pagina.imagem(logo.apelido, LOGO.x, LOGO.y, LOGO.largura, LOGO.altura)
    pagina.imagem(marca.apelido, MARCA_DAS_FOTOS.x, MARCA_DAS_FOTOS.y, MARCA_DAS_FOTOS.largura, MARCA_DAS_FOTOS.altura)

    const desta: ImagemPdf[] = [logo, marca]

    fotos.slice(inicio, inicio + porPagina).forEach((foto, k) => {
      const medidas = medidasDoJpeg(foto.bytes)
      if (!medidas) return

      const apelido = `F${inicio + k}`
      const coluna = k % 2
      const linha = Math.floor(k / 2)
      const quadroX = coluna === 0 ? QUADRO.esquerda : QUADRO.direita
      const quadroTopo = QUADRO.topo - linha * (QUADRO.altura + QUADRO.respiro)

      const escala = Math.min(QUADRO.largura / medidas.largura, QUADRO.altura / medidas.altura)
      const largura = medidas.largura * escala
      const altura = medidas.altura * escala

      pagina.imagem(
        apelido,
        quadroX + (QUADRO.largura - largura) / 2,
        quadroTopo - QUADRO.altura + (QUADRO.altura - altura) / 2,
        largura,
        altura,
      )

      desta.push({ apelido, bytes: foto.bytes, ...medidas, filtro: 'DCTDecode' })
    })

    pdf.pagina(pagina, desta)
  }

  return pdf.montar()
}

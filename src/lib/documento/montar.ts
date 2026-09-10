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

/**
 * O logo entra sangrando na margem esquerda, como no original. No Canva
 * ele vinha com um filete vertical colado na direita, que no papel
 * aparecia como um risco solto ao lado do cabeçalho; a extração apara
 * esse filete, e por isso a largura sai da imagem — o desenho não pode
 * esticar para ocupar o lugar de onde a linha estava. A escala é a do
 * documento original: 320 px do logo ocupavam 133,6 pt de papel.
 */
const PONTOS_POR_PIXEL_DO_LOGO = 133.6 / 320
const LOGO = {
  x: -7.1,
  y: 748.1,
  largura: LOGO_MICRO_KA.largura * PONTOS_POR_PIXEL_DO_LOGO,
  altura: 96,
}
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

// O documento sai com uma letra só. No Canva cada caixa era escrita à
// mão, e o arquivo terminava com a descrição maior que os objetivos e o
// nome do professor menor que a turma — texto grande e pequeno na mesma
// folha. Aqui o tamanho é decidido para o grupo inteiro: o corpo mede as
// três caixas juntas e usa o maior tamanho em que TODAS cabem; o
// cabeçalho faz o mesmo com os cinco campos.

/** Tamanho de partida do corpo, e o piso de onde ele não desce. */
const TAMANHO_CORPO = 12
const MENOR_CORPO = 7.5
const PASSO_CORPO = 0.5

/** Piso e passo do cabeçalho, que parte de TAMANHO_CAMPO. */
const MENOR_CAMPO = 6
const PASSO_CAMPO = 0.25

/** Entrelinha como proporção da letra — a mesma em todas as caixas. */
const ENTRELINHA = 1.36

// O bloco fica no meio da caixa, e não pendurado no topo: a caixa é
// desenhada do tamanho do template, o texto quase nunca a preenche, e
// antes toda a sobra caía embaixo. Centralizado, a sobra se divide em
// cima e embaixo.

/** Respiro mínimo entre o texto e a borda, em cima e embaixo. */
const RESPIRO = 6

/** Quanto a letra sobe da base e quanto o rabo dela desce. */
const ALTURA_DA_LETRA = 0.7
const RABO_DA_LETRA = 0.3

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

type Bloco = {
  caixa: Caixa
  /** Já sem espaço sobrando nas pontas. */
  texto: string
  recuoX: number
  marcadores?: boolean
}

/** A largura de linha que sobra dentro da caixa. */
function larguraUtil(bloco: Bloco) {
  return bloco.caixa.largura - bloco.recuoX - RECUO
}

/** Quantas linhas o texto ocupa depois de quebrado na largura da caixa. */
function linhasDoBloco(bloco: Bloco, tamanho: number) {
  const largura = larguraUtil(bloco)
  return bloco.texto
    .split('\n')
    .filter((l) => l.trim() !== '')
    .reduce(
      (soma, paragrafo) => soma + quebrarLinhas(paragrafo, tamanho, bloco.marcadores ? largura - 9 : largura).length,
      0,
    )
}

/** Do alto da primeira linha ao rabo da última. */
function alturaDoBloco(bloco: Bloco, tamanho: number) {
  const linhas = linhasDoBloco(bloco, tamanho)
  if (linhas === 0) return 0
  return (linhas - 1) * tamanho * ENTRELINHA + tamanho * (ALTURA_DA_LETRA + RABO_DA_LETRA)
}

/**
 * O maior tamanho, de TAMANHO_CORPO para baixo, em que o bloco cabe na
 * caixa. Quem chama compara o resultado das outras caixas e usa o menor:
 * é isso que faz a página inteira sair com uma letra só. O documento do
 * Canva quebrava quando o professor escrevia demais — aqui o texto
 * sempre entra, e é a única liberdade que este arquivo toma em relação
 * ao original.
 */
function tamanhoQueCabe(bloco: Bloco) {
  let tamanho = TAMANHO_CORPO
  for (; tamanho > MENOR_CORPO; tamanho -= PASSO_CORPO) {
    if (alturaDoBloco(bloco, tamanho) <= bloco.caixa.altura - 2 * RESPIRO) break
  }
  return tamanho
}

function escreverBloco(conteudo: Conteudo, bloco: Bloco, tamanho: number) {
  if (bloco.texto === '') return

  // A sobra da caixa dividida em duas, e a primeira base uma altura de
  // letra abaixo do alto do bloco.
  const sobra = Math.max(0, bloco.caixa.altura - alturaDoBloco(bloco, tamanho))
  const alto = bloco.caixa.y + bloco.caixa.altura - sobra / 2

  conteudo.bloco(
    bloco.caixa.x + bloco.recuoX,
    alto - tamanho * ALTURA_DA_LETRA,
    tamanho,
    larguraUtil(bloco),
    tamanho * ENTRELINHA,
    bloco.texto,
    bloco.marcadores,
  )
}

/** Um campo do cabeçalho: o rótulo e, na sequência, o valor. */
type CampoDoCabecalho = {
  caixa: Caixa
  rotulo: string
  valor: string
}

/**
 * O maior tamanho em que os cinco campos cabem. Nome de escola ou de
 * professor comprido não pode sair da caixa; antes ele encolhia sozinho
 * e ficava menor que os vizinhos, e é justamente isso que o cabeçalho
 * decidido em conjunto resolve.
 */
function letraQueCabeNoCabecalho(campos: CampoDoCabecalho[]) {
  const cabe = (c: CampoDoCabecalho, tamanho: number) =>
    larguraDoTexto(c.rotulo + c.valor, tamanho) <= c.caixa.largura - 2 * RECUO

  let tamanho = TAMANHO_CAMPO
  for (; tamanho > MENOR_CAMPO; tamanho -= PASSO_CAMPO) {
    if (campos.every((c) => cabe(c, tamanho))) break
  }
  return tamanho
}

function campo(conteudo: Conteudo, c: CampoDoCabecalho, tamanho: number) {
  // Uma linha só: o meio da caixa, pela mesma conta dos blocos.
  const sobra = c.caixa.altura - tamanho * (ALTURA_DA_LETRA + RABO_DA_LETRA)
  const y = c.caixa.y + sobra / 2 + tamanho * RABO_DA_LETRA

  conteudo.texto(c.caixa.x + RECUO, y, tamanho, c.rotulo)
  conteudo.texto(c.caixa.x + RECUO + larguraDoTexto(c.rotulo, tamanho), y, tamanho, c.valor)
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

  const cabecalho: CampoDoCabecalho[] = [
    { caixa: CAIXAS.escola, rotulo: 'Escola: ', valor: dados.escola },
    { caixa: CAIXAS.data, rotulo: 'Data: ', valor: dataCurta(dados.data) },
    { caixa: CAIXAS.turma, rotulo: 'Turma: ', valor: dados.turma },
    { caixa: CAIXAS.curso, rotulo: 'Curso: ', valor: dados.curso },
    { caixa: CAIXAS.professor, rotulo: 'Prof.: ', valor: dados.professor },
  ]

  const letraDoCabecalho = letraQueCabeNoCabecalho(cabecalho)
  for (const c of cabecalho) campo(capa, c, letraDoCabecalho)

  const tema: Bloco = { caixa: CAIXAS.tema, texto: dados.tema.trim(), recuoX: RECUO }
  const corpo: Bloco[] = [
    { caixa: CAIXAS.objetivos, texto: dados.objetivos.trim(), recuoX: 27.5, marcadores: true },
    { caixa: CAIXAS.descricao, texto: dados.descricao.trim(), recuoX: 12.5 },
    { caixa: CAIXAS.materiais, texto: dados.materiais.trim(), recuoX: 27.5, marcadores: true },
  ]

  // Manda a caixa mais apertada: as três saem no tamanho da que menos
  // couber. O tema acompanha o corpo, mas título comprido demais encolhe
  // só ele — a faixa do tema é baixa, e uma segunda linha ali levaria a
  // página inteira para o piso sem necessidade.
  const letraDoCorpo = Math.min(TAMANHO_CORPO, ...corpo.filter((b) => b.texto !== '').map(tamanhoQueCabe))
  const letraDoTema = Math.min(letraDoCorpo, tamanhoQueCabe(tema))

  capa.texto(19, CAIXAS.tema.y + 13.6, TAMANHO_ROTULO, 'TEMA DA AULA:')
  escreverBloco(capa, tema, letraDoTema)

  const rotuloDaSecao = (caixa: Caixa, texto: string) =>
    capa.texto(19, caixa.y + caixa.altura + 9.3, TAMANHO_ROTULO, texto)

  const [objetivos, descricao, materiais] = corpo
  rotuloDaSecao(objetivos.caixa, 'OBJETIVOS DE APRENDIZAGEM')
  escreverBloco(capa, objetivos, letraDoCorpo)

  rotuloDaSecao(descricao.caixa, 'DESCRIÇÃO DA AULA')
  escreverBloco(capa, descricao, letraDoCorpo)

  rotuloDaSecao(materiais.caixa, 'MATERIAIS E RECURSOS NECESSÁRIOS')
  escreverBloco(capa, materiais, letraDoCorpo)

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

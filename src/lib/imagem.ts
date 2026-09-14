/**
 * Preparar foto de celular para o site.
 *
 * Toda foto vira JPEG antes de sair do navegador: é o formato que entra
 * no PDF sem conversão nenhuma do outro lado, e o mesmo arquivo que sobe
 * para o site é o que vai para dentro do documento. Mora aqui porque
 * duas telas do painel fazem isso — o gerador de documento e o registro
 * rápido do projeto integrador.
 */

/** Foto grande demais atrasa o envio e não melhora o documento. */
const LADO_MAXIMO = 1600

/**
 * O iPhone entrega HEIC, e nem todo navegador decodifica HEIC pelo
 * `createImageBitmap`. Quando ele recusa, a tag `<img>` costuma dar
 * conta (o sistema decodifica por baixo) — e é a diferença entre a
 * equipe conseguir mandar a foto do celular ou não.
 */
async function decodificar(
  arquivo: Blob,
  nome: string,
): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(arquivo)
  } catch {
    const endereco = URL.createObjectURL(arquivo)
    try {
      const desenho = new Image()
      desenho.src = endereco
      await desenho.decode()
      return desenho
    } catch {
      throw new Error(`Não consegui abrir "${nome}". Tente exportar como JPEG.`)
    } finally {
      // Só depois do desenho na tela é que dava para soltar, mas o
      // navegador mantém a imagem já decodificada; revogar aqui evita
      // deixar a memória presa se a conversão falhar no meio.
      setTimeout(() => URL.revokeObjectURL(endereco), 10_000)
    }
  }
}

/**
 * `Blob` e não `File` porque a foto nem sempre vem do seletor de
 * arquivos: a exportação do documento busca a que já está hospedada no
 * site, e blob buscado não tem nome.
 */
export async function paraJpeg(
  arquivo: Blob,
  nome = arquivo instanceof File ? arquivo.name : 'a imagem',
): Promise<Blob> {
  const desenho = await decodificar(arquivo, nome)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(desenho.width, desenho.height))
  const tela = document.createElement('canvas')
  tela.width = Math.round(desenho.width * escala)
  tela.height = Math.round(desenho.height * escala)

  const pincel = tela.getContext('2d')
  if (!pincel) throw new Error('Este navegador não conseguiu preparar a foto.')
  // Fundo branco: PNG com transparência viraria preto no JPEG.
  pincel.fillStyle = '#ffffff'
  pincel.fillRect(0, 0, tela.width, tela.height)
  pincel.drawImage(desenho, 0, 0, tela.width, tela.height)
  if (desenho instanceof ImageBitmap) desenho.close()

  return await new Promise<Blob>((resolver, recusar) => {
    tela.toBlob(
      (blob) => (blob ? resolver(blob) : recusar(new Error('Não consegui preparar a foto.'))),
      'image/jpeg',
      0.82,
    )
  })
}

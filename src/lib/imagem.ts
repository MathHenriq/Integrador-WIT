/** Foto grande demais atrasa o envio e não melhora nem o documento nem a vitrine. */
const LADO_MAXIMO = 1600

/**
 * Toda foto vira JPEG antes de sair do navegador: é o formato que entra
 * no PDF sem conversão nenhuma do outro lado, e o mesmo preparo serve
 * para o que sobe direto para o Storage a partir do celular ou do
 * computador de quem está usando o painel.
 */
export async function paraJpeg(arquivo: File): Promise<Blob> {
  const desenho = await createImageBitmap(arquivo)
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
  desenho.close()

  return await new Promise<Blob>((resolver, recusar) => {
    tela.toBlob(
      (blob) => (blob ? resolver(blob) : recusar(new Error('Não consegui preparar a foto.'))),
      'image/jpeg',
      0.82,
    )
  })
}

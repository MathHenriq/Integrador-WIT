import { useRef, useState } from 'react'
import { subirFotosDaAula } from '../lib/api'
import { paraJpeg } from '../lib/imagem'

/**
 * Escolher as fotos da aula no aparelho e já deixá-las hospedadas.
 *
 * O registro pedia o **endereço** da foto, um por linha. Quem acabou de
 * dar a aula tem a foto no celular, não um link: para cumprir o campo
 * seria preciso subir o arquivo em outro serviço primeiro, e na prática
 * o projeto entrava sem foto nenhuma. Aqui a foto sai do aparelho e vai
 * para o balde do próprio site (pela Edge Function `subir-fotos`, que é
 * quem tem service role — ver a seção 3.1 do HANDOFF).
 *
 * O que sai daqui continua sendo uma lista de endereços: é isso que o
 * resto do site — vitrine, página da atividade, `admin_importar_aula_realizada`
 * — já sabia guardar.
 */
export function SeletorDeFotos({
  senha,
  fotos,
  aoMudar,
  aoErro,
  aoOcupado,
}: {
  senha: string
  fotos: string[]
  aoMudar: (fotos: string[]) => void
  aoErro: (e: string | null) => void
  aoOcupado?: (ocupado: boolean) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  function ocupar(valor: boolean) {
    setEnviando(valor)
    aoOcupado?.(valor)
  }

  async function receber(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    aoErro(null)
    ocupar(true)
    try {
      // Converter antes de subir tira o peso da foto de celular (que vem
      // com 4000 px de lado) e resolve o HEIC do iPhone, que o balde não
      // aceitaria.
      const preparadas = []
      for (const arquivo of Array.from(lista)) {
        preparadas.push({
          blob: await paraJpeg(arquivo),
          nome: arquivo.name.replace(/\.[^.]+$/, '') + '.jpg',
        })
      }

      const enviadas = await subirFotosDaAula(senha, preparadas)
      // Mandar a mesma foto duas vezes devolve o mesmo endereço (o
      // caminho sai do conteúdo dela); sem isto ela apareceria repetida.
      aoMudar([...fotos, ...enviadas.fotos.filter((e) => !fotos.includes(e))])
      // Foto que ficou de fora não pode sumir em silêncio: quem registrou
      // a aula precisa saber que aquela não entrou.
      if (enviadas.avisos.length > 0) aoErro(enviadas.avisos.join(' '))
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não consegui enviar as fotos.')
    } finally {
      ocupar(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void receber(e.target.files)}
      />
      <button
        type="button"
        className="secundario"
        onClick={() => entrada.current?.click()}
        disabled={enviando}
      >
        {enviando ? 'Enviando…' : fotos.length > 0 ? '+ Adicionar mais fotos' : '+ Escolher fotos'}
      </button>

      {fotos.length > 0 && (
        <div className="fotos-importadas" style={{ marginTop: 14 }}>
          {fotos.map((endereco, indice) => (
            <figure key={endereco}>
              <img src={endereco} alt={`Foto ${indice + 1} da aula`} loading="lazy" />
              <button
                type="button"
                className="fantasma pequeno"
                aria-label={`Tirar a foto ${indice + 1}`}
                onClick={() => aoMudar(fotos.filter((f) => f !== endereco))}
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      )}
    </>
  )
}

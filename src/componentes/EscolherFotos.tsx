import { useRef, useState } from 'react'
import { subirFotos } from '../lib/api'
import { paraJpeg } from '../lib/imagem'

type Props = {
  senha: string
  /** As fotos já anexadas por aqui — não inclui as coladas por link em outro campo. */
  valor: string[]
  aoMudar: (fotos: string[]) => void
  aoErro: (e: string | null) => void
}

/**
 * O botão "+ Anexar fotos", para quando a foto está no celular ou no
 * computador de quem preenche, e não num link já hospedado em algum
 * lugar. Cada foto vira JPEG no navegador e sobe pela Edge Function
 * `subir-fotos` — o mesmo caminho (Storage só por service role) do
 * importador do Canva, nunca o navegador escrevendo direto no balde.
 *
 * Devolve só endereços (`string[]`), iguais aos que vêm de um link
 * colado à mão — de propósito, para os dois jeitos se somarem sem
 * precisar de um tipo à parte em quem usa este componente.
 */
export function EscolherFotos({ senha, valor, aoMudar, aoErro }: Props) {
  const [enviando, setEnviando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  async function anexar(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    aoErro(null)
    setEnviando(true)
    try {
      const prontas: File[] = []
      for (const arquivo of Array.from(lista)) {
        const blob = await paraJpeg(arquivo)
        prontas.push(new File([blob], arquivo.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
      }

      const resultado = await subirFotos(senha, prontas)
      aoMudar([...valor, ...resultado.fotos])
      if (resultado.avisos.length > 0) aoErro(resultado.avisos.join(' '))
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não consegui enviar as fotos.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void anexar(e.target.files)}
      />
      <button
        type="button"
        className="secundario"
        onClick={() => entrada.current?.click()}
        disabled={enviando}
      >
        {enviando ? 'Enviando…' : '+ Anexar fotos do celular ou computador'}
      </button>

      {valor.length > 0 && (
        <div className="fotos-importadas" style={{ marginTop: 14 }}>
          {valor.map((url) => (
            <figure key={url}>
              <img src={url} alt="" loading="lazy" />
              <button
                type="button"
                className="fantasma pequeno"
                aria-label="Tirar esta foto"
                onClick={() => aoMudar(valor.filter((f) => f !== url))}
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

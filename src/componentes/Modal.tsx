import { useEffect, useRef } from 'react'

type Props = {
  titulo: string
  subtitulo?: string
  largo?: boolean
  aoFechar: () => void
  children: React.ReactNode
}

export function Modal({ titulo, subtitulo, largo, aoFechar, children }: Props) {
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    // Leva o foco para dentro do diálogo assim que ele abre.
    caixa.current?.querySelector<HTMLElement>('input, button')?.focus()

    // Trava a rolagem do fundo enquanto o diálogo está aberto.
    const rolagem = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = rolagem
    }
  }, [aoFechar])

  return (
    <div className="fundo-modal" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div
        className={`modal ${largo ? 'largo' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        ref={caixa}
      >
        <h2>{titulo}</h2>
        {subtitulo && <p className="subtitulo">{subtitulo}</p>}
        {children}
      </div>
    </div>
  )
}

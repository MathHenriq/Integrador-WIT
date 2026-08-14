import { useEffect, useRef } from 'react'

type Props = {
  titulo: string
  subtitulo?: string
  aoFechar: () => void
  children: React.ReactNode
}

export function Modal({ titulo, subtitulo, aoFechar, children }: Props) {
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    // Leva o foco para dentro do diálogo assim que ele abre.
    caixa.current?.querySelector<HTMLElement>('input, button')?.focus()
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return (
    <div className="fundo-modal" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={caixa}>
        <h2>{titulo}</h2>
        {subtitulo && <p className="subtitulo">{subtitulo}</p>}
        {children}
      </div>
    </div>
  )
}

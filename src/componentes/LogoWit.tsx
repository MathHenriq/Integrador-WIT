import { useEffect, useState } from 'react'

/**
 * Marca do Núcleo WIT.
 *
 * Se existir `public/logo-wit.png`, é ele que aparece. Enquanto não
 * existir, entra um desenho em SVG equivalente. Basta soltar o arquivo
 * oficial em `public/logo-wit.png` — nenhum código muda.
 *
 * O teste do arquivo roda uma vez por sessão e o resultado fica em
 * cache: sem isso, uma tela com vários logos dispararia várias
 * requisições, e o `onError` de um <img> apontando para arquivo
 * inexistente piscaria imagem quebrada em cada um deles.
 */

const CAMINHO_ARQUIVO = '/logo-wit.png'

let disponivel: boolean | null = null
let procurando: Promise<boolean> | null = null

function procurarArquivo(): Promise<boolean> {
  if (disponivel !== null) return Promise.resolve(disponivel)
  if (procurando) return procurando

  procurando = new Promise<boolean>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth > 0)
    img.onerror = () => resolve(false)
    img.src = CAMINHO_ARQUIVO
  }).then((achou) => {
    disponivel = achou
    return achou
  })

  return procurando
}

type Props = {
  /** Altura em pixels; a largura acompanha. */
  altura?: number
  /** Esconde a linha "Tecnologias Inovadoras Essenciais". */
  semAssinatura?: boolean
  className?: string
}

export function LogoWit({ altura = 38, semAssinatura = false, className }: Props) {
  const [temArquivo, setTemArquivo] = useState(disponivel === true)

  useEffect(() => {
    let ativo = true
    void procurarArquivo().then((achou) => {
      if (ativo) setTemArquivo(achou)
    })
    return () => {
      ativo = false
    }
  }, [])

  if (temArquivo) {
    return (
      <img
        src={CAMINHO_ARQUIVO}
        alt="Núcleo WIT"
        height={altura}
        style={{ height: altura, width: 'auto', display: 'block' }}
        className={className}
      />
    )
  }

  return <LogoDesenhado altura={altura} semAssinatura={semAssinatura} className={className} />
}

// Duas caixas: com assinatura o desenho é mais alto e mais largo, para o
// texto de baixo caber inteiro em vez de vazar pela borda.
const CAIXA_COMPLETA = { largura: 176, altura: 78 }
const CAIXA_CURTA = { largura: 140, altura: 64 }

function LogoDesenhado({ altura, semAssinatura, className }: Required<Omit<Props, 'className'>> & { className?: string }) {
  const caixa = semAssinatura ? CAIXA_CURTA : CAIXA_COMPLETA
  const largura = altura * (caixa.largura / caixa.altura)

  return (
    <svg
      viewBox={`0 0 ${caixa.largura} ${caixa.altura}`}
      width={largura}
      height={altura}
      className={className}
      role="img"
      aria-label="Núcleo WIT — Tecnologias Inovadoras Essenciais"
    >
      <title>Núcleo WIT</title>

      {/* Quadradinhos em cascata diagonal, como no logo original */}
      <g>
        <rect x="96" y="2" width="12" height="12" rx="2.5" fill="#A6CE39" />
        <rect x="111" y="2" width="12" height="12" rx="2.5" fill="#8DC63F" />
        <rect x="103" y="16" width="12" height="12" rx="2.5" fill="#39B54A" />
        <rect x="118" y="16" width="12" height="12" rx="2.5" fill="#00A651" />
        <rect x="110" y="30" width="12" height="12" rx="2.5" fill="#007236" />
      </g>

      <text
        x="2"
        y="24"
        fontFamily="Segoe UI, system-ui, sans-serif"
        fontSize="21"
        fontWeight="600"
        fill="#39B54A"
      >
        Núcleo
      </text>

      <text
        x="0"
        y="58"
        fontFamily="Segoe UI, system-ui, sans-serif"
        fontSize="46"
        fontWeight="800"
        letterSpacing="-1.5"
        fill="url(#gradienteWit)"
      >
        wit
      </text>

      {!semAssinatura && (
        <text
          x="2"
          y="72"
          fontFamily="Segoe UI, system-ui, sans-serif"
          fontSize="8.6"
          letterSpacing="0.35"
          fill="currentColor"
          opacity="0.7"
        >
          Tecnologias Inovadoras Essenciais
        </text>
      )}

      <defs>
        {/* Escuro embaixo à esquerda, claro em cima à direita — o mesmo
            sentido do degradê da marca. */}
        <linearGradient id="gradienteWit" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#006B33" />
          <stop offset="50%" stopColor="#00A651" />
          <stop offset="100%" stopColor="#8DC63F" />
        </linearGradient>
      </defs>
    </svg>
  )
}

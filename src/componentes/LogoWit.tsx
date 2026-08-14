/**
 * Marca do Núcleo WIT em SVG: os quadradinhos em degradê de verde, o
 * "Núcleo" leve sobre o "wit" pesado, e a assinatura da unidade.
 *
 * Se você tiver o arquivo oficial, jogue em `public/logo-wit.png` e
 * troque este componente por uma <img> — o resto do layout não muda.
 */

type Props = {
  /** Altura em pixels; a largura acompanha. */
  altura?: number
  /** Esconde a linha "Tecnologias Inovadoras Essenciais". */
  semAssinatura?: boolean
  className?: string
}

// Duas caixas: com assinatura o desenho é mais alto e mais largo, para o
// texto de baixo caber inteiro em vez de vazar pela borda.
const CAIXA_COMPLETA = { largura: 176, altura: 78 }
const CAIXA_CURTA = { largura: 140, altura: 64 }

export function LogoWit({ altura = 38, semAssinatura = false, className }: Props) {
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

      {/* Quadradinhos do logo, do lima ao verde escuro */}
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
        <linearGradient id="gradienteWit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8DC63F" />
          <stop offset="55%" stopColor="#00A651" />
          <stop offset="100%" stopColor="#007236" />
        </linearGradient>
      </defs>
    </svg>
  )
}

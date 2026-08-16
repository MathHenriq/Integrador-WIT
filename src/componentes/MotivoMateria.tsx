/**
 * Desenho de cada matéria, para a capa do cartão do catálogo.
 *
 * São SVGs pequenos e sem texto solto, pensados para viver recortados na
 * borda direita da capa: o professor bate o olho e reconhece a matéria
 * antes de ler o nome. A cor vem da própria matéria (`cor`), então o
 * desenho acompanha a paleta cadastrada no painel.
 */

type Props = { nome: string | null; className?: string }

/** Reduz o nome cadastrado a uma chave, tolerando acento e caixa. */
function chave(nome: string | null): string {
  const limpo = (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (limpo.includes('portugues') || limpo.includes('lingua portuguesa')) return 'portugues'
  if (limpo.includes('matematica')) return 'matematica'
  if (limpo.includes('ciencia')) return 'ciencias'
  if (limpo.includes('historia')) return 'historia'
  if (limpo.includes('geografia')) return 'geografia'
  if (limpo.includes('arte')) return 'arte'
  if (limpo.includes('fisica') || limpo.includes('educacao fisica')) return 'edfisica'
  if (limpo.includes('ingles')) return 'ingles'
  if (limpo.includes('integrador')) return 'integrador'
  return 'padrao'
}

const T = 'rgba(255,255,255,0.92)'
const M = 'rgba(255,255,255,0.55)'
const F = 'rgba(255,255,255,0.28)'

export function MotivoMateria({ nome, className }: Props) {
  const comum = {
    viewBox: '0 0 120 120',
    className,
    'aria-hidden': true as const,
    fill: 'none' as const,
  }

  switch (chave(nome)) {
    // Letras e régua
    case 'portugues':
      return (
        <svg {...comum}>
          <text x="6" y="52" fontFamily="Outfit, sans-serif" fontSize="46" fontWeight="700" fill={T}>
            Aa
          </text>
          <text x="66" y="86" fontFamily="Outfit, sans-serif" fontSize="30" fontWeight="600" fill={M}>
            Bb
          </text>
          <rect x="4" y="70" width="58" height="17" rx="3" stroke={T} strokeWidth="2.5" />
          <path d="M14 70v7M24 70v10M34 70v7M44 70v10M54 70v7" stroke={M} strokeWidth="2.5" />
          <path d="M70 30h44M70 40h30" stroke={F} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )

    // Números e símbolos
    case 'matematica':
      return (
        <svg {...comum}>
          <text x="4" y="46" fontFamily="Outfit, sans-serif" fontSize="40" fontWeight="700" fill={T}>
            7
          </text>
          <text x="34" y="46" fontFamily="Outfit, sans-serif" fontSize="40" fontWeight="700" fill={M}>
            ÷
          </text>
          <text x="70" y="46" fontFamily="Outfit, sans-serif" fontSize="40" fontWeight="700" fill={T}>
            3
          </text>
          <text x="4" y="94" fontFamily="Outfit, sans-serif" fontSize="36" fontWeight="700" fill={M}>
            π
          </text>
          <text x="38" y="94" fontFamily="Outfit, sans-serif" fontSize="36" fontWeight="700" fill={T}>
            +
          </text>
          <text x="72" y="94" fontFamily="Outfit, sans-serif" fontSize="36" fontWeight="700" fill={F}>
            ×
          </text>
          <path d="M4 60h108" stroke={F} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )

    // Béquer e folha
    case 'ciencias':
      return (
        <svg {...comum}>
          <path d="M44 16h28M52 16v26L34 88a8 8 0 0 0 7 12h38a8 8 0 0 0 7-12L68 42V16"
                stroke={T} strokeWidth="3" strokeLinejoin="round" />
          <path d="M41 74h38" stroke={M} strokeWidth="3" />
          <circle cx="54" cy="84" r="4" fill={M} />
          <circle cx="68" cy="90" r="3" fill={F} />
          <path d="M14 44c14-4 24 4 22 18-14 4-24-4-22-18Z" stroke={M} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M16 46c8 6 14 12 18 20" stroke={F} strokeWidth="2.5" />
        </svg>
      )

    // Globo terrestre
    case 'historia':
      return (
        <svg {...comum}>
          <circle cx="58" cy="52" r="34" stroke={T} strokeWidth="3" />
          <ellipse cx="58" cy="52" rx="15" ry="34" stroke={M} strokeWidth="2.5" />
          <path d="M24 52h68M31 33h54M31 71h54" stroke={M} strokeWidth="2.5" />
          <path d="M58 86v16M40 106h36" stroke={T} strokeWidth="3" strokeLinecap="round" />
          <path d="M44 40c6 5 4 10 10 12s10 8 6 14" stroke={F} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )

    // Mapa e bússola
    case 'geografia':
      return (
        <svg {...comum}>
          <path d="M8 30l32-12 40 14 32-12v66l-32 12-40-14-32 12V30Z"
                stroke={T} strokeWidth="3" strokeLinejoin="round" />
          <path d="M40 18v66M80 32v66" stroke={M} strokeWidth="2.5" />
          <circle cx="62" cy="56" r="15" stroke={T} strokeWidth="3" />
          <path d="M68 50l-4 12-8 4 4-12 8-4Z" fill={M} />
        </svg>
      )

    // Pincel e paleta
    case 'arte':
      return (
        <svg {...comum}>
          <path d="M52 16c22 0 40 15 40 33 0 11-9 15-17 15h-8c-6 0-10 4-10 9 0 4 3 6 3 10 0 6-5 11-12 11-20 0-34-18-34-38S30 16 52 16Z"
                stroke={T} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="38" cy="40" r="5.5" fill={T} />
          <circle cx="62" cy="34" r="5.5" fill={M} />
          <circle cx="78" cy="50" r="5.5" fill={F} />
          <circle cx="32" cy="62" r="5.5" fill={M} />
        </svg>
      )

    // Cronômetro
    case 'edfisica':
      return (
        <svg {...comum}>
          <circle cx="60" cy="64" r="32" stroke={T} strokeWidth="3" />
          <path d="M60 46v18l12 8" stroke={T} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M48 20h24M60 20v12" stroke={M} strokeWidth="3" strokeLinecap="round" />
          <path d="M88 36l8-8" stroke={M} strokeWidth="3" strokeLinecap="round" />
          <path d="M22 96c8-6 14-6 22 0" stroke={F} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )

    // Balão de fala bilíngue
    case 'ingles':
      return (
        <svg {...comum}>
          <path d="M12 26h64a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8H44l-18 14V72h-14a8 8 0 0 1-8-8V34a8 8 0 0 1 8-8Z"
                stroke={T} strokeWidth="3" strokeLinejoin="round" />
          <text x="22" y="58" fontFamily="Outfit, sans-serif" fontSize="26" fontWeight="700" fill={T}>
            Hi
          </text>
          <path d="M96 52h14a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8h-4v10l-12-10h-2"
                stroke={M} strokeWidth="3" strokeLinejoin="round" />
        </svg>
      )

    // Engrenagem com faísca (o Projeto Integrador em si)
    case 'integrador':
      return (
        <svg {...comum}>
          <circle cx="56" cy="60" r="16" stroke={T} strokeWidth="3" />
          <path d="M56 28v-12M56 104v-12M24 60H12M100 60H88M33 37l-9-9M88 92l-9-9M79 37l9-9M24 92l9-9"
                stroke={M} strokeWidth="3" strokeLinecap="round" />
          <path d="M96 14l4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z" fill={T} />
        </svg>
      )

    // Livro aberto
    default:
      return (
        <svg {...comum}>
          <path d="M60 34c-10-8-24-11-40-10v58c16-1 30 2 40 10 10-8 24-11 40-10V24c-16-1-30 2-40 10Z"
                stroke={T} strokeWidth="3" strokeLinejoin="round" />
          <path d="M60 34v58" stroke={M} strokeWidth="3" />
          <path d="M32 44h16M32 58h16M72 44h16M72 58h16" stroke={F} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )
  }
}

/**
 * O estúdio do Núcleo, desenhado: ciclorama de chroma key ao fundo, dois
 * softboxes, o ring light e a câmera no tripé.
 *
 * É ilustração, não foto — assim ela acompanha o tema claro/escuro, pesa
 * poucos kB e não depende de nenhuma imagem hospedada.
 */
export function CenaEstudio({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 720 400" className={className} role="img" aria-label="Estúdio do Núcleo WIT: chroma key, softboxes, ring light e câmera">
      <title>Estúdio do Núcleo WIT</title>

      <defs>
        <linearGradient id="ciclorama" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c8f52" />
          <stop offset="55%" stopColor="#136b3d" />
          <stop offset="100%" stopColor="#0c4a2b" />
        </linearGradient>
        <radialGradient id="poolLuz" cx="50%" cy="38%" r="58%">
          <stop offset="0%" stopColor="#a9ffcd" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#a9ffcd" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="luzSoft" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffdf0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fffdf0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="difusor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e6efe6" />
        </linearGradient>
      </defs>

      {/* Ciclorama: parede e piso sem quina, como fundo infinito */}
      <path d="M40 24h640v300c0 26-20 44-52 44H92c-32 0-52-18-52-44V24Z" fill="url(#ciclorama)" />
      <path d="M40 24h640v300c0 26-20 44-52 44H92c-32 0-52-18-52-44V24Z" fill="url(#poolLuz)" />

      {/* Estofo de luz que os softboxes jogam no fundo */}
      <ellipse cx="188" cy="150" rx="150" ry="120" fill="url(#luzSoft)" />
      <ellipse cx="536" cy="150" rx="150" ry="120" fill="url(#luzSoft)" />

      {/* --- Softbox esquerdo --- */}
      <g>
        <path d="M150 300v66" stroke="#20303a" strokeWidth="7" strokeLinecap="round" />
        <path d="M126 368h48M150 340l-26 28M150 340l26 28" stroke="#20303a" strokeWidth="6" strokeLinecap="round" />
        <g transform="rotate(-14 150 190)">
          <rect x="98" y="126" width="104" height="128" rx="10" fill="#1d2a33" />
          <rect x="106" y="134" width="88" height="112" rx="7" fill="url(#difusor)" />
          <path d="M106 162h88M106 190h88M106 218h88" stroke="#cfdad0" strokeWidth="2" />
        </g>
      </g>

      {/* --- Softbox direito --- */}
      <g>
        <path d="M574 300v66" stroke="#20303a" strokeWidth="7" strokeLinecap="round" />
        <path d="M550 368h48M574 340l-26 28M574 340l26 28" stroke="#20303a" strokeWidth="6" strokeLinecap="round" />
        <g transform="rotate(14 574 190)">
          <rect x="522" y="126" width="104" height="128" rx="10" fill="#1d2a33" />
          <rect x="530" y="134" width="88" height="112" rx="7" fill="url(#difusor)" />
          <path d="M530 162h88M530 190h88M530 218h88" stroke="#cfdad0" strokeWidth="2" />
        </g>
      </g>

      {/* --- Ring light --- */}
      <g>
        <path d="M300 300v70" stroke="#20303a" strokeWidth="6" strokeLinecap="round" />
        <path d="M280 370h40" stroke="#20303a" strokeWidth="6" strokeLinecap="round" />
        <circle cx="300" cy="252" r="46" fill="none" stroke="#fffdf0" strokeWidth="13" opacity="0.95" />
        <circle cx="300" cy="252" r="46" fill="none" stroke="#a6ce39" strokeWidth="3" opacity="0.8" />
      </g>

      {/* --- Câmera no tripé --- */}
      <g>
        <path d="M430 300v56M406 372l24-24M454 372l-24-24M430 348v24" stroke="#17222a" strokeWidth="7" strokeLinecap="round" />
        <rect x="382" y="232" width="96" height="60" rx="9" fill="#17222a" />
        <rect x="396" y="220" width="34" height="16" rx="5" fill="#17222a" />
        <circle cx="430" cy="262" r="21" fill="#0d151b" />
        <circle cx="430" cy="262" r="13" fill="none" stroke="#a6ce39" strokeWidth="3.5" />
        <circle cx="424" cy="256" r="4" fill="#ffffff" opacity="0.65" />
        <rect x="452" y="242" width="18" height="9" rx="3" fill="#00a651" />
      </g>

      {/* Marca de chão do apresentador */}
      <path d="M330 352h60" stroke="#0a3a22" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

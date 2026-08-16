/**
 * Identidade visual de cada matéria: o desenho e a cor.
 *
 * Os desenhos vêm do Phosphor (peso `duotone`), não são feitos à mão
 * aqui. Ícone desenhado a olho fica torto em detalhe que ninguém sabe
 * apontar mas todo mundo enxerga — traço de espessura irregular, curva
 * que não fecha, tamanho ótico diferente de um para o outro. Um conjunto
 * pronto e bem desenhado resolve isso de graça.
 *
 * A cor é fixa por matéria de propósito: na cabeça de quem usa, cada
 * matéria tem a sua cor (matemática azul, ciências verde), e essa
 * associação vale mais que a cor que estiver gravada no banco. Matéria
 * que não estiver nesta lista cai na cor do cadastro.
 */

import { DESENHOS, VIEW_BOX } from './desenhos-materias'

type Props = { nome: string | null; className?: string }

/** Reduz o nome cadastrado a uma chave, tolerando acento e caixa. */
function chave(nome: string | null): string {
  const limpo = (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (limpo.includes('portugues')) return 'portugues'
  if (limpo.includes('matematica')) return 'matematica'
  if (limpo.includes('ciencia')) return 'ciencias'
  if (limpo.includes('historia')) return 'historia'
  if (limpo.includes('geografia')) return 'geografia'
  if (limpo.includes('arte')) return 'arte'
  if (limpo.includes('fisica')) return 'edfisica'
  if (limpo.includes('ingles')) return 'ingles'
  // "Projetos WIT" é a caixa das atividades próprias do Núcleo. O nome
  // antigo ("Projeto Integrador") continua reconhecido porque o banco de
  // alguma escola pode não ter rodado a migration que renomeia.
  if (limpo.includes('projetos wit') || limpo.includes('integrador')) return 'wit'
  return 'padrao'
}

/** Uma cor por matéria, na convenção que todo mundo já carrega. */
const CORES: Record<string, string> = {
  portugues: '#d62828',
  matematica: '#2563eb',
  ciencias: '#00a651',
  historia: '#b45309',
  geografia: '#0d9488',
  arte: '#db2777',
  edfisica: '#f77f00',
  ingles: '#7c3aed',
  wit: '#a6ce39',
  padrao: '#00a651',
}

export function corDaMateria(nome: string | null, corDoBanco?: string | null) {
  const k = chave(nome)
  if (k !== 'padrao') return CORES[k]
  return corDoBanco ?? CORES.padrao
}

function canais(hex: string) {
  const limpo = hex.replace('#', '')
  const n = parseInt(limpo.length === 3 ? limpo.replace(/./g, '$&$&') : limpo, 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

function escurecer([r, g, b]: readonly number[], fator: number) {
  return [r * fator, g * fator, b * fator] as const
}

/** Luminância relativa (WCAG), para decidir a cor do texto por cima. */
function luminancia([r, g, b]: readonly number[]) {
  const linear = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * Fundo da capa. A cor da matéria entra inteira, sem escurecer: escurecer
 * o lima da marca até o branco caber por cima devolvia um oliva sujo, e
 * apagava justamente a diferença entre as matérias, que é o ponto de ter
 * uma cor para cada uma. Quem cede é o texto — ver `textoDaMateria`.
 */
export function degradeMateria(nome: string | null, corDoBanco?: string | null) {
  const base = canais(corDaMateria(nome, corDoBanco))
  if (!base) return `linear-gradient(150deg, ${CORES.padrao}, #05301c)`

  const rgb = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v)).join(', ')})`
  return `linear-gradient(150deg, ${rgb(base)}, ${rgb(escurecer(base, 0.68))})`
}

/**
 * Preto sobre cor clara, branco sobre cor escura — a regra de sempre.
 * Sem isto o lima e o laranja ficariam com título ilegível.
 */
export function textoDaMateria(nome: string | null, corDoBanco?: string | null) {
  const base = canais(corDaMateria(nome, corDoBanco))
  if (!base) return '#ffffff'
  return luminancia(base) > 0.32 ? '#12190f' : '#ffffff'
}

function Desenho({ chave, className }: { chave: string; className?: string }) {
  return (
    <svg viewBox={VIEW_BOX} className={className} fill="currentColor" aria-hidden="true">
      {DESENHOS[chave] ?? DESENHOS.padrao}
    </svg>
  )
}

export function MotivoMateria({ nome, className }: Props) {
  const k = chave(nome)

  // A caixa do Núcleo não tem um objeto só que a represente: são os
  // óculos, a câmera e o controle. Vão em leque, o VR na frente.
  if (k === 'wit') {
    return (
      <span className={`${className ?? ''} leque`}>
        <Desenho chave="camera" className="atras esquerda" />
        <Desenho chave="controle" className="atras direita" />
        <Desenho chave="vr" className="frente" />
      </span>
    )
  }

  return <Desenho chave={k} className={className} />
}

// =====================================================================
// O tema de um projeto, comparado com os que já estão no catálogo
// =====================================================================
// O mesmo projeto escrito com outras palavras virava atividade nova:
// "Desenhando em Pixel Art", "Criação de Pixel Arts" e "CRIAÇÃO DE
// PERSONAGENS COM PIXEL ART" chegaram a ser três. Quem registra não
// procura no catálogo antes — então o catálogo vai até ele, na hora de
// digitar o tema e de novo na confirmação.
// =====================================================================

/**
 * Sem acento, sem pontuação e sem caixa: "ARTES COM IA" e "Artes com IA."
 * são o mesmo tema. Mesma régua da `_texto_chave` do banco, que é a que
 * decide quando um registro reaproveita a atividade do catálogo.
 */
export function chaveDoTema(titulo: string) {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Palavras que aparecem em todo tema e não dizem de que ele trata. */
const VAZIAS = new Set(
  'a o as os e de da do das dos com em na no nas nos para por sobre um uma uns umas como the aula aulas sala wit'.split(
    ' ',
  ),
)

/**
 * As palavras que dizem do que o tema trata, pelo começo: "criação" e
 * "criando" viram "cria", "arts" e "art" viram "art". Grosseiro de
 * propósito — errar para o lado de sugerir é barato, porque quem decide
 * é a pessoa; errar para o lado de calar é o que fez o catálogo encher.
 */
function radicais(titulo: string) {
  return new Set(
    chaveDoTema(titulo)
      .split(' ')
      .filter((p) => p.length > 2 && !VAZIAS.has(p))
      .map((p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p).slice(0, 4)),
  )
}

export type TemaDoCatalogo = { id: string; titulo: string; vezes_dada: number }

/** O tema digitado é, letra por letra (sem acento e caixa), um do catálogo. */
export function temaIgual<T extends TemaDoCatalogo>(tema: string, catalogo: T[]): T | null {
  const chave = chaveDoTema(tema)
  if (!chave) return null
  return catalogo.find((a) => chaveDoTema(a.titulo) === chave) ?? null
}

/**
 * Os temas do catálogo que parecem o digitado, do mais parecido para o
 * menos. O igual vem primeiro, sempre.
 */
export function temasParecidos<T extends TemaDoCatalogo>(tema: string, catalogo: T[], limite = 4): T[] {
  const chave = chaveDoTema(tema)
  if (chave.length < 4) return []
  const meus = radicais(tema)
  if (meus.size === 0) return []

  // Desempate: palavras inteiras em comum. "Musica com IA" fica mais
  // perto de "MÚSICAS COM IA" do que de "Criando Musicas com MusicLab".
  const palavras = new Set(chave.split(' '))

  return catalogo
    .map((aula) => {
      const deles = chaveDoTema(aula.titulo)
      if (deles === chave) return { aula, nota: 2, inteiras: 0 }
      const radicaisDeles = radicais(aula.titulo)
      let comuns = 0
      for (const r of meus) if (radicaisDeles.has(r)) comuns++
      const menor = Math.min(meus.size, radicaisDeles.size)
      const inteiras = deles.split(' ').filter((p) => palavras.has(p)).length
      return { aula, nota: menor === 0 ? 0 : comuns / menor, inteiras }
    })
    .filter((c) => c.nota >= 0.5)
    .sort(
      (a, b) =>
        b.nota - a.nota || b.inteiras - a.inteiras || b.aula.vezes_dada - a.aula.vezes_dada,
    )
    .slice(0, limite)
    .map((c) => c.aula)
}

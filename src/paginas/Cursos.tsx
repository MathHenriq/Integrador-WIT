import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../componentes/Aviso'
import { MotivoMateria } from '../componentes/MotivoMateria'
import { listarPontesBncc } from '../lib/api'
import type { PonteBncc } from '../lib/tipos'

/**
 * Responde a pergunta que o professor faz de verdade: "isso que vocês
 * fazem encaixa onde na minha matéria?".
 *
 * A ponte é curada à mão, uma habilidade por cruzamento de curso com
 * matéria, porque busca por palavra não resolve: "metaverso", "óculos
 * VR" e "robô" não aparecem uma única vez no texto da BNCC. Procurar
 * por elas devolve coisa errada com cara de certa.
 *
 * E é ponto de partida, não lista fechada — quem escolhe as outras
 * habilidades é o professor da turma junto com o profissional do WIT.
 */
export function Cursos() {
  const [pontes, setPontes] = useState<PonteBncc[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [curso, setCurso] = useState<string | null>(null)

  useEffect(() => {
    listarPontesBncc()
      .then(setPontes)
      .catch((f) => setErro(f instanceof Error ? f.message : 'Não foi possível carregar.'))
      .finally(() => setCarregando(false))
  }, [])

  // A ordem dos cursos vem do banco; aqui só se tira a repetição.
  const cursos = useMemo(() => [...new Set(pontes.map((p) => p.curso))], [pontes])
  const escolhido = curso ?? cursos[0] ?? null
  const visiveis = pontes.filter((p) => p.curso === escolhido)

  return (
    <main className="conteudo">
      <div className="titulo-pagina">
        <h1>Onde o WIT encontra a sua matéria</h1>
        <p>
          Escolha o curso que vai acontecer na sala e veja, em cada matéria, uma habilidade da BNCC
          por onde começar a conversa.
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {cursos.length > 0 && (
        <div className="chips" style={{ marginBottom: 26 }}>
          {cursos.map((nome) => (
            <button
              key={nome}
              type="button"
              className="chip"
              aria-pressed={nome === escolhido}
              onClick={() => setCurso(nome)}
            >
              {nome}
            </button>
          ))}
        </div>
      )}

      {carregando ? (
        <p className="carregando">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="vazio">
          <span className="emoji">🧭</span>
          Ainda não há habilidades ligadas a este curso.
        </div>
      ) : (
        <div className="grade pontes">
          {visiveis.map((p) => (
            <article key={p.materia_nome} className="cartao ponte">
              <div className="cabeca">
                <MotivoMateria nome={p.materia_nome} className="motivo" />
                <h2>{p.materia_nome}</h2>
              </div>

              <p className="porque">{p.motivo}</p>

              <div className="habilidade">
                <span className="etiqueta codigo">{p.habilidade_codigo}</span>
                <p>{p.habilidade_texto}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="cartao" style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>Esta lista é o começo, não o fim</h2>
        <p style={{ color: 'var(--texto-suave)' }}>
          É uma habilidade por matéria, escolhida para destravar a primeira conversa. O conteúdo da
          aula é o seu: na reunião com a equipe do WIT vocês decidem juntos quais outras habilidades
          entram e como a proposta fica.{' '}
          <Link to="/agendar">Marque um horário</Link> e a gente monta a aula com você.
        </p>
      </div>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoWit } from '../componentes/LogoWit'
import { listarAulas, listarRealizadas } from '../lib/api'
import type { AulaCatalogo, Realizada } from '../lib/tipos'

/**
 * As três coisas que alguém vem fazer aqui, com o nome da ação. Nada de
 * "explorar" ou "saiba mais": o professor precisa bater o olho e saber
 * onde clicar.
 */
const ACOES = [
  {
    para: '/agendar',
    titulo: 'Agendar uma aula',
    texto: 'Escolha a escola, veja a semana e reserve o horário que couber na sua rotina.',
    acao: 'Ver horários livres',
  },
  {
    para: '/realizadas',
    titulo: 'Aulas já realizadas',
    texto: 'O que professores de todas as escolas já fizeram no Núcleo, com fotos das turmas.',
    acao: 'Ver o que já rolou',
  },
  {
    para: '/reserva',
    titulo: 'Confirmar agendamento',
    texto: 'Consulte, confira a data ou cancele um agendamento seu com o número do protocolo.',
    acao: 'Consultar protocolo',
  },
]

export function Inicio() {
  const [aulas, setAulas] = useState<AulaCatalogo[]>([])
  const [realizadas, setRealizadas] = useState<Realizada[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // A home é a vitrine: se um bloco falhar, ela ainda abre inteira.
    Promise.allSettled([listarAulas({}), listarRealizadas({ limite: 200 })])
      .then(([cat, feitas]) => {
        if (cat.status === 'fulfilled') setAulas(cat.value)
        if (feitas.status === 'fulfilled') setRealizadas(feitas.value)
      })
      .finally(() => setCarregando(false))
  }, [])

  return (
    <main className="conteudo">
      <section className="abertura">
        <div className="abertura-texto">
          <LogoWit altura={78} />

          <h1 className="titulo-pagina" style={{ marginTop: 22 }}>
            O que é o Projeto Integrador WIT?
          </h1>

          <p className="linha-fina">
            A sala do Núcleo WIT está aberta para receber você e a sua turma. A ideia é{' '}
            <strong>unir o conteúdo da sua matéria ao conhecimento técnico da nossa equipe</strong> —
            no período regular de aula, com você conduzindo junto com o profissional WIT.
          </p>

          <div className="abertura-acoes">
            <Link to="/agendar" className="botao grande">
              Agendar uma aula
            </Link>
            <Link to="/atividades" className="botao secundario grande">
              Ver as atividades
            </Link>
          </div>
        </div>

        <div className="abertura-cena">
          <img
            src="/WIT HOME.jpg"
            alt="Sala do Núcleo WIT montada, com estúdio e equipamentos"
            loading="eager"
          />
        </div>
      </section>

      <section className="secao">
        <div className="grade">
          {ACOES.map((item) => (
            <Link
              key={item.para}
              to={item.para}
              className="cartao-acao"
            >
              <h3>{item.titulo}</h3>
              <p>{item.texto}</p>
              <span className="seta">{item.acao} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="secao">
        <div className="secao-titulo">
          <div>
            <h2>Como funciona, em três passos</h2>
          </div>
        </div>
        <ol className="passos">
          <li>
            <span className="numero">1</span>
            <div>
              <strong>Escolha o horário</strong>
              <p>Selecione a sua escola e veja a semana. Os horários livres estão em verde.</p>
            </div>
          </li>
          <li>
            <span className="numero">2</span>
            <div>
              <strong>Escolha a aula</strong>
              <p>
                Pegue uma das nossas atividades prontas — com as habilidades da BNCC já mapeadas — ou
                descreva em uma linha o que você quer trabalhar.
              </p>
            </div>
          </li>
          <li>
            <span className="numero">3</span>
            <div>
              <strong>Traga a turma</strong>
              <p>
                Você recebe um protocolo na hora. No dia, a equipe WIT já está com a sala pronta e
                conduz a aula com você.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {aulas.length > 0 && (
        <section className="secao">
          <div className="secao-titulo">
            <div>
              <h2>Atividades prontas para levar</h2>
              <p>Preparadas pela equipe WIT, com as habilidades da BNCC já mapeadas.</p>
            </div>
            <Link to="/atividades">ver todas as {aulas.length} →</Link>
          </div>
          <div className="grade">
            {aulas.slice(0, 3).map((aula) => (
              <Link key={aula.id} to={`/atividades/${aula.id}`} className="cartao atividade-destaque">
                {aula.materia_nome && (
                  <span className="etiqueta materia" style={{ marginBottom: 10 }}>
                    {aula.materia_nome}
                  </span>
                )}
                <h3 style={{ fontSize: 18 }}>{aula.titulo}</h3>
                <p style={{ color: 'var(--texto-suave)', fontSize: 15, marginTop: 6 }}>{aula.resumo}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {realizadas.length > 0 && (
        <section className="secao">
          <div className="secao-titulo">
            <div>
              <h2>Já aconteceu no Núcleo</h2>
              <p>
                {realizadas.length === 1
                  ? '1 turma já passou por aqui.'
                  : `${realizadas.length} turmas já passaram por aqui.`}
              </p>
            </div>
            <Link to="/realizadas">ver o histórico →</Link>
          </div>
        </section>
      )}

      {carregando && <p className="carregando">Carregando…</p>}
    </main>
  )
}

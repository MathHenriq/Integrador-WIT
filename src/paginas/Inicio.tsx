import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoWit } from '../componentes/LogoWit'
import { carregarContexto, listarAulas, listarRealizadas } from '../lib/api'
import { diaEMes } from '../lib/formato'
import type { AulaCatalogo, Realizada } from '../lib/tipos'

const CAMINHOS = [
  {
    para: '/agendar',
    icone: '📅',
    titulo: 'Agendar uma aula',
    texto:
      'Veja a semana da sua escola, escolha um horário livre na sala do Núcleo WIT e traga a sua turma.',
    acao: 'Ver a agenda',
  },
  {
    para: '/atividades',
    icone: '🧪',
    titulo: 'Explorar atividades',
    texto:
      'Aulas prontas por matéria, ano e habilidade da BNCC — de robótica com sucata a horta com sensores.',
    acao: 'Ver o catálogo',
  },
  {
    para: '/realizadas',
    icone: '✨',
    titulo: 'O que já rolou',
    texto:
      'As aulas que outras turmas já fizeram, para inspirar a próxima. Tudo aberto para todo mundo ver.',
    acao: 'Ver a vitrine',
  },
]

export function Inicio() {
  const [escolas, setEscolas] = useState(0)
  const [aulas, setAulas] = useState<AulaCatalogo[]>([])
  const [realizadas, setRealizadas] = useState<Realizada[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // A home é vitrine: se algo falhar, ela ainda precisa abrir bonita,
    // então cada bloco degrada para vazio em vez de derrubar a página.
    Promise.allSettled([carregarContexto(), listarAulas({}), listarRealizadas({ limite: 200 })])
      .then(([ctx, cat, feitas]) => {
        if (ctx.status === 'fulfilled') setEscolas(ctx.value.escolas.length)
        if (cat.status === 'fulfilled') setAulas(cat.value)
        if (feitas.status === 'fulfilled') setRealizadas(feitas.value)
      })
      .finally(() => setCarregando(false))
  }, [])

  return (
    <main className="conteudo">
      <section className="hero">
        <span className="selo">Projeto Integrador</span>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <LogoWit altura={72} />
        </div>
        <h1>
          A sala de tecnologia da sua escola, <span className="destaque">aberta para a sua turma</span>
        </h1>
        <p className="subtitulo">
          Quando um horário do Núcleo WIT fica livre, ele pode ser seu. Escolha o dia, escolha a
          aula — uma das nossas ou a que você mesmo quer dar — e leve os seus alunos.
        </p>
        <div className="hero-acoes">
          <Link to="/agendar" className="botao">
            Agendar uma aula
          </Link>
          <Link to="/atividades" className="botao secundario">
            Ver atividades
          </Link>
        </div>
      </section>

      <section className="numeros" style={{ marginTop: 8 }}>
        <div className="numero-caixa">
          <div className="valor">{carregando ? '—' : escolas}</div>
          <div className="rotulo">escolas com agenda aberta</div>
        </div>
        <div className="numero-caixa">
          <div className="valor">{carregando ? '—' : aulas.length}</div>
          <div className="rotulo">aulas prontas no catálogo</div>
        </div>
        <div className="numero-caixa">
          <div className="valor">{carregando ? '—' : realizadas.length}</div>
          <div className="rotulo">aulas já realizadas</div>
        </div>
      </section>

      <section className="secao">
        <div className="grade">
          {CAMINHOS.map((caminho) => (
            <Link key={caminho.para} to={caminho.para} className="cartao-caminho">
              <span className="icone" aria-hidden="true">
                {caminho.icone}
              </span>
              <h3>{caminho.titulo}</h3>
              <p>{caminho.texto}</p>
              <span className="seta">{caminho.acao} →</span>
            </Link>
          ))}
        </div>
      </section>

      {aulas.length > 0 && (
        <section className="secao">
          <div className="secao-titulo">
            <div>
              <h2>Aulas prontas para levar</h2>
              <p>Preparadas pela equipe WIT, alinhadas à BNCC.</p>
            </div>
            <Link to="/atividades">ver todas →</Link>
          </div>
          <div className="grade">
            {aulas.slice(0, 3).map((aula) => (
              <Link key={aula.id} to={`/atividades/${aula.id}`} className="cartao-aula">
                <div
                  className="barra-materia"
                  style={{ background: aula.materia_cor ?? 'var(--verde)' }}
                />
                <h3>{aula.titulo}</h3>
                <p className="resumo">{aula.resumo}</p>
                <div className="rodape-cartao">
                  {aula.materia_nome && <span className="etiqueta materia">{aula.materia_nome}</span>}
                  <span>{aula.duracao_min} min</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {realizadas.length > 0 && (
        <section className="secao">
          <div className="secao-titulo">
            <div>
              <h2>Últimas aulas realizadas</h2>
              <p>O que outras turmas fizeram nas salas do Núcleo.</p>
            </div>
            <Link to="/realizadas">ver o histórico →</Link>
          </div>
          <div className="grade">
            {realizadas.slice(0, 3).map((item) => (
              <div key={item.id} className="cartao">
                <div className="topo-cartao" style={{ marginBottom: 8 }}>
                  {item.materia_nome && <span className="etiqueta materia">{item.materia_nome}</span>}
                </div>
                <h3 style={{ fontSize: 17, marginBottom: 6 }}>{item.titulo}</h3>
                <p style={{ color: 'var(--texto-suave)', fontSize: 14 }}>
                  {item.escola_nome} · {diaEMes(item.data_aula)} · {item.nome_professor}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

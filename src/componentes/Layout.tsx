import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LogoWit } from './LogoWit'

const CHAVE_TEMA = 'wit:tema'

/**
 * Poucos destinos, com o nome do que a pessoa vai fazer — nada de
 * "explore" ou "saiba mais". Professor cansado não procura no site.
 */
const PAGINAS = [
  { para: '/agendar', rotulo: 'Agendar aula' },
  { para: '/cursos', rotulo: 'Na sua matéria' },
  { para: '/atividades', rotulo: 'Atividades' },
  { para: '/realizadas', rotulo: 'Já realizadas' },
  { para: '/reserva', rotulo: 'Minha reserva' },
]

/** A tela de reservas do professor acontece "no chroma"; o resto, no estúdio. */
function ambienteDaRota(caminho: string) {
  return caminho.startsWith('/reserva') ? 'chroma' : 'estudio'
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<'escuro' | 'claro'>(
    () => (localStorage.getItem(CHAVE_TEMA) as 'escuro' | 'claro') ?? 'escuro',
  )
  const [menuAberto, setMenuAberto] = useState(false)
  const local = useLocation()
  const ambiente = ambienteDaRota(local.pathname)

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    localStorage.setItem(CHAVE_TEMA, tema)
  }, [tema])

  useEffect(() => {
    setMenuAberto(false)
    window.scrollTo({ top: 0 })
  }, [local.pathname])

  return (
    <>
      <div className={`ambiente ${ambiente}`} aria-hidden="true" />

      <div className={`app ${ambiente === 'chroma' ? 'sobre-chroma' : ''}`}>
        <header className="topo">
          <div className="topo-interno">
            <Link to="/" className="marca" aria-label="Núcleo WIT — início">
              <LogoWit altura={32} semAssinatura />
            </Link>

            <button
              type="button"
              className="fantasma icone-so menu-hamburguer"
              aria-label="Abrir menu"
              aria-expanded={menuAberto}
              onClick={() => setMenuAberto((a) => !a)}
            >
              {menuAberto ? '✕' : '☰'}
            </button>

            <nav className={`nav ${menuAberto ? 'aberto' : ''}`}>
              {PAGINAS.map((pagina) => (
                <NavLink
                  key={pagina.para}
                  to={pagina.para}
                  className={({ isActive }) => (isActive ? 'ativo' : '')}
                >
                  {pagina.rotulo}
                </NavLink>
              ))}
              {/* A equipe entra por aqui. Fica à direita de tudo, separado
                  das abas do professor, para ninguém confundir os dois. */}
              <Link to="/admin" className="botao-painel">
                Painel WIT
              </Link>

              <button
                type="button"
                className="botao-tema"
                onClick={() => setTema(tema === 'escuro' ? 'claro' : 'escuro')}
                aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
                title={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
              >
                {tema === 'escuro' ? '☀' : '☾'}
              </button>
            </nav>
          </div>
        </header>

        {children}

        <footer className="rodape">
          <div className="rodape-interno">
            <span>Projeto Integrador · Núcleo WIT · Secretaria de Educação de Barueri</span>
          </div>
        </footer>
      </div>
    </>
  )
}

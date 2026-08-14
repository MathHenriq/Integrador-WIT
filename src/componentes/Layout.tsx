import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LogoWit } from './LogoWit'

const CHAVE_TEMA = 'wit:tema'

const PAGINAS = [
  { para: '/agendar', rotulo: 'Agendar aula' },
  { para: '/atividades', rotulo: 'Atividades' },
  { para: '/realizadas', rotulo: 'Já realizadas' },
  { para: '/reserva', rotulo: 'Minha reserva' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  // O escuro é o padrão da identidade dos Núcleos; o claro fica de opção
  // para quem projeta na sala de aula.
  const [tema, setTema] = useState<'escuro' | 'claro'>(
    () => (localStorage.getItem(CHAVE_TEMA) as 'escuro' | 'claro') ?? 'escuro',
  )
  const [menuAberto, setMenuAberto] = useState(false)
  const local = useLocation()

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    localStorage.setItem(CHAVE_TEMA, tema)
  }, [tema])

  useEffect(() => {
    setMenuAberto(false)
    window.scrollTo({ top: 0 })
  }, [local.pathname])

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-interno">
          <Link to="/" className="marca" aria-label="Núcleo WIT — início">
            <LogoWit altura={34} semAssinatura />
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
          <Link to="/admin">Equipe WIT</Link>
        </div>
      </footer>
    </div>
  )
}

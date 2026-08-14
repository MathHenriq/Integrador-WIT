import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Admin } from './paginas/Admin'
import { Inicio } from './paginas/Inicio'
import { PortalEscola } from './paginas/PortalEscola'
import { configuracaoAusente } from './lib/supabase'

export function App() {
  if (configuracaoAusente) return <ConfiguracaoPendente />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/e/:token" element={<PortalEscola />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function ConfiguracaoPendente() {
  return (
    <div className="pagina" style={{ maxWidth: 560 }}>
      <div className="cartao">
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Configuração pendente</h1>
        <p style={{ color: 'var(--texto-suave)', marginTop: 0 }}>
          Copie <span className="mono">.env.example</span> para <span className="mono">.env</span> e
          preencha <span className="mono">VITE_SUPABASE_URL</span> e{' '}
          <span className="mono">VITE_SUPABASE_ANON_KEY</span> com os dados do projeto Supabase do
          Projeto Integrador.
        </p>
      </div>
    </div>
  )
}

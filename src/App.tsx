import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './componentes/Layout'
import { LogoWit } from './componentes/LogoWit'
import { Admin } from './paginas/Admin'
import { Agendar } from './paginas/Agendar'
import { AtividadeDetalhe, Atividades } from './paginas/Atividades'
import { Inicio } from './paginas/Inicio'
import { MinhaReserva } from './paginas/MinhaReserva'
import { Realizadas } from './paginas/Realizadas'
import { configuracaoAusente } from './lib/supabase'

export function App() {
  if (configuracaoAusente) return <ConfiguracaoPendente />

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/agendar" element={<Agendar />} />
          <Route path="/atividades" element={<Atividades />} />
          <Route path="/atividades/:id" element={<AtividadeDetalhe />} />
          <Route path="/realizadas" element={<Realizadas />} />
          <Route path="/reserva" element={<MinhaReserva />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

function ConfiguracaoPendente() {
  return (
    <div className="app">
      <main className="conteudo estreito" style={{ maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <LogoWit altura={64} />
        </div>
        <div className="cartao">
          <h1 style={{ fontSize: 20, marginBottom: 10 }}>Configuração pendente</h1>
          <p style={{ color: 'var(--texto-suave)' }}>
            Defina <span className="mono">VITE_SUPABASE_URL</span> e{' '}
            <span className="mono">VITE_SUPABASE_ANON_KEY</span> nas variáveis de ambiente (no
            Vercel: Settings → Environment Variables) e faça um novo deploy. Localmente, copie{' '}
            <span className="mono">.env.example</span> para <span className="mono">.env</span>.
          </p>
        </div>
      </main>
    </div>
  )
}

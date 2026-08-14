import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Ninguém deveria chegar aqui no uso normal — o professor abre o link da
 * escola direto. A página existe para quem digitou o endereço na mão ou
 * perdeu o resto do link.
 */
export function Inicio() {
  const navegar = useNavigate()
  const [token, setToken] = useState('')

  function abrir(evento: React.FormEvent) {
    evento.preventDefault()
    const limpo = token.trim().replace(/^.*\/e\//, '')
    if (limpo) navegar(`/e/${encodeURIComponent(limpo)}`)
  }

  return (
    <div className="pagina">
      <header className="cabecalho">
        <div>
          <div className="selo">Núcleo WIT</div>
          <h1>Projeto Integrador</h1>
          <p>
            Horários de sala de tecnologia que ficariam ociosos, abertos para as turmas da escola.
          </p>
        </div>
      </header>

      <div className="cartao">
        <h2 style={{ fontSize: 17, marginBottom: 8 }}>Você tem um link da sua escola?</h2>
        <p style={{ color: 'var(--texto-suave)', fontSize: 14, marginTop: 0 }}>
          Cada escola tem um link próprio, entregue pelo Núcleo WIT à coordenação. Cole o link (ou só
          o código dele) abaixo.
        </p>
        <form onSubmit={abrir}>
          <div className="campo">
            <label htmlFor="token">Link ou código da escola</label>
            <input
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="https://…/e/abc123 ou abc123"
            />
          </div>
          <div className="acoes-formulario">
            <button type="submit" disabled={!token.trim()}>
              Abrir
            </button>
          </div>
        </form>
      </div>

      <p style={{ color: 'var(--texto-suave)', fontSize: 14, marginTop: 24 }}>
        Não tem o link? Procure a coordenação da sua escola ou o instrutor do Núcleo WIT.
      </p>
    </div>
  )
}

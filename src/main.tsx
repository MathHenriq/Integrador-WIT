import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AUTOR, AUTOR_URL, SISTEMA } from './lib/autoria'
import './estilos.css'

console.info(`%c${SISTEMA}%c\nDesenvolvido por ${AUTOR} · ${AUTOR_URL}`, 'font-weight:700;color:#39B54A', '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

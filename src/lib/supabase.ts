import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configuracaoAusente = !url || !anonKey

// Cliente com valores de fachada quando o .env não está preenchido: a
// aplicação sobe e mostra a tela de "configure o .env" em vez de quebrar
// no import.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** A confirmação por e-mail é opcional (ver README). */
export const emailHabilitado = import.meta.env.VITE_EMAIL_CONFIRMACAO === 'true'

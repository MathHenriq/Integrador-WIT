import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Sem as variáveis do Supabase, `configuracaoAusente` vira uma constante
 * verdadeira, o Vite elimina o router inteiro como código morto e o
 * build termina verde tendo compilado só a tela de "configuração
 * pendente" — um deploy que parece bom e serve um site vazio.
 *
 * Melhor quebrar aqui, alto e com o nome do que falta. No `dev` não
 * quebra: ali a tela de configuração pendente é justamente o aviso útil
 * para quem acabou de clonar o projeto.
 */
function exigirVariaveis() {
  return {
    name: 'wit-exigir-variaveis',
    apply: 'build' as const,
    config(_: unknown, { mode }: { mode: string }) {
      const faltando = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
        (nome) => !process.env[nome]?.trim(),
      )

      if (faltando.length > 0) {
        throw new Error(
          `\n\nFalta ${faltando.join(' e ')} para compilar (modo ${mode}).\n\n` +
            'Sem essas variáveis o site inteiro sai do bundle e o build passa sem ter\n' +
            'testado nada. No Vercel: Settings → Environment Variables. Localmente:\n\n' +
            '  VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run build\n',
        )
      }
    },
  }
}

export default defineConfig({
  plugins: [exigirVariaveis(), react()],
  server: { port: 5173 },
})

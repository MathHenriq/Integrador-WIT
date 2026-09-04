// =====================================================================
// Edge Function: subir-fotos
// =====================================================================
// Recebe fotos soltas — anexadas do celular ou do computador de quem
// está usando o painel, sem passar por PDF nenhum — e devolve os
// endereços já hospedados no mesmo balde das fotos importadas do Canva.
//
// Existe pela mesma razão da importar-canva (ver 0008_importar_do_canva):
// o painel não tem login de verdade, então o papel `anon` não pode
// escrever no Storage. A senha é conferida antes de qualquer envio, e
// quem grava é a service role, que nunca sai deste processo.
//
// Chamada: POST multipart/form-data com o campo `senha` e um ou mais
// campos `arquivo` (um por foto).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Já sai comprimida em JPEG do navegador; acima disto é engano. */
const TAMANHO_MAXIMO = 10 * 1024 * 1024
const MAXIMO_DE_FOTOS = 20
const BALDE = 'fotos-aulas'

const EXTENSAO_DO_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function responder(corpo: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function recusar(mensagem: string, status = 400) {
  return responder({ ok: false, mensagem }, status)
}

async function sha256(bytes: Uint8Array) {
  const digerido = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digerido)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return recusar('Método não suportado.', 405)

  let senha = ''
  let arquivos: File[] = []
  try {
    const formulario = await req.formData()
    senha = String(formulario.get('senha') ?? '')
    arquivos = formulario.getAll('arquivo').filter((v): v is File => v instanceof File)
  } catch {
    return recusar('Não consegui ler o envio. Tente de novo.')
  }

  if (arquivos.length === 0) return recusar('Escolha ao menos uma foto.')
  if (arquivos.length > MAXIMO_DE_FOTOS) {
    return recusar(`Envie no máximo ${MAXIMO_DE_FOTOS} fotos de cada vez.`)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // A senha vem primeiro: subir foto custa tempo, e ninguém sem senha
  // vai gastar o nosso.
  const { error: erroDaSenha } = await supabase.rpc('admin_conferir_senha', { p_admin_token: senha })
  if (erroDaSenha) return recusar(erroDaSenha.message || 'Senha de administração inválida.', 401)

  const avisos: string[] = []
  const enderecos: string[] = []

  for (const arquivo of arquivos) {
    if (arquivo.size === 0) continue
    if (arquivo.size > TAMANHO_MAXIMO) {
      avisos.push(`"${arquivo.name}" passa de 10 MB e ficou de fora.`)
      continue
    }

    const extensao = EXTENSAO_DO_TIPO[arquivo.type]
    if (!extensao) {
      avisos.push(`"${arquivo.name}" não é uma foto num formato aceito (JPEG, PNG ou WEBP).`)
      continue
    }

    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    const hash = await sha256(bytes)
    const caminho = `enviadas/${hash.slice(0, 24)}.${extensao}`

    const { error } = await supabase.storage
      .from(BALDE)
      .upload(caminho, bytes as BlobPart, { contentType: arquivo.type, upsert: true })

    if (error) {
      console.error('Falha ao subir foto', caminho, error)
      avisos.push(`Não consegui guardar "${arquivo.name}".`)
      continue
    }

    enderecos.push(`${url}/storage/v1/object/public/${BALDE}/${caminho}`)
  }

  if (enderecos.length === 0) {
    return recusar(avisos[0] || 'Não consegui guardar nenhuma das fotos.')
  }

  return responder({ ok: true, fotos: enderecos, avisos })
})

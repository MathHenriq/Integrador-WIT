// =====================================================================
// Edge Function: importar-canva
// =====================================================================
// Recebe o PDF que a equipe exporta do Canva e devolve a aula pronta
// para conferência: campos lidos, relato montado e as fotos já
// hospedadas.
//
// Por que no servidor e não no navegador: as fotos vêm dentro do PDF e
// precisam ir para o Storage. O painel não tem login de verdade — é uma
// senha conferida por RPC —, então dar ao papel `anon` permissão de
// escrita no Storage deixaria qualquer pessoa subir arquivo. Aqui a
// senha é conferida antes de qualquer coisa e a gravação usa a service
// role, que nunca sai deste processo.
//
// Chamada: POST multipart/form-data com os campos `senha` e `arquivo`.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { ErroDeLeitura, extrairDoPdf } from './extrair.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Documento de aula não passa disto; acima é engano ou arquivo errado. */
const TAMANHO_MAXIMO = 10 * 1024 * 1024

const BALDE = 'fotos-aulas'

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
  let arquivo: File | null = null
  try {
    const formulario = await req.formData()
    senha = String(formulario.get('senha') ?? '')
    const enviado = formulario.get('arquivo')
    arquivo = enviado instanceof File ? enviado : null
  } catch {
    return recusar('Não consegui ler o envio. Tente de novo.')
  }

  if (!arquivo) return recusar('Escolha o PDF do documento do Canva.')
  if (arquivo.size === 0) return recusar('O arquivo enviado está vazio.')
  if (arquivo.size > TAMANHO_MAXIMO) {
    return recusar('O arquivo passa de 10 MB. Exporte o PDF do Canva em qualidade padrão.')
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // A senha vem primeiro: ler PDF e subir foto custa tempo, e ninguém
  // sem senha vai gastar o nosso.
  const { error: erroDaSenha } = await supabase.rpc('admin_conferir_senha', { p_admin_token: senha })
  if (erroDaSenha) return recusar(erroDaSenha.message || 'Senha de administração inválida.', 401)

  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const hash = await sha256(bytes)

  let extracao
  try {
    extracao = await extrairDoPdf(bytes)
  } catch (erro) {
    if (erro instanceof ErroDeLeitura) return recusar(erro.message)
    console.error('Falha ao ler o PDF', erro)
    return recusar('Não consegui ler este PDF. Se ele abre normalmente, me mande o arquivo para eu olhar.', 422)
  }

  // ------------------------------------------------------------------
  // As fotos
  // ------------------------------------------------------------------
  // O caminho começa pelo hash do documento: reimportar o mesmo arquivo
  // reescreve as mesmas fotos em vez de espalhar cópias pelo balde.

  const avisos = [...extracao.avisos]
  const enderecos: string[] = []

  for (const [indice, foto] of extracao.fotos.entries()) {
    const caminho = `${hash.slice(0, 16)}/${String(indice + 1).padStart(2, '0')}.${foto.extensao}`
    const { error } = await supabase.storage
      .from(BALDE)
      .upload(caminho, foto.bytes as BlobPart, { contentType: foto.tipo, upsert: true })

    if (error) {
      console.error('Falha ao subir foto', caminho, error)
      avisos.push(`Não consegui guardar uma das fotos (${foto.largura}×${foto.altura}).`)
      continue
    }

    enderecos.push(`${url}/storage/v1/object/public/${BALDE}/${caminho}`)
  }

  // ------------------------------------------------------------------
  // O registro
  // ------------------------------------------------------------------

  const { data: registro, error: erroDoRegistro } = await supabase.rpc('admin_registrar_importacao_canva', {
    p_admin_token: senha,
    p_arquivo_nome: arquivo.name,
    p_arquivo_hash: hash,
    p_tamanho_bytes: arquivo.size,
    p_campos: extracao.campos,
    p_fotos: enderecos,
    p_avisos: avisos,
  })

  if (erroDoRegistro) {
    console.error('Falha ao registrar a importação', erroDoRegistro)
    return recusar('Li o documento, mas não consegui registrar a importação. Tente de novo.', 500)
  }

  return responder({
    ok: true,
    importacao_id: registro?.importacao_id ?? null,
    anteriores: registro?.anteriores ?? [],
    campos: extracao.campos,
    relato: extracao.relato,
    fotos: enderecos,
    avisos,
    paginas: extracao.paginas,
  })
})

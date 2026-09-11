// =====================================================================
// Edge Function: subir-fotos
// =====================================================================
// Recebe fotos soltas — anexadas do celular ou do computador de quem
// está usando o painel, sem passar por PDF nenhum — e devolve os
// endereços já hospedados no mesmo balde das fotos importadas do Canva.
//
// Existe porque pedir o *endereço* da foto a quem acabou de dar a aula
// é pedir que a pessoa suba o arquivo em outro serviço primeiro; na
// prática, o projeto entrava sem foto nenhuma.
//
// Por que no servidor e não no navegador: a mesma razão da
// importar-canva (ver 0008_importar_do_canva e a seção 3.1 do HANDOFF).
// O painel não tem login de verdade, então o papel `anon` não pode
// escrever no Storage. A senha é conferida antes de qualquer envio, e
// quem grava é a service role, que nunca sai deste processo — o balde
// continua sem policy de escrita.
//
// Também aceita **link** de foto, e aqui está a parte que importa: o
// link não é guardado como link. O arquivo é baixado e hospedado no
// mesmo balde. Link de Drive apontava para a *página* de
// compartilhamento (`/file/d/<id>/view`), que é HTML — a vitrine nunca
// abriu nenhuma delas —, e mesmo o endereço direto só funciona enquanto
// o arquivo continuar público na conta de quem colou. Copiando a foto
// para cá, ela abre para sempre, para qualquer visitante.
//
// Chamada: POST multipart/form-data com o campo `senha` e, em qualquer
// combinação, campos `arquivo` (um por foto) e `link` (um por foto).
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

/** Baixar de fora não pode pendurar a tela de quem está registrando. */
const ESPERA_MAXIMA = 20_000

/**
 * O link que a equipe copia do Drive é o de compartilhamento, que abre
 * uma página, não a imagem. Estes são os endereços que devolvem os bytes
 * do mesmo arquivo — tentados em ordem, porque o Drive muda de ideia
 * sobre qual deles responde dependendo do tamanho do arquivo.
 */
function enderecosDiretos(link: string): string[] {
  let alvo: URL
  try {
    alvo = new URL(link)
  } catch {
    return []
  }

  if (alvo.protocol !== 'https:' && alvo.protocol !== 'http:') return []
  // Quem manda o link manda esta função buscar o endereço. Fora da
  // internet pública ela não vai: nada de localhost, IP de rede interna
  // ou o endereço de metadados da nuvem.
  if (
    /^(localhost|.*\.local|.*\.internal)$/i.test(alvo.hostname) ||
    /^(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01])|0)\./.test(alvo.hostname) ||
    alvo.hostname.startsWith('[')
  ) {
    return []
  }

  const drive = /^(drive|docs)\.google\.com$/.test(alvo.hostname)
  if (drive) {
    const id =
      alvo.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
      alvo.searchParams.get('id') ??
      ''
    if (id) {
      return [
        `https://drive.usercontent.google.com/download?id=${id}&export=download`,
        `https://lh3.googleusercontent.com/d/${id}`,
      ]
    }
  }

  // Dropbox entrega a página de pré-visualização com `dl=0`.
  if (alvo.hostname.endsWith('dropbox.com')) {
    alvo.searchParams.set('raw', '1')
    alvo.searchParams.delete('dl')
    return [alvo.toString()]
  }

  return [alvo.toString()]
}

/**
 * O que vier de fora é tratado como arquivo desconhecido: só https/http,
 * só imagem, e com teto de tamanho. Devolve os bytes ou a frase que
 * explica para a equipe o que fazer.
 */
async function baixarImagem(
  link: string,
): Promise<{ bytes: Uint8Array; tipo: string } | { erro: string }> {
  const candidatos = enderecosDiretos(link)
  if (candidatos.length === 0) return { erro: `"${link}" não parece um endereço de foto.` }

  let ultimoTipo = ''
  for (const endereco of candidatos) {
    let resposta: Response
    try {
      resposta = await fetch(endereco, {
        redirect: 'follow',
        signal: AbortSignal.timeout(ESPERA_MAXIMA),
      })
    } catch {
      continue
    }

    if (!resposta.ok) {
      ultimoTipo = `resposta ${resposta.status}`
      continue
    }

    const tipo = (resposta.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!EXTENSAO_DO_TIPO[tipo]) {
      ultimoTipo = tipo || 'sem tipo'
      continue
    }

    const bytes = new Uint8Array(await resposta.arrayBuffer())
    if (bytes.byteLength === 0) {
      ultimoTipo = 'arquivo vazio'
      continue
    }
    if (bytes.byteLength > TAMANHO_MAXIMO) {
      return { erro: `A foto de "${link}" passa de 10 MB.` }
    }

    return { bytes, tipo }
  }

  // O caso comum, de longe: o arquivo do Drive não está público, e o
  // Google devolve a tela de login em HTML. Dizer isso com todas as
  // letras evita a foto quebrada que ninguém entende na vitrine.
  if (/(^|\.)google\.com$/.test(new URL(candidatos[0]).hostname)) {
    return {
      erro:
        `Não consegui abrir a foto de "${link}". No Drive, o arquivo precisa estar como ` +
        '"qualquer pessoa com o link" — do jeito que está, só quem entra na conta de vocês veria ' +
        'a foto. O caminho mais curto é anexar o arquivo aqui.',
    }
  }

  if (ultimoTipo.includes('html')) {
    return {
      erro:
        `"${link}" abre uma página, não uma imagem. Clique na foto com o botão direito, ` +
        '"copiar endereço da imagem", e cole esse — ou anexe o arquivo aqui.',
    }
  }

  return { erro: `Não consegui baixar a foto de "${link}" (${ultimoTipo || 'sem resposta'}).` }
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
  let links: string[] = []
  try {
    const formulario = await req.formData()
    senha = String(formulario.get('senha') ?? '')
    arquivos = formulario.getAll('arquivo').filter((v): v is File => v instanceof File)
    links = formulario
      .getAll('link')
      .map((v) => String(v).trim())
      .filter(Boolean)
  } catch {
    return recusar('Não consegui ler o envio. Tente de novo.')
  }

  if (arquivos.length + links.length === 0) return recusar('Escolha ao menos uma foto.')
  if (arquivos.length + links.length > MAXIMO_DE_FOTOS) {
    return recusar(`Envie no máximo ${MAXIMO_DE_FOTOS} fotos de cada vez.`)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // A senha vem primeiro: subir foto custa tempo, e ninguém sem senha
  // vai gastar o nosso.
  const { error: erroDaSenha } = await supabase.rpc('admin_conferir_senha', { p_admin_token: senha })
  if (erroDaSenha) return recusar(erroDaSenha.message || 'Senha de administração inválida.', 401)

  // Uma foto ruim no meio de dez não derruba as outras: ela vira aviso e
  // o resto sobe. Quem está registrando a aula não vai remontar o envio
  // inteiro por causa de um arquivo que o celular exportou torto.
  const avisos: string[] = []
  const enderecos: string[] = []

  /**
   * O caminho sai do hash da própria foto: mandar a mesma imagem duas
   * vezes reescreve o mesmo arquivo em vez de espalhar cópias pelo balde
   * — a mesma régua que o importador usa com o hash do PDF. Anexo e link
   * passam por aqui igual: no fim, toda foto da vitrine mora no balde.
   */
  async function guardar(bytes: Uint8Array, tipo: string, comoChamar: string) {
    const hash = await sha256(bytes)
    const caminho = `enviadas/${hash.slice(0, 24)}.${EXTENSAO_DO_TIPO[tipo]}`

    const { error } = await supabase.storage
      .from(BALDE)
      .upload(caminho, bytes as BlobPart, { contentType: tipo, upsert: true })

    if (error) {
      console.error('Falha ao subir foto', caminho, error)
      avisos.push(`Não consegui guardar ${comoChamar}.`)
      return
    }

    // Mesma foto mandada duas vezes no mesmo envio (anexada e colada,
    // por exemplo) cai no mesmo caminho: ela entra uma vez na lista.
    const endereco = `${url}/storage/v1/object/public/${BALDE}/${caminho}`
    if (!enderecos.includes(endereco)) enderecos.push(endereco)
  }

  for (const link of links) {
    const baixada = await baixarImagem(link)
    if ('erro' in baixada) {
      avisos.push(baixada.erro)
      continue
    }
    await guardar(baixada.bytes, baixada.tipo, `a foto de "${link}"`)
  }

  for (const arquivo of arquivos) {
    if (arquivo.size === 0) continue
    if (arquivo.size > TAMANHO_MAXIMO) {
      avisos.push(`"${arquivo.name}" passa de 10 MB e ficou de fora.`)
      continue
    }

    if (!EXTENSAO_DO_TIPO[arquivo.type]) {
      avisos.push(`"${arquivo.name}" não é uma foto num formato aceito (JPEG, PNG ou WEBP).`)
      continue
    }

    await guardar(new Uint8Array(await arquivo.arrayBuffer()), arquivo.type, `"${arquivo.name}"`)
  }

  if (enderecos.length === 0) {
    return recusar(avisos[0] || 'Não consegui guardar nenhuma das fotos.')
  }

  return responder({ ok: true, fotos: enderecos, avisos })
})

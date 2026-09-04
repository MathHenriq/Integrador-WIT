import { emailHabilitado, supabase } from './supabase'
import type {
  AulaAdmin,
  AulaCatalogo,
  AulaDetalhe,
  AulaImportada,
  ContextoPublico,
  DataIso,
  EscolaAdmin,
  Habilidade,
  HorarioAdmin,
  Comprovante,
  FotosEnviadas,
  ImportacaoCanva,
  Ocorrencia,
  OrigemReserva,
  Realizada,
  ReservaAdmin,
  ReservaConsulta,
} from './tipos'

/**
 * As RPCs levantam exceções com mensagens já escritas para o usuário
 * final (em português). Repassamos essa mensagem e guardamos um fallback
 * para erros de rede/infra, que não têm texto apresentável.
 */
export class ErroApi extends Error {}

async function chamar<T>(funcao: string, argumentos: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(funcao, argumentos)

  if (error) {
    const mensagem = error.message?.trim()
    const semTexto = !mensagem || /fetch|network|failed to/i.test(mensagem)
    throw new ErroApi(
      semTexto ? 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.' : mensagem,
    )
  }

  return data as T
}

/**
 * O calendário casa ocorrência com dia por igualdade exata de string,
 * então uma data que chegue como "2026-08-19T00:00:00Z" faria a semana
 * aparecer vazia sem erro nenhum. Normalizar aqui mantém esse
 * acoplamento num lugar só.
 */
function soData(valor: string): DataIso {
  return valor.slice(0, 10)
}

// ------------------------------------------------------------- público

export async function carregarContexto() {
  const ctx = await chamar<ContextoPublico>('contexto_publico')
  return { ...ctx, hoje: soData(ctx.hoje), limite_agendamento: soData(ctx.limite_agendamento) }
}

export async function agendaEscola(escolaId: string, inicio: DataIso, fim: DataIso) {
  const linhas = await chamar<Ocorrencia[]>('agenda_escola', {
    p_escola_id: escolaId,
    p_inicio: inicio,
    p_fim: fim,
  })
  return linhas.map((o) => ({ ...o, data_aula: soData(o.data_aula) }))
}

export function listarAulas(filtros: {
  materiaId?: string | null
  ano?: number | null
  habilidadeId?: string | null
  busca?: string | null
}) {
  return chamar<AulaCatalogo[]>('listar_aulas', {
    p_materia_id: filtros.materiaId ?? null,
    p_ano: filtros.ano ?? null,
    p_habilidade_id: filtros.habilidadeId ?? null,
    p_busca: filtros.busca ?? null,
  })
}

export function obterAula(aulaId: string) {
  return chamar<AulaDetalhe | null>('obter_aula', { p_aula_id: aulaId })
}

/**
 * A busca acontece no servidor de propósito. São 1.303 habilidades, e o
 * PostgREST corta a resposta em mil linhas: filtrar no navegador nunca
 * enxergaria as outras 303, sem nada avisar.
 */
export function listarHabilidades(filtros: {
  materiaId?: string | null
  ano?: number | null
  busca?: string | null
  limite?: number
} = {}) {
  return chamar<Habilidade[]>('listar_habilidades', {
    p_materia_id: filtros.materiaId ?? null,
    p_ano: filtros.ano ?? null,
    p_busca: filtros.busca?.trim() || null,
    p_limite: filtros.limite ?? 60,
  })
}

export async function listarRealizadas(filtros: {
  materiaId?: string | null
  escolaId?: string | null
  limite?: number
}) {
  const linhas = await chamar<Realizada[]>('listar_realizadas', {
    p_materia_id: filtros.materiaId ?? null,
    p_escola_id: filtros.escolaId ?? null,
    p_limite: filtros.limite ?? 60,
  })
  return linhas.map((r) => ({ ...r, data_aula: soData(r.data_aula) }))
}

export async function agendar(dados: {
  escolaId: string
  horarioId: string
  dataAula: DataIso
  nomeProfessor: string
  turma: string | null
  email: string | null
  whatsapp: string | null
  quantidadeAlunos: number
  aulaId: string | null
  aulaLivre: string | null
  aulaObjetivos: string | null
  aulaMateriais: string | null
}) {
  const comprovante = await chamar<Comprovante>('agendar', {
    p_escola_id: dados.escolaId,
    p_horario_id: dados.horarioId,
    p_data_aula: dados.dataAula,
    p_nome_professor: dados.nomeProfessor,
    p_turma: dados.turma,
    p_email_contato: dados.email,
    p_aula_id: dados.aulaId,
    p_aula_livre: dados.aulaLivre,
    p_quantidade_alunos: dados.quantidadeAlunos,
    p_whatsapp_contato: dados.whatsapp,
    p_aula_objetivos: dados.aulaObjetivos,
    p_aula_materiais: dados.aulaMateriais,
  })
  // Disparo do e-mail depois da reserva já estar gravada, e sem await no
  // caminho de erro: a confirmação que vale é o protocolo na tela.
  if (emailHabilitado && comprovante?.protocolo) {
    void supabase.functions
      .invoke('enviar-confirmacao', { body: { protocolo: comprovante.protocolo } })
      .catch((erro) => console.warn('Falha ao enviar e-mail de confirmação', erro))
  }

  return { ...comprovante, data_aula: soData(comprovante.data_aula) }
}

export async function obterReserva(protocolo: string) {
  const reserva = await chamar<ReservaConsulta | null>('obter_reserva', { p_protocolo: protocolo })
  return reserva ? { ...reserva, data_aula: soData(reserva.data_aula) } : null
}

export function cancelarPorProtocolo(protocolo: string, motivo: string | null) {
  return chamar<unknown>('cancelar_por_protocolo', { p_protocolo: protocolo, p_motivo: motivo })
}

// --------------------------------------------------------------- admin

export function adminListarEscolas(senha: string) {
  return chamar<EscolaAdmin[]>('admin_listar_escolas', { p_admin_token: senha })
}

export function adminListarHorarios(senha: string, escolaId: string) {
  return chamar<HorarioAdmin[]>('admin_listar_horarios', {
    p_admin_token: senha,
    p_escola_id: escolaId,
  })
}

export function adminCriarHorario(
  senha: string,
  escolaId: string,
  dados: { diaSemana: number; horaInicio: string; horaFim: string; capacidade: number; ocupacaoWit: number },
) {
  return chamar<unknown>('admin_criar_horario', {
    p_admin_token: senha,
    p_escola_id: escolaId,
    p_dia_semana: dados.diaSemana,
    p_hora_inicio: dados.horaInicio,
    p_hora_fim: dados.horaFim,
    p_capacidade: dados.capacidade,
    p_ocupacao_wit: dados.ocupacaoWit,
  })
}

export function adminAtualizarHorario(
  senha: string,
  horarioId: string,
  dados: { capacidade?: number | null; ocupacaoWit?: number | null; ativo?: boolean | null },
) {
  return chamar<unknown>('admin_atualizar_horario', {
    p_admin_token: senha,
    p_horario_id: horarioId,
    p_capacidade: dados.capacidade ?? null,
    p_ocupacao_wit: dados.ocupacaoWit ?? null,
    p_ativo: dados.ativo ?? null,
  })
}

export function adminRemoverHorario(senha: string, horarioId: string) {
  return chamar<unknown>('admin_remover_horario', { p_admin_token: senha, p_horario_id: horarioId })
}

export function adminListarAulas(senha: string) {
  return chamar<AulaAdmin[]>('admin_listar_aulas', { p_admin_token: senha })
}

export function adminSalvarAula(
  senha: string,
  dados: {
    id: string | null
    titulo: string
    resumo: string
    tema: string | null
    descricao: string | null
    objetivos: string | null
    materiais: string | null
    materiaId: string | null
    anos: number[]
    duracaoMin: number
    publicada: boolean
    habilidades: string[]
  },
) {
  return chamar<unknown>('admin_salvar_aula', {
    p_admin_token: senha,
    p_aula_id: dados.id,
    p_titulo: dados.titulo,
    p_resumo: dados.resumo,
    p_tema: dados.tema,
    p_descricao: dados.descricao,
    p_objetivos: dados.objetivos,
    p_materiais: dados.materiais,
    p_materia_id: dados.materiaId,
    p_anos: dados.anos,
    p_duracao_min: dados.duracaoMin,
    p_publicada: dados.publicada,
    p_habilidades: dados.habilidades,
  })
}

export function adminRemoverAula(senha: string, aulaId: string) {
  return chamar<{ removida: boolean; despublicada: boolean }>('admin_remover_aula', {
    p_admin_token: senha,
    p_aula_id: aulaId,
  })
}

export function adminSalvarMateria(
  senha: string,
  dados: { id: string | null; nome: string; cor: string; ordem: number },
) {
  return chamar<unknown>('admin_salvar_materia', {
    p_admin_token: senha,
    p_materia_id: dados.id,
    p_nome: dados.nome,
    p_cor: dados.cor,
    p_ordem: dados.ordem,
  })
}

export function adminSalvarHabilidade(
  senha: string,
  dados: {
    id: string | null
    codigo: string
    descricao: string
    materiaId: string | null
    ano: number | null
  },
) {
  return chamar<unknown>('admin_salvar_habilidade', {
    p_admin_token: senha,
    p_habilidade_id: dados.id,
    p_codigo: dados.codigo,
    p_descricao: dados.descricao,
    p_materia_id: dados.materiaId,
    p_ano: dados.ano,
  })
}

export function adminRemoverHabilidade(senha: string, habilidadeId: string) {
  return chamar<unknown>('admin_remover_habilidade', {
    p_admin_token: senha,
    p_habilidade_id: habilidadeId,
  })
}

export async function adminListarReservas(senha: string, escolaId: string | null) {
  const linhas = await chamar<ReservaAdmin[]>('admin_listar_reservas', {
    p_admin_token: senha,
    p_escola_id: escolaId,
    p_de: null,
    p_ate: null,
  })
  return linhas.map((r) => ({ ...r, data_aula: soData(r.data_aula) }))
}

export function adminCancelarReserva(senha: string, reservaId: string, motivo: string | null) {
  return chamar<unknown>('admin_cancelar_reserva', {
    p_admin_token: senha,
    p_reserva_id: reservaId,
    p_motivo: motivo,
  })
}

export function adminConfirmarReserva(senha: string, reservaId: string) {
  return chamar<unknown>('admin_confirmar_reserva', {
    p_admin_token: senha,
    p_reserva_id: reservaId,
  })
}

/**
 * Corrige um projeto integrador já registrado: data, horário, professor,
 * turma, contato e — só quando a aula não é do catálogo — tema, objetivos
 * e materiais. Diferente de cancelar: aqui a reserva continua a mesma,
 * só com os dados certos.
 */
export function adminAtualizarReserva(
  senha: string,
  reservaId: string,
  dados: {
    horarioId: string
    dataAula: DataIso
    nomeProfessor: string
    turma: string | null
    emailContato: string | null
    whatsappContato: string | null
    quantidadeAlunos: number | null
    aulaLivre: string | null
    aulaObjetivos: string | null
    aulaMateriais: string | null
  },
) {
  return chamar<unknown>('admin_atualizar_reserva', {
    p_admin_token: senha,
    p_reserva_id: reservaId,
    p_horario_id: dados.horarioId,
    p_data_aula: dados.dataAula,
    p_nome_professor: dados.nomeProfessor,
    p_turma: dados.turma,
    p_email_contato: dados.emailContato,
    p_whatsapp_contato: dados.whatsappContato,
    p_quantidade_alunos: dados.quantidadeAlunos,
    p_aula_livre: dados.aulaLivre,
    p_aula_objetivos: dados.aulaObjetivos,
    p_aula_materiais: dados.aulaMateriais,
  })
}

/** Apaga o registro de vez — diferente de cancelar, que mantém o histórico. */
export function adminRemoverReserva(senha: string, reservaId: string) {
  return chamar<unknown>('admin_remover_reserva', {
    p_admin_token: senha,
    p_reserva_id: reservaId,
  })
}

export function adminRegistrarRelato(
  senha: string,
  reservaId: string,
  relato: string,
  fotos: string[],
) {
  return chamar<unknown>('admin_registrar_relato', {
    p_admin_token: senha,
    p_reserva_id: reservaId,
    p_relato: relato,
    p_fotos: fotos,
  })
}

// ------------------------------------------- importação do documento do Canva

/**
 * Manda o PDF do Canva para a Edge Function, que lê os campos e hospeda
 * as fotos. É o único ponto do site que não passa por RPC: as fotos vêm
 * dentro do arquivo e precisam ir para o Storage, e só o servidor tem
 * permissão de escrever lá (ver `supabase/functions/importar-canva`).
 */
export async function importarDocumentoCanva(senha: string, arquivo: File) {
  const formulario = new FormData()
  formulario.append('senha', senha)
  formulario.append('arquivo', arquivo)

  const { data, error } = await supabase.functions.invoke('importar-canva', { body: formulario })

  if (error) {
    // A função devolve a frase pronta no corpo, inclusive quando responde
    // 4xx; sem isto o usuário veria só "Edge Function returned a non-2xx".
    let mensagem = ''
    const contexto = (error as { context?: Response }).context
    if (contexto && typeof contexto.json === 'function') {
      try {
        mensagem = ((await contexto.json()) as { mensagem?: string }).mensagem ?? ''
      } catch {
        mensagem = ''
      }
    }
    throw new ErroApi(
      mensagem ||
        'Não foi possível falar com o importador. Confira a conexão e tente de novo.',
    )
  }

  const corpo = data as ImportacaoCanva & { ok?: boolean; mensagem?: string }
  if (corpo?.ok === false) throw new ErroApi(corpo.mensagem ?? 'Não consegui ler este documento.')

  return corpo
}

/**
 * Sobe fotos soltas — anexadas do celular ou do computador de quem está
 * no painel — para o mesmo balde das fotos do Canva. Existe pela mesma
 * razão da `importarDocumentoCanva`: o painel não tem login de verdade,
 * então só a Edge Function (service role) pode escrever no Storage; o
 * navegador nunca fala com o balde direto.
 */
export async function subirFotos(senha: string, arquivos: File[]) {
  const formulario = new FormData()
  formulario.append('senha', senha)
  for (const arquivo of arquivos) formulario.append('arquivo', arquivo)

  const { data, error } = await supabase.functions.invoke('subir-fotos', { body: formulario })

  if (error) {
    let mensagem = ''
    const contexto = (error as { context?: Response }).context
    if (contexto && typeof contexto.json === 'function') {
      try {
        mensagem = ((await contexto.json()) as { mensagem?: string }).mensagem ?? ''
      } catch {
        mensagem = ''
      }
    }
    throw new ErroApi(mensagem || 'Não foi possível enviar as fotos. Confira a conexão e tente de novo.')
  }

  const corpo = data as FotosEnviadas & { ok?: boolean; mensagem?: string }
  if (corpo?.ok === false) throw new ErroApi(corpo.mensagem ?? 'Não consegui guardar as fotos.')

  return corpo
}

/**
 * Publica a aula lida do documento (ou registrada direto pela equipe). O
 * horário é opcional: aula que já aconteceu está no site para inspirar
 * outros professores, não para ocupar agenda, então quando a equipe não
 * sabe (ou não precisa dizer) o tempo exato, o banco resolve sozinho
 * (anexa à reserva que já existe ou usa o primeiro tempo livre do dia).
 * Mas se a equipe sabe o horário certo, informar aqui evita que o banco
 * "adivinhe" errado quando mais de um tempo estava livre naquele dia.
 *
 * As partes do documento vão separadas, e não só dentro do relato,
 * porque a mesma aula abre uma atividade no catálogo: ali a descrição, os
 * objetivos e os materiais moram em campos próprios.
 */
export function adminImportarAulaRealizada(
  senha: string,
  dados: {
    importacaoId: string | null
    escolaId: string
    dataAula: DataIso
    nomeProfessor: string
    turma: string | null
    titulo: string
    relato: string | null
    fotos: string[]
    descricao: string | null
    objetivos: string | null
    materiais: string | null
    virarAtividade: boolean
    /** Só vale quando cria uma reserva nova. Padrão: Equipe WIT. */
    origem?: OrigemReserva
    /** Quando a equipe sabe o horário certo. Deixe null para o banco escolher. */
    horarioId?: string | null
  },
) {
  return chamar<AulaImportada>('admin_importar_aula_realizada', {
    p_admin_token: senha,
    p_importacao_id: dados.importacaoId,
    p_escola_id: dados.escolaId,
    p_data_aula: dados.dataAula,
    p_nome_professor: dados.nomeProfessor,
    p_turma: dados.turma,
    p_titulo: dados.titulo,
    p_relato: dados.relato,
    p_fotos: dados.fotos,
    p_descricao: dados.descricao,
    p_objetivos: dados.objetivos,
    p_materiais: dados.materiais,
    p_virar_atividade: dados.virarAtividade,
    p_origem: dados.origem ?? 'equipe_wit',
    p_horario_id: dados.horarioId ?? null,
  })
}

/**
 * Importa a BNCC inteira de uma vez. O site separa código e descrição; o
 * banco deriva o ano e a matéria a partir do próprio código, que já
 * carrega os dois (EF06MA01 = 6º ano, Matemática).
 */
export function adminImportarHabilidades(senha: string, pares: { codigo: string; descricao: string }[]) {
  return chamar<{ novas: number; alteradas: number; ignoradas: string[] }>(
    'admin_importar_habilidades',
    {
      p_admin_token: senha,
      p_codigos: pares.map((p) => p.codigo),
      p_descricoes: pares.map((p) => p.descricao),
    },
  )
}

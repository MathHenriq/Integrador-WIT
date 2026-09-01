import { useEffect, useMemo, useState } from 'react'
import { agendar, listarAulas } from '../lib/api'
import { dataExtensa, emailValido, faixaHoraria, rotuloAnos } from '../lib/formato'
import type { AulaCatalogo, Comprovante, Ocorrencia } from '../lib/tipos'
import { Aviso } from './Aviso'
import { Modal } from './Modal'

type Props = {
  escolaId: string
  escolaNome: string
  ocorrencia: Ocorrencia
  aoFechar: () => void
  aoConfirmar: (comprovante: Comprovante) => void
}

type Origem = 'catalogo' | 'propria'

/** Materiais que a sala do Núcleo já tem. Só um atalho — o professor pode
 *  simplesmente escrever o que precisa no campo. */
const MATERIAIS_DA_SALA = [
  'Computadores',
  'Celulares',
  'Tablets',
  'Relógios smartwatches',
  'Óculos de realidade virtual',
  'Óculos de realidade aumentada',
  'Câmera',
  'Televisões',
  'Estúdio',
  'Fones',
]

function linhasDe(texto: string) {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Acrescenta ou tira uma linha do texto, sem mexer no resto que o
 *  professor já escreveu. */
function alternarLinha(texto: string, item: string) {
  const linhas = linhasDe(texto)
  const chave = item.toLowerCase()
  const jaTem = linhas.some((l) => l.toLowerCase() === chave)
  return jaTem ? linhas.filter((l) => l.toLowerCase() !== chave).join('\n') : [...linhas, item].join('\n')
}

export function DialogoAgendamento({
  escolaId,
  escolaNome,
  ocorrencia,
  aoFechar,
  aoConfirmar,
}: Props) {
  const [nome, setNome] = useState('')
  const [turma, setTurma] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [quantidadeAlunos, setQuantidadeAlunos] = useState('')
  const [origem, setOrigem] = useState<Origem>('catalogo')
  const [aulaId, setAulaId] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')
  const [objetivos, setObjetivos] = useState('')
  const [materiais, setMateriais] = useState('')
  const [busca, setBusca] = useState('')

  const [aulas, setAulas] = useState<AulaCatalogo[]>([])
  const [carregandoAulas, setCarregandoAulas] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    listarAulas({})
      .then((lista) => {
        setAulas(lista)
        // Catálogo vazio: não faz sentido oferecer uma escolha que não
        // existe, então o formulário já abre no modo "escrevo a minha".
        if (lista.length === 0) setOrigem('propria')
      })
      .catch(() => setOrigem('propria'))
      .finally(() => setCarregandoAulas(false))
  }, [])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return aulas
    return aulas.filter(
      (a) =>
        a.titulo.toLowerCase().includes(termo) ||
        (a.tema ?? '').toLowerCase().includes(termo) ||
        a.resumo.toLowerCase().includes(termo) ||
        (a.materia_nome ?? '').toLowerCase().includes(termo),
    )
  }, [aulas, busca])

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    if (nome.trim().length < 3) {
      setErro('Informe o nome do professor responsável pela turma.')
      return
    }
    if (email.trim() && !emailValido(email.trim())) {
      setErro('O e-mail informado não parece válido.')
      return
    }
    if (!email.trim() && !whatsapp.trim()) {
      setErro('Informe um e-mail ou um WhatsApp: é como a equipe WIT confirma a aula com você.')
      return
    }
    const alunos = Number(quantidadeAlunos)
    if (!quantidadeAlunos.trim() || !Number.isInteger(alunos) || alunos < 1) {
      setErro('Informe quantos alunos a turma tem.')
      return
    }
    if (origem === 'catalogo' && !aulaId) {
      setErro('Escolha uma aula do catálogo, ou mude para "Vou dar a minha aula".')
      return
    }
    if (origem === 'propria' && descricao.trim().length < 3) {
      setErro('Descreva a aula que você quer dar na sala do Núcleo WIT.')
      return
    }

    setEnviando(true)
    try {
      const comprovante = await agendar({
        escolaId,
        horarioId: ocorrencia.horario_id,
        dataAula: ocorrencia.data_aula,
        nomeProfessor: nome.trim(),
        turma: turma.trim() || null,
        email: email.trim() || null,
        whatsapp: whatsapp.trim() || null,
        quantidadeAlunos: alunos,
        aulaId: origem === 'catalogo' ? aulaId : null,
        aulaLivre: origem === 'propria' ? descricao.trim() : null,
        aulaObjetivos: origem === 'propria' ? objetivos.trim() || null : null,
        aulaMateriais: origem === 'propria' ? materiais.trim() || null : null,
      })
      aoConfirmar(comprovante)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir o agendamento.')
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo="Agendar aula"
      subtitulo={`${escolaNome} · ${dataExtensa(ocorrencia.data_aula)} · ${faixaHoraria(
        ocorrencia.hora_inicio,
        ocorrencia.hora_fim,
      )}`}
      aoFechar={aoFechar}
      largo
    >
      <form onSubmit={enviar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="nome">Professor(a) responsável</label>
            <input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Ana Ribeiro"
              autoComplete="name"
              maxLength={120}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="turma">
              Turma <span className="opcional">(opcional)</span>
            </label>
            <input
              id="turma"
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
              placeholder="Ex.: 7º ano B"
              maxLength={60}
            />
          </div>
          <div className="campo">
            <label htmlFor="quantidade-alunos">Quantidade de alunos</label>
            <input
              id="quantidade-alunos"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={quantidadeAlunos}
              onChange={(e) => setQuantidadeAlunos(e.target.value)}
              placeholder="Ex.: 28"
              required
            />
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="email">E-mail de contato</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@escola.edu.br"
              autoComplete="email"
              maxLength={160}
            />
          </div>
          <div className="campo">
            <label htmlFor="whatsapp">WhatsApp</label>
            <input
              id="whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(11) 91234-5678"
              autoComplete="tel"
              maxLength={30}
            />
          </div>
        </div>
        <p className="ajuda" style={{ marginTop: -10, marginBottom: 18 }}>
          Informe pelo menos um dos dois: é como a equipe WIT confirma com você os detalhes da
          aula antes do dia marcado.
        </p>

        <fieldset>
          <legend>Qual aula vai ser dada?</legend>

          <div className="chips" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className="chip"
              aria-pressed={origem === 'catalogo'}
              onClick={() => setOrigem('catalogo')}
              disabled={aulas.length === 0}
            >
              Escolher do catálogo WIT
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={origem === 'propria'}
              onClick={() => setOrigem('propria')}
            >
              Vou dar a minha aula
            </button>
          </div>

          {origem === 'catalogo' ? (
            carregandoAulas ? (
              <p className="carregando" style={{ padding: 16 }}>
                Carregando aulas…
              </p>
            ) : (
              <>
                <div className="campo" style={{ marginBottom: 12 }}>
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por tema, matéria ou título…"
                    aria-label="Buscar aula no catálogo"
                  />
                </div>

                {filtradas.length === 0 ? (
                  <p className="ajuda">
                    Nenhuma aula encontrada com esse termo. Limpe a busca ou escreva a sua própria
                    aula.
                  </p>
                ) : (
                  <div className="opcoes-aula" style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {filtradas.map((aula) => (
                      <button
                        type="button"
                        key={aula.id}
                        className="opcao-aula"
                        aria-pressed={aulaId === aula.id}
                        onClick={() => setAulaId(aula.id)}
                      >
                        {aula.titulo}
                        <div className="resumo">
                          {aula.materia_nome ? `${aula.materia_nome} · ` : ''}
                          {rotuloAnos(aula.anos)} · {aula.duracao_min} min
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          ) : (
            <>
              <div className="campo">
                <label htmlFor="descricao-aula">Descrição da aula</label>
                <textarea
                  id="descricao-aula"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: Revisão de frações com jogos digitais — a turma calcula frações de receitas e monta um cardápio no Canva."
                  maxLength={500}
                  rows={3}
                />
                <p className="ajuda">
                  Conte o conteúdo que sua turma está estudando e o que gostaria de fazer com a
                  tecnologia da sala (VR, robótica, IA…). É com essa descrição que a equipe WIT
                  entende como preparar a aula com você. Fica registrado na vitrine de aulas
                  realizadas.
                </p>
              </div>

              <div className="campo">
                <label htmlFor="objetivos-aula">
                  Objetivos de aprendizagem <span className="opcional">(opcional)</span>
                </label>
                <textarea
                  id="objetivos-aula"
                  value={objetivos}
                  onChange={(e) => setObjetivos(e.target.value)}
                  placeholder="Um objetivo por linha."
                  maxLength={400}
                  rows={2}
                />
              </div>

              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="materiais-aula">
                  Materiais e recursos <span className="opcional">(opcional)</span>
                </label>
                <textarea
                  id="materiais-aula"
                  value={materiais}
                  onChange={(e) => setMateriais(e.target.value)}
                  placeholder="Um material por linha, se já souber o que vai precisar."
                  maxLength={400}
                  rows={2}
                />
                <details className="lista-discreta">
                  <summary>Prefere escolher da lista do Núcleo?</summary>
                  <div className="chips" style={{ marginTop: 10 }}>
                    {MATERIAIS_DA_SALA.map((item) => (
                      <button
                        type="button"
                        key={item}
                        className="chip"
                        aria-pressed={linhasDe(materiais)
                          .map((l) => l.toLowerCase())
                          .includes(item.toLowerCase())}
                        onClick={() => setMateriais((atual) => alternarLinha(atual, item))}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            </>
          )}
        </fieldset>

        <div className="acoes-formulario">
          <button type="button" className="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Pedir agendamento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function DialogoComprovante({
  comprovante,
  aoFechar,
}: {
  comprovante: Comprovante
  aoFechar: () => void
}) {
  return (
    <Modal titulo="Pedido de agendamento enviado!" aoFechar={aoFechar}>
      <div className="protocolo">
        <div className="rotulo">Seu protocolo</div>
        <div className="codigo">{comprovante.protocolo}</div>
      </div>

      <dl className="definicoes">
        <dt>Escola</dt>
        <dd>{comprovante.escola_nome}</dd>
        <dt>Data</dt>
        <dd>{dataExtensa(comprovante.data_aula)}</dd>
        <dt>Horário</dt>
        <dd>{faixaHoraria(comprovante.hora_inicio, comprovante.hora_fim)}</dd>
        <dt>Aula</dt>
        <dd>{comprovante.aula_titulo}</dd>
        <dt>Professor(a)</dt>
        <dd>
          {comprovante.nome_professor}
          {comprovante.turma ? ` · ${comprovante.turma}` : ''}
        </dd>
      </dl>

      <Aviso tipo="info">
        O horário está reservado para você, mas ainda <strong>aguardando confirmação da equipe
        WIT</strong>. Alguém do Núcleo vai entrar em contato pelo e-mail ou WhatsApp informado
        para entender a aula antes de confirmar.
      </Aviso>

      <p className="ajuda" style={{ marginTop: 18 }}>
        Guarde o protocolo: é com ele que você acompanha, consulta ou cancela esta reserva, em{' '}
        <strong>Minha reserva</strong>.
      </p>

      <div className="acoes-formulario">
        <button type="button" className="secundario" onClick={() => window.print()}>
          Imprimir
        </button>
        <button type="button" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  )
}

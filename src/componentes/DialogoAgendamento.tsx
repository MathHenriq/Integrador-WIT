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
  const [origem, setOrigem] = useState<Origem>('catalogo')
  const [aulaId, setAulaId] = useState<string | null>(null)
  const [aulaLivre, setAulaLivre] = useState('')
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
    if (origem === 'catalogo' && !aulaId) {
      setErro('Escolha uma aula do catálogo, ou mude para "Vou dar a minha aula".')
      return
    }
    if (origem === 'propria' && aulaLivre.trim().length < 3) {
      setErro('Descreva em uma linha a aula que você quer dar.')
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
        aulaId: origem === 'catalogo' ? aulaId : null,
        aulaLivre: origem === 'propria' ? aulaLivre.trim() : null,
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
        </div>

        <div className="campo">
          <label htmlFor="email">
            E-mail de contato <span className="opcional">(opcional)</span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@escola.edu.br"
            autoComplete="email"
            maxLength={160}
          />
          <p className="ajuda">Serve para a equipe WIT falar com você sobre a aula.</p>
        </div>

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
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="aula-livre">O que você vai trabalhar</label>
              <input
                id="aula-livre"
                value={aulaLivre}
                onChange={(e) => setAulaLivre(e.target.value)}
                placeholder="Ex.: Revisão de frações com jogos digitais"
                maxLength={160}
              />
              <p className="ajuda">
                A equipe WIT prepara a sala e apoia na condução. Fica registrado na vitrine de aulas
                realizadas.
              </p>
            </div>
          )}
        </fieldset>

        <div className="acoes-formulario">
          <button type="button" className="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Agendando…' : 'Confirmar agendamento'}
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
    <Modal titulo="Aula agendada!" aoFechar={aoFechar}>
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

      <p className="ajuda" style={{ marginTop: 18 }}>
        Guarde o protocolo: é com ele que você consulta ou cancela esta reserva, em{' '}
        <strong>Minha reserva</strong>. A equipe WIT já foi avisada.
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

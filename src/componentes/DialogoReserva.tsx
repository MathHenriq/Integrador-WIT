import { useState } from 'react'
import { criarReserva } from '../lib/api'
import { emailValido, faixaHoraria, nomeDia } from '../lib/formato'
import { emailHabilitado } from '../lib/supabase'
import type { Comprovante, Horario } from '../lib/tipos'
import { Aviso } from './Aviso'
import { Modal } from './Modal'

type Props = {
  token: string
  horario: Horario
  aoFechar: () => void
  aoConfirmar: (comprovante: Comprovante) => void
}

export function DialogoReserva({ token, horario, aoFechar, aoConfirmar }: Props) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

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

    setEnviando(true)
    try {
      const comprovante = await criarReserva(token, horario.id, nome.trim(), email.trim() || null)
      aoConfirmar(comprovante)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir a reserva.')
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo="Reservar horário"
      subtitulo={`${nomeDia(horario.dia_semana)}, ${faixaHoraria(horario.hora_inicio, horario.hora_fim)}`}
      aoFechar={aoFechar}
    >
      <form onSubmit={enviar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="campo">
          <label htmlFor="nome">Professor(a) responsável</label>
          <input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Ana Ribeiro — 7º ano B"
            autoComplete="name"
            maxLength={120}
            required
          />
          <p className="ajuda">Quem vai trazer a turma. Pode incluir a turma junto do nome.</p>
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
          <p className="ajuda">
            {emailHabilitado
              ? 'Enviamos a confirmação para este endereço. Sem e-mail, o protocolo na tela já vale como confirmação.'
              : 'Serve para o Núcleo WIT falar com você sobre a aula. O protocolo na tela é a sua confirmação.'}
          </p>
        </div>

        <div className="acoes-formulario">
          <button type="button" className="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Reservando…' : 'Confirmar reserva'}
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
    <Modal titulo="Reserva confirmada" aoFechar={aoFechar}>
      <div className="protocolo">
        <div className="rotulo">Protocolo</div>
        <div className="codigo">{comprovante.protocolo}</div>
      </div>

      <dl className="definicoes">
        <dt>Escola</dt>
        <dd>{comprovante.escola_nome}</dd>
        <dt>Horário</dt>
        <dd>
          {nomeDia(comprovante.dia_semana)}, {faixaHoraria(comprovante.hora_inicio, comprovante.hora_fim)}
        </dd>
        <dt>Professor(a)</dt>
        <dd>{comprovante.nome_professor}</dd>
        {comprovante.email_contato && (
          <>
            <dt>Contato</dt>
            <dd>{comprovante.email_contato}</dd>
          </>
        )}
      </dl>

      <p className="ajuda" style={{ marginTop: 16 }}>
        Anote o protocolo. A reserva já aparece para a coordenação da escola e para o Núcleo WIT
        {emailHabilitado && comprovante.email_contato ? ', e a confirmação foi enviada por e-mail' : ''}.
        Para cancelar, procure a coordenação.
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

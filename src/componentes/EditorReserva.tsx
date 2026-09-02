import { useEffect, useMemo, useState } from 'react'
import { adminAtualizarReserva, adminListarHorarios } from '../lib/api'
import { faixaHoraria, paraData } from '../lib/formato'
import type { HorarioAdmin, ReservaAdmin } from '../lib/tipos'
import { Aviso } from './Aviso'
import { Modal } from './Modal'

type Props = {
  senha: string
  reserva: ReservaAdmin
  aoFechar: () => void
  aoSalvar: () => void
}

/**
 * Corrige um projeto integrador já registrado. Escola não muda por aqui —
 * trocar de escola trocaria também toda a grade de horários envolvida, o
 * que é mais chance de bagunçar do que de corrigir. Tema, objetivos e
 * materiais só ficam editáveis quando a aula não veio do catálogo — vindo
 * de lá, são da atividade, compartilhados com quem mais já deu a mesma
 * aula, e mudam-se na aba Aulas.
 */
export function EditorReserva({ senha, reserva, aoFechar, aoSalvar }: Props) {
  const [horarios, setHorarios] = useState<HorarioAdmin[]>([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(true)

  const [data, setData] = useState(reserva.data_aula)
  const [horarioId, setHorarioId] = useState(reserva.horario_id)
  const [professor, setProfessor] = useState(reserva.nome_professor)
  const [turma, setTurma] = useState(reserva.turma ?? '')
  const [email, setEmail] = useState(reserva.email_contato ?? '')
  const [whatsapp, setWhatsapp] = useState(reserva.whatsapp_contato ?? '')
  const [quantidadeAlunos, setQuantidadeAlunos] = useState(
    reserva.quantidade_alunos != null ? String(reserva.quantidade_alunos) : '',
  )
  const [tema, setTema] = useState(reserva.aula_titulo ?? '')
  const [objetivos, setObjetivos] = useState(reserva.aula_objetivos ?? '')
  const [materiais, setMateriais] = useState(reserva.aula_materiais ?? '')

  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const temaVemDoCatalogo = reserva.aula_id !== null

  useEffect(() => {
    adminListarHorarios(senha, reserva.escola_id)
      .then(setHorarios)
      .catch(() => setHorarios([]))
      .finally(() => setCarregandoHorarios(false))
  }, [senha, reserva.escola_id])

  const diaSemana = useMemo(() => paraData(data).getDay(), [data])

  /**
   * Só os horários do dia da semana da data escolhida — e sempre com o
   * que já está selecionado na lista, mesmo desativado ou de outro dia,
   * senão o select "perde" o valor da reserva assim que abre.
   */
  const horariosVisiveis = useMemo(() => {
    const doDia = horarios.filter((h) => h.dia_semana === diaSemana && h.ativo)
    if (doDia.some((h) => h.id === horarioId)) return doDia
    const atual = horarios.find((h) => h.id === horarioId)
    return atual ? [atual, ...doDia] : doDia
  }, [horarios, diaSemana, horarioId])

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    if (professor.trim().length < 3) {
      setErro('Informe o nome do professor responsável.')
      return
    }
    if (!horarioId) {
      setErro('Escolha um horário — a data mudou e o horário anterior não é mais deste dia.')
      return
    }
    if (!temaVemDoCatalogo && tema.trim().length < 3) {
      setErro('Dê um tema para a aula.')
      return
    }

    const alunos = quantidadeAlunos.trim() ? Number(quantidadeAlunos) : null
    if (alunos !== null && (!Number.isInteger(alunos) || alunos < 1)) {
      setErro('A quantidade de alunos precisa ser um número inteiro maior que zero.')
      return
    }

    setSalvando(true)
    try {
      await adminAtualizarReserva(senha, reserva.id, {
        horarioId,
        dataAula: data,
        nomeProfessor: professor.trim(),
        turma: turma.trim() || null,
        emailContato: email.trim() || null,
        whatsappContato: whatsapp.trim() || null,
        quantidadeAlunos: alunos,
        aulaLivre: temaVemDoCatalogo ? null : tema.trim(),
        aulaObjetivos: temaVemDoCatalogo ? null : objetivos.trim() || null,
        aulaMateriais: temaVemDoCatalogo ? null : materiais.trim() || null,
      })
      aoSalvar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar as alterações.')
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Editar projeto integrador"
      subtitulo={`${reserva.escola_nome} · protocolo ${reserva.protocolo}`}
      aoFechar={aoFechar}
      largo
    >
      <form onSubmit={salvar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="ed-data">Data da aula</label>
            <input
              id="ed-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="ed-horario">Horário</label>
            <select
              id="ed-horario"
              value={horarioId}
              onChange={(e) => setHorarioId(e.target.value)}
              disabled={carregandoHorarios}
              required
            >
              {horariosVisiveis.length === 0 && <option value="">Nenhum horário neste dia</option>}
              {horariosVisiveis.map((h) => (
                <option key={h.id} value={h.id}>
                  {faixaHoraria(h.hora_inicio, h.hora_fim)}
                  {!h.ativo ? ' (desativado)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="ed-professor">Professor(a)</label>
            <input
              id="ed-professor"
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              maxLength={120}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="ed-turma">Turma</label>
            <input
              id="ed-turma"
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
              maxLength={60}
            />
          </div>
          <div className="campo">
            <label htmlFor="ed-alunos">Quantidade de alunos</label>
            <input
              id="ed-alunos"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={quantidadeAlunos}
              onChange={(e) => setQuantidadeAlunos(e.target.value)}
            />
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="ed-email">E-mail de contato</label>
            <input
              id="ed-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={160}
            />
          </div>
          <div className="campo">
            <label htmlFor="ed-whatsapp">WhatsApp</label>
            <input
              id="ed-whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              maxLength={30}
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="ed-tema">Tema da aula</label>
          <input
            id="ed-tema"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            maxLength={160}
            disabled={temaVemDoCatalogo}
            required={!temaVemDoCatalogo}
          />
          {temaVemDoCatalogo && (
            <p className="ajuda">
              Vem da atividade do catálogo — para mudar o tema, os objetivos ou os materiais, edite
              a atividade na aba <strong>Aulas</strong>.
            </p>
          )}
        </div>

        {!temaVemDoCatalogo && (
          <>
            <div className="campo">
              <label htmlFor="ed-objetivos">Objetivos de aprendizagem</label>
              <textarea
                id="ed-objetivos"
                value={objetivos}
                onChange={(e) => setObjetivos(e.target.value)}
                rows={3}
              />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="ed-materiais">Materiais e recursos</label>
              <textarea
                id="ed-materiais"
                value={materiais}
                onChange={(e) => setMateriais(e.target.value)}
                rows={2}
              />
            </div>
          </>
        )}

        <div className="acoes-formulario">
          <button type="button" className="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando || carregandoHorarios}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

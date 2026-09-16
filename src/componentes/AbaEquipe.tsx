import { useCallback, useEffect, useState } from 'react'
import {
  adminEquipeSemCobertura,
  adminListarEquipe,
  adminListarEscolas,
  adminListarNotificacoes,
  adminReenfileirarNotificacao,
  adminRemoverMembroEquipe,
  adminSalvarMembroEquipe,
} from '../lib/api'
import { dataCurta, dataHora, emailValido } from '../lib/formato'
import {
  GRUPOS_WIT,
  type EscolaAdmin,
  type GrupoWit,
  type MembroEquipe,
  type NotificacaoAdmin,
  type TipoNotificacao,
} from '../lib/tipos'
import { Aviso } from './Aviso'

type Props = {
  senha: string
  aoErro: (e: string | null) => void
}

/** Rascunho do formulário. Separado do tipo do banco porque aqui tudo é
 *  texto de input — inclusive o que lá é `null`. */
type Rascunho = {
  id: string | null
  nome: string
  email: string
  grupos: GrupoWit[]
  /** Escolas avulsas, para quem cobre uma escola em vez da rotação. */
  escolas: string[]
  ativo: boolean
}

const VAZIO: Rascunho = { id: null, nome: '', email: '', grupos: [], escolas: [], ativo: true }

/** Sem isto, "Enviado" em três linhas seguidas não diz se o que saiu foi
 *  o aviso da equipe ou o comprovante de quem agendou. */
const ROTULO_TIPO: Record<TipoNotificacao, string> = {
  reserva_nova: 'Aviso da equipe',
  reserva_recebida: 'Comprovante p/ quem agendou',
  reserva_confirmada: 'Confirmação p/ quem agendou',
}

const ROTULO_STATUS: Record<NotificacaoAdmin['status'], string> = {
  pendente: 'Na fila',
  enviando: 'Enviando',
  enviado: 'Enviado',
  falhou: 'Falhou',
  dispensado: 'Reserva cancelada',
}

/** As cores que o projeto já usa para situação, reaproveitadas: o que
 *  deu certo é verde, o que precisa de olho é âmbar, o que quebrou é
 *  vermelho. Nada de tarja lateral. */
const CLASSE_STATUS: Record<NotificacaoAdmin['status'], string> = {
  pendente: 'aguardando',
  enviando: 'aguardando',
  enviado: 'confirmado',
  falhou: 'cancelado',
  dispensado: 'cheio',
}

export function AbaEquipe({ senha, aoErro }: Props) {
  const [equipe, setEquipe] = useState<MembroEquipe[]>([])
  const [escolas, setEscolas] = useState<EscolaAdmin[]>([])
  const [semCobertura, setSemCobertura] = useState(0)
  const [avisos, setAvisos] = useState<NotificacaoAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [recado, setRecado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    aoErro(null)
    try {
      const [lista, fila, todasEscolas, semCob] = await Promise.all([
        adminListarEquipe(senha),
        adminListarNotificacoes(senha, 20),
        adminListarEscolas(senha),
        adminEquipeSemCobertura(senha),
      ])
      setEquipe(lista)
      setAvisos(fila)
      setEscolas(todasEscolas)
      setSemCobertura(Number(semCob) || 0)
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a equipe.')
    } finally {
      setCarregando(false)
    }
  }, [senha, aoErro])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function adicionarEscola(id: string) {
    if (!id) return
    setRascunho((r) => (r.escolas.includes(id) ? r : { ...r, escolas: [...r.escolas, id] }))
  }

  function tirarEscola(id: string) {
    setRascunho((r) => ({ ...r, escolas: r.escolas.filter((e) => e !== id) }))
  }

  function alternarGrupo(grupo: GrupoWit) {
    setRascunho((r) => ({
      ...r,
      grupos: r.grupos.includes(grupo) ? r.grupos.filter((g) => g !== grupo) : [...r.grupos, grupo],
    }))
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    aoErro(null)
    setRecado(null)

    if (rascunho.nome.trim().length < 3) {
      aoErro('Informe o nome do professor.')
      return
    }
    if (!emailValido(rascunho.email.trim())) {
      aoErro('Informe um e-mail válido — é para lá que o aviso vai.')
      return
    }

    setSalvando(true)
    try {
      await adminSalvarMembroEquipe(senha, {
        id: rascunho.id,
        nome: rascunho.nome.trim(),
        email: rascunho.email.trim(),
        grupos: rascunho.grupos,
        escolas: rascunho.escolas,
        ativo: rascunho.ativo,
      })
      setRascunho(VAZIO)
      setRecado(rascunho.id ? 'Cadastro atualizado.' : 'Professor cadastrado.')
      await carregar()
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(membro: MembroEquipe) {
    if (
      !window.confirm(
        `Tirar ${membro.nome} da lista de avisos?\n\n` +
          'Ele para de receber e-mail de reserva nova. Se for afastamento temporário, ' +
          'use "Editar" e desmarque "Recebendo avisos" em vez de remover.',
      )
    ) {
      return
    }

    aoErro(null)
    try {
      await adminRemoverMembroEquipe(senha, membro.id)
      if (rascunho.id === membro.id) setRascunho(VAZIO)
      await carregar()
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não foi possível remover.')
    }
  }

  async function reenviar(aviso: NotificacaoAdmin) {
    aoErro(null)
    try {
      await adminReenfileirarNotificacao(senha, aviso.id)
      setRecado('Aviso devolvido para a fila. Sai na próxima varredura, dentro de um minuto.')
      await carregar()
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não foi possível reenfileirar.')
    }
  }

  const semNinguem = equipe.filter((m) => m.ativo).length === 0

  return (
    <>
      <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
        Quando um professor da escola agenda pelo site, quem está nesta lista recebe o e-mail na
        hora — com a data, a turma, o tema e o contato dele. O aviso vai para os professores do
        grupo daquela escola; o grupo de cada escola fica na aba <strong>Escolas</strong>.
      </p>

      {semNinguem && !carregando && (
        <Aviso tipo="erro">
          Não há ninguém ativo nesta lista. Enquanto estiver assim, nenhum aviso de reserva nova é
          entregue — ele fica esperando na fila, sem se perder, e sai sozinho quando alguém for
          cadastrado aqui.
        </Aviso>
      )}

      {semCobertura > 0 && (
        <Aviso tipo="erro">
          {semCobertura} cadastro(s) sem grupo e sem escola. Como as 18 escolas estão alocadas na
          rotação, quem está assim <strong>nunca recebe nada</strong> — e sem dar erro em lugar
          nenhum. Abra em "Editar" e marque um grupo ou uma escola.
        </Aviso>
      )}

      {recado && <Aviso tipo="sucesso">{recado}</Aviso>}

      <form className="cartao" style={{ marginBottom: 20 }} onSubmit={salvar}>
        <h3 style={{ fontSize: 17, marginBottom: 14 }}>
          {rascunho.id ? 'Editar professor' : 'Adicionar professor da equipe'}
        </h3>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="eq-nome">Nome *</label>
            <input
              id="eq-nome"
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              placeholder="Ana Souza"
              maxLength={120}
            />
          </div>
          <div className="campo">
            <label htmlFor="eq-email">E-mail *</label>
            <input
              id="eq-email"
              type="email"
              value={rascunho.email}
              onChange={(e) => setRascunho({ ...rascunho, email: e.target.value })}
              placeholder="ana@exemplo.com.br"
              maxLength={160}
            />
            <p className="ajuda">É para cá que o aviso de reserva nova chega.</p>
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label>Grupos da rotação</label>
            <div className="chips">
              {GRUPOS_WIT.map((grupo) => (
                <label
                  key={grupo}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '8px 13px',
                    border: '1px solid var(--borda-solida)',
                    borderRadius: 'var(--raio-p)',
                    background: rascunho.grupos.includes(grupo)
                      ? 'var(--superficie-alta)'
                      : 'transparent',
                    cursor: 'pointer',
                    marginBottom: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rascunho.grupos.includes(grupo)}
                    onChange={() => alternarGrupo(grupo)}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  Grupo {grupo}
                </label>
              ))}
            </div>
            <p className="ajuda">
              Dá para marcar mais de um. Quem cobre a rotação inteira de um grupo marca só aqui.
            </p>
          </div>

          <div className="campo">
            <label htmlFor="eq-escola">
              Escolas avulsas <span className="opcional">(opcional)</span>
            </label>
            <select
              id="eq-escola"
              value=""
              onChange={(e) => {
                adicionarEscola(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Adicionar uma escola…</option>
              {escolas
                .filter((e) => !rascunho.escolas.includes(e.id))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                    {e.grupo ? ` · Grupo ${e.grupo}` : ''}
                  </option>
                ))}
            </select>
            <p className="ajuda">
              Para quem atende <strong>uma escola específica</strong> em vez da rotação inteira. A
              cobertura soma: quem tem grupo e escola recebe dos dois.
            </p>

            {rascunho.escolas.length > 0 && (
              <div className="chips" style={{ marginTop: 10 }}>
                {rascunho.escolas.map((id) => (
                  <span
                    key={id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      border: '1px solid var(--borda-solida)',
                      borderRadius: 'var(--raio-p)',
                      background: 'var(--superficie-alta)',
                      fontSize: 14,
                    }}
                  >
                    {escolas.find((e) => e.id === id)?.nome ?? 'Escola'}
                    <button
                      type="button"
                      className="secundario pequeno"
                      onClick={() => tirarEscola(id)}
                      aria-label="Tirar esta escola"
                      style={{ padding: '1px 7px', lineHeight: 1.4 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="campo">
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={rascunho.ativo}
              onChange={(e) => setRascunho({ ...rascunho, ativo: e.target.checked })}
              style={{ width: 'auto', margin: 0 }}
            />
            Recebendo avisos
          </label>
          <p className="ajuda">
            Desmarque para pausar sem apagar o cadastro — férias, afastamento, troca de função.
          </p>
        </div>

        <div className="acoes-linha">
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : rascunho.id ? 'Salvar alterações' : 'Adicionar'}
          </button>
          {rascunho.id && (
            <button type="button" className="secundario" onClick={() => setRascunho(VAZIO)}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {carregando ? (
        <p className="carregando">Carregando…</p>
      ) : equipe.length === 0 ? (
        <div className="vazio">
          <span className="emoji">📬</span>
          Ninguém cadastrado ainda.
        </div>
      ) : (
        <div className="linha-tempo">
          {equipe.map((membro) => (
            <div key={membro.id} className="cartao">
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3 style={{ fontSize: 17 }}>
                    {membro.nome}{' '}
                    {!membro.ativo && <span className="etiqueta cheio">Pausado</span>}
                  </h3>
                  <p style={{ color: 'var(--texto-suave)', fontSize: 14, marginTop: 4 }}>
                    {membro.email}
                  </p>
                  <p style={{ color: 'var(--texto-fraco)', fontSize: 14, marginTop: 4 }}>
                    {[
                      membro.grupos.length > 0 ? `Grupo ${membro.grupos.join(', ')}` : null,
                      membro.escolas_nomes?.length > 0
                        ? `Só ${membro.escolas_nomes.join(', ')}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sem cobertura — não recebe nada'}
                    {' · '}
                    {membro.avisos_30dias} aviso(s) em 30 dias
                  </p>
                </div>
                <div className="acoes-linha">
                  <button
                    type="button"
                    className="secundario pequeno"
                    onClick={() =>
                      setRascunho({
                        id: membro.id,
                        nome: membro.nome,
                        email: membro.email,
                        grupos: membro.grupos,
                        escolas: membro.escolas ?? [],
                        ativo: membro.ativo,
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="secundario pequeno"
                    onClick={() => void remover(membro)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* A prova de que o aviso está saindo. Sem isto, "não chegou
          e-mail" vira adivinhação entre reserva, fila e provedor. */}
      <h3 style={{ fontSize: 17, margin: '28px 0 6px' }}>Últimos avisos</h3>
      <p style={{ color: 'var(--texto-suave)', fontSize: 14, marginBottom: 14 }}>
        Cada reserva feita pelo site gera até três avisos: um para a equipe do grupo e dois para
        quem agendou (comprovante do pedido e, depois, a confirmação). "Na fila" some sozinho em
        até um minuto; "Falhou" é problema de configuração do envio e fica aqui até alguém
        resolver.
      </p>

      {avisos.length === 0 ? (
        <div className="vazio">
          <span className="emoji">📭</span>
          Nenhum aviso ainda. O primeiro aparece assim que uma escola agendar pelo site.
        </div>
      ) : (
        <div className="linha-tempo">
          {avisos.map((aviso) => (
            <div key={aviso.id} className="cartao">
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3 style={{ fontSize: 16 }}>
                    <span className={`etiqueta ${CLASSE_STATUS[aviso.status]}`}>
                      {ROTULO_STATUS[aviso.status]}
                    </span>{' '}
                    <span className="etiqueta materia">
                      {ROTULO_TIPO[aviso.tipo] ?? aviso.tipo}
                    </span>{' '}
                    {aviso.escola}
                  </h3>
                  <p style={{ color: 'var(--texto-suave)', fontSize: 14, marginTop: 4 }}>
                    {dataCurta(aviso.data_aula)} · {aviso.nome_professor} ·{' '}
                    {aviso.grupo ? `Grupo ${aviso.grupo}` : 'escola sem grupo'} · {aviso.protocolo}
                  </p>
                  <p style={{ color: 'var(--texto-fraco)', fontSize: 14, marginTop: 4 }}>
                    {aviso.status === 'enviado' && aviso.enviado_em
                      ? `Enviado em ${dataHora(aviso.enviado_em)} para ${aviso.destinatarios.join(', ')}`
                      : `Pedido em ${dataHora(aviso.criado_em)}`}
                  </p>
                  {aviso.ultimo_erro && (
                    <p style={{ color: 'var(--aviso)', fontSize: 14, marginTop: 4 }}>
                      {aviso.ultimo_erro}
                      {aviso.tentativas > 0 ? ` (tentativa ${aviso.tentativas})` : ''}
                    </p>
                  )}
                </div>
                {aviso.status === 'falhou' && (
                  <div className="acoes-linha">
                    <button
                      type="button"
                      className="secundario pequeno"
                      onClick={() => void reenviar(aviso)}
                    >
                      Tentar de novo
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

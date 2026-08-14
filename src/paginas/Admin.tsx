import { useCallback, useEffect, useState } from 'react'
import { AdminHorarios } from '../componentes/AdminHorarios'
import { Aviso } from '../componentes/Aviso'
import { EtiquetaReserva } from '../componentes/Etiqueta'
import {
  adminCriarEscola,
  adminListarEscolas,
  adminListarReservas,
  adminRenomearEscola,
  adminRenovarTokens,
} from '../lib/api'
import { dataHora, faixaHoraria, nomeDia } from '../lib/formato'
import type { EscolaAdmin, ReservaAdmin } from '../lib/tipos'

const CHAVE_TOKEN = 'integrador-wit:admin-token'

type Aba = 'escolas' | 'reservas'

export function Admin() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(CHAVE_TOKEN) ?? '')
  const [autenticado, setAutenticado] = useState(false)

  if (!autenticado) {
    return (
      <EntradaAdmin
        tokenInicial={adminToken}
        aoEntrar={(token) => {
          localStorage.setItem(CHAVE_TOKEN, token)
          setAdminToken(token)
          setAutenticado(true)
        }}
      />
    )
  }

  return (
    <PainelAdmin
      adminToken={adminToken}
      aoSair={() => {
        localStorage.removeItem(CHAVE_TOKEN)
        setAdminToken('')
        setAutenticado(false)
      }}
    />
  )
}

function EntradaAdmin({
  tokenInicial,
  aoEntrar,
}: {
  tokenInicial: string
  aoEntrar: (token: string) => void
}) {
  const [token, setToken] = useState(tokenInicial)
  const [erro, setErro] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)

  // Não existe sessão: o token é conferido chamando uma RPC de admin.
  // Se ela responder, o token vale.
  async function entrar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setVerificando(true)
    try {
      await adminListarEscolas(token.trim())
      aoEntrar(token.trim())
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível validar o token.')
      setVerificando(false)
    }
  }

  return (
    <div className="pagina" style={{ maxWidth: 460 }}>
      <header className="cabecalho">
        <div>
          <div className="selo">Núcleo WIT</div>
          <h1>Administração</h1>
          <p>Cadastro de escolas, horários e acompanhamento das reservas.</p>
        </div>
      </header>

      <div className="cartao">
        <form onSubmit={entrar}>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="campo">
            <label htmlFor="admin-token">Token de administração</label>
            <input
              id="admin-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              required
            />
            <p className="ajuda">
              Está na tabela <span className="mono">admin_tokens</span> do Supabase.
            </p>
          </div>
          <div className="acoes-formulario">
            <button type="submit" disabled={verificando || !token.trim()}>
              {verificando ? 'Verificando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PainelAdmin({ adminToken, aoSair }: { adminToken: string; aoSair: () => void }) {
  const [aba, setAba] = useState<Aba>('escolas')
  const [escolas, setEscolas] = useState<EscolaAdmin[]>([])
  const [reservas, setReservas] = useState<ReservaAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [nomeNovaEscola, setNomeNovaEscola] = useState('')
  const [criando, setCriando] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const [listaEscolas, listaReservas] = await Promise.all([
        adminListarEscolas(adminToken),
        adminListarReservas(adminToken, null),
      ])
      setEscolas(listaEscolas)
      setReservas(listaReservas)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar os dados.')
    } finally {
      setCarregando(false)
    }
  }, [adminToken])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function criarEscola(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setCriando(true)
    try {
      const escola = await adminCriarEscola(adminToken, nomeNovaEscola.trim())
      setNomeNovaEscola('')
      await carregar()
      setExpandida(escola.id)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar a escola.')
    } finally {
      setCriando(false)
    }
  }

  async function renomear(escola: EscolaAdmin) {
    const nome = window.prompt('Novo nome da escola:', escola.nome)
    if (!nome || nome.trim() === escola.nome) return
    setErro(null)
    try {
      await adminRenomearEscola(adminToken, escola.id, nome.trim())
      await carregar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível renomear a escola.')
    }
  }

  async function renovar(escola: EscolaAdmin) {
    const confirmado = window.confirm(
      `Gerar novos links para ${escola.nome}?\n\nOs links atuais param de funcionar imediatamente e precisam ser reenviados à escola.`,
    )
    if (!confirmado) return
    setErro(null)
    try {
      await adminRenovarTokens(adminToken, escola.id)
      await carregar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível renovar os links.')
    }
  }

  return (
    <div className="pagina">
      <header className="cabecalho">
        <div>
          <div className="selo">Núcleo WIT</div>
          <h1>Administração</h1>
          <p>Cadastro de escolas, horários e acompanhamento das reservas.</p>
        </div>
        <button type="button" className="secundario" onClick={aoSair}>
          Sair
        </button>
      </header>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'escolas'} onClick={() => setAba('escolas')}>
          Escolas ({escolas.length})
        </button>
        <button role="tab" aria-selected={aba === 'reservas'} onClick={() => setAba('reservas')}>
          Reservas ({reservas.length})
        </button>
      </div>

      {carregando ? (
        <p className="carregando">Carregando…</p>
      ) : aba === 'escolas' ? (
        <>
          <form onSubmit={criarEscola} className="cartao" style={{ marginBottom: 20 }}>
            <div className="campo" style={{ marginBottom: 12 }}>
              <label htmlFor="nova-escola">Nova escola</label>
              <input
                id="nova-escola"
                value={nomeNovaEscola}
                onChange={(e) => setNomeNovaEscola(e.target.value)}
                placeholder="Ex.: EMEF Paulo Freire"
                maxLength={120}
              />
              <p className="ajuda">Os dois links são gerados automaticamente no cadastro.</p>
            </div>
            <div className="acoes-formulario" style={{ marginTop: 0 }}>
              <button type="submit" disabled={criando || nomeNovaEscola.trim().length < 2}>
                {criando ? 'Cadastrando…' : 'Cadastrar escola'}
              </button>
            </div>
          </form>

          {escolas.length === 0 ? (
            <div className="vazio">Nenhuma escola cadastrada ainda.</div>
          ) : (
            <div className="lista">
              {escolas.map((escola) => (
                <CartaoEscola
                  key={escola.id}
                  escola={escola}
                  adminToken={adminToken}
                  expandida={expandida === escola.id}
                  aoAlternar={() => setExpandida(expandida === escola.id ? null : escola.id)}
                  aoRenomear={() => void renomear(escola)}
                  aoRenovar={() => void renovar(escola)}
                />
              ))}
            </div>
          )}
        </>
      ) : reservas.length === 0 ? (
        <div className="vazio">Nenhuma reserva registrada ainda.</div>
      ) : (
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Protocolo</th>
                <th>Escola</th>
                <th>Horário</th>
                <th>Professor(a)</th>
                <th>Reservado em</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((reserva) => (
                <tr key={reserva.id}>
                  <td className="mono">{reserva.protocolo}</td>
                  <td>{reserva.escola_nome}</td>
                  <td>
                    {nomeDia(reserva.dia_semana)}
                    <br />
                    <span style={{ color: 'var(--texto-suave)' }}>
                      {faixaHoraria(reserva.hora_inicio, reserva.hora_fim)}
                    </span>
                  </td>
                  <td>
                    {reserva.nome_professor}
                    {reserva.email_contato && (
                      <>
                        <br />
                        <span style={{ color: 'var(--texto-suave)' }}>{reserva.email_contato}</span>
                      </>
                    )}
                  </td>
                  <td>{dataHora(reserva.criado_em)}</td>
                  <td>
                    <EtiquetaReserva status={reserva.status} />
                    {reserva.status === 'cancelado' && (
                      <div style={{ color: 'var(--texto-suave)', fontSize: 13, marginTop: 4 }}>
                        {dataHora(reserva.cancelado_em)}
                        {reserva.cancelado_por ? ` por ${reserva.cancelado_por}` : ''}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CartaoEscola({
  escola,
  adminToken,
  expandida,
  aoAlternar,
  aoRenomear,
  aoRenovar,
}: {
  escola: EscolaAdmin
  adminToken: string
  expandida: boolean
  aoAlternar: () => void
  aoRenomear: () => void
  aoRenovar: () => void
}) {
  return (
    <div className="cartao">
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
          <h3 style={{ fontSize: 16 }}>{escola.nome}</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--texto-suave)', fontSize: 14 }}>
            {escola.total_horarios} horário(s) · {escola.horarios_livres} disponível(eis) ·{' '}
            {escola.reservas_ativas} reservado(s)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="discreto" onClick={aoRenomear}>
            Renomear
          </button>
          <button type="button" className="discreto" onClick={aoRenovar}>
            Novos links
          </button>
          <button type="button" className="secundario" onClick={aoAlternar}>
            {expandida ? 'Fechar' : 'Horários'}
          </button>
        </div>
      </div>

      <LinkEscola rotulo="Professores" token={escola.token_professor} />
      <LinkEscola rotulo="Coordenação" token={escola.token_coordenacao} />

      {expandida && <AdminHorarios adminToken={adminToken} escolaId={escola.id} />}
    </div>
  )
}

function LinkEscola({ rotulo, token }: { rotulo: string; token: string }) {
  const [copiado, setCopiado] = useState(false)
  const url = `${window.location.origin}/e/${token}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      window.prompt('Copie o link:', url)
    }
  }

  return (
    <div className="link-token">
      <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{rotulo}</strong>
      <span className="url" title={url}>
        {url}
      </span>
      <button type="button" className="discreto" onClick={() => void copiar()}>
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { AdminHorarios } from '../componentes/AdminHorarios'
import { Aviso } from '../componentes/Aviso'
import { EditorAula } from '../componentes/EditorAula'
import { EtiquetaReserva } from '../componentes/Etiqueta'
import { LogoWit } from '../componentes/LogoWit'
import {
  adminCancelarReserva,
  adminCriarEscola,
  adminListarAulas,
  adminListarEscolas,
  adminListarReservas,
  adminRegistrarRelato,
  adminRemoverAula,
  adminRemoverHabilidade,
  adminRenomearEscola,
  adminSalvarHabilidade,
  carregarContexto,
  listarHabilidades,
} from '../lib/api'
import { ANOS_ESCOLARES, dataCurta, faixaHoraria, rotuloAnos } from '../lib/formato'
import type { AulaAdmin, EscolaAdmin, Habilidade, Materia, ReservaAdmin } from '../lib/tipos'

const CHAVE = 'wit:senha-admin'
type Aba = 'aulas' | 'escolas' | 'reservas' | 'bncc'

export function Admin() {
  const [senha, setSenha] = useState(() => localStorage.getItem(CHAVE) ?? '')
  const [entrou, setEntrou] = useState(false)

  if (!entrou) {
    return (
      <Entrada
        inicial={senha}
        aoEntrar={(s) => {
          localStorage.setItem(CHAVE, s)
          setSenha(s)
          setEntrou(true)
        }}
      />
    )
  }

  return (
    <Painel
      senha={senha}
      aoSair={() => {
        localStorage.removeItem(CHAVE)
        setSenha('')
        setEntrou(false)
      }}
    />
  )
}

function Entrada({ inicial, aoEntrar }: { inicial: string; aoEntrar: (s: string) => void }) {
  const [valor, setValor] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)

  // Não existe sessão: a senha é conferida chamando uma RPC de admin.
  async function entrar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setVerificando(true)
    try {
      await adminListarEscolas(valor.trim())
      aoEntrar(valor.trim())
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível validar a senha.')
      setVerificando(false)
    }
  }

  return (
    <main className="conteudo estreito" style={{ maxWidth: 460 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <LogoWit altura={64} />
        <h1 style={{ fontSize: 26, marginTop: 18 }}>Painel da equipe</h1>
        <p style={{ color: 'var(--texto-suave)', marginTop: 6 }}>
          Aulas do catálogo, escolas, horários e reservas.
        </p>
      </div>

      <form onSubmit={entrar} className="cartao">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="senha">Senha do painel</label>
          <input
            id="senha"
            type="password"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="acoes-formulario">
          <button type="submit" disabled={verificando || !valor.trim()}>
            {verificando ? 'Verificando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </main>
  )
}

function Painel({ senha, aoSair }: { senha: string; aoSair: () => void }) {
  const [aba, setAba] = useState<Aba>('aulas')
  const [materias, setMaterias] = useState<Materia[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    carregarContexto()
      .then((c) => setMaterias(c.materias))
      .catch(() => setMaterias([]))
  }, [])

  return (
    <main className="conteudo">
      <div className="secao-titulo">
        <div>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 32px)' }}>Painel da equipe WIT</h1>
          <p style={{ color: 'var(--texto-suave)' }}>
            O que você cadastra aqui é o que os professores veem no site.
          </p>
        </div>
        <button type="button" className="secundario" onClick={aoSair}>
          Sair
        </button>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'aulas'} onClick={() => setAba('aulas')}>
          Aulas
        </button>
        <button role="tab" aria-selected={aba === 'escolas'} onClick={() => setAba('escolas')}>
          Escolas e horários
        </button>
        <button role="tab" aria-selected={aba === 'reservas'} onClick={() => setAba('reservas')}>
          Reservas
        </button>
        <button role="tab" aria-selected={aba === 'bncc'} onClick={() => setAba('bncc')}>
          BNCC
        </button>
      </div>

      {aba === 'aulas' && <AbaAulas senha={senha} materias={materias} aoErro={setErro} />}
      {aba === 'escolas' && <AbaEscolas senha={senha} aoErro={setErro} />}
      {aba === 'reservas' && <AbaReservas senha={senha} aoErro={setErro} />}
      {aba === 'bncc' && <AbaBncc senha={senha} materias={materias} aoErro={setErro} />}
    </main>
  )
}

// --------------------------------------------------------------- aulas

function AbaAulas({
  senha,
  materias,
  aoErro,
}: {
  senha: string
  materias: Materia[]
  aoErro: (e: string | null) => void
}) {
  const [aulas, setAulas] = useState<AulaAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<AulaAdmin | null>(null)
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async () => {
    aoErro(null)
    try {
      setAulas(await adminListarAulas(senha))
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível carregar as aulas.')
    } finally {
      setCarregando(false)
    }
  }, [senha, aoErro])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function remover(aula: AulaAdmin) {
    if (!window.confirm(`Remover "${aula.titulo}" do catálogo?`)) return
    aoErro(null)
    try {
      const r = await adminRemoverAula(senha, aula.id)
      if (r.despublicada) {
        window.alert(
          'Esta aula já foi dada por alguma turma, então ela não pode ser apagada — o histórico perderia o título.\n\nEla foi despublicada: some do catálogo, mas continua no registro das aulas realizadas.',
        )
      }
      await carregar()
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível remover a aula.')
    }
  }

  return (
    <>
      <div className="secao-titulo" style={{ marginTop: 0 }}>
        <p style={{ color: 'var(--texto-suave)' }}>
          {carregando ? 'Carregando…' : `${aulas.length} aula(s) no catálogo`}
        </p>
        <button type="button" onClick={() => setCriando(true)}>
          + Nova aula
        </button>
      </div>

      {carregando ? (
        <p className="carregando">Carregando…</p>
      ) : aulas.length === 0 ? (
        <div className="vazio">
          <span className="emoji">📚</span>
          Nenhuma aula cadastrada. Clique em <strong>Nova aula</strong> — dá para começar só com
          título e resumo e completar depois.
        </div>
      ) : (
        <div className="grade">
          {aulas.map((aula) => (
            <div key={aula.id} className="cartao">
              <div className="topo-cartao" style={{ marginBottom: 10 }}>
                {aula.materia_nome && <span className="etiqueta materia">{aula.materia_nome}</span>}
                {!aula.publicada && <span className="etiqueta parcial">Rascunho</span>}
              </div>

              <h3 style={{ fontSize: 17 }}>{aula.titulo}</h3>
              <p style={{ color: 'var(--texto-suave)', fontSize: 14.5, marginTop: 6 }}>
                {aula.resumo}
              </p>

              <div className="rodape-cartao" style={{ marginTop: 12 }}>
                <span>{rotuloAnos(aula.anos)}</span>
                <span>{aula.duracao_min} min</span>
                {aula.habilidades.length > 0 && (
                  <span>
                    {aula.habilidades.length} habilidade{aula.habilidades.length > 1 ? 's' : ''}
                  </span>
                )}
                {aula.vezes_dada > 0 && <span>dada {aula.vezes_dada}x</span>}
              </div>

              <div className="acoes-linha" style={{ marginTop: 14 }}>
                <button type="button" className="secundario pequeno" onClick={() => setEditando(aula)}>
                  Editar
                </button>
                <button type="button" className="perigo pequeno" onClick={() => void remover(aula)}>
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(criando || editando) && (
        <EditorAula
          senha={senha}
          materias={materias}
          aula={editando}
          aoFechar={() => {
            setCriando(false)
            setEditando(null)
          }}
          aoSalvar={async () => {
            setCriando(false)
            setEditando(null)
            await carregar()
          }}
        />
      )}
    </>
  )
}

// ------------------------------------------------------------- escolas

function AbaEscolas({ senha, aoErro }: { senha: string; aoErro: (e: string | null) => void }) {
  const [escolas, setEscolas] = useState<EscolaAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    aoErro(null)
    try {
      setEscolas(await adminListarEscolas(senha))
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível carregar as escolas.')
    } finally {
      setCarregando(false)
    }
  }, [senha, aoErro])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function criar(evento: React.FormEvent) {
    evento.preventDefault()
    setCriando(true)
    aoErro(null)
    try {
      const nova = await adminCriarEscola(senha, nome.trim())
      setNome('')
      await carregar()
      setAberta(nova.id)
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível criar a escola.')
    } finally {
      setCriando(false)
    }
  }

  async function renomear(escola: EscolaAdmin) {
    const novo = window.prompt('Novo nome da escola:', escola.nome)
    if (!novo || novo.trim() === escola.nome) return
    try {
      await adminRenomearEscola(senha, escola.id, novo.trim())
      await carregar()
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível renomear.')
    }
  }

  return (
    <>
      <form onSubmit={criar} className="cartao" style={{ marginBottom: 20 }}>
        <div className="campo" style={{ marginBottom: 12 }}>
          <label htmlFor="nova-escola">Nova escola</label>
          <input
            id="nova-escola"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: EMEF Paulo Freire"
            maxLength={120}
          />
          <p className="ajuda">
            A escola só aparece no site depois que tiver pelo menos um horário na grade.
          </p>
        </div>
        <div className="acoes-formulario" style={{ marginTop: 0 }}>
          <button type="submit" disabled={criando || nome.trim().length < 2}>
            {criando ? 'Cadastrando…' : 'Cadastrar escola'}
          </button>
        </div>
      </form>

      {carregando ? (
        <p className="carregando">Carregando…</p>
      ) : escolas.length === 0 ? (
        <div className="vazio">
          <span className="emoji">🏫</span>
          Nenhuma escola cadastrada ainda.
        </div>
      ) : (
        <div className="linha-tempo">
          {escolas.map((escola) => (
            <div key={escola.id} className="cartao">
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
                  <h3 style={{ fontSize: 17 }}>{escola.nome}</h3>
                  <p style={{ color: 'var(--texto-suave)', fontSize: 14, marginTop: 4 }}>
                    {escola.horarios_ativos} de {escola.total_horarios} horário(s) na grade ·{' '}
                    {escola.reservas_futuras} reserva(s) futura(s)
                  </p>
                </div>
                <div className="acoes-linha">
                  <button type="button" className="fantasma pequeno" onClick={() => void renomear(escola)}>
                    Renomear
                  </button>
                  <button
                    type="button"
                    className="secundario pequeno"
                    onClick={() => setAberta(aberta === escola.id ? null : escola.id)}
                  >
                    {aberta === escola.id ? 'Fechar' : 'Horários'}
                  </button>
                </div>
              </div>

              {aberta === escola.id && <AdminHorarios adminToken={senha} escolaId={escola.id} />}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------ reservas

function AbaReservas({ senha, aoErro }: { senha: string; aoErro: (e: string | null) => void }) {
  const [reservas, setReservas] = useState<ReservaAdmin[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    aoErro(null)
    try {
      setReservas(await adminListarReservas(senha, null))
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível carregar as reservas.')
    } finally {
      setCarregando(false)
    }
  }, [senha, aoErro])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function cancelar(reserva: ReservaAdmin) {
    const motivo = window.prompt(`Cancelar a reserva ${reserva.protocolo}?\n\nMotivo (opcional):`, '')
    if (motivo === null) return
    try {
      await adminCancelarReserva(senha, reserva.id, motivo.trim() || null)
      await carregar()
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível cancelar.')
    }
  }

  async function relatar(reserva: ReservaAdmin) {
    const relato = window.prompt(
      'Conte em poucas linhas como foi a aula. Isso aparece na vitrine pública de aulas realizadas.',
      reserva.relato ?? '',
    )
    if (relato === null) return

    const fotos = window.prompt(
      'Endereços das fotos da aula, um por linha.\n\nCole o link direto da imagem (Drive, Storage do Supabase, etc.). Elas aparecem na vitrine e na página da atividade.',
      reserva.fotos.join('\n'),
    )
    if (fotos === null) return

    try {
      await adminRegistrarRelato(
        senha,
        reserva.id,
        relato,
        fotos.split('\n').map((f) => f.trim()).filter(Boolean),
      )
      await carregar()
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível salvar o relato.')
    }
  }

  if (carregando) return <p className="carregando">Carregando…</p>

  if (reservas.length === 0) {
    return (
      <div className="vazio">
        <span className="emoji">🗓️</span>
        Nenhuma reserva ainda.
      </div>
    )
  }

  return (
    <div className="rolagem">
      <table>
        <thead>
          <tr>
            <th>Protocolo</th>
            <th>Data</th>
            <th>Escola</th>
            <th>Professor(a)</th>
            <th>Aula</th>
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {reservas.map((r) => (
            <tr key={r.id} className={r.ja_aconteceu ? 'passado' : undefined}>
              <td className="mono">{r.protocolo}</td>
              <td>
                {dataCurta(r.data_aula)}
                <br />
                <span style={{ color: 'var(--texto-suave)' }}>
                  {faixaHoraria(r.hora_inicio, r.hora_fim)}
                </span>
              </td>
              <td>{r.escola_nome}</td>
              <td>
                {r.nome_professor}
                {r.turma && (
                  <>
                    <br />
                    <span style={{ color: 'var(--texto-suave)' }}>{r.turma}</span>
                  </>
                )}
                {r.email_contato && (
                  <>
                    <br />
                    <span style={{ color: 'var(--texto-fraco)', fontSize: 13 }}>
                      {r.email_contato}
                    </span>
                  </>
                )}
              </td>
              <td>{r.aula_titulo}</td>
              <td>
                <EtiquetaReserva status={r.status} />
                {r.status === 'confirmado' && r.ja_aconteceu && (
                  <div style={{ color: 'var(--texto-suave)', fontSize: 13, marginTop: 4 }}>
                    Já realizada
                  </div>
                )}
              </td>
              <td>
                <div className="acoes-linha">
                  {r.status === 'confirmado' && r.ja_aconteceu && (
                    <button type="button" className="fantasma pequeno" onClick={() => void relatar(r)}>
                      {r.relato || r.fotos.length > 0 ? 'Relato e fotos' : '+ Relato e fotos'}
                    </button>
                  )}
                  {r.status === 'confirmado' && !r.ja_aconteceu && (
                    <button type="button" className="fantasma pequeno" onClick={() => void cancelar(r)}>
                      Cancelar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- bncc

function AbaBncc({
  senha,
  materias,
  aoErro,
}: {
  senha: string
  materias: Materia[]
  aoErro: (e: string | null) => void
}) {
  const [habilidades, setHabilidades] = useState<Habilidade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [materiaId, setMateriaId] = useState('')
  const [ano, setAno] = useState<string>('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setHabilidades(await listarHabilidades())
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível carregar as habilidades.')
    } finally {
      setCarregando(false)
    }
  }, [aoErro])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setSalvando(true)
    aoErro(null)
    try {
      await adminSalvarHabilidade(senha, {
        id: null,
        codigo: codigo.trim(),
        descricao: descricao.trim(),
        materiaId: materiaId || null,
        ano: ano ? Number(ano) : null,
      })
      setCodigo('')
      setDescricao('')
      await carregar()
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível salvar a habilidade.')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(h: Habilidade) {
    if (!window.confirm(`Remover ${h.codigo}?`)) return
    try {
      await adminRemoverHabilidade(senha, h.id)
      await carregar()
    } catch (f) {
      aoErro(f instanceof Error ? f.message : 'Não foi possível remover.')
    }
  }

  return (
    <>
      <form onSubmit={salvar} className="cartao" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Cadastrar habilidade</h2>
        <p className="ajuda" style={{ marginBottom: 16 }}>
          Cadastre uma vez e reaproveite em quantas aulas quiser. O código é o oficial da BNCC.
        </p>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="codigo">Código *</label>
            <input
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="EF06CI01"
              className="mono"
              maxLength={20}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="hab-materia">Matéria</label>
            <select id="hab-materia" value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
              <option value="">Sem matéria</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="hab-ano">Ano</label>
            <select id="hab-ano" value={ano} onChange={(e) => setAno(e.target.value)}>
              <option value="">Qualquer</option>
              {ANOS_ESCOLARES.map((n) => (
                <option key={n} value={n}>
                  {n}º ano
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="hab-descricao">Descrição *</label>
          <textarea
            id="hab-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Cole aqui o texto da habilidade, como está na BNCC."
            required
          />
        </div>

        <div className="acoes-formulario" style={{ marginTop: 0 }}>
          <button type="submit" disabled={salvando || codigo.trim().length < 3}>
            {salvando ? 'Salvando…' : 'Adicionar habilidade'}
          </button>
        </div>
      </form>

      {carregando ? (
        <p className="carregando">Carregando…</p>
      ) : habilidades.length === 0 ? (
        <div className="vazio">
          <span className="emoji">🎯</span>
          Nenhuma habilidade cadastrada. As aulas funcionam sem isso, mas com elas o professor
          consegue filtrar o catálogo por habilidade.
        </div>
      ) : (
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Matéria</th>
                <th>Ano</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {habilidades.map((h) => (
                <tr key={h.id}>
                  <td>
                    <span className="etiqueta codigo">{h.codigo}</span>
                  </td>
                  <td>{h.descricao}</td>
                  <td>{materias.find((m) => m.id === h.materia_id)?.nome ?? '—'}</td>
                  <td>{h.ano ? `${h.ano}º` : '—'}</td>
                  <td>
                    <button type="button" className="fantasma pequeno" onClick={() => void remover(h)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

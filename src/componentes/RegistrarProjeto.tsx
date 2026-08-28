import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from './Aviso'
import { adminImportarAulaRealizada, adminListarEscolas } from '../lib/api'
import { dataExtensa, faixaHoraria } from '../lib/formato'
import type { AulaImportada, EscolaAdmin, OrigemReserva } from '../lib/tipos'

/** Os cinco cursos do Núcleo. O campo aceita outro, se for o caso. */
const CURSOS = [
  'Inteligência Artificial',
  'Games',
  'Metaverso',
  'Ambientes Inteligentes (IoT)',
  'Comunicação Digital',
]

/**
 * O jeito rápido de registrar um projeto integrador que já aconteceu, sem
 * passar pelo agendamento do site — é o caso comum de quando a Equipe WIT
 * fecha a aula direto com o professor. Sem PDF, sem Canva: só os campos
 * que importam, e a aula já entra na vitrine.
 *
 * Usa a mesma RPC do importador do Canva e do gerador de documento
 * (`admin_importar_aula_realizada`): ela já sabia criar a reserva sozinha
 * quando não existe agendamento prévio.
 */
export function RegistrarProjeto({
  senha,
  aoErro,
}: {
  senha: string
  aoErro: (e: string | null) => void
}) {
  const [escolas, setEscolas] = useState<EscolaAdmin[]>([])
  const [escolaId, setEscolaId] = useState('')
  const [data, setData] = useState('')
  const [turma, setTurma] = useState('')
  const [curso, setCurso] = useState('')
  const [professor, setProfessor] = useState('')
  const [tema, setTema] = useState('')
  const [origem, setOrigem] = useState<OrigemReserva>('equipe_wit')
  const [descricao, setDescricao] = useState('')
  const [objetivos, setObjetivos] = useState('')
  const [materiais, setMateriais] = useState('')
  const [fotosTexto, setFotosTexto] = useState('')
  const [virarAtividade, setVirarAtividade] = useState(true)
  const [registrando, setRegistrando] = useState(false)
  const [registrado, setRegistrado] = useState<AulaImportada | null>(null)

  useEffect(() => {
    adminListarEscolas(senha)
      .then(setEscolas)
      .catch(() => setEscolas([]))
  }, [senha])

  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const fotos = useMemo(
    () =>
      fotosTexto
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean),
    [fotosTexto],
  )

  /** O relato da vitrine, no mesmo formato que o gerador de documento monta. */
  const relato = useMemo(() => {
    const partes: string[] = []
    if (curso.trim()) partes.push(`Curso: ${curso.trim()}`)
    if (descricao.trim()) partes.push(descricao.trim())
    if (objetivos.trim()) partes.push(`Objetivos de aprendizagem\n${objetivos.trim()}`)
    if (materiais.trim()) partes.push(`Materiais e recursos\n${materiais.trim()}`)
    return partes.join('\n\n')
  }, [curso, descricao, objetivos, materiais])

  const podeRegistrar =
    !!escolaId &&
    /^\d{4}-\d{2}-\d{2}$/.test(data) &&
    professor.trim().length >= 3 &&
    tema.trim().length >= 3 &&
    !registrando

  async function registrar() {
    aoErro(null)
    setRegistrando(true)
    try {
      const aula = await adminImportarAulaRealizada(senha, {
        importacaoId: null,
        escolaId,
        dataAula: data,
        nomeProfessor: professor.trim(),
        turma: turma.trim() || null,
        titulo: tema.trim(),
        relato: relato || null,
        fotos,
        descricao: descricao.trim() || null,
        objetivos: objetivos.trim() || null,
        materiais: materiais.trim() || null,
        virarAtividade,
        origem,
      })
      setRegistrado(aula)
    } catch (falha) {
      aoErro(falha instanceof Error ? falha.message : 'Não foi possível registrar o projeto.')
    } finally {
      setRegistrando(false)
    }
  }

  if (registrado) {
    return (
      <Registrado
        aula={registrado}
        aoRecomecar={() => {
          setRegistrado(null)
          setEscolaId('')
          setData('')
          setTurma('')
          setCurso('')
          setProfessor('')
          setTema('')
          setOrigem('equipe_wit')
          setDescricao('')
          setObjetivos('')
          setMateriais('')
          setFotosTexto('')
        }}
      />
    )
  }

  return (
    <>
      <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
        Para quando o projeto integrador aconteceu sem passar pelo agendamento do site — a Equipe
        WIT fechou direto com o professor. Preencha o essencial e a aula já entra na vitrine de
        realizadas, sem precisar montar documento nenhum.
      </p>

      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="reg-escola">Escola *</label>
            <select id="reg-escola" value={escolaId} onChange={(e) => setEscolaId(e.target.value)}>
              <option value="">Escolha a escola</option>
              {[...escolas]
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="reg-data">Data da aula *</label>
            <input
              id="reg-data"
              type="date"
              value={data}
              max={hoje}
              onChange={(e) => setData(e.target.value)}
            />
            <p className="ajuda">A vitrine é de aula que já aconteceu.</p>
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="reg-professor">Professor(a) *</label>
            <input
              id="reg-professor"
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="campo">
            <label htmlFor="reg-turma">Turma</label>
            <input
              id="reg-turma"
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
              placeholder="8C"
              maxLength={60}
            />
          </div>
          <div className="campo">
            <label htmlFor="reg-curso">Curso</label>
            <input
              id="reg-curso"
              list="cursos-do-wit-registro"
              value={curso}
              onChange={(e) => setCurso(e.target.value)}
              maxLength={60}
            />
            <datalist id="cursos-do-wit-registro">
              {CURSOS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="reg-tema">Tema da aula *</label>
          <input
            id="reg-tema"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Ex.: Criação de sites sobre vegetais com IA"
            maxLength={160}
          />
          <p className="ajuda">É o título que aparece na vitrine de aulas realizadas.</p>
        </div>

        <div className="campo" style={{ marginBottom: 0 }}>
          <label>Quem conseguiu este projeto integrador? *</label>
          <div className="caixas">
            <label className="caixa">
              <input
                type="radio"
                name="reg-origem"
                checked={origem === 'equipe_wit'}
                onChange={() => setOrigem('equipe_wit')}
              />
              Equipe WIT — fechou direto com o professor
            </label>
            <label className="caixa">
              <input
                type="radio"
                name="reg-origem"
                checked={origem === 'escola'}
                onChange={() => setOrigem('escola')}
              />
              Escola — já tinha reservado pelo site
            </label>
          </div>
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="campo">
          <label htmlFor="reg-descricao">Como foi a aula</label>
          <textarea
            id="reg-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={5}
            placeholder="Duas ou três linhas contando o que a turma fez."
          />
        </div>

        <div className="campo">
          <label htmlFor="reg-objetivos">Objetivos de aprendizagem</label>
          <textarea
            id="reg-objetivos"
            value={objetivos}
            onChange={(e) => setObjetivos(e.target.value)}
            rows={3}
            placeholder="Um objetivo por linha (opcional)."
          />
        </div>

        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="reg-materiais">Materiais e recursos</label>
          <textarea
            id="reg-materiais"
            value={materiais}
            onChange={(e) => setMateriais(e.target.value)}
            rows={2}
            placeholder="Um material por linha (opcional)."
          />
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Fotos da aula</h3>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="reg-fotos">Endereços das fotos, um por linha</label>
          <textarea
            id="reg-fotos"
            value={fotosTexto}
            onChange={(e) => setFotosTexto(e.target.value)}
            rows={3}
            placeholder="Cole o link direto da imagem (Drive, Storage do Supabase, etc.)"
          />
          <p className="ajuda">Elas aparecem na vitrine e na página da atividade.</p>
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 20 }}>
        <label className="caixa">
          <input
            type="checkbox"
            checked={virarAtividade}
            onChange={(e) => setVirarAtividade(e.target.checked)}
          />
          Abrir esta aula no catálogo de atividades
        </label>
        <p className="ajuda" style={{ marginTop: 6 }}>
          Além de registrar o que esta turma fez, vira uma atividade que outro professor pode
          escolher na hora de agendar.
        </p>
      </div>

      <div className="acoes-formulario" style={{ marginTop: 0 }}>
        <button type="button" onClick={() => void registrar()} disabled={!podeRegistrar}>
          {registrando ? 'Registrando…' : 'Registrar projeto realizado'}
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- pronto

function Registrado({
  aula,
  aoRecomecar,
}: {
  aula: AulaImportada
  aoRecomecar: () => void
}) {
  return (
    <div className="cartao">
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Projeto registrado</h2>
      <p style={{ color: 'var(--texto-suave)', marginBottom: 18 }}>
        <strong>{aula.titulo}</strong> — {aula.escola_nome}, {dataExtensa(aula.data_aula)}, das{' '}
        {faixaHoraria(aula.hora_inicio, aula.hora_fim)}.
      </p>

      <Aviso tipo="sucesso">
        {aula.anexada
          ? `Entrou na reserva ${aula.protocolo}, que já existia para esta turma nesta data.`
          : `Registrado como ${aula.protocolo}, com ${aula.fotos.length} foto(s).`}
      </Aviso>

      {aula.aula_id && (
        <Aviso tipo="info">
          {aula.aula_nova
            ? 'Também abriu uma atividade no catálogo: outro professor já pode escolher esta aula ao agendar.'
            : 'Entrou na atividade que já existia com este tema, no catálogo.'}{' '}
          <Link to={`/atividades/${aula.aula_id}`}>ver a atividade →</Link>
        </Aviso>
      )}

      <div className="acoes-linha" style={{ marginTop: 14 }}>
        <Link className="botao secundario" to="/realizadas">
          Ver na vitrine
        </Link>
      </div>

      <div className="acoes-formulario" style={{ marginTop: 6 }}>
        <button type="button" onClick={aoRecomecar}>
          Registrar outro projeto
        </button>
      </div>
    </div>
  )
}

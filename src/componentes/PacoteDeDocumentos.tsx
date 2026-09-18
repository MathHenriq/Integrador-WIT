import { useMemo, useState } from 'react'
import { Aviso } from './Aviso'
import { Modal } from './Modal'
import { baixar, valeDocumento } from '../lib/documento/refazer'
import { montarPacote, type Andamento } from '../lib/documento/pacote'
import { dataCurta } from '../lib/formato'
import type { EscolaAdmin, ReservaAdmin } from '../lib/tipos'

type Props = {
  reservas: ReservaAdmin[]
  escolas: EscolaAdmin[]
  /** O que já estava filtrado na tela, para não perguntar duas vezes. */
  de: string
  ate: string
  escolaId: string | null
  aoFechar: () => void
}

type Resultado = { arquivos: number; falhas: string[]; fotosPerdidas: number }

/** O primeiro dia do mês corrente, sem passar por `new Date(iso)`. */
function inicioDoMes(hoje: string) {
  return `${hoje.slice(0, 8)}01`
}

/**
 * Baixa de uma vez os documentos de um período inteiro.
 *
 * É o pedido do coordenador: ele manda ao gestor da prefeitura tudo o que
 * o Núcleo fez no mês, e baixar projeto por projeto não escala. Sai um
 * ZIP com um PDF por projeto, nomeados no mesmo padrão do documento
 * avulso — "Projeto Integrador - Escola - Data" —, então a pasta já
 * chega em ordem de data do outro lado.
 */
export function PacoteDeDocumentos({ reservas, escolas, de, ate, escolaId, aoFechar }: Props) {
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [inicio, setInicio] = useState(de || inicioDoMes(hoje))
  const [fim, setFim] = useState(ate || hoje)
  const [escola, setEscola] = useState(escolaId ?? '')
  const [andamento, setAndamento] = useState<Andamento | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const periodoValido = /^\d{4}-\d{2}-\d{2}$/.test(inicio) && /^\d{4}-\d{2}-\d{2}$/.test(fim) && inicio <= fim

  /**
   * As datas são comparadas como string "AAAA-MM-DD", como em todo o
   * resto do site: `new Date` aqui mostraria o dia anterior no fuso do
   * Brasil e cortaria projeto do começo do período.
   */
  const escolhidas = useMemo(() => {
    if (!periodoValido) return []
    return reservas
      .filter(
        (r) =>
          valeDocumento(r) &&
          r.data_aula >= inicio &&
          r.data_aula <= fim &&
          (escola === '' || r.escola_id === escola),
      )
      .sort((a, b) =>
        a.data_aula === b.data_aula
          ? a.hora_inicio.localeCompare(b.hora_inicio)
          : a.data_aula.localeCompare(b.data_aula),
      )
  }, [reservas, inicio, fim, escola, periodoValido])

  /**
   * Projeto que aconteceu mas ninguém relatou ainda: o documento dele sai
   * só com o cabeçalho. Não dá para deixar de fora — a aula existiu —,
   * mas o coordenador precisa saber antes de mandar para a prefeitura.
   */
  const semConteudo = useMemo(
    () => escolhidas.filter((r) => !r.relato && r.fotos.length === 0).length,
    [escolhidas],
  )

  const nomeDaEscola = escolas.find((e) => e.id === escola)?.nome

  async function baixarTudo() {
    setErro(null)
    setResultado(null)
    setAndamento({ feitos: 0, total: escolhidas.length, atual: '' })
    try {
      const pacote = await montarPacote(escolhidas, setAndamento)
      if (pacote.arquivos === 0) {
        setErro('Nenhum documento pôde ser montado. Confira se as aulas do período têm relato e fotos.')
        return
      }
      baixar(
        pacote.zip,
        `Projetos Integradores - ${nomeDaEscola ?? 'todas as escolas'} - ${inicio} a ${fim}.zip`,
      )
      setResultado({
        arquivos: pacote.arquivos,
        falhas: pacote.falhas,
        fotosPerdidas: pacote.fotosPerdidas,
      })
    } catch (f) {
      setErro(f instanceof Error ? f.message : 'Não foi possível montar o pacote.')
    } finally {
      setAndamento(null)
    }
  }

  return (
    <Modal
      titulo="Baixar documentos em lote"
      subtitulo="Um ZIP com o documento de cada projeto integrador do período."
      aoFechar={aoFechar}
    >
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="linha-campos">
        <div className="campo">
          <label htmlFor="lote-de">Data inicial *</label>
          <input id="lote-de" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="lote-ate">Data final *</label>
          <input id="lote-ate" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
      </div>

      <div className="campo">
        <label htmlFor="lote-escola">Escola</label>
        <select id="lote-escola" value={escola} onChange={(e) => setEscola(e.target.value)}>
          <option value="">Todas as escolas</option>
          {[...escolas]
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
        </select>
      </div>

      {!periodoValido ? (
        <Aviso tipo="info">Escolha a data inicial e a final — a inicial não pode ser depois da final.</Aviso>
      ) : (
        <Aviso tipo={escolhidas.length === 0 ? 'info' : 'sucesso'}>
          {escolhidas.length === 0
            ? 'Nenhum projeto realizado neste período com esta escola.'
            : `${escolhidas.length} documento${escolhidas.length === 1 ? '' : 's'} — de ${dataCurta(
                escolhidas[0].data_aula,
              )} a ${dataCurta(escolhidas[escolhidas.length - 1].data_aula)}.`}
        </Aviso>
      )}

      {escolhidas.length > 0 && semConteudo > 0 && (
        <Aviso tipo="info">
          {semConteudo === 1
            ? '1 projeto do período ainda está sem relato e sem fotos: o documento dele sai só com o cabeçalho.'
            : `${semConteudo} projetos do período ainda estão sem relato e sem fotos: os documentos deles saem só com o cabeçalho.`}{' '}
          Vale preencher em "Relato e fotos" antes de mandar.
        </Aviso>
      )}

      {resultado && (
        <>
          <Aviso tipo="sucesso">
            Pacote baixado com {resultado.arquivos} documento
            {resultado.arquivos === 1 ? '' : 's'}.
          </Aviso>
          {resultado.falhas.length > 0 && (
            <Aviso tipo="erro">
              Não consegui montar o documento de: {resultado.falhas.join(' · ')}.
            </Aviso>
          )}
          {resultado.fotosPerdidas > 0 && (
            <Aviso tipo="info">
              {resultado.fotosPerdidas} foto(s) não abriram e ficaram de fora dos documentos.
            </Aviso>
          )}
        </>
      )}

      <p className="ajuda" style={{ marginTop: 14 }}>
        Entram os projetos que já aconteceram. Cancelados e aulas ainda por vir ficam de fora. Cada
        documento é montado na hora, com as fotos da aula, então um período grande demora um pouco.
      </p>

      <div className="acoes-formulario">
        <button type="button" className="secundario" onClick={aoFechar} disabled={!!andamento}>
          {resultado ? 'Fechar' : 'Cancelar'}
        </button>
        <button
          type="button"
          onClick={() => void baixarTudo()}
          disabled={!periodoValido || escolhidas.length === 0 || !!andamento}
        >
          {andamento
            ? `Montando ${Math.min(andamento.feitos + 1, andamento.total)} de ${andamento.total}…`
            : `Baixar ${escolhidas.length || ''} documento${escolhidas.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  )
}

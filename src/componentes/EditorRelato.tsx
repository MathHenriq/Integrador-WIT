import { useState } from 'react'
import { Aviso } from './Aviso'
import { Modal } from './Modal'
import { SeletorDeFotos } from './SeletorDeFotos'
import { adminRegistrarRelato } from '../lib/api'
import { dataCurta, faixaHoraria } from '../lib/formato'
import type { ReservaAdmin } from '../lib/tipos'

/**
 * O relato e as fotos de uma aula que já aconteceu.
 *
 * Era um `window.prompt` pedindo "endereços das fotos, um por linha" — e
 * gravava o que fosse colado, cru. Quem tinha as fotos no celular não
 * tinha o que colar, e quem colava um link do Drive gravava um endereço
 * que ia quebrar assim que o arquivo saísse de "qualquer pessoa com o
 * link". Foi por essa porta que as oito primeiras fotos da vitrine
 * viraram tela de login do Google — e a mesma porta seria a usada para
 * consertá-las.
 *
 * Agora é o mesmo seletor de fotos do registro: o arquivo sai do
 * aparelho e vai para o balde do site. As fotos que já estão na aula
 * aparecem aqui, e a que estiver quebrada pode sair no "×" e ser
 * substituída pelo arquivo de verdade.
 *
 * Mora num diálogo, e não em duas caixas do navegador, porque duas abas
 * pedem a mesma coisa (Reservas e Integradores realizados) e um texto
 * perguntado de dois jeitos viraria dois formatos de registro.
 */
export function EditorRelato({
  senha,
  reserva,
  aoFechar,
  aoSalvar,
}: {
  senha: string
  reserva: ReservaAdmin
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [relato, setRelato] = useState(reserva.relato ?? '')
  const [fotos, setFotos] = useState<string[]>(reserva.fotos)
  const [enviandoFotos, setEnviandoFotos] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      await adminRegistrarRelato(senha, reserva.id, relato.trim(), fotos)
      aoSalvar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o relato.')
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Relato e fotos"
      subtitulo={`${reserva.escola_nome} · ${dataCurta(reserva.data_aula)}, das ${faixaHoraria(
        reserva.hora_inicio,
        reserva.hora_fim,
      )}`}
      aoFechar={aoFechar}
    >
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="campo">
        <label htmlFor="relato-texto">Como foi a aula</label>
        <textarea
          id="relato-texto"
          value={relato}
          onChange={(e) => setRelato(e.target.value)}
          rows={8}
          placeholder="Duas ou três linhas contando o que a turma fez."
        />
        <p className="ajuda">
          Aparece na vitrine pública de aulas realizadas. As linhas{' '}
          <strong>Objetivos de aprendizagem</strong> e <strong>Materiais e recursos</strong>, quando
          existem, são os títulos que o documento em PDF usa para separar os campos — apagá-las joga
          tudo para dentro da descrição.
        </p>
      </div>

      <div className="campo" style={{ marginBottom: 0 }}>
        <label>Fotos da aula</label>
        <SeletorDeFotos
          senha={senha}
          fotos={fotos}
          aoMudar={setFotos}
          aoErro={setErro}
          aoOcupado={setEnviandoFotos}
        />
      </div>

      <div className="acoes-formulario">
        <button type="button" className="secundario" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || enviandoFotos}
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}

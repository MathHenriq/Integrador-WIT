import { useState } from 'react'
import { Aviso } from './Aviso'
import { Modal } from './Modal'
import { temaIgual, temasParecidos } from '../lib/temas'
import type { AulaAdmin } from '../lib/tipos'

/**
 * Embaixo do campo de tema: os projetos do catálogo que parecem o que
 * está sendo digitado. Um clique troca o tema pelo do catálogo, e o
 * registro entra junto do projeto que já existe em vez de abrir outro.
 */
export function SugestoesDeTema({
  tema,
  catalogo,
  aoEscolher,
}: {
  tema: string
  catalogo: AulaAdmin[]
  aoEscolher: (titulo: string) => void
}) {
  const igual = temaIgual(tema, catalogo)
  const parecidos = temasParecidos(tema, catalogo).filter((a) => a.id !== igual?.id)

  if (igual) {
    return (
      <p className="ajuda tema-do-catalogo">
        Este projeto já está no catálogo
        {igual.vezes_dada > 0 ? ` (dado ${vezes(igual.vezes_dada)})` : ''}. Esta turma entra junto
        dele, sem abrir outro.
      </p>
    )
  }

  if (parecidos.length === 0) return null

  return (
    <div className="sugestoes-de-tema">
      <p className="ajuda">Já existe no catálogo — é um destes? Clique para usar o mesmo tema:</p>
      <div className="chips">
        {parecidos.map((a) => (
          <button type="button" key={a.id} className="chip" onClick={() => aoEscolher(a.titulo)}>
            {a.titulo}
          </button>
        ))}
      </div>
    </div>
  )
}

function vezes(n: number) {
  return n === 1 ? '1 vez' : `${n} vezes`
}

/**
 * "Deseja registrar este projeto?" — o passo separado antes de gravar.
 *
 * Antes, o registro saía direto do botão, com "abrir no catálogo" já
 * marcado: quem não prestava atenção abria uma atividade nova com o mesmo
 * projeto de outra, escrito com outras palavras. Aqui a pessoa vê o
 * resumo, vê se o tema já existe e, quando é tema novo, **escolhe** se
 * ele vai para o catálogo — nada vem marcado.
 */
export function ConfirmarRegistro({
  tema,
  resumo,
  catalogo,
  ocupado,
  aoTrocarTema,
  aoConfirmar,
  aoVoltar,
}: {
  tema: string
  /** As linhas do resumo: escola, data, turma… */
  resumo: { rotulo: string; valor: string }[]
  catalogo: AulaAdmin[]
  ocupado: boolean
  aoTrocarTema: (titulo: string) => void
  aoConfirmar: (virarAtividade: boolean) => void
  aoVoltar: () => void
}) {
  const [abrirNoCatalogo, setAbrirNoCatalogo] = useState<boolean | null>(null)
  const igual = temaIgual(tema, catalogo)
  const parecidos = igual ? [] : temasParecidos(tema, catalogo)

  // Tema que já existe entra na atividade dele: não há o que perguntar.
  const podeConfirmar = !ocupado && (igual !== null || abrirNoCatalogo !== null)

  return (
    <Modal
      titulo="Deseja registrar este projeto?"
      subtitulo="Confira antes de salvar. Depois de registrado, ele entra na vitrine."
      aoFechar={aoVoltar}
    >
      <dl className="resumo-registro">
        <dt>Tema</dt>
        <dd>
          <strong>{tema}</strong>
        </dd>
        {resumo.map((linha) => (
          <div key={linha.rotulo} style={{ display: 'contents' }}>
            <dt>{linha.rotulo}</dt>
            <dd>{linha.valor}</dd>
          </div>
        ))}
      </dl>

      {igual ? (
        <Aviso tipo="info">
          <strong>Este projeto já existe no catálogo</strong>
          {igual.vezes_dada > 0 ? `, dado ${vezes(igual.vezes_dada)}` : ''}. Esta turma entra junto
          dele: as fotos se somam às das outras turmas e nenhuma atividade nova é aberta.
        </Aviso>
      ) : (
        <>
          {parecidos.length > 0 && (
            <div className="sugestoes-de-tema" style={{ marginBottom: 16 }}>
              <Aviso tipo="erro">
                <strong>Parece com um projeto que já existe.</strong> Se for o mesmo, use o tema do
                catálogo — senão ele aparece repetido na vitrine.
              </Aviso>
              <div className="chips">
                {parecidos.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className="chip"
                    onClick={() => aoTrocarTema(a.titulo)}
                  >
                    É este: {a.titulo}
                  </button>
                ))}
              </div>
            </div>
          )}

          <fieldset className="campo" style={{ border: 0, padding: 0, margin: '0 0 8px' }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>
              Abrir este tema como atividade nova no catálogo?
            </legend>
            <div className="caixas">
              <label className="caixa">
                <input
                  type="radio"
                  name="abrir-no-catalogo"
                  checked={abrirNoCatalogo === true}
                  onChange={() => setAbrirNoCatalogo(true)}
                />
                Sim — outro professor pode escolher esta aula ao agendar
              </label>
              <label className="caixa">
                <input
                  type="radio"
                  name="abrir-no-catalogo"
                  checked={abrirNoCatalogo === false}
                  onChange={() => setAbrirNoCatalogo(false)}
                />
                Não — só registrar o que esta turma fez
              </label>
            </div>
          </fieldset>
        </>
      )}

      <div className="acoes-formulario">
        <button type="button" className="secundario" onClick={aoVoltar} disabled={ocupado}>
          Voltar e revisar
        </button>
        <button
          type="button"
          onClick={() => aoConfirmar(igual !== null || abrirNoCatalogo === true)}
          disabled={!podeConfirmar}
        >
          {ocupado ? 'Registrando…' : 'Sim, registrar projeto'}
        </button>
      </div>
    </Modal>
  )
}

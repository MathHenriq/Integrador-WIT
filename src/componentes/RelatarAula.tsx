import { useMemo, useState } from 'react'
import { Aviso } from './Aviso'
import { EscolherFotos } from './EscolherFotos'
import { Modal } from './Modal'
import { adminRegistrarRelato } from '../lib/api'
import type { ReservaAdmin } from '../lib/tipos'

type Props = {
  senha: string
  reserva: ReservaAdmin
  aoFechar: () => void
  aoSalvar: () => void
}

/**
 * O relato e as fotos de uma aula que já aconteceu. Era perguntado em
 * duas caixas do navegador (`window.prompt`) — rápido de escrever, mas
 * sem como anexar arquivo nenhum, só colar link. Vira modal para caber
 * o botão de anexar do celular ou do computador, do lado do link, que
 * continua valendo para quem já tem a foto hospedada em algum lugar.
 *
 * As fotos que a reserva já tinha entram na caixa de link, como texto —
 * são endereços, não arquivos, e o formulário não sabe (nem precisa
 * saber) qual delas veio de link e qual veio de anexo da vez passada.
 */
export function RelatarAula({ senha, reserva, aoFechar, aoSalvar }: Props) {
  const [relato, setRelato] = useState(reserva.relato ?? '')
  const [fotosTexto, setFotosTexto] = useState(reserva.fotos.join('\n'))
  const [fotosAnexadas, setFotosAnexadas] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const fotos = useMemo(
    () => [
      ...fotosTexto
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean),
      ...fotosAnexadas,
    ],
    [fotosTexto, fotosAnexadas],
  )

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      await adminRegistrarRelato(senha, reserva.id, relato, fotos)
      aoSalvar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o relato.')
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Relato e fotos"
      subtitulo={`${reserva.escola_nome} · protocolo ${reserva.protocolo}`}
      aoFechar={aoFechar}
      largo
    >
      <form onSubmit={salvar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="campo">
          <label htmlFor="rel-relato">Como foi a aula</label>
          <textarea
            id="rel-relato"
            value={relato}
            onChange={(e) => setRelato(e.target.value)}
            rows={5}
            placeholder="Conte em poucas linhas. Isso aparece na vitrine pública de aulas realizadas."
          />
        </div>

        <div className="campo" style={{ marginBottom: 0 }}>
          <label>Fotos</label>
          <p className="ajuda" style={{ marginTop: 0, marginBottom: 10 }}>
            Anexe do celular ou do computador, ou cole o link de uma foto já hospedada (Drive,
            Storage do Supabase, etc.). Elas aparecem na vitrine e na página da atividade.
          </p>

          <EscolherFotos
            senha={senha}
            valor={fotosAnexadas}
            aoMudar={setFotosAnexadas}
            aoErro={setErro}
          />

          <div style={{ marginTop: 14 }}>
            <label htmlFor="rel-fotos">Ou cole o endereço das fotos, um por linha</label>
            <textarea
              id="rel-fotos"
              value={fotosTexto}
              onChange={(e) => setFotosTexto(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="acoes-formulario">
          <button type="button" className="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar relato'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

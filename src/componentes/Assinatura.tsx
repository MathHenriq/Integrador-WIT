/**
 * Crédito de autoria do sistema. Aparece no rodapé de todas as páginas
 * (o `Layout` envolve todas as rotas) e na tela de configuração pendente.
 *
 * O mesmo nome está em `lib/autoria.ts`, de onde saem o aviso no console
 * e os metadados de autor de todo PDF gerado pelo site. A licença MIT do
 * repositório exige manter o aviso de copyright nas cópias.
 */
import { AUTOR, AUTOR_URL } from '../lib/autoria'

export function Assinatura() {
  return (
    <span className="assinatura">
      Desenvolvido por{' '}
      <a href={AUTOR_URL} target="_blank" rel="noopener noreferrer author">
        {AUTOR}
      </a>
    </span>
  )
}

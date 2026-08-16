"""
Copia os desenhos das materias do Phosphor para dentro do projeto.

    npm i -D @phosphor-icons/core
    python3 ferramentas/extrair-desenhos.py

Escreve `src/componentes/desenhos-materias.tsx`.

Por que copiar em vez de importar: o pacote `@phosphor-icons/react`
carrega os seis pesos de cada icone (bold, duotone, fill, light, regular,
thin). Para treze desenhos, usando um peso so, isso custava cerca de
45 kB gzip. Copiado, custa uns poucos kB e nao sobra dependencia em tempo
de execucao. Os icones sao MIT.

Para trocar o desenho de uma materia, mude o nome do arquivo no mapa
abaixo e rode de novo. Nao edite o .tsx gerado.
"""

import re

BASE = 'node_modules/@phosphor-icons/core/assets/duotone'

ICONES = {
    'portugues': 'book-open-text',
    'matematica': 'math-operations',
    'ciencias': 'flask',
    'historia': 'scroll',
    'geografia': 'globe-hemisphere-west',
    'arte': 'palette',
    'edfisica': 'person-simple-run',
    'ingles': 'translate',
    'padrao': 'book-open',
    # A caixa do Nucleo nao tem um objeto so que a represente.
    'vr': 'virtual-reality',
    'camera': 'camera',
    'controle': 'game-controller',
}

CABECALHO = '''/**
 * Desenhos das matérias — arquivo GERADO, não edite à mão.
 *
 *     python3 ferramentas/extrair-desenhos.py
 *
 * São os ícones `duotone` do Phosphor (MIT), copiados para cá em vez de
 * importados do pacote. O pacote `@phosphor-icons/react` carrega os seis
 * pesos de cada ícone; para treze desenhos isso custava ~45 kB gzip só
 * para usar um peso. Copiando, custa uns poucos kB e some a dependência
 * em tempo de execução.
 *
 * Todos usam `viewBox="0 0 256 256"` e `fill="currentColor"`.
 */

import type { ReactNode } from 'react'

export const VIEW_BOX = '0 0 256 256'

export const DESENHOS: Record<string, ReactNode> = {
'''


def extrair(arquivo):
    svg = open(f'{BASE}/{arquivo}-duotone.svg', encoding='utf-8').read()
    interno = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)

    partes = []
    for tag, attrs in re.findall(r'<(\w+)([^>]*)/>', interno):
        # Se o Phosphor passar a usar outra tag ou outro atributo, e melhor
        # quebrar aqui do que gerar JSX silenciosamente errado.
        assert tag == 'path', f'tag inesperada em {arquivo}: {tag}'
        d = dict(re.findall(r'(\S+)="([^"]*)"', attrs))
        assert set(d) <= {'d', 'opacity'}, f'atributo novo em {arquivo}: {set(d)}'

        props = f'd="{d["d"]}"'
        if 'opacity' in d:
            props += f' opacity="{d["opacity"]}"'
        partes.append(f'    <path {props} />')

    return '\n'.join(partes)


if __name__ == '__main__':
    corpo = '\n'.join(
        f'  {chave}: (\n    <>\n{extrair(arq)}\n    </>\n  ),'
        for chave, arq in ICONES.items()
    )
    destino = 'src/componentes/desenhos-materias.tsx'
    open(destino, 'w', encoding='utf-8').write(CABECALHO + corpo + '\n}\n')
    print(f'{destino} gerado com {len(ICONES)} desenhos')

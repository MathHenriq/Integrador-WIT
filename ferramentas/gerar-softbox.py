"""
Gera os dois softboxes que iluminam o ciclorama da tela "Minha reserva".

    python3 ferramentas/gerar-softbox.py

Escreve `public/softbox-esq.webp` e `public/softbox-dir.webp`.

Por que imagem e nao SVG: forma vetorial de softbox, com aresta exata,
le como adesivo colado em cima do fundo.

O que faz a caixa parecer uma caixa acesa, e nao uma mancha de luz:

1. A armacao escura e a haste. Sem uma parte ESCURA, so existe brilho, e
   brilho sozinho nao tem forma de objeto.
2. O estouro por cima da armacao. Luz de verdade transborda a borda do
   difusor; se o brilho parar na moldura, o difusor le como placa apagada.

Tres armadilhas ja pagas, para nao repetir ao mexer nos numeros:

- Alfa alto no derrame vira mancha de creme cobrindo a tela.
- Forma que encosta na borda do arquivo vira quina reta, porque o
  desfoque nao tem para onde cair. Por isso tudo passa pela mascara de
  borda no fim (a haste sai de proposito, como se o tripe estivesse fora
  do quadro).
- `Image.paste(cor, mask)` sobre RGBA transparente NAO da cor
  translucida: mistura o RGB contra o preto do fundo e devolve cinza. As
  camadas por isso sao montadas com `Image.merge`, colocando a mascara
  direto no canal alfa.
"""

from PIL import Image, ImageChops, ImageDraw, ImageFilter

LADO = 1000
SAIDA = 500

BRANCO = (255, 253, 244)
QUENTE = (255, 248, 224)
ESCURO = (26, 29, 34)

# A caixa vista de vies, virada para o centro da tela.
FORA = [(120, 150), (470, 95), (505, 470), (150, 430)]
DIFUSOR = [(152, 186), (440, 134), (472, 436), (180, 397)]
BRACO = [(126, 268), (152, 262), (152, 330), (126, 336)]
HASTE = [(0, 300), (132, 272), (134, 322), (0, 356)]
DERRAME = [(250, 250), (430, 226), (860, 720), (700, 880), (330, 820)]


def mascara(desenhar, desfoque=0, escala=1.0):
    m = Image.new('L', (LADO, LADO), 0)
    desenhar(ImageDraw.Draw(m))
    if desfoque:
        m = m.filter(ImageFilter.GaussianBlur(desfoque))
    if escala != 1.0:
        m = m.point(lambda v: int(v * escala))
    return m


def camada(mask, cor):
    """Cor chapada com a mascara no canal alfa — ver a terceira armadilha."""
    canais = [Image.new('L', (LADO, LADO), c) for c in cor]
    return Image.merge('RGBA', (*canais, mask))


def softbox():
    img = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    difusor = lambda d: d.polygon(DIFUSOR, fill=255)

    # 1. A luz que a caixa joga no ciclorama, por baixo de tudo.
    img.alpha_composite(camada(mascara(lambda d: d.polygon(DERRAME, fill=26), 150), QUENTE))
    img.alpha_composite(
        camada(mascara(lambda d: d.ellipse([40, 20, 600, 540], fill=64), 90), QUENTE)
    )

    # 2. Haste e braço.
    img.alpha_composite(camada(mascara(lambda d: d.polygon(HASTE, fill=210), 2.5), ESCURO))
    img.alpha_composite(camada(mascara(lambda d: d.polygon(BRACO, fill=235), 1.5), ESCURO))

    # 3. Armação.
    img.alpha_composite(camada(mascara(lambda d: d.polygon(FORA, fill=238), 2), ESCURO))

    # 4. Difusor aceso.
    img.alpha_composite(camada(mascara(difusor, 2), BRANCO))

    # 5. O estouro, por cima da armação.
    img.alpha_composite(camada(mascara(difusor, 16, 0.72), BRANCO))
    img.alpha_composite(camada(mascara(difusor, 46, 0.42), QUENTE))
    img.alpha_composite(camada(mascara(difusor, 110, 0.30), QUENTE))

    borda = mascara(
        lambda d: d.rounded_rectangle([-40, 40, LADO - 60, LADO - 60], radius=200, fill=255), 55
    )
    r, g, b, a = img.split()
    return Image.merge('RGBA', (r, g, b, ImageChops.multiply(a, borda)))


if __name__ == '__main__':
    caixa = softbox().resize((SAIDA, SAIDA), Image.LANCZOS)
    caixa.save('public/softbox-esq.webp', quality=88, method=6)
    caixa.transpose(Image.FLIP_LEFT_RIGHT).save(
        'public/softbox-dir.webp', quality=88, method=6
    )
    print('public/softbox-esq.webp e public/softbox-dir.webp gerados')

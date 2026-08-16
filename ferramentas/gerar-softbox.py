"""
Gera os dois softboxes que iluminam o ciclorama da tela "Minha reserva".

    python3 ferramentas/gerar-softbox.py

Escreve `public/softbox-esq.webp` e `public/softbox-dir.webp`.

Por que imagem e nao SVG: forma vetorial de softbox, com aresta exata,
le como adesivo colado em cima do fundo. O que a foto de um softbox
aceso tem e um retangulo nao tem e o miolo estourado, a borda difusa e o
derrame de luz caindo em cone na direcao do assunto.

Duas armadilhas ja pagas, para nao repetir ao mexer nos numeros:

1. Alfa alto vira mancha de creme. O painel e a unica coisa que pode ler
   como "acesa"; o resto e sujeira de luz, e sujeira de luz forte suja.
2. Forma que encosta na borda do arquivo vira quina reta, porque o
   desfoque nao tem para onde cair. Por isso tudo passa pela mascara de
   borda no fim.
"""

from PIL import Image, ImageChops, ImageDraw, ImageFilter

LADO = 1000
QUENTE = (255, 250, 231)

# A imagem sai em 500px: e tudo desfoque, entao resolucao cheia so
# engorda o bundle sem mudar um pixel em tela.
SAIDA = 500


def mascara(desenhar, desfoque):
    camada = Image.new('L', (LADO, LADO), 0)
    desenhar(ImageDraw.Draw(camada))
    return camada.filter(ImageFilter.GaussianBlur(desfoque))


def softbox():
    # O painel visto de vies: virado para o centro da tela, entao o lado
    # de dentro fica mais alto e mais largo que o de fora.
    corpo = mascara(
        lambda d: d.polygon([(150, 170), (430, 122), (462, 432), (178, 400)], fill=64), 12
    )
    miolo = mascara(
        lambda d: d.polygon([(190, 208), (396, 172), (418, 396), (206, 366)], fill=168), 26
    )
    # Difusao curta que o tecido joga para os lados.
    halo = mascara(lambda d: d.ellipse([96, 78, 516, 470], fill=40), 78)
    # O cone de luz, que termina antes da borda de proposito (ver 2).
    derrame = mascara(
        lambda d: d.polygon(
            [(250, 250), (410, 226), (830, 700), (700, 860), (330, 800)], fill=22
        ),
        150,
    )

    alfa = corpo
    for parte in (miolo, halo, derrame):
        alfa = ImageChops.add(alfa, parte)

    borda = mascara(
        lambda d: d.rounded_rectangle(
            [70, 70, LADO - 70, LADO - 70], radius=220, fill=255
        ),
        60,
    )
    alfa = ImageChops.multiply(alfa, borda)

    canais = [Image.new('L', (LADO, LADO), c) for c in QUENTE]
    return Image.merge('RGBA', (*canais, alfa))


if __name__ == '__main__':
    esquerdo = softbox().resize((SAIDA, SAIDA), Image.LANCZOS)
    esquerdo.save('public/softbox-esq.webp', quality=86, method=6)
    esquerdo.transpose(Image.FLIP_LEFT_RIGHT).save(
        'public/softbox-dir.webp', quality=86, method=6
    )
    print('public/softbox-esq.webp e public/softbox-dir.webp gerados')

#!/usr/bin/env python3
"""Generador del logotipo del Cuerpo Académico UDG-CA-1190.
Compone el escudo oficial de la UdeG con el nombre del CA usando la
paleta cromática de The Lancet (ggsci 'lanonc'). Salida: PNG transparente HiRes.
"""
from PIL import Image, ImageDraw, ImageFont

# --- Paleta Lancet (ggsci lanonc) ---
BLUE   = "#00468B"
RED    = "#ED0000"
GREEN  = "#42B540"
TEAL   = "#0099B4"
PURPLE = "#925E9F"
WINE   = "#AD002A"
BLACK  = "#1B1919"
GRAY   = "#5B6770"

LOGO_PATH = "/Users/jaibri/Documents/CEIC CUTLAJO/FILOSOFIA DE DISEÑO DE CUTLAJOMULCO/UdeG logo color.png"
OPTIMA  = "/System/Library/Fonts/Optima.ttc"
PALAT   = "/System/Library/Fonts/Palatino.ttc"

def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)

def load_logo(target_h):
    logo = Image.open(LOGO_PATH).convert("RGBA")
    logo = logo.crop(logo.getbbox())
    w, h = logo.size
    target_w = round(w * target_h / h)
    return logo.resize((target_w, target_h), Image.LANCZOS)

def draw_tracked(draw, xy, text, fnt, fill, tracking):
    """Texto con espaciado entre letras (tracking en px). Devuelve ancho total."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + tracking
    return x - tracking - xy[0]

def tracked_width(draw, text, fnt, tracking):
    return sum(draw.textlength(ch, font=fnt) + tracking for ch in text) - tracking

# Segmentos temáticos del nombre, coloreados en tonos Lancet armónicos
NAME_LINES = [
    ("Investigación Integrativa de", BLUE),
    ("Factores Biológicos del", TEAL),
    ("Proceso Salud-Enfermedad", WINE),
]

# ----------------------------------------------------------------------------
def build_horizontal():
    W, H = 2800, 1000
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    logo_h = 820
    logo = load_logo(logo_h)
    lx, ly = 70, (H - logo_h) // 2
    img.alpha_composite(logo, (lx, ly))

    # Barra vertical de acento (azul Lancet)
    bar_x = lx + logo.size[0] + 70
    d.rounded_rectangle([bar_x, 150, bar_x + 12, H - 150], radius=6, fill=BLUE)

    tx = bar_x + 70

    # Kicker
    f_kick = font(OPTIMA, 46, 1)
    draw_tracked(d, (tx, 168), "CUERPO ACADÉMICO", f_kick, TEAL, 8)

    # Acrónimo
    f_acr = font(OPTIMA, 168, 1)
    d.text((tx - 4, 222), "UDG-CA-1190", font=f_acr, fill=BLUE)

    # Regla
    acr_w = d.textlength("UDG-CA-1190", font=f_acr)
    rule_y = 430
    d.rectangle([tx, rule_y, tx + acr_w, rule_y + 5], fill=GRAY)

    # Nombre (3 líneas, segmentos Lancet)
    f_name = font(OPTIMA, 92, 1)
    y = rule_y + 48
    for txt, col in NAME_LINES:
        d.text((tx - 2, y), txt, font=f_name, fill=col)
        y += 112

    return img.crop(img.getbbox())

# ----------------------------------------------------------------------------
def build_vertical():
    W, H = 1900, 2150
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    logo_h = 1080
    logo = load_logo(logo_h)
    lx = (W - logo.size[0]) // 2
    img.alpha_composite(logo, (lx, 60))

    cx = W // 2
    y = 60 + logo_h + 70

    f_kick = font(OPTIMA, 50, 1)
    kw = tracked_width(d, "CUERPO ACADÉMICO", f_kick, 10)
    draw_tracked(d, (cx - kw / 2, y), "CUERPO ACADÉMICO", f_kick, TEAL, 10)
    y += 92

    f_acr = font(OPTIMA, 180, 1)
    aw = d.textlength("UDG-CA-1190", font=f_acr)
    d.text((cx - aw / 2, y), "UDG-CA-1190", font=f_acr, fill=BLUE)
    y += 232

    rw = 900
    d.rectangle([cx - rw / 2, y, cx + rw / 2, y + 6], fill=GRAY)
    y += 54

    f_name = font(OPTIMA, 98, 1)
    for txt, col in NAME_LINES:
        tw = d.textlength(txt, font=f_name)
        d.text((cx - tw / 2, y), txt, font=f_name, fill=col)
        y += 122

    return img.crop(img.getbbox())

# ----------------------------------------------------------------------------
def with_white_bg(im, pad=80):
    bg = Image.new("RGBA", (im.size[0] + 2 * pad, im.size[1] + 2 * pad),
                   (255, 255, 255, 255))
    bg.alpha_composite(im, (pad, pad))
    return bg

OUT = "/Users/jaibri/Documents/UDG-CA-1190"
h = build_horizontal()
v = build_vertical()
h.save(f"{OUT}/UDG-CA-1190_logo_horizontal.png")
v.save(f"{OUT}/UDG-CA-1190_logo_vertical.png")
with_white_bg(h).convert("RGB").save(f"{OUT}/UDG-CA-1190_logo_horizontal_blanco.png")
with_white_bg(v).convert("RGB").save(f"{OUT}/UDG-CA-1190_logo_vertical_blanco.png")
print("OK", h.size, v.size)

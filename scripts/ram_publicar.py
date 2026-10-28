#!/usr/bin/env python3
"""Publica la plática «Resistencia antimicrobiana: del pasado dorado de los
antibióticos al futuro que todavía podemos cambiar» (presentación reveal.js
autocontenida) en public/herramientas/resistencia-antimicrobiana/app/, con la
identidad del sitio. El original NO se modifica.

Uso:
  python3 scripts/ram_publicar.py [--origen ARCHIVO] [--salida DIR]

--origen  HTML autocontenido tal como lo produce el autor (por defecto, la copia
          de trabajo en herramientas/Resistencia_antimicrobiana/, carpeta que
          Git ignora).
--salida  carpeta publicada (por defecto public/herramientas/resistencia-antimicrobiana/app/).

Transformaciones (cada una se comprueba con assert):
  - Plantilla del Hospital Civil (fondo PNG con sus logotipos, foto de la
    fachada en la portada) → marco del sitio: logotipo del CA (escudo UdeG)
    arriba a la izquierda, banda inferior roja y azul marino UdeG con filete
    dorado; en la portada, el logotipo vertical del CA. Los logotipos se toman
    de /logos/ (los mismos del encabezado del sitio), no se incrustan.
  - Paleta de la plantilla → tokens UdeG del sitio (design/tokens/colors.json),
    solo en el CSS, el marcado y los scripts propios del deck; reveal.js,
    Chart.js y el plugin de notas no se tocan. Se conservan los matices que
    las notas nombran (barras rojas, ámbar y azules; verde de «después»).
  - Fira Sans y Montserrat incrustadas → fuentes locales del sitio
    (/fonts/fonts.css): Inter en el cuerpo y los títulos, Source Serif 4 en la
    portada y los divisores, IBM Plex Mono en etiquetas.
  - Radios planos y sin sombras, como el resto del sitio.
  - Se retira de las notas del ponente la ruta a su archivo de trabajo local.
  - Enlace «← Herramientas» visible solo al abrir la plática fuera del visor.
  - Comentario de procedencia al inicio del archivo.

Ante un cambio del autor en la plática, se vuelve a ejecutar este script.
"""
import argparse
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN_DEFAULT = RAIZ / 'herramientas/Resistencia_antimicrobiana/RAM_platica_HCO_autocontenido.html'
SALIDA_DEFAULT = RAIZ / 'public/herramientas/resistencia-antimicrobiana/app'
LOGO_H = '/logos/UDG-CA-1190_logo_horizontal.png'
LOGO_V = '/logos/UDG-CA-1190_logo_vertical.png'

# ---------------------------------------------------------------- paleta
# Plantilla HCO → tokens UdeG. #7B8BB2 y #6073A0 son tintes intermedios entre
# navy-700 (#455A8C) y navy-300 (#B0BCD8) para las series claras de las
# gráficas (contraste ≥3:1 sobre blanco); #8C96A8 atenúa los pasos ya vistos
# del panel de guía sobre navy.
PALETA = {
    '#022b49': '#27334F', '#44688e': '#455A8C', '#63afcb': '#7B8BB2', '#a9d3e3': '#B0BCD8',
    '#0b4a7a': '#36476E', '#3f8fb0': '#6073A0',
    '#e6f1f6': '#EDF1F8', '#eaf4f8': '#EDF1F8', '#f7fbfb': '#F7F8FA', '#f4f9fb': '#F7F8FA',
    '#1b2a36': '#14181F', '#5a6b78': '#4B5462', '#d5e3ea': '#DDE1E8',
    '#cfe3ec': '#DDE1E8', '#dbe8ef': '#E4E8EF', '#7f9db0': '#8C96A8',
    # semánticos: error / aviso (ámbar) / ok
    '#c8452c': '#A61E12', '#f9e1db': '#FBEAE8',
    '#e08a2c': '#C9962E', '#9a5a12': '#8A5C0A', '#fbebd8': '#FBF3DD', '#fff4e5': '#FBF3DD',
    '#2e8b6a': '#1A6B42', '#e9f6f0': '#E7F2EC', '#ddf1e8': '#E7F2EC',
}
RGBA = {'rgba(2,43,73,': 'rgba(20,24,31,'}
# Radios: el sistema del sitio es plano (2–6 px); píldoras (999px) y círculos (50%) se conservan.
RADIOS = {'14px': '4px', '12px': '4px', '10px': '4px', '9px': '3px', '8px': '3px', '6px': '2px'}

FUENTE_SANS = "'Inter',system-ui,-apple-system,'Segoe UI',sans-serif"
VARS_FUENTE = (f"--title:{FUENTE_SANS};\n  --body:{FUENTE_SANS};\n"
               "  --serif:'Source Serif 4',Georgia,serif;\n  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;")

MARCO = (
    f'background:url({LOGO_H}) left 48px top 18px/auto 66px no-repeat,'
    'linear-gradient(var(--gold),var(--gold)) left 0 bottom 10px/100% 3px no-repeat,'
    'linear-gradient(var(--red),var(--red)) left 0 bottom 0/190px 10px no-repeat,'
    'linear-gradient(var(--inst),var(--inst)) left 0 bottom 0/100% 10px no-repeat;'
)
# Se añade al final del <head>, después de los estilos del deck.
CSS_SITIO = f"""<style>
/* ===== Identidad del sitio (UdeG · UDG-CA-1190), añadida por scripts/ram_publicar.py ===== */
:root{{--red:#90303A;--red-dark:#701D14;--gold:#FDCF85;--inst:#202945}}
.reveal section h2{{background:var(--red);border-radius:0;font-weight:600;letter-spacing:-.2px;box-shadow:inset 0 -3px 0 var(--red-dark)}}
.reveal .kicker{{font-family:var(--mono);font-weight:500;letter-spacing:.12em}}
/* Sin logotipos al pie, la fuente usa todo el ancho */
.reveal .src{{right:60px}}
.reveal .src::before{{font-family:var(--mono);font-weight:500;letter-spacing:.04em}}
.reveal .s-title h1,.reveal .s-divider h1{{font-family:var(--serif);font-weight:600;letter-spacing:-.4px}}
.reveal .s-title .t-sub{{color:var(--mid)}}
.reveal .s-divider .div-num{{color:var(--red);letter-spacing:-.02em}}
/* Tarjeta de fondo oscuro: tonos claros que se lean sobre navy */
.reveal .card.fill .kicker{{color:#B0BCD8}}
.reveal .card.fill .stat .lbl{{color:#DDE1E8}}
.reveal .card.fill .stat .num.light{{color:#B0BCD8}}
.reveal .card.fill .stat .num.alert{{color:#F1A9A0}}
/* Divisores: retícula de cuadros (concepto «Swiss Data Grid») en lugar de círculos */
.reveal .s-divider .circ{{border-radius:0}}
.reveal .s-divider .c1{{background:var(--mid)}}.reveal .s-divider .c2{{background:var(--red)}}.reveal .s-divider .c3{{background:var(--navy)}}
.reveal .card,.reveal img.fit{{box-shadow:none}}
.reveal .speaker img{{border-color:var(--gold);box-shadow:none}}
.reveal .speaker .role div{{border-left-color:var(--red)}}
.reveal ul li::marker{{color:var(--red)}}
.reveal .progress{{color:var(--red)}}
.reveal .slide-number{{font-family:var(--mono)}}
.reveal .slide-number a{{text-decoration:none}}
/* Portada: logotipo vertical del CA en lugar de la fotografía */
.reveal section.s-title .t-logo{{position:absolute;right:104px;top:118px;height:470px;width:auto}}
.reveal .slides section.chrome.s-title::before{{background:
  linear-gradient(var(--gold),var(--gold)) left 0 bottom 10px/100% 3px no-repeat,
  linear-gradient(var(--red),var(--red)) left 0 bottom 0/190px 10px no-repeat,
  linear-gradient(var(--inst),var(--inst)) left 0 bottom 0/100% 10px no-repeat}}
/* Regreso al sitio: solo si la plática se abre fuera del visor */
.volver-sitio{{display:none;position:fixed;top:10px;right:14px;z-index:40;font:500 12px/1 var(--mono);
  letter-spacing:.06em;text-transform:uppercase;color:var(--mid);background:rgba(255,255,255,.92);padding:6px 8px;text-decoration:none}}
.volver-sitio:hover{{color:var(--red)}}
html.sitio-top .volver-sitio{{display:block}}
html.print-pdf .volver-sitio,html.static .volver-sitio,body.guia-on .volver-sitio{{display:none!important}}
</style>
"""
HTML_VOLVER = (
    '<a class="volver-sitio" href="/herramientas#antimicrobianos" '
    'title="Volver a las herramientas del Cuerpo Académico">← Herramientas</a>\n'
    "<script>if (window.top === window.self) document.documentElement.classList.add('sitio-top');</script>\n"
)


def segmento(h: str, inicio: str, fin: str) -> tuple[int, int]:
    """Posición [a, b) del segmento que empieza en `inicio` y termina antes del primer `fin` posterior."""
    a = h.find(inicio)
    assert a >= 0 and h.count(inicio) == 1, f'inicio de segmento: {inicio[:40]!r}'
    b = h.find(fin, a + len(inicio))
    assert b > a, f'fin de segmento: {fin[:40]!r}'
    return a, b


def recolorear(s: str) -> str:
    s = re.sub(r'#[0-9a-fA-F]{6}\b', lambda m: PALETA.get(m.group(0).lower(), m.group(0)), s)
    for viejo, nuevo in RGBA.items():
        s = s.replace(viejo, nuevo)
    return s


def radios(css: str) -> str:
    def rep(m):
        return 'border-radius:' + re.sub(r'\d+px', lambda v: RADIOS.get(v.group(0), v.group(0)), m.group(1))
    return re.sub(r'border-radius:([^;}]+)', rep, css)


def fuentes(css: str) -> str:
    css, n = re.subn(r"@font-face\{font-family:'(?:Fira Sans|Montserrat)';[^}]*\}\n", '', css)
    assert n == 11, f'@font-face incrustadas: {n}'
    viejo = ("--title:'Avenir Next','Montserrat','Fira Sans',sans-serif;\n"
             "  --body:'Fira Sans','Avenir Next','Helvetica Neue',Arial,sans-serif;")
    assert css.count(viejo) == 1, 'variables de fuente'
    return css.replace(viejo, VARS_FUENTE, 1)


def marco(css: str) -> str:
    css, n = re.subn(r'background:url\(data:image/png;base64,[A-Za-z0-9+/=\s]+\) center/100% 100% no-repeat;', MARCO, css)
    assert n == 1, 'fondo PNG de la plantilla'
    css = css.replace('/* Plantilla HCO dentro de cada diapositiva', '/* Marco institucional dentro de cada diapositiva', 1)
    css = css.replace('/* ===== Identidad HCO (Hospital Civil de Guadalajara · Unidad Hospitalaria Hospital Civil de Oriente) ===== */',
                      '/* ===== Estilos del deck (retematizados por scripts/ram_publicar.py) ===== */', 1)
    return css


def portada(s: str) -> str:
    s, n = re.subn(r'<div class="hex-frame"></div>\s*<div class="hex" style="background-image:url\(data:image/jpeg;base64,[A-Za-z0-9+/=\s]+\)"></div>',
                   f'<img class="t-logo" src="{LOGO_V}" alt="Universidad de Guadalajara · Cuerpo Académico UDG-CA-1190">', s)
    assert n == 1, 'fotografía de la portada'
    return s


def svg_fuentes(s: str) -> str:
    s, n = re.subn(r'font-family="Fira Sans, sans-serif"', 'font-family="Inter, system-ui, sans-serif"', s)
    assert n == 2, f'diagramas SVG con Fira Sans: {n}'
    return s


def cifras(s: str) -> str:
    """Espacio no separable antes de «%» en las cifras grandes: con Inter, «14.6 %» se partía en dos líneas."""
    def rep(m):
        return m.group(1) + m.group(2).replace(' %', '&nbsp;%') + m.group(3)
    s, n = re.subn(r'(<span class="num[^"]*">)([^<]*)(</span>)', rep, s)
    assert n > 50, f'cifras grandes: {n}'
    return s


def notas(s: str) -> str:
    s, n = re.subn(r' El documento base completo \(366 referencias verificadas\) está en investigacion/RAM_investigacion_base\.md\.', '', s)
    assert n == 11, f'ruta local en las notas: {n}'
    return s


def scripts_propios(js: str) -> str:
    js = js.replace('"Fira Sans",Arial,sans-serif', '"Inter",system-ui,sans-serif').replace('"Fira Sans",Arial', '"Inter",system-ui,sans-serif')
    js = js.replace("Chart.defaults.font.family = \"'Fira Sans','Avenir Next',Arial,sans-serif\";",
                    f'Chart.defaults.font.family = "{FUENTE_SANS}";')
    # Panel de guía (tecla G): «al avanzar aparece» en dorado UdeG con texto navy; el tinte claro no daba contraste.
    assert js.count('#gp .nx{background:#63AFCB;color:#022B49;') == 1, 'aviso del panel de guía'
    js = js.replace('#gp .nx{background:#63AFCB;color:#022B49;', '#gp .nx{background:#FDCF85;color:#022B49;', 1)
    js = js.replace('/* Motor del deck: plantilla HCO + componentes interactivos (offline) */',
                    '/* Motor del deck: marco institucional + componentes interactivos */')
    js = js.replace('// Fondo institucional HCO en todas las diapositivas salvo las marcadas',
                    '// Marco institucional en todas las diapositivas salvo las marcadas')
    js = js.replace('// la plantilla HCO va dentro de la diapositiva y escala con ella',
                    '// el marco va dentro de la diapositiva y escala con ella')
    return js


def procedencia(h: str) -> str:
    aviso = ('<!-- Generado por scripts/ram_publicar.py a partir de RAM_platica_HCO_autocontenido.html '
             '(octubre de 2026). No editar a mano: regenerar. -->\n')
    assert h.startswith('<!doctype html>\n')
    return h.replace('<!doctype html>\n', '<!doctype html>\n' + aviso, 1)


def sin_datos(s: str) -> str:
    return re.sub(r'data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=\s]+', 'data:…', s)


def publicar(origen: Path, salida: Path) -> None:
    if not origen.is_file():
        sys.exit(f'No encuentro la plática en {origen}')
    h = origen.read_text(encoding='utf-8')

    # Segmentos propios del deck (de atrás hacia delante para no mover posiciones).
    a, b = segmento(h, '<script>\n/* Modo presentador con guía', '</html>')
    h = h[:a] + recolorear(scripts_propios(h[a:b])) + h[b:]
    a, b = segmento(h, '<div class="reveal">\n<div class="slides">', '<script>')
    h = h[:a] + recolorear(notas(cifras(svg_fuentes(portada(h[a:b]))))) + h[b:]
    a, b = segmento(h, '<style>\n  html,body{background:#fff}', '</style>')
    h = h[:a] + recolorear(h[a:b]) + h[b:]
    a, b = segmento(h, '<style>\n/* ===== Identidad HCO', '</style>')
    h = h[:a] + recolorear(radios(marco(fuentes(h[a:b])))) + h[b:]

    assert h.count('<title>Resistencia antimicrobiana — HCO</title>') == 1
    h = h.replace('<title>Resistencia antimicrobiana — HCO</title>', '<title>Resistencia antimicrobiana · UDG-CA-1190</title>', 1)
    vp = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    assert h.count(vp) == 1
    h = h.replace(vp, vp + '<link rel="stylesheet" href="/fonts/fonts.css">\n', 1)
    assert h.count('</head>\n<body>\n') == 1
    h = h.replace('</head>\n<body>\n', CSS_SITIO + '</head>\n<body>\n' + HTML_VOLVER, 1)

    texto = sin_datos(h)
    restos = [texto[max(0, m.start() - 60):m.end() + 30] for m in re.finditer(r'HCO|Fira Sans|Montserrat|Avenir', texto)]
    assert not restos, f'restos de la plantilla: {restos}'
    assert h.count('data:image/png') == 3 and h.count('data:image/jpeg') == 1, 'imágenes incrustadas'  # 2 iconos de reveal + OMS; foto del ponente
    restos = [c for c in PALETA if c in texto.lower()]
    # reveal.js y Chart.js no usan la paleta de la plantilla: cualquier resto es del deck
    assert not restos, f'colores sin trasladar: {restos}'
    h = procedencia(h)

    salida.mkdir(parents=True, exist_ok=True)
    destino = salida / 'index.html'
    destino.write_text(h, encoding='utf-8')
    print(f'index.html → {destino} · {destino.stat().st_size / 1e6:.2f} MB (origen {origen.stat().st_size / 1e6:.2f} MB)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--origen', type=Path, default=ORIGEN_DEFAULT)
    ap.add_argument('--salida', type=Path, default=SALIDA_DEFAULT)
    a = ap.parse_args()
    publicar(a.origen, a.salida)

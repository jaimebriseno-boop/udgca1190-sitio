#!/usr/bin/env python3
"""Retematiza los HTML de la sección «Laboratorio» (serie «Del tubo al diagnóstico»)
al sistema de diseño del sitio: paleta institucional UdeG/CEIC, fuentes locales
(Inter · Source Serif 4 · IBM Plex Mono servidas desde /fonts/), radios planos y
enlaces de ida y vuelta entre el índice y las tres herramientas.

Uso:
  python3 scripts/laboratorio_retematizar.py [--origen DIR] [--salida DIR]

--origen  carpeta con los cuatro HTML de trabajo (índice + 3 herramientas), tal
          como los produce la autora; los originales NO se modifican.
--salida  carpeta publicada (por defecto public/herramientas/laboratorio/app/).

Cada archivo generado lleva un comentario de procedencia. No se edita a mano:
ante un cambio en el origen, se vuelve a ejecutar este script.
"""
import argparse
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN_DEFAULT = Path(
    '/Users/judithcita/Library/CloudStorage/GoogleDrive-jcdearcosj@gmail.com/Mi unidad/'
    'INVESTIGACIÓN/INVESTIGACIÓN J-J/Jornadas Quimicas 2026/compartir/Materiales para los asistentes'
)
SALIDA_DEFAULT = RAIZ / 'public/herramientas/laboratorio/app'
URL_SECCION = 'https://udgca1190.com.mx/herramientas/laboratorio'

# nombre original → (archivo publicado, slug de la página Astro)
ARCHIVOS = {
    'Herramientas - Índice de la sección.html': ('index.html', ''),
    'Del tubo al diagnóstico - Consulta de biomarcadores.html': ('biomarcadores.html', 'biomarcadores'),
    'Intervalos de referencia - Verificar, establecer y transferir.html': ('intervalos-de-referencia.html', 'intervalos-de-referencia'),
    'Delta check - Comparar al paciente consigo mismo.html': ('delta-check.html', 'delta-check'),
}

# ---------------------------------------------------------------- paleta
# Paleta editorial original (papel cálido, ciruela, azul marino) → tokens UdeG
# (design/tokens/colors.json). Las tapas de tubo (.t-rojo, .t-amarillo…) y el
# verde de ORCID son semánticos y NO se tocan.
PALETA = {
    # superficies y tinta
    '#faf8f4': '#f7f8fa', '#191722': '#14181f', '#3f3c4a': '#4b5462', '#66626f': '#6b7585',
    '#d6d1c8': '#dde1e8', '#33303d': '#2f3641', '#2e2b38': '#2f3641', '#4a4655': '#4b5462',
    '#1f1c27': '#14181f', '#55515e': '#4b5462', '#6d6977': '#6b7585',
    '#f3efe8': '#eef0f4', '#f1ede7': '#e4e8ef', '#f2f0ec': '#eef0f4', '#fbfaf7': '#f7f8fa',
    '#efeae2': '#eef0f4', '#c3cedb': '#b0bcd8',
    # marca: ciruela → azul marino UdeG; enlaces → navy-700; acción → rojo UdeG
    '#5e2249': '#27334f', '#183050': '#455a8c', '#9a3a22': '#90303a',
    '#3f1531': '#1d2533', '#f0d9e6': '#b0bcd8', '#f3ecf0': '#e3e8f2',
    '#f3e6ee': '#edf1f8', '#e3c7d8': '#b0bcd8', '#4a2140': '#27334f', '#e8d5e0': '#b0bcd8',
    '#6b2d55': '#90303a',
    # semánticos: ok / aviso / error
    '#1f6f6a': '#1a6b42', '#e6f2f0': '#e7f2ec', '#bfe0da': '#bcd9c8', '#154b46': '#15532f',
    '#1f5f57': '#1a6b42',
    '#8a6d1f': '#8a5c0a', '#fdf6e4': '#fbf3dd', '#e8d9ae': '#ecd9a3', '#5c4a15': '#5c3d06',
    '#4a3a0d': '#4a3105', '#d99945': '#c9962e', '#8a5a12': '#8a5c0a', '#fdf5ea': '#fbf3dd',
    '#b25a1f': '#8a5c0a', '#fff4e8': '#fbf3dd', '#f0d3b3': '#ecd9a3', '#5a3a12': '#5c3d06',
    '#8f1d1d': '#a61e12', '#fbe9e7': '#fbeae8', '#efc4be': '#efc0bb', '#5a1b1b': '#6d150c',
    '#a8442a': '#9a2c1c', '#f8e9e3': '#fbeae8', '#f7e4de': '#fbeae8',
    # etapas analíticas (pre / ana / post) e índice
    '#1f3a5f': '#36476e', '#e8edf4': '#edf1f8', '#eef1f5': '#edf1f8', '#3a4a8a': '#455a8c',
}
RGBA = {
    'rgba(250,248,244,.96)': 'rgba(247,248,250,.96)', 'rgba(253,252,250,.96)': 'rgba(247,248,250,.96)',
    'rgba(62,21,49,.25)': 'rgba(39,51,79,.25)', 'rgba(94,34,73,.35)': 'rgba(39,51,79,.35)',
    'rgba(107,45,85,.35)': 'rgba(39,51,79,.35)', 'rgba(25,23,34,.5)': 'rgba(20,24,31,.5)',
    'rgba(34,32,43,.45)': 'rgba(20,24,31,.45)',
}
# Radios: el sistema del sitio es plano (4–6 px); las píldoras (20/30 px, 50 %) se conservan.
RADIOS = {'16': '6', '14': '6', '12': '6', '10': '4', '8': '4', '7': '4', '6': '4', '5': '3', '4': '3', '3': '2'}

FUENTES_LOCALES = '<link rel="stylesheet" href="/fonts/fonts.css">'
VARS_FUENTE = ('--f-serif:"Source Serif 4",Georgia,serif; '
               '--f-sans:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif; '
               '--f-mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;')
CSS_VOLVER_TOP = (
    '.top .volver{font-family:var(--f-mono); font-size:.64rem; letter-spacing:.1em; text-transform:uppercase; '
    'color:var(--tenue); text-decoration:none; white-space:nowrap; padding:.3rem .6rem .3rem 0; margin-right:.4rem; '
    'border-right:1px solid var(--linea)}\n.top .volver:hover{color:var(--accion)}\n'
)
CSS_VOLVER_CAB = (
    '.cab .volver{display:inline-block; font-family:var(--f-mono); font-size:.62rem; letter-spacing:.1em; '
    'text-transform:uppercase; color:var(--tenue); text-decoration:none; margin-bottom:.55rem}\n'
    '.cab .volver:hover{color:var(--accion)}\n'
)


def fuentes(h: str) -> str:
    """Google Fonts → fuentes locales del sitio; Petrona → Source Serif 4; Plex Sans → Inter."""
    h = re.sub(r'<link rel="preconnect" href="https://fonts\.g(?:oogleapis|static)\.com"[^>]*>\n?', '', h)
    h = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]+">', FUENTES_LOCALES, h)
    h = h.replace('"Petrona",Georgia,serif', '"Source Serif 4",Georgia,serif')
    h = h.replace('font-family:Petrona,Georgia,serif', 'font-family:var(--f-serif)')  # dentro de cadenas JS
    h = h.replace('font-family="Petrona, Georgia, serif"', 'font-family="\'Source Serif 4\', Georgia, serif"')  # atributos SVG
    h = h.replace('"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif',
                  '"Inter",system-ui,-apple-system,"Segoe UI",sans-serif')
    h = h.replace('"IBM Plex Sans",sans-serif', '"Inter",sans-serif')
    h = h.replace("'IBM Plex Sans',sans-serif", "'Inter',sans-serif")
    h = h.replace('font-family="IBM Plex Sans, sans-serif"', 'font-family="Inter, sans-serif"')
    h = h.replace(':root{\n', ':root{\n  ' + VARS_FUENTE + '\n', 1)
    return h


def paleta(h: str) -> str:
    def hexrep(m):
        return PALETA.get(m.group(0).lower(), m.group(0))
    h = re.sub(r'#[0-9a-fA-F]{6}\b', hexrep, h)
    for k, v in RGBA.items():
        h = h.replace(k, v)
    return h


def radios(h: str) -> str:
    return re.sub(r'border-radius:\s*(\d+)px', lambda m: 'border-radius:' + RADIOS.get(m.group(1), m.group(1)) + 'px', h)


def arte_dorado(h: str) -> str:
    """El amarillo de la ilustración del hero pasa al dorado institucional (solo ahí:
    en las gráficas y las tapas de tubo el amarillo es semántico)."""
    return re.sub(r'(<div class="arte"[^>]*>)(.*?)(</svg>\s*</div>)',
                  lambda m: m.group(1) + m.group(2).replace('#e6c02e', '#FDCF85') + m.group(3), h, count=1, flags=re.S)


def procedencia(h: str, original: str) -> str:
    aviso = (f'<!-- Generado por scripts/laboratorio_retematizar.py a partir de «{original}» '
             '(serie «Del tubo al diagnóstico», v2.0, septiembre de 2026). No editar a mano: regenerar. -->\n')
    return h.replace('<!doctype html>\n', '<!doctype html>\n' + aviso, 1)


def comun(h: str, original: str) -> str:
    h = fuentes(h)
    h = paleta(h)
    h = radios(h)
    h = arte_dorado(h)
    h = procedencia(h, original)
    return h


# ---------------------------------------------------------------- herramientas
def herramienta(h: str, slug: str) -> str:
    """Delta check e Intervalos: enlace de vuelta al índice y URL canónica en la cita."""
    h = h.replace('<nav class="top"><div class="in">\n  <a class="marca"',
                  '<nav class="top"><div class="in">\n  <a class="volver" href="index.html" '
                  'title="Volver al índice de la sección Laboratorio">← Laboratorio</a>\n  <a class="marca"', 1)
    assert 'class="volver"' in h, slug
    h = h.replace('.top a.n:hover{', CSS_VOLVER_TOP + '.top a.n:hover{', 1)
    h = h.replace('Disponible en la página del cuerpo académico.', f'Disponible en: {URL_SECCION}/{slug}')
    return h


def biomarcadores(h: str, slug: str) -> str:
    """Consulta de biomarcadores (app con barra lateral): enlace de vuelta en la cabecera."""
    h = h.replace('<div class="cab">\n    <a class="inicio"',
                  '<div class="cab">\n    <a class="volver" href="index.html" '
                  'title="Volver al índice de la sección Laboratorio">← Laboratorio</a>\n    <a class="inicio"', 1)
    assert 'class="volver"' in h, slug
    h = h.replace('.cab a.inicio{', CSS_VOLVER_CAB + '.cab a.inicio{', 1)
    h = h.replace('Disponible en la página del cuerpo académico.', f'Disponible en: {URL_SECCION}/{slug}')
    return h


# ---------------------------------------------------------------- índice
ARTE_INDICE = '''<svg viewBox="0 0 520 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tres tubos de muestra y una distribución de referencia: laboratorio clínico">
      <ellipse cx="260" cy="150" rx="250" ry="125" fill="#fff" fill-opacity=".06"/>
      <!-- distribución de referencia -->
      <path d="M300,215 C340,213 360,205 380,180 C400,150 410,80 430,80 C450,80 460,150 480,180 C500,205 505,213 510,215" fill="none" stroke="#FDCF85" stroke-width="3" stroke-linecap="round"/>
      <line x1="300" y1="215" x2="510" y2="215" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>
      <line x1="372" y1="120" x2="372" y2="215" stroke="#fff" stroke-opacity=".6" stroke-dasharray="5 4"/>
      <line x1="488" y1="120" x2="488" y2="215" stroke="#fff" stroke-opacity=".6" stroke-dasharray="5 4"/>
      <text x="372" y="110" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#e3e8f2">2.5</text>
      <text x="488" y="110" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#e3e8f2">97.5</text>
      <!-- tubos: EDTA (lila), suero (amarillo), citrato (azul) -->
      <g transform="translate(60,62)"><rect x="-10" y="-8" width="44" height="18" rx="6" fill="#8e6bbf"/><path d="M-4,10 h32 v110 a16,16 0 0 1 -32,0 z" fill="#fff" fill-opacity=".14" stroke="#fff" stroke-opacity=".85" stroke-width="2"/><path d="M-4,54 h32 v66 a16,16 0 0 1 -32,0 z" fill="#a61e12"/><rect x="2" y="16" width="5" height="80" rx="2" fill="#fff" opacity=".5"/></g>
      <g transform="translate(140,62)"><rect x="-10" y="-8" width="44" height="18" rx="6" fill="#e6c02e"/><path d="M-4,10 h32 v110 a16,16 0 0 1 -32,0 z" fill="#fff" fill-opacity=".14" stroke="#fff" stroke-opacity=".85" stroke-width="2"/><path d="M-4,40 h32 v40 a0,0 0 0 1 0,0 v0 h-32 z" fill="#f2dc74" fill-opacity=".9"/><path d="M-4,80 h32 v40 a16,16 0 0 1 -32,0 z" fill="#a61e12"/><rect x="2" y="16" width="5" height="80" rx="2" fill="#fff" opacity=".5"/></g>
      <g transform="translate(220,62)"><rect x="-10" y="-8" width="44" height="18" rx="6" fill="#2f6fd6"/><path d="M-4,10 h32 v110 a16,16 0 0 1 -32,0 z" fill="#fff" fill-opacity=".14" stroke="#fff" stroke-opacity=".85" stroke-width="2"/><path d="M-4,60 h32 v60 a16,16 0 0 1 -32,0 z" fill="#a61e12"/><rect x="2" y="16" width="5" height="80" rx="2" fill="#fff" opacity=".5"/></g>
      <text x="152" y="225" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#fff">preanalítica · analítica · postanalítica</text>
      <text x="260" y="262" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" fill="#e3e8f2">funcionan en el navegador · los datos no salen de tu equipo</text>
    </svg>'''

NAV_INDICE = '''<nav class="top"><div class="in">
  <a class="marca" href="#inicio">Laboratorio</a>
  <a class="n" href="#herramientas">Herramientas</a><a class="n" href="#como">Cómo usar</a><a class="n" href="#quienes">Quiénes</a><a class="n" href="#legal">Aviso legal</a>
  <a class="n" href="/herramientas" target="_top" title="Todas las herramientas del Cuerpo Académico">Todas las herramientas ↗</a>
</div></nav>'''

HERO_INDICE = '''<div class="hero">
  <div>
    <p class="lema">“Del tubo al diagnóstico”</p>
    <h1>Herramientas de laboratorio clínico</h1>
    <p class="baj"><b>Cuerpo Académico UDG-CA-1190 · Centro Universitario de Tlajomulco, Universidad de Guadalajara.</b> Calculadoras, guías y materiales de consulta para el laboratorio clínico: verificación de resultados, intervalos de referencia, preanalítica, calidad analítica y consulta de biomarcadores. Cada tarjeta dice qué pregunta responde, para quién es y qué necesitas para usarla. Todas funcionan en el navegador; las que capturan datos los procesan en tu equipo y no los envían a ningún servidor.</p>
  </div>
  <div class="arte">
    ''' + ARTE_INDICE + '''
  </div>
</div>'''

SCRIPT_INDICE = r'''<script>
/* buscador y filtros: sin dependencias, solo muestra u oculta tarjetas */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var tarjetas = Array.prototype.slice.call(document.querySelectorAll('.tj'));
  function norm(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function filtrar(){
    var q = norm($('q').value.trim()), per = $('fperfil').value, est = $('festado').value, vis = 0;
    tarjetas.forEach(function(t){
      var ok = true;
      if(per && (t.getAttribute('data-perfil') || '').split(/\s+/).indexOf(per) < 0) ok = false;
      if(est && t.getAttribute('data-estado') !== est) ok = false;
      if(q){ var texto = norm(t.textContent + ' ' + (t.getAttribute('data-texto') || '')); if(texto.indexOf(q) < 0) ok = false; }
      t.classList.toggle('oculta', !ok); if(ok) vis++;
    });
    $('vacio').classList.toggle('oculta', vis > 0);
    var total = tarjetas.filter(function(t){ return t.getAttribute('data-estado') !== 'pronto'; }).length;
    var pronto = tarjetas.length - total;
    $('conteo').textContent = (q || per || est)
      ? vis + ' resultado' + (vis === 1 ? '' : 's')
      : total + ' herramienta' + (total === 1 ? '' : 's') + ' disponible' + (total === 1 ? '' : 's') + (pronto ? ' · ' + pronto + ' en preparación' : '');
  }
  ['q','fperfil','festado'].forEach(function(id){ $(id).addEventListener('input', filtrar); $(id).addEventListener('change', filtrar); });
  filtrar();
})();
</script>'''


def indice(h: str) -> str:
    """El índice general de tres categorías pasa a ser el índice de la sección Laboratorio."""
    h = h.replace('<title>Herramientas · Cuerpo Académico UDG-CA-1190</title>',
                  '<title>Laboratorio · Herramientas · Cuerpo Académico UDG-CA-1190</title>')
    h = re.sub(r'<meta name="description" content="[^"]*">',
               '<meta name="description" content="Herramientas de laboratorio clínico del Cuerpo Académico UDG-CA-1190: '
               'consulta de 60 biomarcadores, intervalos de referencia y delta check. Funcionan en el navegador; '
               'los datos no salen de tu equipo.">', h, count=1)
    # barra superior y hero
    h, n = re.subn(r'<nav class="top">.*?</nav>', lambda m: NAV_INDICE, h, count=1, flags=re.S); assert n == 1
    h, n = re.subn(r'<div class="hero">.*?</svg>\s*</div>\s*</div>', lambda m: HERO_INDICE, h, count=1, flags=re.S); assert n == 1
    # filtros: una sola categoría → desaparece el selector
    h, n = re.subn(r'\s*<div><label for="fcat">.*?</select></div>', '', h, count=1, flags=re.S); assert n == 1
    h = h.replace('.busca{background:#fff; border:1px solid var(--linea); border-radius:6px; padding:1rem 1.2rem; margin:0 0 1.4rem; display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr;',
                  '.busca{background:#fff; border:1px solid var(--linea); border-radius:6px; padding:1rem 1.2rem; margin:0 0 1.4rem; display:grid; grid-template-columns:1.6fr 1fr 1fr;')
    assert 'grid-template-columns:1.6fr 1fr 1fr' in h
    # categorías Epidemiología y Escalas («Próximamente») viven en el sitio principal
    h, n = re.subn(r'\n<!-- ═+ EPIDEMIOLOGÍA ═+ -->.*?</section>\n', '\n', h, count=1, flags=re.S); assert n == 1
    h, n = re.subn(r'\n<!-- ═+ ESCALAS ═+ -->.*?</section>\n', '\n', h, count=1, flags=re.S); assert n == 1
    h = h.replace('<section class="cat lab" id="lab">\n  <h2><small>Categoría 1</small>Laboratorio</h2>',
                  '<section class="cat lab" id="herramientas">\n  <h2><small>Sección Laboratorio</small>Herramientas disponibles</h2>')
    assert 'id="herramientas"' in h
    h = h.replace('data-cat="lab|epi|esc"', 'data-cat="lab"')
    # color de la sección: navy-700 del sistema (el verde queda para los estados «lista»)
    h = h.replace('--lab:#1a6b42; --lab-suave:#e7f2ec;', '--lab:#455a8c; --lab-suave:#edf1f8;')
    assert '--lab:#455a8c' in h
    # enlaces a las herramientas publicadas
    for original, (publicado, _) in ARCHIVOS.items():
        if publicado != 'index.html':
            h = h.replace(f'href="{original}', f'href="{publicado}')
    assert 'href="archivo.html"' in h  # la plantilla comentada se conserva
    # cita de la sección con URL canónica
    h = h.replace('Universidad de Guadalajara; 2026. Cada herramienta tiene su propia cita en su página.',
                  f'Universidad de Guadalajara; 2026. Disponible en: {URL_SECCION}. Cada herramienta tiene su propia cita en su página.')
    # script de filtros sin el selector de categoría
    h, n = re.subn(r'<script>.*?</script>', lambda m: SCRIPT_INDICE, h, count=1, flags=re.S); assert n == 1
    return h


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--origen', type=Path, default=ORIGEN_DEFAULT)
    ap.add_argument('--salida', type=Path, default=SALIDA_DEFAULT)
    a = ap.parse_args()
    if not a.origen.is_dir():
        print(f'No existe la carpeta de origen: {a.origen}', file=sys.stderr)
        return 1
    a.salida.mkdir(parents=True, exist_ok=True)
    for original, (publicado, slug) in ARCHIVOS.items():
        ruta = a.origen / original
        h = ruta.read_text(encoding='utf-8')
        if publicado == 'index.html':
            h = comun(h, original)
            h = indice(h)
        elif publicado == 'biomarcadores.html':
            h = comun(h, original)
            h = biomarcadores(h, slug)
        else:
            h = comun(h, original)
            h = herramienta(h, slug)
        for prohibido in ('fonts.googleapis', 'fonts.gstatic', 'Petrona', 'IBM Plex Sans'):
            assert prohibido not in h, f'{publicado}: queda «{prohibido}»'
        assert '/fonts/fonts.css' in h, publicado
        (a.salida / publicado).write_text(h, encoding='utf-8')
        print(f'{publicado:<28} {len(h.encode("utf-8")):>10,} bytes  ← {original}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

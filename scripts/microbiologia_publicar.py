#!/usr/bin/env python3
"""Publica el material «Diagnóstico microbiológico médico» (Microbiología I, I8581)
en public/herramientas/diagnostico-microbiologico/app/ a partir de la carpeta de
trabajo de los autores en Google Drive. Los originales NO se modifican.

Uso:
  python3 scripts/microbiologia_publicar.py [--origen DIR] [--salida DIR]

Transformaciones sobre index.html (cada una se comprueba con assert):
  - Google Fonts → fuentes locales del sitio (/fonts/fonts.css): Petrona → Source
    Serif 4 e IBM Plex Sans → Inter; IBM Plex Mono se conserva.
  - Se retira del HTML publicado la clave docente en texto plano: cualquiera
    puede leer el código fuente de una página pública, y con la clave y la URL de
    Apps Script se descargaría el concentrado de calificaciones (datos
    personales). La clave se comparte al profesorado por otro canal.
  - Carga diferida de las fotografías (loading="lazy"), salvo la de portada.
  - PNG sin transparencia → JPEG (neisseria-plate.png pesa 1.2 MB).
  - Cita con la URL canónica y enlace «← Herramientas» en la barra superior.
  - Comentario de procedencia al inicio del archivo.

Ante un cambio de los autores en el material, se vuelve a ejecutar este script.
No se copian README.txt, registro_apps_script.gs ni test-results/.
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN_DEFAULT = Path(
    '/Users/judithcita/Library/CloudStorage/GoogleDrive-jcdearcosj@gmail.com/Mi unidad/'
    'INVESTIGACIÓN/INVESTIGACIÓN J-J/Diagnostico_microbiologico_presentacion'
)
SALIDA_DEFAULT = RAIZ / 'public/herramientas/diagnostico-microbiologico/app'
URL_CANONICA = 'https://udgca1190.com.mx/herramientas/diagnostico-microbiologico'
EXTENSIONES_IMAGEN = {'.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'}

CSS_VOLVER = (
    '.topbar .volver{font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;'
    'color:#cfc6dd;text-decoration:none;white-space:nowrap;border-left:1px solid rgba(255,255,255,.25);padding-left:12px}\n'
    '.topbar .volver:hover{color:#fff}\n'
    '@media (max-width:700px){.topbar .volver{display:none}}\n'
)
HTML_VOLVER = ('  <a class="volver" href="/herramientas" target="_top" '
               'title="Volver a las herramientas del Cuerpo Académico">← Herramientas</a>\n')


def fuentes(h: str) -> str:
    h = re.sub(r'<link rel="preconnect" href="https://fonts\.g(?:oogleapis|static)\.com"[^>]*>\n?', '', h)
    h, n = re.subn(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]+">',
                   '<link rel="stylesheet" href="/fonts/fonts.css">', h)
    assert n == 1, 'hoja de Google Fonts'
    h = h.replace('"Petrona"', '"Source Serif 4"').replace("'Petrona'", "'Source Serif 4'").replace('Petrona,', 'Source Serif 4,')
    h = h.replace('"IBM Plex Sans"', '"Inter"').replace("'IBM Plex Sans'", "'Inter'").replace('IBM Plex Sans,', 'Inter,')
    assert 'Petrona' not in h and 'Plex Sans' not in h and 'fonts.googleapis' not in h and 'fonts.gstatic' not in h
    assert '"IBM Plex Mono"' in h  # la monoespaciada sí existe localmente
    return h


def sin_clave(h: str) -> str:
    h, n = re.subn(r' Clave configurada: <code>[^<]+</code>\.', '', h)
    assert n == 1, 'clave docente'
    assert 'Cutlajo' not in h
    return h


def imagenes_diferidas(h: str) -> str:
    vistas = [0]

    def rep(m):
        vistas[0] += 1
        if vistas[0] == 1:  # portada: se carga de inmediato
            return m.group(0)
        return '<img loading="lazy" decoding="async" ' + m.group(0)[len('<img '):]

    h = re.sub(r'<img (?![^>]*loading=)', rep, h)
    assert vistas[0] > 60, vistas[0]
    return h


def cita(h: str) -> str:
    h, n = re.subn(r'Disponible en la página del cuerpo académico\.', f'Disponible en: {URL_CANONICA}', h)
    assert n == 1, 'cita'
    return h


def volver(h: str) -> str:
    marca = '  <a class="marca" href="#portada">Diagnóstico microbiológico</a>\n'
    assert h.count(marca) == 1, 'marca de la barra superior'
    h = h.replace(marca, marca + HTML_VOLVER, 1)
    regla = '.topbar .mod{color:#cfc6dd;flex:1;'
    assert h.count(regla) == 1, 'regla .topbar .mod'
    h = h.replace(regla, CSS_VOLVER + regla, 1)
    return h


def procedencia(h: str) -> str:
    aviso = ('<!-- Generado por scripts/microbiologia_publicar.py a partir de la carpeta de trabajo '
             '«Diagnostico_microbiologico_presentacion» (v2.1, septiembre de 2026). No editar a mano: regenerar. -->\n')
    assert h.startswith('<!doctype html>\n')
    return h.replace('<!doctype html>\n', '<!doctype html>\n' + aviso, 1)


def convertir_png(origen: Path, destino: Path) -> bool:
    """PNG opaco → JPEG (calidad 88, progresivo). Devuelve True si se convirtió."""
    from PIL import Image
    with Image.open(origen) as im:
        if im.mode in ('RGBA', 'LA') or 'transparency' in im.info:
            return False
        im.convert('RGB').save(destino.with_suffix('.jpg'), 'JPEG', quality=88, optimize=True, progressive=True)
    return True


def publicar(origen: Path, salida: Path) -> None:
    html = origen / 'index.html'
    activos = origen / 'assets'
    if not html.is_file() or not activos.is_dir():
        sys.exit(f'No encuentro index.html y assets/ en {origen}')
    if salida.exists():
        shutil.rmtree(salida)
    (salida / 'assets').mkdir(parents=True)

    h = html.read_text(encoding='utf-8')
    h = fuentes(h)
    h = sin_clave(h)
    h = imagenes_diferidas(h)
    h = cita(h)
    h = volver(h)
    h = procedencia(h)

    copiadas = convertidas = 0
    for f in sorted(activos.iterdir()):
        if not f.is_file() or f.name.startswith('.') or f.suffix.lower() not in EXTENSIONES_IMAGEN:
            continue
        if f.suffix.lower() == '.png' and convertir_png(f, salida / 'assets' / f.name):
            h = h.replace(f'assets/{f.name}', f'assets/{f.stem}.jpg')
            assert f'assets/{f.name}' not in h
            convertidas += 1
        else:
            shutil.copy2(f, salida / 'assets' / f.name)
            copiadas += 1

    # todas las referencias a assets/ deben existir en la salida
    faltan = sorted({r for r in re.findall(r'assets/([^"\')\s]+)', h) if not (salida / 'assets' / r).is_file()})
    assert not faltan, faltan

    (salida / 'index.html').write_text(h, encoding='utf-8')
    total = sum(p.stat().st_size for p in salida.rglob('*') if p.is_file())
    print(f'index.html → {salida / "index.html"}')
    print(f'assets: {copiadas} copiadas, {convertidas} PNG→JPEG · {total / 1e6:.1f} MB en total')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--origen', type=Path, default=ORIGEN_DEFAULT)
    ap.add_argument('--salida', type=Path, default=SALIDA_DEFAULT)
    a = ap.parse_args()
    publicar(a.origen, a.salida)

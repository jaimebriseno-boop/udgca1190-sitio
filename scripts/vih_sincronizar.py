#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publica la clase «VIH/SIDA 2026» dentro de la herramienta de Virología.

La clase se edita y se ensambla fuera de este repositorio (carpeta
«Clases /Infecto/platica_vih» de Google Drive, `python3 fuente/build.py`), que produce un único HTML con imágenes y
fuentes incrustadas en base64 (~2.2 MB). Este script toma ese HTML ya
ensamblado y genera la copia del sitio:

  public/herramientas/virologia/app/temas/vih-sida-2026/
    index.html          diapositivas, estilos y motor sin cambios
    assets/img/*.webp   imágenes devueltas a archivo
    assets/fonts/*.woff2

Devolver imágenes y fuentes a archivo deja el HTML en unos cientos de KB: el
motor de la presentación arranca sin esperar a que lleguen ~2 MB y cada imagen
se descarga en paralelo y queda en caché. Lo único que se añade es el enlace
«← Virología» en la barra de controles. No se reescribe ninguna diapositiva.

Uso:
  python3 fuente/build.py                       # en la carpeta de la clase
  python3 scripts/vih_sincronizar.py ["<carpeta de la clase>"]

Idempotente: borra solo las imágenes y fuentes que dejó de usar la clase.
"""
import base64
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN_POR_OMISION = Path('/Volumes/Bioinformatics/GoogleDrive-jaime.briseno@academicos.udg.mx'
                          '/Clases /Infecto/platica_vih')
DESTINO = RAIZ / 'public/herramientas/virologia/app/temas/vih-sida-2026'

# Enlace de regreso al índice de Virología, como primer control de la barra.
# El motor construye la barra en DOMContentLoaded; este oyente se registra
# después que el suyo, así que se ejecuta cuando la barra ya existe.
ESTILO_REGRESO = """<style>
.hud .hud-back { font-family:var(--mono); font-size:11.5px; letter-spacing:.12em; text-transform:uppercase;
  background:var(--card); color:var(--muted); border:1px solid var(--rule); border-radius:999px;
  padding:6px 11px; text-decoration:none; line-height:normal; }
.hud .hud-back:hover, .hud .hud-back:focus-visible { color:var(--navy); border-color:var(--navy); }
</style>
"""
SCRIPT_REGRESO = """<script>
document.addEventListener('DOMContentLoaded', function () {
  var hud = document.querySelector('.hud');
  if (!hud || hud.querySelector('.hud-back')) return;
  var a = document.createElement('a');
  a.className = 'hud-back';
  a.href = '../../index.html';
  a.title = 'Volver al índice de Virología';
  a.textContent = '← Virología';
  hud.insertBefore(a, hud.firstChild);
});
</script>
"""

DATA_URI = re.compile(r'data:([a-z]+/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)')


def main():
    origen = Path(sys.argv[1]) if len(sys.argv) > 1 else ORIGEN_POR_OMISION
    html_path = origen / 'VIH-SIDA-2026.html'
    fuente = origen / 'fuente'
    if not html_path.is_file():
        sys.exit(f'✗ No existe {html_path}. Ejecuta antes «python3 fuente/build.py» en la carpeta de la clase.')

    # Aviso si alguna pieza de la clase es más reciente que el HTML ensamblado.
    t_html = html_path.stat().st_mtime
    piezas = [fuente / 'engine.css', fuente / 'engine.js']
    for sub in ('slides', 'css', 'js', 'assets/img'):
        piezas += [p for p in (fuente / sub).glob('*') if p.is_file() and not p.name.startswith('.')]
    nuevas = sorted(p.relative_to(fuente).as_posix() for p in piezas if p.is_file() and p.stat().st_mtime > t_html)
    if nuevas:
        print('⚠ Cambiaron después del último build.py (se publica la versión ensamblada):', ', '.join(nuevas))

    # base64 → nombre de archivo, para cada imagen y fuente de la clase.
    catalogo = {}
    for sub, patron in (('img', '*'), ('fonts', '*.woff2')):
        for p in sorted((fuente / 'assets' / sub).glob(patron)):
            if p.is_file() and not p.name.startswith('.'):
                catalogo[base64.b64encode(p.read_bytes()).decode('ascii')] = (sub, p)

    html = html_path.read_text(encoding='utf-8')
    usados, sin_archivo = {}, 0

    def devolver(m):
        nonlocal sin_archivo
        hit = catalogo.get(m.group(2))
        if not hit:
            sin_archivo += 1
            return m.group(0)
        sub, p = hit
        usados[(sub, p.name)] = p
        return f'assets/{sub}/{p.name}'

    salida = DATA_URI.sub(devolver, html)
    if salida.count('</head>') != 1 or salida.count('</body>') != 1:
        sys.exit('✗ El HTML no tiene exactamente un </head> y un </body>; revisa build.py.')
    salida = salida.replace('</head>', ESTILO_REGRESO + '</head>', 1)
    salida = salida.replace('</body>', SCRIPT_REGRESO + '</body>', 1)

    # Escritura: index.html + archivos usados; se retiran los que ya no se usan.
    for sub in ('img', 'fonts'):
        (DESTINO / 'assets' / sub).mkdir(parents=True, exist_ok=True)
    (DESTINO / 'index.html').write_text(salida, encoding='utf-8')
    for (sub, nombre), p in usados.items():
        destino = DESTINO / 'assets' / sub / nombre
        datos = p.read_bytes()
        if not destino.is_file() or destino.read_bytes() != datos:
            destino.write_bytes(datos)
    retirados = []
    for sub, patron in (('img', '*'), ('fonts', '*.woff2')):
        for p in (DESTINO / 'assets' / sub).glob(patron):
            if p.is_file() and not p.name.startswith('.') and (sub, p.name) not in usados:
                p.unlink()
                retirados.append(f'{sub}/{p.name}')

    secciones = re.findall(r'<section\b[^>]*class="([^"]*\bslide\b[^"]*)"', salida)
    deep = sum(1 for c in secciones if re.search(r'\bdeep\b', c))
    peso = sum(p.stat().st_size for p in usados.values())
    print(f'✓ {DESTINO.relative_to(RAIZ)}/index.html')
    print(f'  diapositivas: {len(secciones)} (principales {len(secciones) - deep} · profundizar {deep})')
    print(f'  HTML: {len(html.encode()) / 1e6:.2f} MB → {len(salida.encode()) / 1e6:.2f} MB'
          f' · archivos: {sum(1 for k in usados if k[0] == "img")} imágenes,'
          f' {sum(1 for k in usados if k[0] == "fonts")} fuentes ({peso / 1e6:.2f} MB)')
    if retirados:
        print('  retirados (ya no los usa la clase):', ', '.join(sorted(retirados)))
    if sin_archivo:
        print(f'  ⚠ {sin_archivo} recursos incrustados no coinciden con ningún archivo de fuente/assets y se dejaron en línea')


if __name__ == '__main__':
    main()

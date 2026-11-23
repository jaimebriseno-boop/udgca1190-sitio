# Handoff — equipo nuevo y plática «Uso racional de los antibióticos»

Fecha: 2026-11-23. Repositorio: `/home/jaibri/Projects/UDG-CA-1190` (Linux aarch64).
Handoffs anteriores: [Virología, tema «VIH/SIDA 2026»](docs/virologia/HANDOFF.md)
(2026-11-05) y [propedéutica](SESSION_HANDOFF.md) (2026-09-16). Panorama general en
[PROGRESS.md](PROGRESS.md); cada frente tiene su `docs/<frente>/PROGRESO.md`.

## Objetivo de la sesión

1. **Mudanza del proyecto.** El usuario copió el repositorio del disco externo exFAT
   (`/run/media/jaibri/ADATA SC750/Respaldo_Jaibri_310326/Programacion/UDG-CA-1190`) a
   `~/Projects/UDG-CA-1190`. Esa copia es la de trabajo: **no volver a trabajar en el
   disco externo**.
2. **Actualizar la plática de resistencia antimicrobiana** del sitio con la versión más
   reciente del autor, «solo quitando los logos de Civil de Oriente y usando el diseño de
   la página de CA 1190». Se cumplió: está publicada y cotejada en producción.

## Estado actual

- `main` = `origin/main`. Implementación: `b13d91c`, desplegada por Vercel. El commit de
  este handoff va después.
- Página: <https://udgca1190.com.mx/herramientas/resistencia-antimicrobiana> (y `/en/…`).
  Títulos servidos: «Uso racional de los antibióticos · UDG-CA-1190» y «Rational use of
  antibiotics · UDG-CA-1190».
- Plática servida idéntica byte a byte a la local:
  `public/herramientas/resistencia-antimicrobiana/app/index.html`, SHA-256
  `031f2b65657e318409db722e24bd955259b17014a082d18dfd7763dd2a806967` (0.88 MB).
- Verificación local: `npm run check` 0 errores y 0 advertencias; `npm run build`
  79 páginas; `npm run test` 1847 pruebas correctas (4 + 1833 + 10).

## Qué se hizo (plática)

Origen, sin modificar:
`/home/jaibri/Cloud/gdrive/Clases /Infecto/Platica resistencia antimicrobiana/sesion_general_hospitalaria/RAM_sesion_general_autocontenido.html`
(SHA-256 `4218260b90cc317cd734a7cb3831abaf281980d3b639225d3c62d725d7996e14`). Es la
versión de 40 minutos para la Sesión General Académica del 19-nov-2026: 34 diapositivas,
3 de respaldo y 13 de referencias (50), 178 referencias, superíndices con clic, contador
y guía del ponente (tecla G). Copia de trabajo en `herramientas/Resistencia_antimicrobiana/`
(ignorada por Git).

| Archivo | Cambio |
|---|---|
| `scripts/ram_publicar.py` | Adaptado al HTML nuevo (la versión de 68 diapositivas se publicó con este script en `cc84219`). El segmento de scripts propios empieza ahora en `/* ?tab=N`; la fuente de la ventana de citas pasa a Inter; `#9ad4e8`→dorado y `#cfe6f0`→gris claro (contador y ventana de citas sobre navy); número de la cita en dorado; radios planos; `&nbsp;%` también en `.ba .a/.b`; `#stepind` recorrido a 92 px para no encimarse con el número de diapositiva en IBM Plex Mono; se quitan de las notas las 14 menciones a `RAM_sesion_general_referencias.md` (archivo local del autor que no se publica). Cada transformación tiene su `assert`. |
| `public/herramientas/resistencia-antimicrobiana/app/index.html` | Regenerado (determinista). |
| `src/i18n.mjs` (`ram.*`, es/en) | Título «Uso racional de los antibióticos», intro, meta, nota de uso (G y citas con clic), «Sobre la plática» y «Cómo citar». |
| `data/herramientas.yml`, `data/i18n/en.yml` | Tarjeta `ram-introduccion`: nombre, resumen y descripción. |
| `docs/antimicrobianos/PROGRESO.md`, `README.md`, `PROGRESS.md` | Documentan la actualización. |

Se conservan como **texto** (no son logotipos, mismo criterio que en octubre):
«Sesión General Académica · Hospital Civil de Oriente» en la portada y «Director del
Hospital Civil de Oriente» en la portada y en «¡Gracias!».

## Qué funcionó

- **Reutilizar `ram_publicar.py`.** La versión nueva usa la misma plantilla HCO
  (`../presentacion/assets/css/hco.css` y `deck.js`), así que el marco, la paleta, las
  fuentes y la portada salieron casi sin cambios. Los `assert` señalaron exactamente qué
  había cambiado (segmentos, conteos de SVG, cifras, notas, título, imágenes).
- **Revisión visual con Chromium sin interfaz** (`/usr/bin/chromium --headless=new
  --screenshot … ?static#/N`) y hojas de contacto con `montage` (ImageMagick). Para probar
  interacciones, inyectar un `<script>` en una copia en el scratchpad y leer la consola con
  `--enable-logging=stderr --v=0`.
- Servidor estático: `python3 -m http.server` sobre `public/` o `dist/` (los logotipos y
  las fuentes se piden con rutas absolutas `/logos/` y `/fonts/`).

## Qué no funcionó (no repetir)

- **Lanzar Chromium justo después de arrancar `http.server` en segundo plano:** las
  primeras capturas fallan con `ERR_CONNECTION_REFUSED`. Comprobar con `curl -sI` antes.
- **`pkill -f "http.server 876"`** mató el propio shell (código 144). Matar por PID.
- **`! gh auth login --web` y `! gh auth setup-git` pegados en un solo mensaje:** se
  ejecutaron como una sola orden; el login funcionó pero `setup-git` no corrió (salida 1).
  Van en mensajes separados.

## Entorno (importante, cambió respecto a los handoffs anteriores)

- Linux aarch64, Node 26.13.1. Ya no hay exFAT: sin `._*`, sin cambios falsos de permisos;
  `git add -A` vuelve a ser seguro (aun así, agregar rutas explícitas).
- **sharp:** el sistema tiene libvips, sharp intenta compilarse, falla y npm lo omite sin
  avisar; `astro build` truena con «Could not find Sharp». Reinstalar con
  `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci`.
- **GitHub:** `gh` quedó autenticado como `jaimebriseno-boop` (keyring) y `gh auth setup-git`
  configurado; el push funciona. Push a `main` = despliegue automático en Vercel (tardó
  menos de un minuto).
- Google Drive del autor montado en `/home/jaibri/Cloud/gdrive/` (en macOS era
  `/Volumes/Bioinformatics/GoogleDrive-…`).
- **Rutas de macOS fijas** que ya no existen aquí: `scripts/vih_sincronizar.py`
  (`ORIGEN_POR_OMISION`, pasarle la carpeta de la clase como argumento) y la entrada de
  propedéutica (`/Volumes/Bioinformatics/Wiki/…`, en `scripts/propedeutica_REGENERATE.md`).

## Cómo actualizar la plática de RAM

```sh
S="/home/jaibri/Cloud/gdrive/Clases /Infecto/Platica resistencia antimicrobiana/sesion_general_hospitalaria"
# 1. El autor regenera su HTML (build.py + empaquetar.py en "$S/fuente")
cp "$S/RAM_sesion_general_autocontenido.html" herramientas/Resistencia_antimicrobiana/
python3 scripts/ram_publicar.py      # si un assert falla, el HTML del autor cambió: ajustar el paso
# 2. Revisar las 50 diapositivas (?static#/N) y la ventana de citas
npm run check && npm run build && npm run test
# 3. Commit de public/herramientas/resistencia-antimicrobiana/app/index.html (y textos) y push
```

## Siguientes pasos

1. **Decisión del usuario:** ¿se quedan como texto «Sesión General Académica · Hospital
   Civil de Oriente» y «Director del Hospital Civil de Oriente»? Para quitarlos, añadir un
   reemplazo en `portada()` y en el divisor de cierre de `ram_publicar.py`.
2. La sección de antimicrobianos sigue con una sola tarjeta. La plática académica de
   60 minutos (`../presentacion/`) ya no está en el sitio; si se quiere ofrecer también,
   publicarla en otra ruta con un script hermano.
3. Opcional: publicar `RAM_sesion_general_referencias.md` (la verificación frase por frase)
   y volver a mencionarlo en las notas.
4. Pendientes heredados: figuras de terceros en la clase de VIH (ver su handoff); rutas de
   macOS en `vih_sincronizar.py`.

## Archivos ajenos

`PDFS_POR_CONSEGUIR.xlsx` (sin rastrear) no se abrió ni se agregó. En Drive solo se leyó.

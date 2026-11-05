# Handoff — Virología: tema «VIH/SIDA 2026»

Fecha: 2026-11-05. Repositorio: `/Volumes/ADATA SC750/Respaldo_Jaibri_310326/Programacion/UDG-CA-1190`
(disco externo exFAT; ver «Entorno» abajo). El handoff de propedéutica sigue en
[SESSION_HANDOFF.md](SESSION_HANDOFF.md); el panorama general, en [PROGRESS.md](PROGRESS.md).

## Objetivo

El usuario pidió subir su clase **VIH/SIDA 2026** al apartado de Virología del sitio
(`/herramientas/virologia`). Se cumplió: está publicada y verificada en producción.

- Clase: <https://udgca1190.com.mx/herramientas/virologia/app/temas/vih-sida-2026/index.html>
- Sección: <https://udgca1190.com.mx/herramientas/virologia/> (y `/en/…`)

## Estado actual

- Implementación: commit `78013f5` en `origin/main`, rebasado sobre `8002580`.
  Vercel lo desplegó sin errores.
- Producción cotejada por SHA-256: los 42 archivos servidos (clase, 34 imágenes,
  4 fuentes, OFL, índice de Virología y ficha de Retroviridae) son idénticos a los locales.
  `temas/vih-sida-2026/index.html` = `1a98a7a1c4a495bf3d076e0e0bc6567f01bcf019d145f1b6c115171ce5ca85f3`.
- Origen de la clase, ensamblado por el autor:
  `/Volumes/Bioinformatics/GoogleDrive-jaime.briseno@academicos.udg.mx/Clases /Infecto/platica_vih/VIH-SIDA-2026.html`
  (SHA-256 `e5ddeadb0b95e6c82e28998a2444a3f23cb19383d09d469d4bc1810cde8792a9`).
  La carpeta antigua `Clases /Infecto/VIH SIDA 2026` quedó vacía tras el traslado.

## Qué se hizo

| Archivo | Cambio |
|---|---|
| `public/herramientas/virologia/app/temas/vih-sida-2026/` | Copia de la clase: 39 diapositivas + 12 «Profundizar». `index.html` de 0.33 MB, más `assets/img/` (34) y `assets/fonts/` (4 woff2 + `OFL.txt`). |
| `scripts/vih_sincronizar.py` | Genera esa copia desde el HTML ensamblado por `build.py`. Devuelve cada data URI a su archivo (busca el base64 en `fuente/assets/`) y añade el enlace «← Virología» a la barra `.hud`. No toca las diapositivas. |
| `public/herramientas/virologia/app/index.html` | Puerta `a.tree-door.clase` (dorada, a todo lo ancho) bajo los árboles DNA/RNA y Herramientas diagnósticas. Pie: «28 de 28 fichas publicadas · tema VIH/SIDA 2026». |
| `public/herramientas/virologia/app/virus/retroviridae.html` | Enlace `.pager` a la clase tras el encabezado. |
| `src/components/pages/VirologiaPage.astro` | `allow="fullscreen"` en el iframe; la tecla F de la clase funciona dentro del visor. |
| `src/i18n.mjs` (`viro.intro`, `viro.note`, `viro.meta`, `viro.use_text`, es/en) | Mencionan la clase. `use_text` aclara que las figuras de terceros conservan los derechos de sus autores. |
| `data/herramientas.yml`, `data/i18n/en.yml` | La descripción de la herramienta `virologia` añade la clase. |

Verificación local, sobre `origin/main` combinado: `npm run build` (79 páginas) y
`npm run check` (0 errores, 0 advertencias). `audit-performance.py` sin recursos faltantes
ni externos. Capturas con Chrome sin interfaz: índice, portada, diapositiva `#dx-ventana`
con la barra y modo lectura a 600 px. Al volver a incrustar imágenes y fuentes en la copia
del sitio, el resultado es idéntico byte a byte al HTML del autor.

## Qué funcionó

- **Partir del HTML ya ensamblado por `build.py`**, no reimplementar el ensamblado. El
  script solo deshace la incrustación base64, así `build.py` sigue siendo la única fuente.
- **Imágenes y fuentes en archivos aparte.** El motor de la clase arranca en
  `DOMContentLoaded` con el `<script>` al final del body. Incrustado, no arrancaba hasta
  descargar 2.2 MB; ahora sirve 93 KB comprimidos. Las rutas relativas `assets/img/…`
  funcionan sin reescribir CSS ni JS.
- **Enlace de regreso inyectado** con un oyente `DOMContentLoaded` registrado después del
  del motor, que construye `.hud` en `buildChrome()`. Se ve también en modo lectura (< 900 px).
- **Conflictos del rebase.** En los tres, la primera línea del lado remoto era la versión
  vieja de la línea editada, seguida de claves nuevas (WISCA, Microbiología I). Se tomó
  la línea nueva más el resto del lado remoto.
- **Revisión visual con Chrome sin interfaz** desde Bash, sin sandbox:
  `--headless=new --screenshot` o `--dump-dom`. Con `--virtual-time-budget=1500` la barra
  aún no se oculta por inactividad (2.6 s).

## Qué no funcionó (no repetir)

- **Extensión Claude in Chrome contra el servidor local:** `ERR_CONNECTION_REFUSED` en
  `localhost` y en `127.0.0.1`, aun con `astro preview --host 127.0.0.1` fuera del sandbox.
  Usar Chrome sin interfaz.
- **`astro preview` dentro del sandbox:** no es alcanzable desde ningún navegador.
- **`git rebase` en exFAT:** la primera vez abortó con «Please commit your changes» con el
  árbol limpio. Se resolvió con `git update-index -q --refresh` y `git rebase --continue`.
- **`G="git -c core.fileMode=false"; $G …` en zsh:** falla porque la variable no se separa
  en palabras. Exportar `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fileMode GIT_CONFIG_VALUE_0=false`.
- **`audit-performance.py`:** truena con `UnicodeDecodeError` por `dist/**/._*.html`. Hay que
  borrar `dist/._*` antes. El auditor reescribe `docs/performance/after.json`;
  restaurarlo con `git restore`.

## Entorno (importante)

- El `main` local estaba **32 commits atrás** de `origin/main`; el usuario también trabaja
  desde otros equipos. Antes de cualquier commit: `git fetch` y rebase, luego `npm ci`
  (esta vez faltaban katex, flag-icons y @vercel/analytics) y `npm run build`.
- exFAT: unos 200 archivos aparecen `M` solo por permisos (100644 → 100755), y hay cientos
  de `._*` sin rastrear. También `.git/objects/pack/._pack-*`, que provocan «non-monotonic
  index»; son de 4 KB y se pueden borrar. Agregar siempre rutas explícitas, nunca `git add -A`,
  con `':(exclude,glob)**/._*'`.
- Push a `main` = despliegue automático en Vercel. Estado:
  `gh api repos/jaimebriseno-boop/udgca1190-sitio/commits/<sha>/status`.

## Cómo actualizar la clase

```sh
# 1. En la carpeta de la clase (el autor edita fuente/slides, css, js)
cd "/Volumes/Bioinformatics/GoogleDrive-jaime.briseno@academicos.udg.mx/Clases /Infecto/platica_vih"
python3 fuente/build.py
# 2. En el repo
python3 scripts/vih_sincronizar.py            # o: … "<otra carpeta de la clase>"
npm run build && find dist -name '._*' -delete && npm run check
# 3. Commit de public/herramientas/virologia/app/temas/vih-sida-2026 (sin ._*) y push
```

El script avisa si algún archivo de `fuente/` es más reciente que el HTML ensamblado. Borra
solo las imágenes y fuentes que la clase dejó de usar; `OFL.txt` se conserva.

## Siguientes pasos

1. **Decisión pendiente del usuario: figuras de terceros.** Unas 25 figuras están publicadas
   con su cita al pie (NEJM 2011, Harrison, Mandell, Science 1996, Ann Intern Med, Nat Rev
   Immunol, National HIV Curriculum). Créditos en `fuente/assets/creditos.json`. El sitio
   publica su contenido bajo CC BY 4.0; en Propedéutica se evitó publicar tablas de McGee
   por esa razón. Si decide sustituir algunas: editar la clase, `build.py`, sincronizar
   y publicar.
2. Más temas de la clase: crear `app/temas/<slug>/` con un script hermano o generalizar
   `vih_sincronizar.py` (hoy fija `VIH-SIDA-2026.html` y el destino). Con dos o más temas,
   valorar una fila «Temas» en el portal del índice en lugar de una puerta por clase.
3. Opcional: registrar «Virología · tema VIH/SIDA 2026» en `docs/performance/REVIEW.md` si se
   vuelve a medir. El minisitio de Virología pasó de ~2.15 MB a ~3.9 MB en `dist/` por las
   imágenes de la clase, que solo se piden al abrirla.
4. La clase es solo en español; la página `/en/herramientas/virologia` lo indica.

## Archivos ajenos

`PDFS_POR_CONSEGUIR.xlsx` (sin rastrear) no se abrió ni se agregó. No se tocó nada fuera de
los archivos listados arriba. En Drive solo se leyó.

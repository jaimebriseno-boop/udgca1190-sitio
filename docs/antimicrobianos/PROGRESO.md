# Progreso — sección «Antibióticos y resistencia antimicrobiana»

## Actualización 2026-11-23 — «Uso racional de los antibióticos»

Por petición del usuario, la plática publicada se reemplazó por su versión más reciente,
**Uso racional de los antibióticos: rol estratégico en el profesional de salud** (Sesión
General Académica del 19 de noviembre de 2026, Semana Mundial de Concienciación sobre la
RAM): 40 minutos, 34 diapositivas, 3 de respaldo y 13 de referencias (50 en total), 178
referencias verificadas al 18 de noviembre de 2026, superíndices con clic que muestran la
referencia completa, contador de muertes atribuibles en el cierre y guía del ponente (G).
Misma ruta (`/herramientas/resistencia-antimicrobiana`), mismo criterio: **sin logotipos
del Hospital Civil y con el diseño del sitio**.

- Origen (no se edita): `RAM_sesion_general_autocontenido.html` en la carpeta del autor
  (`Clases /Infecto/Platica resistencia antimicrobiana/sesion_general_hospitalaria/` en
  Google Drive), SHA-256
  `4218260b90cc317cd734a7cb3831abaf281980d3b639225d3c62d725d7996e14`. Copia de trabajo en
  `herramientas/Resistencia_antimicrobiana/` (ignorada por Git).
- `scripts/ram_publicar.py` se adaptó a la nueva versión (la anterior queda en `cc84219`):
  el mismo marco, paleta, fuentes y portada con el logotipo vertical del CA; además, la
  ventana de las citas y el contador con tonos UdeG (dorado sobre navy) y en Inter, el
  espacio no separable antes de «%» también en las cifras «antes → después», el indicador
  de pasos recorrido para no encimarse con el número de diapositiva, y se retira de las
  notas la mención al archivo local `RAM_sesion_general_referencias.md` (14 frases).
- Publicado: 0.88 MB (origen 1.58 MB), SHA-256 `031f2b65657e318409db722e24bd955259b17014a082d18dfd7763dd2a806967`;
  salida determinista.
- Textos de la página, tarjeta y traducción al inglés actualizados (`src/i18n.mjs`,
  `data/herramientas.yml`, `data/i18n/en.yml`); el título de la página pasa a «Uso
  racional de los antibióticos».
- Verificación: las 50 diapositivas en Chrome headless (`?static`), ventana de cita y
  portada frente al original; `npm run check` 0 errores; `npm run build` 79 páginas;
  `npm run test` 1847 pruebas correctas.
- Se conservan como texto: «Sesión General Académica · Hospital Civil de Oriente» en la
  portada y «Director del Hospital Civil de Oriente» en la portada y el cierre.

Lo que sigue describe la publicación original (octubre de 2026).

Actualizado: 2026-10-28. Estado: **publicada** (commit `cc84219`) en
<https://udgca1190.com.mx/herramientas/resistencia-antimicrobiana> (y `/en/…`), sección en
<https://udgca1190.com.mx/herramientas#antimicrobianos>.

## Qué es

- Sección nueva de la página de Herramientas (`#antimicrobianos`, al final, fondo gris
  como Laboratorio), con `seccion: antimicrobianos` en `data/herramientas.yml` y en el
  esquema de `src/content.config.ts`. Sin página índice propia: por ahora tiene una sola
  tarjeta.
- Introducción de la sección: la plática **Resistencia antimicrobiana — Del pasado dorado
  de los antibióticos al futuro que todavía podemos cambiar** (Dr. Jaime Briseño-Ramírez;
  68 diapositivas, nueve bloques, 175 referencias verificadas al 28 de octubre de 2026).
  Tarjeta `ram-introduccion` (tipo docente, línea epidemiologia-infecciosas).
- Página: `src/components/pages/ResistenciaAntimicrobianaPage.astro` (iframe 16:9,
  pantalla completa, uso del teclado, «Sobre la plática» y «Cómo citar»), rutas
  `/herramientas/resistencia-antimicrobiana` y `/en/…`, claves `tools.ram.*` y `ram.*`
  en `src/i18n.mjs`, traducción de la tarjeta en `data/i18n/en.yml`. El contenido de la
  plática está en español.

## Dónde vive

- Origen (no se edita): `RAM_platica_HCO_autocontenido.html` del autor; copia de trabajo
  en `herramientas/Resistencia_antimicrobiana/` (carpeta ignorada por Git). SHA-256 del
  origen usado: `2db81f8a6914ff76f282bfdfb943630daaf5ceaa18889603e197ead87dd52f5e`.
- Publicado: `public/herramientas/resistencia-antimicrobiana/app/index.html` (1.05 MB,
  frente a 1.82 MB del origen), generado por `scripts/ram_publicar.py`. No editar a mano:
  ante cambios del autor, reemplazar la copia de trabajo, volver a ejecutar el script y
  hacer commit. La salida es determinista (dos ejecuciones, mismo SHA-256).

## Qué transforma el script

Por petición del usuario: estilo y paleta del sitio, **sin logotipos del Hospital Civil,
solo los de la Universidad de Guadalajara**.

- Fondo PNG de la plantilla HCO (logotipos del Hospital Civil de Guadalajara, del Gobierno
  de Jalisco y de la UdeG, barras de color) → marco en CSS: logotipo horizontal del CA
  (escudo UdeG) arriba a la izquierda y banda inferior roja y azul marino UdeG con filete
  dorado.
- Portada: la fotografía de la fachada del Hospital Civil de Oriente (con su nombre y
  escudos) → logotipo vertical del CA. Ambos logotipos se toman de `/logos/`, los mismos
  del encabezado del sitio.
- Paleta HCO → tokens UdeG (`design/tokens/colors.json`), solo en el CSS, el marcado y los
  scripts propios del deck; reveal.js, Chart.js y el plugin de notas no se tocan. Títulos
  de diapositiva en banda roja UdeG (como el PageHeader). Se conservan los matices que
  citan las notas (barras rojas, ámbar y azules; verde de «después»).
- Fira Sans y Montserrat incrustadas → `/fonts/fonts.css`: Inter (cuerpo y títulos),
  Source Serif 4 (portada y divisores), IBM Plex Mono (etiquetas). También en los dos
  diagramas SVG y en Chart.js.
- Radios planos y sin sombras; divisores con cuadros en lugar de círculos.
- Ajustes de legibilidad: tonos claros dentro de la tarjeta navy (caso Achaogen), aviso del
  panel de guía en dorado, espacio no separable antes de «%» en las cifras grandes, fuente
  al pie a todo el ancho.
- Se retira de las notas del ponente la ruta a su archivo local
  (`investigacion/RAM_investigacion_base.md`).
- Enlace «← Herramientas» solo cuando la plática se abre fuera del visor.

Se conservan como texto (no son logotipos): «Sesión académica · Hospital Civil de Oriente»
en la portada y «Director del Hospital Civil de Oriente» en las diapositivas del ponente y
de cierre; la fotografía del ponente; la infografía de la OMS (citada, «Adaptado de OMS»).

## Verificación (2026-10-28)

- Las 68 diapositivas en Chrome headless (modo `?static`, estado final de todo), cotejadas
  con el original en diez de ellas; panel de guía (`?guia`) y vista a pantalla completa.
- `npm run check`: 0 errores, 0 advertencias. `npm run build`: 79 páginas (sobre
  `7e85c2f`, que añadió WISCA). `npm run test`: 1847 pruebas correctas.
- Vista previa: página es/en, sección en `/herramientas` y `/en/herramientas`, iframe a
  390 px sin desplazamiento horizontal.

- Producción (Vercel, tras el push de `cc84219`): páginas es/en, `/herramientas` y
  `/en/herramientas` con la sección, logotipos y fuentes en 200. La plática servida es
  idéntica byte por byte a la local (SHA-256
  `9890d1861f55915f52901a9fa63318a5fe7dd47bf66499fb9eeec241924f5771`); las páginas de Astro
  solo difieren en el script de Vercel Analytics que inyecta su compilación.
- Push: este equipo no tenía credenciales de GitHub; el usuario inició sesión con
  `gh auth login --web` (entra a GitHub con Google) y `gh auth setup-git`.

## Pendientes

- Decidir si «Sesión académica · Hospital Civil de Oriente» se queda en la portada.
- Siguientes materiales de la sección; con más de dos o tres, considerar una página índice
  (`/herramientas/antimicrobianos`) y si «WISCA bayesiano» se traslada aquí.

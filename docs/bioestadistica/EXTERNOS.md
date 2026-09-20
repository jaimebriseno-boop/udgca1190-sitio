# Recursos externos de Bioestadística abierta

Actualizado: 20 de septiembre de 2026 (H4).

La sección funciona sin red: los cálculos se hacen en TypeScript dentro del navegador y
ninguna página declara un recurso de otro origen (lo vigila `npm run audit:performance`,
que además rechaza explícitamente cualquier host de webR como recurso declarado en HTML o
CSS). El único contacto con el exterior es opcional, explícito y reversible: el botón
**«Verificar con R»**.

## Qué se descarga, de dónde y cuándo

| Origen | Qué | Cuándo |
|---|---|---|
| `https://webr.r-wasm.org/v0.6.0/` | webR 0.6.0: `webr.mjs`, `webr-worker.js`, `R.js`, `R.wasm` (R 4.6.0 compilado a WebAssembly; 12.3 MB comprimido), BLAS/LAPACK y las partes del sistema de archivos que R pide al arrancar | Solo tras pulsar «Verificar con R» y aceptar el panel de consentimiento; nunca al visitar una página |
| `https://repo.r-wasm.org/` | Paquetes de R compilados a WebAssembly que cargue el snippet de la calculadora (`binom`, `irr`, `pwr`, `survival`, `jsonlite`…), montados como imágenes de sistema de archivos | En la misma verificación, uno por uno, con progreso por paquete |

La versión está fijada (`/v0.6.0/`, nunca `/latest/`): las rutas versionadas del CDN son
estables y la caché HTTP del navegador reutiliza los binarios entre calculadoras y visitas
(el CDN los sirve con `Cache-Control: max-age=604800`).

## Qué NO sale del navegador

- Los datos capturados o pegados. webR corre en un *worker* local y solo pide binarios a
  los dos orígenes; el snippet se ejecuta dentro del navegador y su salida se compara ahí.
- Nada se transmite a ningún servidor propio ni ajeno; la sección no tiene backend.

## Consentimiento

- Panel con el texto de lo que se descarga, desde dónde y qué paquetes (ES/EN, claves
  `bio.ui.webr_consentimiento*` de `src/i18n.mjs`; los nombres de host se interpolan desde
  `src/lib/bioestadistica/webr.ts`, que es el único archivo de `src/` que los contiene).
- Casilla «Recordar mi decisión en este navegador»: escribe `localStorage['bio.webr.consentimiento'] = 'v1'`.
  Sin marcarla, el consentimiento vale solo para la visita (documento) actual. Si el texto
  del consentimiento cambia de forma sustantiva, se sube la versión (`v2`) y se vuelve a preguntar.
- Aviso previo cuando el dispositivo declara menos de 4 GB (`navigator.deviceMemory`) o es iOS.
- Botón «Cancelar la verificación» mientras R descarga, arranca, instala o ejecuta (cierra la
  sesión: con el canal `PostMessage` es la única interrupción posible), botón «Liberar memoria de R»
  cuando hay sesión, y botón «Olvidar mi decisión» cuando el consentimiento está recordado: el
  opt-in es reversible desde la propia página, sin borrar datos del sitio.

## Política de hosts (código y despliegue)

- `src/lib/bioestadistica/webr.ts` declara `WEBR_ORIGEN`, `REPO_ORIGEN`, `WEBR_VERSION` y se
  carga únicamente con `import()` dinámico desde el controlador al pulsar el botón.
- `tests/bioestadistica/politica.test.ts` falla si `r-wasm.org` aparece en cualquier otro
  archivo de `src/`, de `data/bioestadistica/` (acaba en el HTML) o de `public/` (se sirve tal
  cual), si `webr.ts` se importa de forma estática, o si la CSP de `vercel.json` permite algún
  origen externo distinto de esos dos, difiere entre ES y EN o no casa con las rutas de la sección.
- `vercel.json` sirve `/herramientas/bioestadistica/*` y `/en/herramientas/bioestadistica/*`
  con una `Content-Security-Policy` que permite `connect-src` y `script-src` solo hacia esos
  dos orígenes (más `'self'`), `'wasm-unsafe-eval'` para WebAssembly y `worker-src`/`child-src`
  `blob:` (webR envuelve su *worker* cross-origin en un blob). Detalle en ARQUITECTURA §6.8.
- **`'unsafe-eval'` en `script-src`, medido y no supuesto.** La revisión estática de H4 concluyó
  que el núcleo de webR no necesitaba `eval` (solo los paquetes compilados con `EM_ASM`/`EM_JS`);
  la prueba de humo demostró lo contrario: sin `'unsafe-eval'` R se descarga entero (13.2 MB) y el
  worker se cuelga hasta agotar los 180 s con un `EvalError` que no genera violación declarada de
  la CSP. Con `'unsafe-eval'` la misma página verifica en menos de 2 s. Se abre solo esa palabra
  clave: `'unsafe-inline'` sigue cerrado (la protección que importa frente a HTML inyectado) y los
  orígenes siguen acotados a los dos de webR. Todo paquete nuevo del catálogo (H5) se comprueba
  igual con `npm run humo:webr` sobre una calculadora que lo cargue.
- `scripts/bio-humo-webr.mjs` (`npm run humo:webr`) sirve `dist/` con esas mismas cabeceras
  y pulsa «Verificar con R» en Chrome headless: cualquier violación de la CSP hace fallar la prueba.

## Cómo pasar a autoalojado

`webr.ts` aísla las dos URL como constantes. Para autoalojar el núcleo basta copiar
`node_modules/webr/dist/` a `public/herramientas/bioestadistica/webr/<versión>/` y cambiar
`WEBR_BASE_URL`; para autoalojar también los paquetes hay que construir una imagen de
biblioteca con `rwasm` (MOTOR §4.4, opción c) y montarla con `webR.FS.mount`. En ese caso
se retiran los orígenes de la CSP y de `ORIGENES_EXTERNOS`, y `politica.test.ts` pasa a
vigilar que no queden restos. Queda como endurecimiento posterior, cuando el conjunto de
paquetes se congele (fin de H5).

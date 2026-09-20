# Revisión transversal de rendimiento — 6 de septiembre de 2026

Se revisó el sitio institucional bilingüe y las tres aplicaciones públicas.
Las optimizaciones están aplicadas localmente y validadas; no se ha desplegado
esta revisión. La base es el commit `f0a9ced8ab874d2e2cb03e718bbdd84df809441c`,
con Astro 6.4.4 y Node 22.22.2.

## Diagnóstico y plan ejecutado

El sitio principal ya utiliza generación estática, JavaScript pequeño por página,
imágenes adaptativas y fuentes locales. No se encontró una razón de rendimiento
para cambiar de framework o introducir renderizado en servidor. Los principales
costes evitables estaban en recursos gráficos, código repetido y actualizaciones
de las herramientas.

| Prioridad | Hallazgo | Cambio aplicado |
|---|---|---|
| Alta | El logotipo lateral se servía como PNG de 381,856 bytes en todas las páginas internas. | `Sidebar.astro` utiliza `astro:assets`, WebP y tres resoluciones acordes con el ancho de 252 px. |
| Alta | Los cuatro fondos ocupaban el mismo viewport; `loading="lazy"` no aislaba los fondos invisibles. | Tres fondos quedan en `template` inertes. Se inserta y decodifica el siguiente antes de mostrarlo. Se conserva el primer fondo y su precarga AVIF. |
| Alta | El carrusel seguía trabajando fuera del área visible y podía solapar avances asíncronos. | Temporizador secuencial, pausa fuera del viewport y en pestaña oculta, pausa manual y respeto dinámico a movimiento reducido. Se mantiene el fondo actual ante un fallo de carga. |
| Alta | Cada cambio del mosaico de dengue destruía y creaba 33 gráficas. La limpieza comprobaba el contenedor equivocado. | Paneles identificados por región y actualizados mediante `Plotly.react`; conservación de nodos y limpieza del div interior cuando desaparece una región. |
| Alta | El deslizador podía lanzar actualizaciones completas consecutivas sin esperar a Plotly. | Cambios agrupados por frame y renderizados serializados; el último estado pendiente se dibuja después del actual. |
| Media | Plotly bloqueaba el análisis del HTML y cada gráfica añadía su propio tratamiento de resize. | Script `defer`, redimensionado centralizado y observación de cambios de ancho. La altura del iframe solo se comunica si cambió. |
| Media | Propedéutica ordenaba otra vez hasta 1,213 registros en cada filtro y reconstruía la lista al seleccionar una ficha. | Orden inicial único con `Intl.Collator`, índice por identificador y cambio de selección sobre los nodos existentes. Se elimina el sondeo periódico de altura de 900 ms. |
| Media | 32 páginas de virología solicitaban Google Fonts; 29 repetían CSS y JS idénticos. | Fuentes locales compartidas y bloques comunes en `css/guide.css` y `js/guide.js`, con sus referencias conservadas en el mismo punto del documento. |
| Media | Importaciones de fuentes incluían escrituras no utilizadas y formatos adicionales. | Generación reproducible de WOFF2 desde las dependencias existentes; rangos latino, latino extendido y griego, cursivas reales para virología y licencias incluidas. Los binarios se comparten entre el sitio y las herramientas. |
| Baja | `sizes` describía 112 px para todas las fotos de escritorio, aunque los integrantes usan 80 px y el líder 112 px. | Tamaño declarado según el rol, conservando las dimensiones del diseño. |
| Media | Nuevos recursos necesitan una política que permita caché sin congelar datos científicos. | Caché anual únicamente para `/_astro/` y fuentes WOFF2 con hash; JSON, HTML y archivos de herramientas sin versión siguen sujetos a revalidación. |

## Resultados medidos

Los números siguientes son **bytes de archivos**, no porcentajes de mejora de
velocidad. Las estimaciones gzip del inventario son reproducibles, pero no son
una captura de la transferencia HTTP de Vercel.

| Elemento | Antes | Después | Resultado |
|---|---:|---:|---|
| Logo lateral, resolución 252 px | 381,856 B | 27,268 B | 92.9% menos bytes |
| Logo lateral, resolución 504 px | 381,856 B | 63,160 B | 83.5% menos bytes |
| Logo lateral, resolución 756 px | 381,856 B | 100,634 B | 73.6% menos bytes |
| Fondos activos en el HTML inicial | 4 imágenes | 1 imagen y 3 plantillas inertes | Tres imágenes excluidas de la carga inicial |
| Conjunto de fondos a la resolución de escritorio observada | 501,490 B | 103,207 B del primer fondo | 398,283 B diferidos; se descargan si avanza el carrusel |
| Archivos del minisitio de virología, sin las fuentes compartidas externas a su carpeta | 2,605,090 B | 2,150,699 B | 454,391 B menos (17.4%) |
| Salida completa `dist/`, todas las rutas y variantes | 14,738,656 B | 14,393,399 B | 345,257 B menos; no equivale al peso de una visita |
| Recreación de paneles existentes por actualización de dengue | 33 | 0 | Se conservan los nodos y se actualizan sus gráficas |

El inventario completo está en [baseline.json](baseline.json) y
[after.json](after.json). La portada se comprobó inmediatamente tras cargar:
[browser-home-after.json](browser-home-after.json) registra una imagen de fondo
y tres plantillas; posteriormente se comprobó que las cuatro imágenes aparecen
al avanzar el carrusel. Las fotografías de integrantes que el navegador decide
precargar por proximidad al viewport mantienen su comportamiento nativo.

## Verificación

- Compilación: 25 páginas Astro y 34 HTML públicos, 59 en total.
- `astro check`: cero errores y cero advertencias; permanecen los 73 hints preexistentes.
- Cuatro pruebas automatizadas: identidad de los 33 paneles y conservación de sus trazas, reordenamiento, limpieza del div correcto, agrupación de cambios rápidos y espera de la finalización de Plotly.
- Auditoría de todos los HTML y CSS generados: ninguna referencia a un recurso local faltante y ningún recurso de carga externa declarado en ellos. Esto no cuenta los enlaces externos de navegación o bibliografía como descargas.
- Los cuatro JSON públicos de dengue y propedéutica coinciden byte por byte y en SHA-256 con la compilación inicial.
- El texto de las 32 páginas de virología coincide con el commit original tras excluir CSS y scripts. Los bloques compartidos se extrajeron sin modificar sus contenidos.
- Navegador: portada ES/EN, avance y pausa, menú a 390 × 844 px, fotos, filtro de publicaciones con contador 6/6, búsqueda `murphy` con 3 resultados, selección de ficha, calculadora, región Jalisco, mosaico de 33 paneles, orden por casos y último origen de pronóstico. También se comprobó la expansión de las ocho secciones de Flaviviridae y la carga de los visores en inglés dentro de iframe.

Las comprobaciones automatizadas de Plotly usan un DOM mínimo en su límite de
integración; las pruebas manuales usan Plotly real en Chrome. No se atribuye una
mejora porcentual de LCP, INP, CLS o Lighthouse: no se ejecutó un benchmark de
tiempos con red y CPU controladas ni una medición de campo en producción. La
preferencia de movimiento reducido se revisó en código, sin emulación de sistema.

Capturas de revisión: [portada](screenshots/home-after.jpg),
[portada móvil EN](screenshots/home-mobile-en.jpg),
[menú móvil](screenshots/menu-mobile.jpg),
[mosaico](screenshots/dengue-grid.jpg) y
[virología](screenshots/virology-after.jpg).

## Comandos reproducibles

```sh
npm run build
npm run check
npm run test:performance
npm run audit:performance -- --check-data-baseline
npm run preview -- --host 127.0.0.1 --port 4321
```

La opción `--check-data-baseline` exige igualdad con los datos de esta revisión;
cuando se actualicen deliberadamente los datos, usar la auditoría sin esa opción
o capturar una nueva base documentada. El auditor escribe `after.json`.
`public/fonts/` y `src/styles/fonts.css` se generan automáticamente antes de
`dev`, `build` y `check`; no deben editarse manualmente.

## Sección «Bioestadística abierta» (17 de septiembre de 2026)

Publicada con el visto bueno del dueño sobre las páginas reales tras los hitos H0–H2
(diez calculadoras, 22 páginas de la sección, 55 en total). Su secuencia de
verificación, distinta de la de esta revisión porque su código no toca Plotly ni
los datos de las otras herramientas, queda registrada en
`docs/bioestadistica/PROGRESO.md` («Verificación conservada») y se resume aquí:

- `npm run build` 55 páginas; `npm run check` 0 errores y 0 advertencias (124 hints
  preexistentes); `npm run test` 4 + 1,004 pruebas (`tests/bioestadistica/*.test.ts`,
  con `node --test` sobre TypeScript sin transpilar).
- `npm run fixtures:bio:check`: los 143 casos de las diez calculadoras coinciden con
  la salida de R 4.5.2 sin deriva de plantilla ni de versión de paquete.
- `npm run barrido:bio`: 60,646 combinaciones de entradas × 2 idiomas y 121,292 SVG
  sin excepciones, marcadores sin rellenar ni atributos geométricos no finitos.
- `npm run audit:performance` (sin `--check-data-baseline`): ningún recurso externo
  declarado en HTML o CSS y ninguno local faltante; el único `false` sigue siendo el de
  `signos.json`, ajeno a esta sección (ver arriba).
- Chrome headless: capturas de escritorio (1280 px), móvil (400 px) e impresión de las
  diez calculadoras en ES y EN; DOM comprobado tras ejecutar el JavaScript (columna
  pegada por URL, estados de diseño de la tabla 2×2, avisos interpolados).
- Revisión de código independiente en H0, H1 y H2 con todos los hallazgos corregidos
  antes de cada commit (detalle en `docs/bioestadistica/DECISIONES.md`).

H3 (nueve calculadoras más: tamaño de muestra y poder, kappa y Kaplan-Meier; 19 en
total, 40 páginas de la sección, 73 en el sitio), publicado el 17 de septiembre de 2026
con el visto bueno del dueño, repitió la misma secuencia antes de pedirlo: `npm run build` 73 páginas; `npm run check` 0 errores y 0
advertencias (124 hints preexistentes); `npm run test` 4 + 1,833 pruebas;
`npm run fixtures:bio:check` 302 casos de 19 calculadoras sin deriva;
`npm run barrido:bio` 75,039 combinaciones × 2 idiomas y 150,078 SVG sin problemas;
`npm run audit:performance` sin recursos externos ni faltantes (111 páginas HTML
auditadas); capturas ES/EN de las nueve páginas nuevas y del índice; dos revisiones de
código independientes (detalle en `docs/bioestadistica/PROGRESO.md`).

H4 (20 de septiembre de 2026; «Verificar con R» con webR en el navegador) mantiene la
auditoría en verde y le añade una aserción: ningún host de webR puede aparecer como
recurso declarado en HTML o CSS (`r-wasm.org`). El adaptador `webr.ts` es un chunk
aparte de 7.5 KB (3.3 KB gzip) que la página solo pide con `import()` al pulsar el
botón, y la descarga de R (≈ 12 MB comprimidos más paquetes) ocurre únicamente tras un
consentimiento explícito. Dos cambios de entrega afectan a todo el sitio y se registran
aquí porque cambian las cifras de esta revisión sin cambiar el contenido:

- `vercel.json` sirve `/herramientas/bioestadistica/*` y `/en/herramientas/bioestadistica/*`
  con una `Content-Security-Policy` estricta (`script-src 'self' 'wasm-unsafe-eval'` más el
  origen de webR, `connect-src` a los dos orígenes de webR, `worker-src blob:`,
  `style-src 'self'`, sin `'unsafe-inline'`); el resto del sitio no lleva CSP.
- Para que esa CSP no bloquee nada, `astro.config.mjs` desactiva la incrustación de
  scripts y hojas de estilo pequeños (`vite.build.assetsInlineLimit: 0`,
  `build.inlineStylesheets: 'never'`). Antes Astro incrustaba en cada página el script
  del menú lateral (560 bytes) y una o dos hojas de menos de 4 KB; ahora se sirven como
  archivos con hash bajo `/_astro/` con la caché anual, así que cada página hace una o
  dos peticiones más la primera vez y ninguna después. Las páginas de la sección quedan
  sin ningún `<script>` ejecutable ni `<style>` en línea (los `application/json` y
  `application/ld+json` no se ejecutan).

La política se prueba contra el build real: `npm run humo:webr` sirve `dist/` aplicando
las cabeceras de `vercel.json`, pulsa «Verificar con R» en Chrome headless y falla ante
cualquier violación de la CSP; su resultado queda en `docs/bioestadistica/PROGRESO.md`
(«Verificación conservada (H4)»).

## Siguientes prioridades

1. **Medir en el alojamiento real.** Tras una publicación autorizada, verificar
   compresión Brotli/gzip, cabeceras efectivas y LCP/INP/CLS en móvil y escritorio.
   La vista previa local no aplica `vercel.json`; esa política está preparada y
   aún no verificada en el CDN. Mantener las mismas rutas, dispositivo y perfil
   de red al comparar, con varias repeticiones.
2. **Primera apertura del mosaico.** Aún se construyen 33 gráficas la primera vez
   que se abre. Si el perfil de móviles muestra bloqueos importantes, dibujar
   paneles al acercarse al viewport y repartir el trabajo entre frames, incluyendo
   una ruta completa para impresión. No se añadió complejidad sin medir ese coste.
3. **Datos de las herramientas.** `forecasts.json` pesa 1.01 MB y `signos.json`
   1.11 MB sin comprimir; ya están minificados. Si la red es el cuello de botella,
   separar pronósticos por región y detalles de signos bajo demanda, con índices
   versionados y validación de integridad. Requiere ampliar el contrato de carga
   y pruebas de búsqueda; no basta con partir archivos arbitrariamente.
4. **Virología extensa.** El árbol RNA continúa siendo un HTML de aproximadamente
   347 KB. Antes de cambiar sus tablas o navegación, medir coste de DOM y pintura;
   valorar contención o carga por secciones conservando búsqueda e impresión.
5. **CSS y construcción.** Los layouts comparten estilos generales y los helpers
   leen YAML de forma síncrona durante el build. Son candidatos secundarios:
   estas lecturas no ocurren en el navegador y la compilación con caché tarda
   alrededor de 1–2 segundos en este equipo. No se añadió caché de datos en memoria
   que pudiera dejar contenido obsoleto durante desarrollo.

Las decisiones sobre imágenes se apoyan en las capacidades de
[Astro Assets](https://docs.astro.build/en/guides/images/). La política de caché
se limita a recursos identificados por contenido conforme a la documentación de
[Vercel](https://vercel.com/docs/caching/cdn-cache) y
[Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).

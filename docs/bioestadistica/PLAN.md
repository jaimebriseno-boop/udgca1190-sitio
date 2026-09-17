# Plan: «Bioestadística abierta aplicada a la investigación clínica»

## Contexto

El Dr. Briseño revisó VassarStats (vassarstats.net, Richard Lowry, 1998-2023): calculadoras
estadísticas en JavaScript que corren en el navegador, en inglés, con frameset de 1998, sin
explicación didáctica, sin ecuaciones, sin fuentes originales y sin gráficas. Quiere construir
dentro del sitio del CA UDG-CA-1190 (udgca1190.com.mx, Astro 6.4 estático en Vercel) un sistema
mejor para las herramientas más usadas en investigación clínica: en español e inglés, código
abierto, cálculo in situ (los datos no salen del navegador), código R visible y ejecutable en el
navegador, llenado automatizado de campos, ecuación clásica y explicación sencilla, cita de los
autores originales, interpretación en lenguaje claro que se actualiza al escribir, y un «resultado
de la automatización» (párrafo de Métodos, tabla, código, exportes). Branch:
`jaimebriseno-boop/Bioestadistica-abierta` (worktree limpio; `node_modules/` aún no instalado aquí).

## Decisiones cerradas

Del dueño (16-sep-2026):
- **Nombre**: «Bioestadística abierta aplicada a la investigación clínica»; forma corta
  «Bioestadística abierta»; lema «Calcula, entiende, cita»; en inglés «Open Biostatistics applied
  to clinical research» / «Open Biostatistics». Slug fijo `bioestadistica`.
- **Motor híbrido**: TypeScript instantáneo para todo lo de forma cerrada; R real en el navegador
  (webR) bajo demanda para «Verificar con R» y como motor de los modelos multivariables.
- **Primer lote**: diagnóstico, asociación 2×2, tamaño de muestra, concordancia/descriptivos,
  más regresión logística, Cox, Kaplan-Meier y regresión lineal.
- **Ubicación**: sección nueva de Herramientas, como Laboratorio. **Bilingüe** desde el inicio.
- **webR por CDN bajo demanda** (webr.r-wasm.org v0.6.0 fijada + repo.r-wasm.org), solo tras
  consentimiento; autoalojar queda como endurecimiento posterior.
- **Autoría**: Briseño-Ramírez J, De Arcos-Jiménez JC (CA UDG-CA-1190, CUTlajomulco, UdeG).
- **Paquetes de R**: autorizado instalarlos en la biblioteca de usuario de R 4.5.2.

Del diseño (tres documentos coordinados, referencia de detalle a nivel de código):
- Especificación estadística (24 calculadoras): `docs/bioestadistica/ESPECIFICACION.md`
- Arquitectura Astro: `docs/bioestadistica/ARQUITECTURA.md`
- Motor, webR, validación y exportes: `docs/bioestadistica/MOTOR.md`
- Reportes de exploración del repo: `…-agent-aexplore-{arquitectura,apps-restricciones,bibliografia-datos}-*.md`

El primer commit copia los tres diseños a `docs/bioestadistica/{ESPECIFICACION,ARQUITECTURA,MOTOR}.md`
para que vivan en el repo.

Decisiones de diseño clave:
1. **Páginas nativas de Astro, no iframe.** Motivo: el código nace en el repo; contenido bilingüe
   en `data/` validado por Zod (cumple mejor el README «todo el contenido vive en data/»); KaTeX en
   build → MathML sin CSS ni fuentes en el cliente; tokens y fuentes compartidos sin duplicar;
   `astro check` cubre el código numérico; HTML real (SEO, impresión, accesibilidad, hreflang).
2. **Primeras rutas dinámicas del repo**: `[slug].astro` con `getStaticPaths` (2 archivos por
   idioma) en vez de 50 wrappers.
3. **Biblioteca numérica pura** en `src/lib/bioestadistica/` que corre igual en build, navegador y
   `node --test` (Node 22.22 ejecuta `.ts` sin transpilar; imports con extensión `.ts`; sintaxis
   borrable; `erasableSyntaxOnly: true` en `tsconfig.json`; `allowImportingTsExtensions` ya viene
   del preset de Astro).
4. **Contrato «el R que ves es el R que valida»**: el snippet R de cada calculadora vive una sola
   vez (en el YAML, o en `rScript()` cuando hay lógica), se muestra tal cual, lo ejecuta webR tal
   cual y lo ejecuta `Rscript` tal cual para generar los fixtures de prueba.
5. **epiR no corre en webR** (arrastra sf, officer, flextable): los snippets ejecutables usan base
   R + paquetes ligeros (binom, PropCIs, exact2x2, irr, pwr, survival, jsonlite); epiR, DescTools,
   presize y pROC aparecen solo como línea comentada «Equivalente en RStudio» y como oráculo
   secundario local.
6. **Gráficas en SVG propio** (`svg.ts`), sin Plotly ni D3; nomograma de Fagan portado de
   propedéutica como función pura de coordenadas.
7. **Referencias metodológicas en `data/bioestadistica/referencias.bib`** (separado de la
   producción del CA), loader generalizado `loadBib(ruta)`, componente `Referencias.astro` con DOI
   y PMID; clave faltante rompe el build.
8. **Persistencia de R entre calculadoras**: `<ClientRouter />` de `astro:transitions` acotado a
   la sección (se activa en el hito H4; respaldo: reinicio de R por página y modelos en una página
   con pestañas).
9. **Licencias del sitio** (código MIT, contenido CC BY 4.0) declaradas en el pie de la sección;
   no se hereda el pie restrictivo de Laboratorio.
10. Nada de la sección se sirve bajo una ruta con segmento `/data/` (evita el anclaje por hash de
    `audit-performance.py --check-data-baseline`).

## Catálogo, slugs y fases

Convención de nombres (URL, YAML, TS, JSON de R y fixtures usan los mismos ids):
entradas diagnósticas `vp, fp, fn, vn`; asociación `a, b, c, d`; `nivel` como proporción (0.95);
salidas `sn, sp, vpp, vpn, prev, exactitud, youden, lr_pos, lr_neg, dor`, `rr, or, rra, rrr, nnt`,
`chi2, p, phi`, `kappa, po, pe, pabak`, etc. Un vector `[est, lo, hi]` en R equivale a
`{valor, ic}` en TS.

| Slug (`data/bioestadistica/calculadoras/<slug>.yml`) | Espec. | Motor | Hito |
|---|---|---|---|
| `ic-proporcion` (Wilson por defecto, Wilson cc, Clopper-Pearson, Agresti-Coull, Jeffreys por `qbeta`, Wald) | D3 | ts | H0/H1 (primera) |
| `prueba-diagnostica-2x2` (Sn, Sp, VPP, VPN, prev, exactitud, Youden, LR± Simel, DOR Woolf) | A1 | ts | H1 (vertical completa) |
| `probabilidad-posprueba` (Bayes, nomograma de Fagan) | A2 | ts | H1 |
| `valores-predictivos` (desde Sn/Sp/prevalencia, logit de Mercaldo, frecuencias naturales) | A3 | ts | H1 |
| `efecto-2x2` (RR Katz, OR Woolf, RRA Newcombe 10, RRR, NNT Altman, diseño cohorte/casos-controles/transversal) | B1 | ts | H2 |
| `chi-cuadrada-fisher` (Pearson, Yates acotada como R, N−1, Fisher «minlike», φ, regla de Cochran) | B2 | ts | H2 |
| `mcnemar` (exacta si b+c<25, Edwards, δ pareada Wald/Agresti-Min, OR pareado) | B3 | ts | H2 |
| `ic-media` (t; IC de la DE por χ²) | D4 | ts | H2 |
| `descriptivos` (columna pegada: n, media, DE, cuantiles tipo 7, G1, G2, Shapiro-Wilk AS R94, Tukey, histograma + caja) | D6 | ts | H2 |
| `media-desde-mediana` (Luo 2018, Wan 2014, Hozo 2005) | D5 | ts | H2 |
| `muestra-una-proporcion`, `muestra-una-media`, `muestra-dos-proporciones` (Fleiss + cc), `muestra-dos-medias`, `muestra-medias-pareadas` (t no central AS 243 = `power.t.test`), `muestra-prueba-diagnostica` (Buderer), `muestra-correlacion` | C1–C7 | ts | H3 |
| `kappa` (simple, lineal, cuadrática; SE Fleiss-Cohen-Everitt; PABAK) | D1 | ts | H3 |
| `kaplan-meier` (KM, Greenwood, IC log-log, mediana regla `quantile.survfit`, log-rank k grupos) | E3 | ts (+ survival como verificación) | H3 |
| `regresion-logistica` (OR Wald, EPV, HL, AUC DeLong) | E1 | webr | H5 |
| `regresion-cox` (HR, Efron, cox.zph, concordancia) | E2 | webr | H5 |
| `regresion-lineal` (coeficientes, R², VIF, residuos; respaldo TS por QR en fase posterior) | E4 | webr | H5 |
| `icc` (Shrout-Fleiss / McGraw-Wong; Koo-Li) | D2 | webr (cerrado con `qf`, puede pasar a ts) | H5 |
| `curva-roc` (AUC Mann-Whitney + IC DeLong desde columnas pegadas; `roc.ts`) | nuevo | ts | opcional H3 |

Orden de construcción interno (dependencias): primitivas numéricas → `proporciones` (seis IC) →
núcleo 2×2 → posprueba/valores predictivos → McNemar → parser de columnas (media, descriptivos,
Hozo) → bloque C común y C1–C7 → kappa → KM → infraestructura webR → modelos → ICC.

## Arquitectura

### Estructura de archivos

```
data/bioestadistica/
  calculadoras/<slug>.yml            contenido por calculadora: bloque neutro (grupo, orden, estado,
                                     motor, entradas, ejemplo, r.paquetes, r.codigo, referencias,
                                     grafica) + bloques es:/en: idénticos en forma (titulo, titulo_corto,
                                     meta, intro, explicacion[], ecuaciones[{id,tex,simbolos,nota}],
                                     etiquetas, ayudas, interpretacion (claves + variantes por banda
                                     `lrp.grande`…), avisos, metodos, ejemplo_descripcion, grafica_titulo)
  referencias.bib                    clásicos con pmid cuando exista (Wilson 1927, Fisher 1935, Cohen 1960…)
src/lib/bioestadistica/              PURO (sin DOM; corre en build, navegador y node --test)
  primitivas/ especiales.ts (erfc Cody, lgamma Lanczos, lchoose) · incompletas.ts (betaInc Lentz,
              gammaP/Q) · distribuciones.ts (pnorm/qnorm AS241, pt/qt, pnt AS243, pchisq/qchisq,
              pbeta/qbeta, pf/qf, dbinom/pbinom, dhyper) · raices.ts (Brent)
  metodos/    proporciones.ts tabla2x2.ts posprueba.ts asociacion2x2.ts pruebas2x2.ts media.ts
              descriptivos.ts hozo.ts kappa.ts muestra.ts supervivencia.ts roc.ts
  nucleo/     tipos.ts (Estimacion, Resultado, Aviso, Definicion, Presentacion) · bandas.ts ·
              formato.ts (Intl es-MX/en-US, pistas pct1/dec2/sig3/p/lr) · plantillas.ts (rellenar
              {var} y {ref:key}) · codigoR.ts (rellenarR, contrato) · comparar.ts (TS vs JSON de R) ·
              pegado.ts (TSV/CSV, coma decimal, faltantes) · exportar.ts (Markdown, CSV, estado URL) ·
              macros.ts (macros KaTeX)
  calculadoras/<slug>.ts             export const definicion: Definicion (derivar, validar, calcular |
                                     rScript+parsearR, presentar, grafica)
  registro.ts                        import.meta.glob('./calculadoras/*.ts')
  webr.ts                            único módulo con red/worker; solo se carga con import() dinámico
  generado/propedeutica-indice.json  fase 2 (H6), generado por script, chunk hasheado en /_astro/
src/bioestadistica/                  NAVEGADOR: montar.ts (re-entrante, astro:page-load), controlador.ts
                                     (leer→derivar→validar→calcular→presentar→pintar→URL), estado-url.ts,
                                     dom.ts, svg.ts (escalas, ejes, ic-forest, fagan, barras,
                                     histograma-boxplot, km, potencia), exportar-dom.ts
src/components/bioestadistica/       Tabla2x2Input, CampoNumero, PegarColumna, ResultadoCelda,
                                     Interpretacion, Avisos, Ecuacion (KaTeX→MathML), Grafica, CodigoR,
                                     Exportar, Referencias, Autoria, Cita, CardCalculadora
src/components/pages/                BioestadisticaIndexPage.astro · CalculadoraPage.astro (recibe entry)
src/pages/herramientas/bioestadistica.astro · bioestadistica/[slug].astro · y gemelas bajo src/pages/en/
tests/bioestadistica/                casos/<slug>.json · casos/datos/*.csv · r/instalar.R · r/correr_casos.R ·
                                     r/oraculo2_epiR.R · r/generado/<slug>/<id>.R (commiteados) ·
                                     fixtures/<slug>.json · py/oraculo.py · tolerancias.ts · *.test.ts
scripts/bio-fixtures.mjs             casos + YAML → snippets → Rscript → fixtures (--check detecta deriva)
scripts/bioestadistica_indice_propedeutica.mjs   (H6)
docs/bioestadistica/                 ESPECIFICACION.md ARQUITECTURA.md MOTOR.md EXTERNOS.md COMO_AÑADIR.md
```

### Contratos (resumen; detalle en ARQUITECTURA §6 y MOTOR §1–3)

- `Estimacion { valor, ic?, nivel?, metodo: MetodoId }`; `Resultado { calculadora, version: 1,
  entradas, valores: Record<id, Estimacion>, bandas, avisos: Aviso[] }`. La biblioteca nunca
  redondea; `Infinity`/`NaN` significan «no definido» (celdas cero) con aviso; entradas inválidas
  lanzan `RangeError`; Haldane-Anscombe es opción explícita (`corr: 0 | 0.5`) que viaja al snippet.
- `Definicion` por calculadora; el controlador genérico monta cualquier `Definicion`: una
  calculadora nueva = un YAML + un módulo puro + casos/fixtures.
- Interpretación: la numérica produce bandas (`bandas.ts`: LR según Jaeschke 1994, κ según
  Landis-Koch 1977, ICC según Koo-Li 2016, φ/r según Cohen 1988, dirección del NNT); `presentar()`
  elige `textos.interpretacion['lrp.' + banda]` y rellena `{var}` con valores ya formateados.
- Snippet R: marcadores `{ident}` (minúsculas), números con `String(x)`, booleanos como números,
  error si queda un marcador; debe contener `res <- list(` y `cat(toJSON(res, auto_unbox = TRUE,
  digits = NA))`; `"Inf"/"-Inf"/"NaN"/"NA"` se normalizan al comparar. `tol = 1e-10` en
  `power.*.test`. Comentarios breves en inglés; línea final comentada «Equivalente en RStudio».
- Página: `CalculadoraPage` calcula el ejemplo en build (HTML con resultados reales) e inyecta
  `<script type="application/json" is:inline id="bio-datos">` con entradas, ejemplo, textos del
  idioma, plantilla R, números de referencias y claves `bio.ui.*` necesarias; `<script>` importa
  `montar()`.
- Estado en URL: `?vp=68&fp=6&fn=12&vn=114&nivel=0.95&corr=0` (ids = nombres de parámetro),
  `history.replaceState(history.state, '', url)` con debounce 300 ms; sin parámetros se muestra el
  ejemplo con píldora «Ejemplo cargado»; columnas pegadas con tope de longitud.

### Anatomía de la página de calculadora

Barra (← índice, píldora de motor, «Compartir enlace») → dos columnas desde 1024 px: entradas
(`Tabla2x2Input`/`CampoNumero`/`PegarColumna`, nivel de confianza, «Cargar ejemplo», «Limpiar»,
fase 2 «Buscar en Propedéutica») y resultados (`ResultadoCelda` con IC, `Interpretacion`
`aria-live="polite"`, `Avisos`, `Grafica` SVG con `<title>`, barra `Exportar`: Markdown, CSV,
Imprimir) → Explicación (`.prose`) y Ecuaciones (MathML + tabla de símbolos) → Código R («Copiar»,
«Verificar con R» navy, tabla de comparación TS/R con `pill-ok`/`pill-err`) → Métodos para
manuscrito («Copiar») → Referencias numeradas (original/didáctica/complementaria) → asides
`Autoria` (borde navy; autoría, versión, privacidad, licencias) y `Cita` (borde rojo; cita generada
con `bio.cite_template` + «Copiar»). Tokens `--udg-*`, radios ≤ 6 px, sin sombras, nunca rojo y
navy en un mismo componente; `inputmode="decimal"`; CSS `@media print`.

### Integración con el sitio (patrón Laboratorio, exacto)

1. `src/content.config.ts`: `seccion: z.enum(['laboratorio', 'bioestadistica'])`; colección
   `calculadoras` con loader `glob({ pattern: '*.yml', base: 'data/bioestadistica/calculadoras' })`
   y el esquema de ARQUITECTURA §2.1 (refine: al menos una referencia `original`; bloques `es`/`en`
   con el mismo sub-esquema).
2. `data/herramientas.yml`: cinco tarjetas, una por grupo (diagnóstico, asociación, muestra,
   concordancia/descriptivos, modelos), `tipo: estadistica`, `estado: beta`, `seccion:
   bioestadistica`, `orden: 1..5`, `linea: clinica-epidemiologica-traslacional`, `enlace_app:
   "/herramientas/bioestadistica#<grupo>"`, `tecnologias: ["TypeScript", "R", "webR"]`;
   overrides en `data/i18n/en.yml` con `enlace_app: /en/…`.
3. `src/components/pages/HerramientasPage.astro`: tercer bloque `section--bio` (mismas reglas que
   `section--lab`) filtrado por `seccion === 'bioestadistica'` y ordenado por `orden`.
4. `src/i18n.mjs` (ambas tablas): `tools.bio.{kicker,title,intro,index}`; `bio.{kicker,back,
   index.title,index.meta,index.intro,index.cite,grupo.*,grupo_desc.*,authors_heading,authors_text,
   authors_short,version,cite_heading,cite_template,privacy,license}`; `bio.ui.*` (etiquetas de
   interfaz). La cita por calculadora se genera con `bio.cite_template` + título + URL canónica.
5. Rutas: `src/pages/herramientas/bioestadistica.astro`, `…/bioestadistica/[slug].astro` y las
   gemelas bajo `src/pages/en/`. El nav no cambia (`isActive` usa `startsWith('/herramientas')`).
6. `package.json`: `katex` (build), `webr` (tipos), `@types/node` (dev); scripts `test:bio`,
   `test` (performance + bio), `fixtures:bio`, `fixtures:bio:check`, `oraculo2:bio`, `bio:indice`.
7. `src/content-loaders/bibtex.mjs`: `loadBib(bibPath, overridesPath?)` con caché;
   `loadPublicaciones()` como envoltura compatible; `scripts/check-bib.mjs` acepta ruta opcional;
   `src/lib/formatCita.mjs` extendido a `book`/`incollection` y enlace PMID (salida actual intacta).
8. `src/layouts/Base.astro`: `<slot name="head" />` y drawer móvil re-entrante (`astro:page-load`),
   solo en H4.
9. `scripts/audit-performance.py`: aserción nueva `assert not [e for e in external if
   'r-wasm.org' in e['url']]` (H4); `tests/bioestadistica/politica.test.ts` falla si `r-wasm.org`
   aparece fuera de `webr.ts` o si algo de la sección se sirve bajo `/data/`.

### Ecuaciones y referencias

`Ecuacion.astro`: `katex.renderToString(tex, { displayMode, output: 'mathml', throwOnError: true,
strict: 'error', macros })` en build; compuerta visual en H0 (tres ecuaciones en Chrome headless;
Safari si está a mano); plan B `htmlAndMathml` + `import 'katex/dist/katex.min.css'` (Vite emite
CSS y fuentes hasheados en `/_astro/`, locales). `Referencias.astro`: lista numerada desde claves
del `.bib`; `{ref:key}` en la plantilla de Métodos toma el mismo número. Las 22 referencias marcadas
«[verificar]» en la especificación se confirman contra el registro real antes de publicar.

### webR («Verificar con R» y modelos)

`src/lib/bioestadistica/webr.ts` (MOTOR §4): consentimiento explícito con texto ES/EN («Se
descargarán ≈ 15 MB desde webr.r-wasm.org y repo.r-wasm.org… tus datos no se envían a ningún
servidor»), recordado en `localStorage`; `WEBR_BASE_URL = https://webr.r-wasm.org/v0.6.0/`
(nunca `/latest/`), `channelType: PostMessage` (sin COOP/COEP), `installPackages` por paquete con
progreso por etapas, cola de ejecución, `Shelter.captureR` con captura de stdout/stderr,
timeouts con `Promise.race` y `webR.close()` como única interrupción, botón «Liberar memoria»,
aviso previo en dispositivos con poca memoria. `comparar()` muestra tabla campo por campo
(«Coincide en 11/11 campos» o el valor de R junto al de TS). Modelos (H5): la tabla pegada se
escribe como `/home/web_user/datos.csv`, el snippet siempre lee `read.csv("datos.csv")` y el botón
«Descargar datos.csv» acompaña al código para RStudio; guardas EPV < 10, separación, cox.zph.
Documentación del opt-in en `docs/bioestadistica/EXTERNOS.md`, README y `docs/performance/REVIEW.md`.

### Propedéutica (H6)

`scripts/bioestadistica_indice_propedeutica.mjs` genera `src/lib/bioestadistica/generado/
propedeutica-indice.json` (`f === 'full'` con Sn/Sp o LR+; conserva número | [min,max] |
"Infinity" | null; sin promediar rangos). Selector `<dialog>` con búsqueda por signo y condición,
carga bajo demanda con `import()`; rango → el usuario elige un extremo; `"Infinity"` se explica;
enlace «Ver en Propedéutica» (`?lang&signo=<i>`); la URL de la calculadora registra `?signo=`.
`indice.test.ts` compara `meta.version/fecha` con `signos.json`.

## Validación

- **Principio**: R es el oráculo y ejecuta byte a byte el código que ve el usuario.
  `scripts/bio-fixtures.mjs`: lee `r.codigo`/`r.paquetes`/`ejemplo` del YAML (o `rScript()` del
  módulo), antepone el caso `ejemplo`, escribe `tests/bioestadistica/r/generado/<slug>/<id>.R`,
  corre `Rscript tests/bioestadistica/r/correr_casos.R <slug>` y guarda
  `fixtures/<slug>.json` `{ generado_por, meta: { R, plataforma, paquetes, plantilla_sha256 },
  casos: [{ id, entradas, esperado, tol }] }`. `--check` detecta deriva sin tocar el repo.
- **Pruebas `node --test tests/bioestadistica/*.test.ts`** (sin R; consumen fixtures commiteados):
  por calculadora (fixtures + igualdad del snippet generado), `primitivas.test.ts` (identidades
  `pnorm(qnorm(p)) = p`, valores tabulados), `sintaxis.test.ts`, `contenido.test.ts` (paridad
  es/en, claves de interpretación ⊇ `definicion.claves`, ejemplo válido, claves bib existentes,
  snippet cumple el contrato, salidas = etiquetas = `esperado`), `i18n.test.ts` (claves `bio.*` en
  ambas tablas), `plantillas.test.ts`, `pegado.test.ts`, `formato.test.ts`, `estado-url.test.ts`,
  `exportar.test.ts`, `politica.test.ts`, `indice.test.ts` (H6). Pruebas de propiedades: el IC
  contiene la estimación; Wilson ∈ [0,1]; intercambiar filas invierte RR/OR y conserva χ²/Fisher;
  el poder crece con n; Sn de A1 = D3 sobre a/(a+c); OR de logística con un predictor binario =
  ad/bc con IC de Woolf.
- **Tolerancias** (`tolerancias.ts`): cerrados rel 1e-12; con cuantiles/`pchisq` rel 1e-9;
  p exactos rel 1e-8; OR condicional de `fisher.test` rel 5e-4 (R usa `uniroot` a 1.2e-4); n de
  potencia rel 1e-6 y n redondeado igualdad exacta; KM S(t) 1e-12, IC/log-rank 1e-9, mediana
  exacta; `n_pwr` informativo ±1; glm/coxph/lm 1e-6.
- **Oráculos secundarios**: `r/oraculo2_epiR.R` (epiR::epi.tests/epi.2by2, vcd::Kappa,
  pROC::ci.auc) y `py/oraculo.py` (statsmodels/scipy: Wilson, AC, Jeffreys, Fisher, χ², McNemar,
  κ, poder) contra los fixtures.
- **Instalación local** (autorizada): `Rscript -e 'install.packages(c("binom","PropCIs","exact2x2",
  "irr","pwr","presize","epiR","DescTools"), repos = "https://cloud.r-project.org")'`
  (jsonlite, survival, pROC, vcd, ggplot2 ya están).
- **Mac mini**: manual por defecto (`fixtures:bio` cuando cambian plantillas o casos; los fixtures
  se commitean junto con el cambio); opcional launchd semanal `fixtures:bio:check` + humo de webR
  en Chrome headless que notifica deriva sin commitear; fase posterior: Plumber tras Tailscale
  Funnel solo para simulaciones, con botón aparte apagado por defecto y sin datos de paciente.

## Hitos y verificación

Secuencia de cierre de cada hito: `npm run build` · `npm run check` (0 errores/0 avisos) ·
`npm run test` (performance + bio) · `npm run audit:performance -- --check-data-baseline` ·
`npm run preview -- --host 127.0.0.1 --port 4321` + captura Chrome headless (escritorio 1280 px,
móvil 400 px, `--print-to-pdf`) de `/herramientas/bioestadistica/prueba-diagnostica-2x2/?vp=68&fp=6&fn=12&vn=114`
en ES y EN (la extensión de Chrome no alcanza localhost aquí). Commits con prefijo
`BIOESTADISTICA:` en español, como la convención del repo.

| Hito | Entregable | Verificación específica |
|---|---|---|
| **H0 Cimientos** | `npm install` en el worktree; deps y scripts npm; `erasableSyntaxOnly`; enum `seccion`; colección `calculadoras`; 5 tarjetas + `en.yml`; bloque en `HerramientasPage`; claves `tools.bio.*`/`bio.*`; `referencias.bib` inicial; `loadBib`/`formatCita`/`check-bib`; `Ecuacion` + compuerta MathML; `Referencias`; rutas `[slug]` es/en; `CalculadoraPage` e índice; `montar`/`controlador`/`estado-url`/`formato`/`plantillas`; primitivas + `primitivas.test.ts`; `proporciones.ts` + `ic-proporcion` (YAML, módulo, casos, fixture, test); `bio-fixtures.mjs`, `correr_casos.R`, `instalar.R`; docs copiados a `docs/bioestadistica/`. | Circuito completo TS → snippet → Rscript → fixture → test demostrado con `ic-proporcion`; decisión MathML/plan B anotada; conteo de páginas del build = YAML × 2. |
| **H1 Vertical completa** | `prueba-diagnostica-2x2` de punta a punta (ES/EN, ecuaciones, interpretación viva, gráfica `ic-forest`, R, referencias, Métodos, exportes, URL, impresión); `probabilidad-posprueba` (Fagan en `svg.ts`); `valores-predictivos`. | Fixtures en verde; comparación manual de tres resultados contra R local; revisión del dueño sobre la página real. **Se publica** (merge a `main` → Vercel). |
| **H2 Patrón confirmado** | Grupo B (`efecto-2x2`, `chi-cuadrada-fisher`, `mcnemar`); `pegado.ts` + `PegarColumna` con `descriptivos`, `ic-media`, `media-desde-mediana`. | `pegado.test.ts` con pegados reales de Excel/Sheets. |
| **H3 Por patrón** | C1–C7 (bloque común, modo inverso de poder, gráfica `potencia`), `kappa`, `kaplan-meier` (gráfica `km`), opcional `curva-roc`. | Un YAML + un módulo + fixtures cada una; sin tocar componentes. |
| **H4 webR** | `webr.ts`, panel de consentimiento, «Verificar con R» en todas las `motor: ts`, tabla de comparación; `<slot name="head">` + `<ClientRouter />` acotado; drawer re-entrante; aserción anti `r-wasm.org` en la auditoría; `politica.test.ts`; `EXTERNOS.md`, README, REVIEW.md. | Primera carga, segunda carga en caché, sin red; navegar entre dos calculadoras sin reiniciar R (segunda verificación < 1 s); drawer móvil tras navegación interna; Chrome y Safari. |
| **H5 Modelos** | `regresion-logistica`, `regresion-cox`, `regresion-lineal`, `icc` con `PegarColumna` multicolumna, roles, `datos.csv`, forest SVG, guardas. | Fixtures con `casos/datos/*.csv`; comparación con R local. |
| **H6 Propedéutica** | Generador, índice, selector, `?signo=`, `indice.test.ts`; opcional reenvío de `signo` en `PropedeuticaPage`. | `npm run bio:indice` idempotente. |
| **H7 Documentación** | README (sección, comandos, «cómo añadir una calculadora en 4 pasos»), `COMO_AÑADIR.md`, CHANGELOG de fixtures, memoria del proyecto actualizada. | Lectura cruzada por un agente verificador. |

## Riesgos y valores por defecto

- MathML tosco en Chrome → plan B `htmlAndMathml` con CSS/fuentes locales (decidir en H0).
- CDN de webR caído o versión retirada → las calculadoras N1 no dependen de R; mensaje claro;
  versión fijada; humo semanal; endurecimiento autoalojado con imagen `rwasm` construida en la
  Mac mini cuando se congele el conjunto de paquetes (fin de H5).
- Memoria en móviles (R wasm 150–300 MB) → aviso previo, una instancia, «Liberar memoria», nunca
  carga automática.
- `ClientRouter`: scripts no re-entrantes o `history.state` pisado → cinco reglas de
  ARQUITECTURA §6.7, pruebas manuales en móvil; respaldo documentado.
- Deriva de versiones (R local ≠ webR ≠ snippet) → `meta.paquetes` y `plantilla_sha256` en
  fixtures, `fixtures:bio:check`, la UI muestra ambos valores.
- Diferencias de método TS vs R (Yates acotada, `conf.type`, cuantil tipo 7, Jeffreys equal-tailed
  vs `binom` «bayes» HPD, Wald vs perfil) → cada detalle es un `MetodoId` con caso de fixture y el
  snippet pasa argumentos explícitos.
- Deriva i18n → `contenido.test.ts` y `plantillas.test.ts`; el esquema exige `en`.
- Auditoría (`/data/`, recursos externos, Google Fonts) → `politica.test.ts` y aserción nueva.
- Tarjetas: 5 por grupo (no 25). `tipo`: reutilizar `estadistica`. Ejemplo precargado por defecto.
  `es-MX` usa punto decimal; se acepta coma como respaldo en la captura.
- 22 referencias «[verificar]» y nombres de argumentos de paquetes no instalados → confirmar al
  instalar los paquetes (H0) y contra el registro bibliográfico antes de publicar (H1).

## Tareas colaterales

- Actualizar la memoria del proyecto: la regla «idx sin cifras» de propedéutica ya no aplica
  (`PUBLICAR_CIFRAS_MCGEE = True` desde el commit 35ff0ba); registrar la nueva sección y su flujo
  (`fixtures:bio`, `test:bio`, opt-in de webR).
- El pie restrictivo de Laboratorio contradice CC BY 4.0: queda al dueño unificarlo (fuera de alcance).

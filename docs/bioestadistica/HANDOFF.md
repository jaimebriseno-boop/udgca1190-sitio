# Handoff — Bioestadística abierta

Fecha: 17 de septiembre de 2026 (cierre de H1). Para continuar en un contexto nuevo, en ESTA carpeta:
`/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta` (worktree de Orca; no hacer
`cd` al checkout principal `/Volumes/Bioinformatics/Programacion/UDG-CA-1190`, que está en `main`).

## Leer primero

1. [PROGRESO.md](PROGRESO.md): estado por hito y verificación conservada.
2. [DECISIONES.md](DECISIONES.md): desviaciones respecto a los diseños (H0 y H1) y convenciones fijadas.
3. [PLAN.md](PLAN.md): plan maestro (catálogo de 24 calculadoras, slugs, hitos, riesgos).
4. Según el hito, las secciones pertinentes de [ESPECIFICACION.md](ESPECIFICACION.md) (estadística),
   [ARQUITECTURA.md](ARQUITECTURA.md) (Astro/cliente) y [MOTOR.md](MOTOR.md) (R, fixtures, webR).
   Son archivos de 60–80 KB: leerlos por rangos (`grep -n "^## "` y `sed -n`).
5. Patrones de referencia: `ic-proporcion` (campos sueltos, un panel) y `prueba-diagnostica-2x2`
   (tabla 2×2, selectores, Haldane, dos paneles): `data/bioestadistica/calculadoras/<slug>.yml`,
   `src/lib/bioestadistica/calculadoras/<slug>.ts`, `tests/bioestadistica/casos/<slug>.json`,
   `tests/bioestadistica/<slug>.test.ts`. Para entradas opcionales con `derivar()`, `valores-predictivos`;
   para una gráfica que no es un bosque, `probabilidad-posprueba` (fagan) y `valores-predictivos` (curvas).

## Pedido y decisiones del dueño (Dr. Jaime Briseño Ramírez, 16-sep-2026)

Construir dentro del sitio una alternativa mejor que VassarStats para las herramientas más usadas en
investigación clínica: en español e inglés, código abierto, cálculo en el navegador (los datos no salen),
código R visible y ejecutable en el navegador, ecuación clásica y explicación sencilla, cita de los autores
originales, interpretación en lenguaje llano que se actualiza al escribir, y exportes para manuscrito.

Decisiones cerradas (no volver a preguntarlas):

- Nombre largo «Bioestadística abierta aplicada a la investigación clínica»; corto «Bioestadística
  abierta»; lema «Calcula, entiende, cita»; en inglés «Open Biostatistics applied to clinical research».
  Slug fijo `/herramientas/bioestadistica`.
- Motor híbrido: TypeScript instantáneo + R real en el navegador (webR) bajo demanda; webR por CDN con
  versión fijada (`webr.r-wasm.org/v0.6.0/`, `repo.r-wasm.org`) solo tras consentimiento; autoalojar
  queda como endurecimiento posterior.
- Primer lote: diagnóstico, asociación 2×2, tamaño de muestra, concordancia/descriptivos, más regresión
  logística, Cox, Kaplan-Meier y lineal.
- Sección dentro de Herramientas (patrón Laboratorio). Bilingüe desde el inicio.
- Autoría: «Briseño-Ramírez J, De Arcos-Jiménez JC» (CA UDG-CA-1190, CUTlajomulco, UdeG).
- Paquetes de R: autorizado instalarlos (ya están en la biblioteca del sistema, R 4.5.2 arm64).
- Plan aprobado el 16-sep-2026 («Aprobar y empezar H0»). Commits en la rama con prefijo
  `BIOESTADISTICA:` en español. Publicación = merge a `main` tras revisión del dueño.
- Fuera de alcance: propedéutica (otro proyecto; sus archivos `PROGRESS.md`/`SESSION_HANDOFF.md` en la
  raíz son de ese trabajo y no se tocan); el pie restrictivo de Laboratorio queda al dueño.

## Estado Git

- Rama `jaimebriseno-boop/Bioestadistica-abierta`; H0 = `e69d80b`; `origin/main` fusionado en `b9e00e6`;
  H1 = commit `BIOESTADISTICA: H1 …` (ver `git log --oneline -3`). Empujada a `origin` (vista previa de
  Vercel de la rama; no toca producción). NO fusionada en `main`: la sección sigue sin publicar.
- Remoto `https://github.com/jaimebriseno-boop/udgca1190-sitio.git`; `main` despliega en Vercel.
- Antes de cambiar nada: `git status --short --branch`, `git log --oneline -3`, y comprobar que `main`
  no avanzó (`git fetch && git log --oneline HEAD..origin/main`); si avanzó, `git merge origin/main`
  antes de seguir (en H1 se fusionó limpio).

## Mapa de archivos

| Ruta | Función |
|---|---|
| `data/bioestadistica/calculadoras/<slug>.yml` | Contenido bilingüe + entradas (`opciones` para selectores), `tabla2x2`, ejemplo, `r.codigo`, referencias, `grafica` (esquema Zod en `src/content.config.ts`) |
| `data/bioestadistica/referencias.bib` | 25 referencias metodológicas; clave faltante rompe el build (`Referencias.astro`); lint con `node scripts/check-bib.mjs data/bioestadistica/referencias.bib` |
| `src/lib/bioestadistica/nucleo/tipos.ts` | Contrato: `Estimacion`, `Resultado`, `Definicion`, `Presentacion`, `Contexto`, `DatosGrafica` (unión `ic-forest` con `paneles` · `fagan` · `curvas`) |
| `src/lib/bioestadistica/primitivas/` | erf/lgamma/beta y gamma incompletas, Brent, distribuciones (p/q/d) validadas contra R |
| `src/lib/bioestadistica/metodos/` | `proporciones` (seis IC), `razones` (log-Wald: Simel, Woolf, Haldane), `diagnostico` (núcleo 2×2), `bayes` (momios), `predictivos` (Mercaldo) |
| `src/lib/bioestadistica/nucleo/` | `formato`, `plantillas`, `bandas`, `macros` (KaTeX), `codigoR`, `comparar`, `svg` (bosque con paneles, fagan, curvas), `entrada`, `exportar` |
| `src/lib/bioestadistica/calculadoras/<slug>.ts` | `definicion` pura: `claves`, `avisos`, `salidas`, `derivar?`, `validar`, `calcular`, `presentar`, `grafica` |
| `src/bioestadistica/` | Navegador: `montar` (re-entrante), `controlador` (ciclo genérico + totales `[data-total]` + rótulos de opciones), `estado-url`, `dom`, `cita`, `registro` |
| `src/components/bioestadistica/` | `Tabla2x2Input`, `CampoOpcion`, `CampoNumero`, `ResultadoCelda`, `Interpretacion`, `Avisos`, `Ecuacion`, `Grafica` (estilos globales de los SVG), `CodigoR`, `Exportar`, `Referencias`, `Autoria`, `Cita`, `CardCalculadora` |
| `src/components/pages/CalculadoraPage.astro`, `BioestadisticaIndexPage.astro` | Página de calculadora (SSR del ejemplo + `#bio-datos`; reparte tabla/selectores/campos) e índice por grupos |
| `src/pages/herramientas/bioestadistica{.astro,/[slug].astro}` y `src/pages/en/...` | Rutas (`getStaticPaths` desde la colección) |
| `src/i18n.mjs` | Claves `tools.bio.*`, `bio.*`, `bio.ui.*` en ES y EN; `tPrefijo(lang, 'bio.ui.')` |
| `scripts/bio-fixtures.mjs` | Casos + YAML → snippets `.R` → `Rscript` → `tests/bioestadistica/fixtures/<slug>.json` (`--solo`, `--check`) |
| `tests/bioestadistica/` | `casos/`, `r/` (instalar, correr_casos, primitivas), `r/generado/` (commiteado), `fixtures/`, `tolerancias.ts`, `util.ts` (`leerYaml`, `leerFixture`, `contextoDePrueba`, `conDerivadas`), `*.test.ts` |
| `docs/bioestadistica/` | PLAN, ESPECIFICACION, ARQUITECTURA, MOTOR, DECISIONES, PROGRESO, HANDOFF |

## Cómo se añade una calculadora (patrón H0/H1)

1. YAML en `data/bioestadistica/calculadoras/<slug>.yml`: bloque neutro (`grupo`, `orden`, `motor`,
   `entradas`, `tabla2x2` opcional, `ejemplo`, `r.paquetes`, `r.codigo` con marcadores `{id}`,
   `referencias`, `grafica`) y bloques `es`/`en` de forma idéntica. El snippet R debe contener
   `res <- list(` y `cat(toJSON(res, auto_unbox = TRUE, digits = NA))`; solo paquetes ligeros (base, binom,
   PropCIs, exact2x2, irr, pwr, survival, jsonlite); epiR/DescTools/pROC solo como línea comentada. Claves
   del JSON = ids de salida = claves de `etiquetas` de salida. Un selector es una entrada con `opciones`
   (tipo `opcion` si su valor es texto; tipo `decimal`/`entero` si debe llegar a R como número, p. ej.
   `corr: ["0", "0.5"]`) y cada opción necesita `etiquetas["<id>.<opcion>"]` en los dos idiomas. Una
   tabla 2×2 se declara con `tabla2x2: { celdas: [f1c1, f1c2, f2c1, f2c2] }` y las etiquetas `tabla.filas`,
   `tabla.columnas`, `tabla.fila1`, `tabla.fila2`, `tabla.col1`, `tabla.col2`, `tabla.total`. Toda clave de
   `interpretacion`/`avisos` del YAML debe usarla el módulo (`claves`/`avisos`) y viceversa.
2. Módulo puro `src/lib/bioestadistica/calculadoras/<slug>.ts` que exporta `definicion` (mismo `id` que el
   slug). Métodos reutilizables en `metodos/`. Nada de DOM ni `astro:*`; imports con `.ts`. Una entrada
   opcional que el snippet R necesita se completa en `derivar()` (p. ej. `n_d` vacío = 0).
3. Referencias nuevas en `referencias.bib` (con `pmid` si existe; verificar PMID con
   `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=<pmid>&retmode=json` y DOI con
   `https://api.crossref.org/works/<doi>`).
4. `tests/bioestadistica/casos/<slug>.json` (el caso `ejemplo` se antepone solo; un caso puede fijar `tol`
   para elegir otro perfil de `tolerancias.ts`) → `npm run fixtures:bio -- --solo <slug>` →
   `tests/bioestadistica/<slug>.test.ts` (fixture + igualdad del snippet + propiedades + `presentar()` en
   ambos idiomas con `contextoDePrueba`). `contenido.test.ts`, `sintaxis.test.ts` e `i18n.test.ts`
   descubren la nueva calculadora solos.
5. Si la calculadora necesita un control nuevo (columna pegada) o una gráfica nueva (barras,
   histograma-boxplot, km, potencia), añadirlo en `src/components/bioestadistica/`, en `nucleo/svg.ts`
   (renderizador puro) y en los enums de `content.config.ts`/`tipos.ts` (la unión `DatosGrafica` y
   `textosDeGrafica` de `contenido.test.ts`); `CalculadoraPage` lanza error de build si un YAML declara un
   tipo de entrada sin control.

## Comandos

```sh
cd /Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta
git status --short --branch && git log --oneline -3
npm run build            # 47 páginas al cierre de H1 (10 de la sección)
npm run check            # 0 errores / 0 advertencias (124 hints preexistentes)
npm run test             # performance + bio (4 + 471 al cierre de H1)
npm run fixtures:bio     # regenera fixtures con Rscript (solo si cambian plantillas o casos)
npm run fixtures:bio:check
npm run audit:performance          # sin --check-data-baseline (ver pendiente ajeno); restaurar luego docs/performance/after.json
npm run preview -- --host 127.0.0.1 --port 4321
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,3400 --virtual-time-budget=5000 --screenshot=/tmp/calc.png \
  "http://127.0.0.1:4321/herramientas/bioestadistica/prueba-diagnostica-2x2/?vp=68&fp=6&fn=12&vn=114"
# 400 px reales: --window-size=400,5200 · impresión: --no-pdf-header-footer --print-to-pdf=/tmp/calc.pdf
# comprobar el DOM tras ejecutar el JS: --virtual-time-budget=4000 --dump-dom <url>
```

## Reglas que deben conservarse

- «El R que ves es el R que valida»: el snippet vive una sola vez en el YAML (o en `rScript`), lo muestra la
  página, lo ejecutará webR y lo ejecuta `Rscript` para el fixture, sin transformarlo.
- La biblioteca nunca redondea; `Infinity`/`NaN` significan «no definido» con aviso; entradas inválidas
  lanzan `RangeError`; Haldane-Anscombe es opción explícita (`corr: 0 | 0.5`) que viaja al snippet y solo
  afecta a las razones; un IC de razón con celda 0 es `[NaN, NaN]` en TS y `NA` en R por regla explícita.
- Tolerancias en `tests/bioestadistica/tolerancias.ts` (cerrado 1e-12 + suelo 1e-14; cuantiles 1e-9;
  exactos 1e-8; OR condicional 5e-4; potencia 1e-6). No aflojar tolerancias para que algo pase: reportar.
- Sintaxis TS borrable (`erasableSyntaxOnly`), imports relativos con `.ts`, `import type`; Node 22.22
  ejecuta `.ts` sin transpilar y un `.mjs` puede importar `.ts`.
- Textos de interfaz solo por `t()`/`tPrefijo()`/YAML; paridad ES/EN vigilada por `contenido.test.ts` e
  `i18n.test.ts`. Tokens `--udg-*`; nunca rojo y navy en un mismo componente; sin botón primario rojo;
  series de las gráficas distinguibles por trazo (no solo por color) para imprimir en blanco y negro.
- Nada de la sección bajo una ruta con segmento `/data/`; ningún recurso externo declarado en HTML/CSS
  (webR solo por `import()` tras consentimiento, H4).
- Una sola región `aria-live` (interpretación + avisos; los `<output>` de totales van con
  `aria-live="off"`); estado en la URL con `replaceState(history.state, …)`.
- Fixtures y `.R` generados se commitean junto con el cambio de plantilla o de casos
  (`fixtures:bio:check` y `plantilla_sha256` lo obligan).

## H2 · Patrón confirmado (siguiente)

Entregables (PLAN «Hitos», ESPECIFICACION B1–B3 y D4–D6):

1. Grupo B con el patrón de H1: `efecto-2x2` (RR de Katz, OR de Woolf, RRA de Newcombe método 10, RRR,
   NNT de Altman; diseño cohorte/casos-controles/transversal como `opcion`; tabla 2×2 con ids `a, b, c, d`
   y etiquetas `tabla.*` de exposición/desenlace; Haldane como en A1), `chi-cuadrada-fisher` (Pearson,
   Yates acotada como R, N−1, Fisher «minlike», φ, regla de Cochran; `fisher.test` para el OR condicional
   con perfil `fisher_or`) y `mcnemar` (exacta si b + c < 25, Edwards, δ pareada Wald/Agresti-Min, OR
   pareado). Gráfica: bosque con paneles (razones en log, diferencias en lineal con referencia 0).
2. Columnas pegadas: `nucleo/pegado.ts` (`parsearPegado`: separadores tab/`;`/`,`/salto de línea, coma
   decimal, encabezado, NA) + `PegarColumna.astro` (tipo de entrada `columna`; el controlador ya codifica
   columnas en la URL con `;` y tope de 1,500 caracteres) con `descriptivos` (n, media, DE, cuantiles tipo
   7, G1, G2, Shapiro-Wilk AS R94, Tukey; gráfica `histograma-boxplot` nueva en `svg.ts`), `ic-media`
   (t; IC de la DE por χ²) y `media-desde-mediana` (Luo 2018, Wan 2014, Hozo 2005). Las columnas exigen
   `Definicion.rScript` (los vectores no se interpolan en una plantilla de texto): el generador de fixtures
   y los tests deberán usar `codigoR({ rScript })` en lugar de `rellenarR(r.codigo)` para esas
   calculadoras (hoy `scripts/bio-fixtures.mjs` solo conoce `r.codigo`).
3. Cierre como H1: secuencia completa de verificación, capturas ES/EN, revisión de código independiente,
   commit `BIOESTADISTICA: H2 …`, vista previa para el dueño.

## Flujo de trabajo que funcionó (H0 y H1) y trampas

- Orquestador escribe primero los contratos (`tipos.ts`, esquema Zod, tolerancias, convenciones del
  YAML) y lanza agentes en paralelo sobre archivos disjuntos (SVG / interfaz Astro + controlador) mientras
  escribe la numérica, los YAML, los casos y las pruebas; al final un `code-reviewer` independiente.
  Si un contrato cambia a mitad (en H1, `PanelIC.titulo` → `rotulo`), avisar al agente por mensaje.
- La extensión de Chrome no alcanza localhost en este equipo: usar Chrome headless (`--screenshot`,
  `--print-to-pdf`, `--dump-dom` con `--virtual-time-budget`). Sí acepta `--window-size=400,…`.
- La salida de un comando de Bash se persiste a archivo por encima de ~25 KB: leer archivos grandes por
  rangos.
- `toJSON(digits = NA)` de jsonlite escribe 15 cifras: las tolerancias «cerradas» necesitan suelo absoluto.
  `NA` numérico viaja como la cadena `"NA"`, `Inf` como `"Inf"`; `normalizarR` los resuelve.
- `astro check` cubre también `tests/`: un `any` implícito en una prueba rompe el check; anotar tipos en
  los callbacks de `filter`/`map` cuando el estrechamiento se pierde en bucles anidados.
- KaTeX con `strict: 'error'` y `output: 'mathml'` compila las ecuaciones en build; las letras griegas en
  Unicode dentro del `tex` pasan la compuerta, así que escribirlas como comandos LaTeX. Macros disponibles
  en `nucleo/macros.ts` (`\Sn`, `\Sp`, `\LRp`, `\LRn`, `\DOR`, `\logit`, `\expit`, `\se`…).
- `docs/performance/after.json` se reescribe con cada auditoría: restaurarlo (`git checkout --`) salvo
  commit deliberado.
- Memoria persistente del asistente: `~/.claude/projects/-Volumes-Bioinformatics-Programacion-UDG-CA-1190/memory/`
  (`project-bioestadistica-abierta.md`) apunta a estos archivos.

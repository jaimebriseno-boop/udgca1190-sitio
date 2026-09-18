# Handoff — Bioestadística abierta

Fecha: 17 de septiembre de 2026 (cierre de H3, pendiente de visto bueno y publicación). Para continuar en un contexto nuevo, en ESTA carpeta:
`/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta` (worktree de Orca; no hacer
`cd` al checkout principal `/Volumes/Bioinformatics/Programacion/UDG-CA-1190`, que está en `main`).

## Leer primero

1. [PROGRESO.md](PROGRESO.md): estado por hito y verificación conservada.
2. [DECISIONES.md](DECISIONES.md): desviaciones respecto a los diseños (H0–H3) y convenciones fijadas.
3. [PLAN.md](PLAN.md): plan maestro (catálogo de 24 calculadoras, slugs, hitos, riesgos).
4. Según el hito, las secciones pertinentes de [ESPECIFICACION.md](ESPECIFICACION.md) (estadística),
   [ARQUITECTURA.md](ARQUITECTURA.md) (Astro/cliente) y [MOTOR.md](MOTOR.md) (R, fixtures, webR).
   Son archivos de 60–80 KB: leerlos por rangos (`grep -n "^## "` y `sed -n`).
5. Patrones de referencia: `ic-proporcion` (campos sueltos, un panel) y `prueba-diagnostica-2x2`
   (tabla 2×2, selectores, Haldane, dos paneles): `data/bioestadistica/calculadoras/<slug>.yml`,
   `src/lib/bioestadistica/calculadoras/<slug>.ts`, `tests/bioestadistica/casos/<slug>.json`,
   `tests/bioestadistica/<slug>.test.ts`. Para entradas opcionales con `derivar()`, `valores-predictivos`
   (0 = «no disponible») y `media-desde-mediana` (`NaN` = «no capturado», que viaja a R como `NA`);
   para una gráfica que no es un bosque, `probabilidad-posprueba` (fagan), `valores-predictivos`
   (curvas), `chi-cuadrada-fisher` y `mcnemar` (barras), `descriptivos` y `media-desde-mediana`
   (histograma-boxplot, con y sin bins); para un bosque de tres paneles con referencias distintas,
   `efecto-2x2`; para una columna pegada (`tipo: columna`), `descriptivos`; para replicar una
   raíz numérica de R (`uniroot` de `fisher.test`), `metodos/independencia.ts`; para un port de un
   algoritmo publicado con fixture propio, `metodos/shapiro.ts` + `tests/bioestadistica/shapiro.test.ts`;
   para tamaño de muestra con modo inverso y el convenio «0 = sin dato», `muestra-dos-proporciones`
   (bloque común C0 en `metodos/muestra-comun.ts`; `power.prop.test`/`power.t.test` replicados con
   `uniroot`); para una tabla k×k pegada (`tipo: tabla`, `k` derivado), `kappa`; para varias columnas
   pegadas con grupos, `Resultado.extras` (vectores validados contra R) y la gráfica `km`, `kaplan-meier`.

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
  H1 = `2c37184` (+ `033f464`, registro de su verificación); H2 = commit `BIOESTADISTICA: H2 …` (ver
  `git log --oneline -3`; H2 = `1772462`, `e02aa46`, `08a3d94`, `35bffcb`). El 17-sep-2026 el dueño
  dio el visto bueno («quedó excelente», «publicar») y la rama se lleva a `main` por fast-forward
  (`git push origin jaimebriseno-boop/Bioestadistica-abierta:main`): H0–H2 PUBLICADOS en
  udgca1190.com.mx. El checkout principal (`/Volumes/Bioinformatics/Programacion/UDG-CA-1190`, en
  `main`) puede quedar atrasado: `git pull` allí cuando haga falta; el trabajo sigue en este worktree.
  H3 = `f04f4dd` (más el commit de registro que le sigue), en la rama y en `origin`, PENDIENTE de visto
  bueno del dueño y del fast-forward a `main` (`git push origin jaimebriseno-boop/Bioestadistica-abierta:main`).
- Remoto `https://github.com/jaimebriseno-boop/udgca1190-sitio.git`; `main` despliega en Vercel.
- Antes de cambiar nada: `git status --short --branch`, `git log --oneline -3`, y comprobar que `main`
  no avanzó (`git fetch && git log --oneline HEAD..origin/main`); si avanzó, `git merge origin/main`
  antes de seguir (en H1 se fusionó limpio).

## Mapa de archivos

| Ruta | Función |
|---|---|
| `data/bioestadistica/calculadoras/<slug>.yml` | Contenido bilingüe + entradas (`opciones` para selectores), `tabla2x2`, ejemplo, `r.codigo`, referencias, `grafica` (esquema Zod en `src/content.config.ts`) |
| `data/bioestadistica/referencias.bib` | 89 referencias metodológicas (25 de H0/H1 + 33 de H2 + 31 de H3); clave faltante rompe el build (`Referencias.astro`); lint con `node scripts/check-bib.mjs data/bioestadistica/referencias.bib` |
| `src/lib/bioestadistica/nucleo/tipos.ts` | Contrato: `Estimacion`, `Resultado`, `Definicion`, `Presentacion`, `Contexto`, `DatosGrafica` (unión `ic-forest` con `paneles` · `fagan` · `curvas` con `referenciaY` · `barras` · `histograma-boxplot` · `km`); `Resultado.extras` (vectores de longitud variable comparados elemento a elemento) |
| `src/lib/bioestadistica/primitivas/` | erf/lgamma/beta y gamma incompletas, Brent y `uniroot` (traducción literal del `R_zeroin2` de R, para reproducir lo que R resuelve con `uniroot`), distribuciones (p/q/d, incluida la t no central `pnt`) validadas contra R |
| `src/lib/bioestadistica/metodos/` | `proporciones` (seis IC), `razones` (log-Wald: Simel, Woolf, Haldane), `diagnostico` (núcleo 2×2), `bayes` (momios), `predictivos` (Mercaldo), `efecto` (RR, OR, RRA Newcombe 10/Wald, RRR, NNT), `independencia` (χ², Yates, N−1, Fisher minlike, OR condicional, φ), `pareadas` (McNemar, δ pareada, OR pareado), `medias` (IC t, IC χ² de la DE), `resumenes` (Luo, Wan, Hozo), `descriptivos` (momentos, cuantiles tipo 7, Tukey, Sturges), `shapiro` (AS R94), `muestra-comun` (C0: zAlfa, zPoder, pérdidas, techo), `muestra-estimacion` (C1/C2: Cochran, CPF, t iterada, `SIN_DATO`/`hayDato`), `muestra-proporciones` (C3: Fleiss ± corrección, `power.prop.test`, h de Cohen), `muestra-medias` (C4/C5: t no central como `power.t.test`, Guenther), `muestra-diagnostica` (C6: Buderer), `muestra-correlacion` (C7: z de Fisher, `pwr.r.test`), `kappa` (κ simple/ponderada, EE de Fleiss-Cohen-Everitt, z/p como `irr::kappa2`, κ máxima por transporte, PABAK/Byrt), `supervivencia` (Kaplan-Meier, Greenwood log-log/log, mediana `quantile.survfit`, log-rank) |
| `src/lib/bioestadistica/nucleo/` | `formato`, `plantillas`, `bandas`, `macros` (KaTeX), `codigoR` (vectores → `c(...)`, `NaN` → `NA`), `comparar`, `svg` (bosque con paneles, fagan, curvas con línea de referencia, barras, histograma-boxplot, `km` con banda, censuras y tabla en riesgo), `entrada`, `pegado` (`parsearPegado`, `resumenPegado`, `parsearTablaPegada`, `resumenTabla`, `textoDeTabla`), `avisos` (`interpolar`, `paramsDeAvisos`), `exportar` |
| `src/lib/bioestadistica/calculadoras/<slug>.ts` | `definicion` pura: `claves`, `avisos`, `salidas`, `derivar?`, `validar`, `calcular`, `presentar`, `grafica` |
| `src/bioestadistica/` | Navegador: `montar` (re-entrante), `controlador` (ciclo genérico + totales `[data-total]` + rótulos de opciones), `estado-url`, `dom`, `cita`, `registro` |
| `src/components/bioestadistica/` | `Tabla2x2Input`, `CampoOpcion`, `CampoNumero`, `PegarColumna` (textarea + resumen del pegado), `PegarTabla` (tabla k×k pegada, aplanada por filas), `ResultadoCelda`, `Interpretacion`, `Avisos` (con `params` para el SSR), `Ecuacion`, `Grafica` (estilos globales de los SVG), `CodigoR`, `Exportar`, `Referencias`, `Autoria`, `Cita`, `CardCalculadora` |
| `src/components/pages/CalculadoraPage.astro`, `BioestadisticaIndexPage.astro` | Página de calculadora (SSR del ejemplo + `#bio-datos`; reparte tabla/selectores/campos) e índice por grupos |
| `src/pages/herramientas/bioestadistica{.astro,/[slug].astro}` y `src/pages/en/...` | Rutas (`getStaticPaths` desde la colección) |
| `src/i18n.mjs` | Claves `tools.bio.*`, `bio.*`, `bio.ui.*` en ES y EN; `tPrefijo(lang, 'bio.ui.')` |
| `scripts/bio-fixtures.mjs` | Casos + YAML → snippets `.R` → `Rscript` → `tests/bioestadistica/fixtures/<slug>.json` (`--solo`, `--check`) |
| `scripts/bio-barrido.mjs` | Barrido de `presentar()`/`grafica()` en ES/EN sobre ~75k combinaciones de las 19 calculadoras (lista `SLUGS` fija + un bloque de combinaciones por calculadora; cuenta los casos válidos por calculadora y falla si alguna queda en cero); compuerta de cierre de hito |
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
   `interpretacion`/`avisos` del YAML debe usarla el módulo (`claves`/`avisos`) y viceversa. Una columna
   pegada es `{ id: x, tipo: columna, min: 2 }` (`min` = número mínimo de valores) con `ejemplo.x` como
   lista de números y `x <- {x}` en el snippet: `codigoR` la escribe como `c(...)` multilínea. Un aviso
   con parámetros (`params`) se interpola con `nucleo/avisos.ts` tanto en build como en el navegador. En
   el snippet, un escalar «no definido» se escribe `NA_real_` (un `NA` lógico da la vuelta por jsonlite
   como `{}`); un vector `c(NA, NA, NA)` sí viaja bien.
2. Módulo puro `src/lib/bioestadistica/calculadoras/<slug>.ts` que exporta `definicion` (mismo `id` que el
   slug). Métodos reutilizables en `metodos/`. Nada de DOM ni `astro:*`; imports con `.ts`. Una entrada
   opcional que el snippet R necesita se completa en `derivar()` con el convenio «0 = sin dato» (`n_d`,
   `n_dado`, `poblacion`, `t1`…): el ejemplo del YAML y TODOS los casos JSON deben traer el marcador (Zod
   y el generador de fixtures no admiten `NaN` ni `null`), y el snippet decide con `if (x > 0) … else
   NA_real_`. `NaN → NA` solo sirve cuando el ejemplo y los casos traen siempre el valor
   (`media-desde-mediana`). Un vector de longitud variable que también imprime R (tabla de vida) va en
   `Resultado.extras` y el comparador lo coteja elemento a elemento.
3. Referencias nuevas en `referencias.bib` (con `pmid` si existe; verificar PMID con
   `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=<pmid>&retmode=json` y DOI con
   `https://api.crossref.org/works/<doi>`).
4. `tests/bioestadistica/casos/<slug>.json` (el caso `ejemplo` se antepone solo; un caso puede fijar `tol`
   para elegir otro perfil de `tolerancias.ts`) → `npm run fixtures:bio -- --solo <slug>` →
   `tests/bioestadistica/<slug>.test.ts` (fixture + igualdad del snippet + propiedades + `presentar()` en
   ambos idiomas con `contextoDePrueba`). `contenido.test.ts`, `sintaxis.test.ts` e `i18n.test.ts`
   descubren la nueva calculadora solos.
5. Si la calculadora necesita un control nuevo (tabla k×k, varias columnas pegadas) o una gráfica nueva
   (km, potencia), añadirlo en `src/components/bioestadistica/`, en `nucleo/svg.ts` (renderizador puro)
   y en los enums de `content.config.ts`/`tipos.ts` (la unión `DatosGrafica` y `textosDeGrafica` de
   `contenido.test.ts`); `CalculadoraPage` lanza error de build si un YAML declara un tipo de entrada sin
   control. Ya existen `ic-forest` (con paneles), `fagan`, `curvas`, `barras` e `histograma-boxplot`, y
   los controles `entero`/`decimal`/`proporcion`/`porcentaje` (`CampoNumero`), `opcion` (`CampoOpcion`),
   `tabla2x2` (`Tabla2x2Input`) y `columna` (`PegarColumna`).

## Comandos

```sh
cd /Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta
git status --short --branch && git log --oneline -3
npm run build            # 73 páginas al cierre de H3 (40 de la sección: índice + 19 calculadoras × 2 idiomas)
npm run check            # 0 errores / 0 advertencias (124 hints preexistentes)
npm run test             # performance + bio (4 + 1,833 al cierre de H3; ver PROGRESO para la cifra vigente)
npm run fixtures:bio     # regenera fixtures con Rscript (solo si cambian plantillas o casos)
npm run fixtures:bio:check
npm run barrido:bio      # presentar()/grafica() de las 19 calculadoras sobre ~75k combinaciones × 2 idiomas (~4 min); compuerta de cierre de hito, sale con 1 si hay problemas o si una calculadora queda sin casos válidos
npm run audit:performance          # sin --check-data-baseline (ver pendiente ajeno); restaurar luego docs/performance/after.json
npm run preview -- --host 127.0.0.1 --port 4321
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,3400 --virtual-time-budget=5000 --screenshot=/tmp/calc.png \
  "http://127.0.0.1:4321/herramientas/bioestadistica/prueba-diagnostica-2x2/?vp=68&fp=6&fn=12&vn=114"
# 400 px reales: --window-size=400,5200 · impresión: --no-pdf-header-footer --print-to-pdf=/tmp/calc.pdf
# comprobar el DOM tras ejecutar el JS: --virtual-time-budget=4000 --dump-dom <url>
# una columna pegada por URL: /herramientas/bioestadistica/descriptivos/?x=1;2;3;4;5;60&nivel=0.9
# esperar al preview sin `sleep`: curl -s --retry 40 --retry-connrefused --retry-delay 1 -o /dev/null <url>
# agentes en paralelo: NUNCA `npm run build` ni `astro preview` (comparten dist/); cada uno
#   `npm run dev -- --host 127.0.0.1 --port <propio>` y apaga solo su PID (`lsof -ti tcp:<puerto>`), nunca `pkill -f astro`
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
- Convenio «0 = sin dato» para las entradas numéricas OPCIONALES (`requerido: false`, `min: 0`): el
  controlador no registra un cuadro vacío (llega `undefined`), `derivar()` lo convierte en 0 y nunca
  reinterpreta un 0 capturado; el snippet ramifica con `if (x >= umbral) … else NA_real_`. Ni el YAML
  (Zod `z.number()`) ni los casos JSON admiten `NaN`; `NaN → NA` queda solo para `media-desde-mediana`.
- YAML: el LaTeX de `simbolos[].def`, `nota` y cualquier texto va entre comillas simples o en prosa.
  Entre comillas dobles, `\c` (de `\cdot`) aborta la carga del archivo (tumba build y `astro check`
  de todos) y `\a`, `\b`, `\e`, `\f`, `\v`, `\0` se convierten en caracteres de control sin aviso;
  `contenido.test.ts` rechaza cualquier carácter de control en los textos.

## H3 · Por patrón (hecho; pendiente de visto bueno y publicación)

Diecinueve calculadoras en total. Lo entregado en H3, con sus desviaciones motivadas en DECISIONES «H3»:

1. Grupo `muestra` (siete): `muestra-una-proporcion` (Cochran + CPF + inverso), `muestra-una-media` (z y
   t iterada, CPF, inverso), `muestra-dos-proporciones` (Fleiss ± corrección de continuidad,
   `power.prop.test`, `pwr.2p.test`), `muestra-dos-medias` y `muestra-medias-pareadas` (t no central
   exacta como `power.t.test(tol = 1e-10)`, Guenther, inverso; C5 acepta σ_d directa o σ y ρ),
   `muestra-prueba-diagnostica` (Buderer 1996) y `muestra-correlacion` (z de Fisher, `pwr.r.test`,
   inverso). Bloque común C0 en `metodos/muestra-comun.ts`; gráfica `curvas` con `referenciaY` (no un
   renderizador `potencia` aparte); `uniroot` en `primitivas/raices.ts`.
2. `kappa` (D1): tabla k×k pegada (`tipo: tabla`, `PegarTabla.astro`, `parsearTablaPegada`), κ simple, lineal y
   cuadrática, EE de Fleiss-Cohen-Everitt, z y p como `irr::kappa2`, κ máxima, PABAK e índices de Byrt
   con k = 2; bosque `ic-forest`.
3. `kaplan-meier` (E3): tres columnas pegadas (tiempo, evento, grupo opcional con ≤ 2 niveles), Greenwood
   log-log/log, mediana con la regla de `quantile.survfit` e IC de Brookmeyer-Crowley, S(t) en dos
   tiempos opcionales («0 = sin dato»), log-rank; tabla de vida validada entera contra `survfit` vía
   `Resultado.extras`; renderizador `km`.
4. Infraestructura: barrido ampliado a las 19 calculadoras con contador por calculadora; guarda de
   caracteres de control en `contenido.test.ts`; tarjeta `bio-modelos` de `data/herramientas.yml` en
   beta; `bio.grupo_desc.modelos` distingue lo disponible de lo pendiente.

Pendientes documentados que NO bloquean: `curva-roc` (opcional del PLAN); log-rank con ≥ 3 grupos y
pegado de una tabla con roles (H5); mecanismo de plurales («1 pacientes»); p unilateral de Fisher, mid-p
de McNemar, opciones D6 y Shi 2020 (H2); `docs/performance/baseline.json` desactualizado (ajeno).

## H4 · webR (siguiente)

Entregables (PLAN «Hitos» H4; MOTOR §3–§4 y ARQUITECTURA §7 para el detalle):

1. Botón «Verificar con R» en cada calculadora: carga de webR por `import()` dinámico desde el CDN con
   versión fijada (`https://webr.r-wasm.org/v0.6.0/`, paquetes desde `https://repo.r-wasm.org`) SOLO tras
   un consentimiento explícito (diálogo con lo que se descarga y desde dónde; recordar la decisión en
   `localStorage`); ningún recurso externo declarado en HTML/CSS (`audit:performance` lo vigila).
2. Ejecutar el snippet visible tal cual (el mismo que corre `Rscript` en el fixture), capturar el JSON,
   normalizarlo con `normalizarR` y compararlo con `comparar()` usando el perfil de `tolerancias.ts` de
   esa calculadora; panel con la tabla de coincidencias/discrepancias y un aviso claro si un paquete no
   está disponible en webR (comprobar `binom`, `PropCIs`, `exact2x2`, `irr`, `pwr`, `survival`).
3. Política de hosts y CSP del sitio (Vercel): permitir solo los dos orígenes de webR; documentar en
   ARQUITECTURA. `ClientRouter`/estado: el worker de webR debe sobrevivir a la navegación entre
   calculadoras o reiniciarse limpio; los datos pegados nunca salen del navegador (webR corre local).
4. Pruebas: unitarias del adaptador (mock de webR), una prueba de humo con Chrome headless que cargue una
   calculadora, acepte el consentimiento y compare (marcarla como lenta/opcional si el CDN no responde).
5. Cierre como H1–H3: verificación completa (incluido `npm run barrido:bio`), capturas, revisión
   independiente, commit `BIOESTADISTICA: H4 …`, vista previa y fast-forward a `main` con visto bueno.

## Flujo de trabajo que funcionó (H0–H3) y trampas

- Orquestador escribe primero los contratos (`tipos.ts`, esquema Zod, tolerancias, convenciones del
  YAML) y lanza agentes en paralelo sobre archivos disjuntos (SVG / interfaz Astro + controlador) mientras
  escribe la numérica, los YAML, los casos y las pruebas; al final un `code-reviewer` independiente.
  Si un contrato cambia a mitad (en H1, `PanelIC.titulo` → `rotulo`), avisar al agente por mensaje.
  En H2 escaló bien a ocho agentes (uno por calculadora, más SVG, interfaz y bibliografía) con los
  ids de salida, los perfiles de tolerancia, las claves del .bib y los tipos de gráfica fijados de
  antemano en el prompt de cada uno; cada agente corre solo sus pruebas y
  `node --test --test-name-pattern="<slug>" tests/bioestadistica/contenido.test.ts` para no chocar con
  los YAML a medio escribir de los demás. Un agente puede escribir a otro (d6 avisó a la interfaz del
  defecto de los avisos en SSR): útil, pero el orquestador debe enterarse.
- Un agente que ejecuta `npm run audit:performance` deja `docs/performance/after.json` modificado:
  revisar `git status` antes del commit.
- La extensión de Chrome no alcanza localhost en este equipo: usar Chrome headless (`--screenshot`,
  `--print-to-pdf`, `--dump-dom` con `--virtual-time-budget`). Sí acepta `--window-size=400,…`.
- La salida de un comando de Bash se persiste a archivo por encima de ~25 KB: leer archivos grandes por
  rangos.
- `toJSON(digits = NA)` de jsonlite escribe 15 cifras: las tolerancias «cerradas» necesitan suelo absoluto.
  `NA_real_` viaja como la cadena `"NA"`, `Inf` como `"Inf"`; `normalizarR` los resuelve. Un `NA` lógico
  escalar (`NA` a secas) da la vuelta por `fromJSON`/`toJSON` de `correr_casos.R` como `{}` y el
  comparador lo rechaza: en los snippets, siempre `NA_real_`.
- `PropCIs` no siempre implementa el método que su nombre sugiere (`diffscoreci` no es Newcombe 10):
  antes de apoyar un snippet en un paquete, imprimir su `body()` con `Rscript` y compararlo con la
  fórmula de la especificación; si difiere, escribir la fórmula a mano y dejar el paquete comentado.
- `mcnemar.test(correct = TRUE)` solo corrige si b ≠ c; `chisq.test` acota Yates; `binom.test` bilateral
  suma masas con `relErr = 1 + 1e-7`; `t.test` falla con datos constantes; `shapiro.test` exige
  3 ≤ n ≤ 5000 y rango > 0: cada regla de R que TS reproduce va escrita en el snippet, con guardas.
- Los casos de fixture son JSON: no admiten `NaN` ni `Infinity`; una entrada opcional ausente se prueba
  con `derivar()` en la prueba, no con un caso del fixture.
- `Avisos.astro` necesita los `params` del resultado para el SSR; sin ellos el HTML publica los
  marcadores en crudo hasta que carga el JavaScript.
- `npm run test` comprueba el ejemplo y los casos de fixture; una clave de aviso o de interpretación
  que solo se activa en otra combinación (p. ej. `direccion.*` de McNemar a medio escribir entre módulo
  y YAML) solo la ve `npm run barrido:bio` (`scripts/bio-barrido.mjs`, del revisor de H2). Pasarlo
  después del último retoque y antes del commit de cierre de cada hito; al añadir una calculadora,
  añadirle su bloque de combinaciones.
- `parsearNumero` quita los espacios de miles: cualquier analizador que le pase una celda con
  espacios debe haber decidido antes si el espacio separa valores («150 160 170») o agrupa miles
  («1 234»); `pegado.ts` lo resuelve con la regla de un solo hueco. Probar siempre el pegado de una
  tabla de texto plano (PDF), no solo el de Excel.
- `astro check` cubre también `tests/`: un `any` implícito en una prueba rompe el check; anotar tipos en
  los callbacks de `filter`/`map` cuando el estrechamiento se pierde en bucles anidados.
- KaTeX con `strict: 'error'` y `output: 'mathml'` compila las ecuaciones en build; las letras griegas en
  Unicode dentro del `tex` pasan la compuerta, así que escribirlas como comandos LaTeX. Macros disponibles
  en `nucleo/macros.ts` (`\Sn`, `\Sp`, `\LRp`, `\LRn`, `\DOR`, `\logit`, `\expit`, `\se`…).
- `docs/performance/after.json` se reescribe con cada auditoría: restaurarlo (`git checkout --`) salvo
  commit deliberado.
- H3 escaló a diez agentes en dos oleadas (siete calculadoras de muestra, kappa, Kaplan-Meier, SVG `km`,
  control de tabla y bibliografía). Lo que hay que fijar en el prompt de cada uno, además de ids, perfiles
  y claves del .bib: (1) que NUNCA ejecuten `npm run build` ni `astro preview` (comparten `dist/`: un
  build a medias rompió chunks a tres previews ajenos) y que capturen con `npm run dev` en un puerto
  propio, apagando solo su PID (hubo tres `pkill -f astro` que tumbaron servidores de otros); (2) el
  convenio de las entradas opcionales; (3) que la lista `SLUGS` del barrido la toca solo el orquestador.
- Un YAML roto de un agente tumba `contenido.test.ts`, `astro check` (aborta en «Syncing content» y un
  «0 errores» leído en ese estado no mide nada) y el build de TODOS: pasar `js-yaml` sobre los 19 YAML
  antes de dar por buena una compuerta global mientras haya archivos a medio escribir.
- `Partial<EntradasX>` en una prueba vuelve opcional también la firma de índice de `Entradas` y el
  objeto deja de ser asignable (`ValorEntrada | undefined`): declarar los ajustes campo a campo
  (`interface Ajustes { p?: number; … }`) o `Partial<Pick<…>>`.
- Los campos `requerido: false` llegan `undefined` al motor; el barrido los ejerce también en blanco.
  `calcular()`/`presentar()` no deben lanzar con nada que `validar()` acepte (C2 lanzaba con σ ≪ d).
- R tiene esquinas que el snippet debe esquivar y documentar: `factor()` ordena los niveles como texto
  («1», «10», «2»: `irr::kappa2` desplaza los pesos con k = 10; `survfit` invertiría los grupos con
  códigos 2 y 10 → `levels = sort(unique(x))`), `pwr` no acepta `alternative = "one.sided"` (usar
  `"greater"` con `abs(h)`), `power.t.test` con `extendInt = "upX"` devuelve n < 2 y `uniroot` falla
  sin cambio de signo (guardas explícitas en ambos lados), `pwr.r.test` se detiene si ni con 4 pares baja
  del poder (`tryCatch` → `NA_real_`).
- Que TS y R coincidan no demuestra que el número sea correcto cuando los dos implementan el mismo
  algoritmo (en H3, el punto fijo de la t de una media entraba en un ciclo de periodo 2 en ambos lados y
  el fixture validaba un n una unidad corto): las propiedades matemáticas de la salida (mínimo que
  cumple la condición, monotonía, cotas) necesitan su propia prueba, y la fórmula se contrasta con la
  fuente original, no solo con R.
- Toda guarda del motor (suelos, topes, `NA` por diseño irresoluble) va también en el snippet, con un
  caso de fixture en cada extremo; y si R extiende el corchete de `uniroot` (`extendInt = "upX"` en
  `power.prop.test`/`power.t.test`), TypeScript debe extenderlo igual o el snippet debe llevar la misma
  guarda: [1, 1e7] fijo daba NaN donde R resolvía 3.9 × 10⁸.
- Los totales del grupo `muestra` son sumas de techos por grupo (159 + 159 = 318), nunca el techo de la
  suma (317 dejaría a un grupo por debajo de su n).
- El rótulo de «no definido» tiene DOS fuentes: `NO_DEFINIDO` en `nucleo/formato.ts` (lo que devuelve
  `fmt.num(NaN)`) y `bio.ui.no_definido` en `i18n.mjs`; cambiar uno sin el otro deja páginas mezcladas.
- Todo lo que R pueda ABORTAR con entradas que `validar()` acepta va en `tryCatch` dentro del snippet
  (`survdiff` con varianza nula lanza un error de Lapack; `pwr.r.test` sin cambio de signo se detiene):
  el snippet es el código que el usuario copia a RStudio y que ejecutará webR, y un error ahí rompe la
  regla de oro aunque TypeScript degrade bien.
- Al portar una función de R, portar también su preprocesado silencioso: `approx()` ORDENA los nodos
  antes de interpolar (el IC de la mediana de `quantile.survfit` dependía de ello), `factor()` ordena
  los niveles como texto, `uniroot(extendInt=)` estira el corchete. Un port «de la fórmula» sin esos
  pasos coincide en los casos fáciles y diverge en los bordes.
- `correr_casos.R` NO relee ni reescribe el JSON del snippet: lo valida y lo copia tal cual dentro de
  `casos`. Releerlo con `fromJSON(simplifyVector = TRUE)` volvía el vector `[4]` en el escalar `4` (y
  `comparar()` lo rechazaba, lo que impedía un `extras` de longitud 1) y con `simplifyVector = FALSE`
  cambiaba los `null` por "NA". Cualquier transformación intermedia acaba apareciendo como deriva.
- Un campo mal condicionado (resta de casi iguales, como z de kappa frente a κ = 0 con p_e → 1) se
  ataca primero reproduciendo la AGRUPACIÓN de operaciones del oráculo (kappa2 trabaja con conteos y
  divide entre n al final: con eso la diferencia bajó de 1.5e-8 a 0); solo si eso es imposible se le da
  un perfil propio y documentado en `tolerancias.ts`, nunca un `cerrado` aflojado para todos.
- Memoria persistente del asistente: `~/.claude/projects/-Volumes-Bioinformatics-Programacion-UDG-CA-1190/memory/`
  (`project-bioestadistica-abierta.md`) apunta a estos archivos.

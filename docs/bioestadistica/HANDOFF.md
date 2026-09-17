# Handoff — Bioestadística abierta

Fecha: 17 de septiembre de 2026 (cierre de H2). Para continuar en un contexto nuevo, en ESTA carpeta:
`/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta` (worktree de Orca; no hacer
`cd` al checkout principal `/Volumes/Bioinformatics/Programacion/UDG-CA-1190`, que está en `main`).

## Leer primero

1. [PROGRESO.md](PROGRESO.md): estado por hito y verificación conservada.
2. [DECISIONES.md](DECISIONES.md): desviaciones respecto a los diseños (H0, H1 y H2) y convenciones fijadas.
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
   algoritmo publicado con fixture propio, `metodos/shapiro.ts` + `tests/bioestadistica/shapiro.test.ts`.

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
  `git log --oneline -3`). Empujada a `origin` (vista previa de Vercel de la rama; no toca producción).
  NO fusionada en `main`: la sección sigue sin publicar; el dueño no ha dado aún el visto bueno sobre las
  páginas reales (lo pidió «continuar con los siguientes pasos», no «publicar»).
- Remoto `https://github.com/jaimebriseno-boop/udgca1190-sitio.git`; `main` despliega en Vercel.
- Antes de cambiar nada: `git status --short --branch`, `git log --oneline -3`, y comprobar que `main`
  no avanzó (`git fetch && git log --oneline HEAD..origin/main`); si avanzó, `git merge origin/main`
  antes de seguir (en H1 se fusionó limpio).

## Mapa de archivos

| Ruta | Función |
|---|---|
| `data/bioestadistica/calculadoras/<slug>.yml` | Contenido bilingüe + entradas (`opciones` para selectores), `tabla2x2`, ejemplo, `r.codigo`, referencias, `grafica` (esquema Zod en `src/content.config.ts`) |
| `data/bioestadistica/referencias.bib` | 58 referencias metodológicas (25 de H0/H1 + 33 de H2); clave faltante rompe el build (`Referencias.astro`); lint con `node scripts/check-bib.mjs data/bioestadistica/referencias.bib` |
| `src/lib/bioestadistica/nucleo/tipos.ts` | Contrato: `Estimacion`, `Resultado`, `Definicion`, `Presentacion`, `Contexto`, `DatosGrafica` (unión `ic-forest` con `paneles` · `fagan` · `curvas` · `barras` · `histograma-boxplot`) |
| `src/lib/bioestadistica/primitivas/` | erf/lgamma/beta y gamma incompletas, Brent, distribuciones (p/q/d) validadas contra R |
| `src/lib/bioestadistica/metodos/` | `proporciones` (seis IC), `razones` (log-Wald: Simel, Woolf, Haldane), `diagnostico` (núcleo 2×2), `bayes` (momios), `predictivos` (Mercaldo), `efecto` (RR, OR, RRA Newcombe 10/Wald, RRR, NNT), `independencia` (χ², Yates, N−1, Fisher minlike, OR condicional, φ), `pareadas` (McNemar, δ pareada, OR pareado), `medias` (IC t, IC χ² de la DE), `resumenes` (Luo, Wan, Hozo), `descriptivos` (momentos, cuantiles tipo 7, Tukey, Sturges), `shapiro` (AS R94) |
| `src/lib/bioestadistica/nucleo/` | `formato`, `plantillas`, `bandas`, `macros` (KaTeX), `codigoR` (vectores → `c(...)`, `NaN` → `NA`), `comparar`, `svg` (bosque con paneles, fagan, curvas, barras, histograma-boxplot), `entrada`, `pegado` (`parsearPegado`, `resumenPegado`), `avisos` (`interpolar`, `paramsDeAvisos`), `exportar` |
| `src/lib/bioestadistica/calculadoras/<slug>.ts` | `definicion` pura: `claves`, `avisos`, `salidas`, `derivar?`, `validar`, `calcular`, `presentar`, `grafica` |
| `src/bioestadistica/` | Navegador: `montar` (re-entrante), `controlador` (ciclo genérico + totales `[data-total]` + rótulos de opciones), `estado-url`, `dom`, `cita`, `registro` |
| `src/components/bioestadistica/` | `Tabla2x2Input`, `CampoOpcion`, `CampoNumero`, `PegarColumna` (textarea + resumen del pegado), `ResultadoCelda`, `Interpretacion`, `Avisos` (con `params` para el SSR), `Ecuacion`, `Grafica` (estilos globales de los SVG), `CodigoR`, `Exportar`, `Referencias`, `Autoria`, `Cita`, `CardCalculadora` |
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
   `interpretacion`/`avisos` del YAML debe usarla el módulo (`claves`/`avisos`) y viceversa. Una columna
   pegada es `{ id: x, tipo: columna, min: 2 }` (`min` = número mínimo de valores) con `ejemplo.x` como
   lista de números y `x <- {x}` en el snippet: `codigoR` la escribe como `c(...)` multilínea. Un aviso
   con parámetros (`params`) se interpola con `nucleo/avisos.ts` tanto en build como en el navegador. En
   el snippet, un escalar «no definido» se escribe `NA_real_` (un `NA` lógico da la vuelta por jsonlite
   como `{}`); un vector `c(NA, NA, NA)` sí viaja bien.
2. Módulo puro `src/lib/bioestadistica/calculadoras/<slug>.ts` que exporta `definicion` (mismo `id` que el
   slug). Métodos reutilizables en `metodos/`. Nada de DOM ni `astro:*`; imports con `.ts`. Una entrada
   opcional que el snippet R necesita se completa en `derivar()` (p. ej. `n_d` vacío = 0, o `q1` vacío =
   `NaN`, que llega a R como `NA`; los casos JSON de fixture no admiten `NaN`: esa ruta se prueba aparte).
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
npm run build            # 55 páginas al cierre de H2 (22 de la sección: índice + 10 calculadoras × 2 idiomas)
npm run check            # 0 errores / 0 advertencias (124 hints preexistentes)
npm run test             # performance + bio (4 + 961 al cierre de H2; ver PROGRESO para la cifra vigente)
npm run fixtures:bio     # regenera fixtures con Rscript (solo si cambian plantillas o casos)
npm run fixtures:bio:check
npm run audit:performance          # sin --check-data-baseline (ver pendiente ajeno); restaurar luego docs/performance/after.json
npm run preview -- --host 127.0.0.1 --port 4321
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,3400 --virtual-time-budget=5000 --screenshot=/tmp/calc.png \
  "http://127.0.0.1:4321/herramientas/bioestadistica/prueba-diagnostica-2x2/?vp=68&fp=6&fn=12&vn=114"
# 400 px reales: --window-size=400,5200 · impresión: --no-pdf-header-footer --print-to-pdf=/tmp/calc.pdf
# comprobar el DOM tras ejecutar el JS: --virtual-time-budget=4000 --dump-dom <url>
# una columna pegada por URL: /herramientas/bioestadistica/descriptivos/?x=1;2;3;4;5;60&nivel=0.9
# esperar al preview sin `sleep`: curl -s --retry 40 --retry-connrefused --retry-delay 1 -o /dev/null <url>
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

## H3 · Por patrón (siguiente)

Entregables (PLAN «Hitos» y «Catálogo»; ESPECIFICACION C0–C7 en las líneas 188–278, D1 en 280–310 y E3
en 418–441; MOTOR §1.6 para Kaplan-Meier en TS):

1. Tamaño de muestra y poder, grupo `muestra`, siete calculadoras con el bloque común C0 (α uni/bilateral,
   poder, razón de asignación r, pérdidas L con `n_aj = ceil(n/(1 − L))`, modo inverso «poder dado n»,
   techo una sola vez al final, gráfica `potencia` nueva en `svg.ts`: curva de poder frente a n con el
   punto elegido): `muestra-una-proporcion` (con corrección por población finita), `muestra-una-media`,
   `muestra-dos-proporciones` (Fleiss con y sin corrección de continuidad; `power.prop.test(tol = 1e-10)`),
   `muestra-dos-medias` y `muestra-medias-pareadas` (t no central: `pnt` AS 243 ya existe en
   `primitivas/distribuciones.ts`; `power.t.test(tol = 1e-10)`), `muestra-prueba-diagnostica` (Buderer
   1996) y `muestra-correlacion` (z de Fisher; `pwr::pwr.r.test` como comparación ±1). Perfiles de
   tolerancia `potencia` ya definidos. Conviene un módulo común `metodos/muestra.ts` y un `presentar`
   compartido para el bloque C0 (Métodos y avisos comunes), para no repetir siete veces lo mismo.
2. `kappa` (D1): tabla k×k (2 ≤ k ≤ 10) simple/lineal/cuadrática con EE de Fleiss-Cohen-Everitt, z y p,
   PABAK e índices de Byrt para k = 2; paquete `irr` como oráculo (`irr::kappa2` necesita las
   calificaciones fila a fila: el snippet debe reconstruirlas desde la tabla o escribir la fórmula a mano).
   Necesita un control nuevo de tabla k×k (`tipo: tabla`): `exportar.ts` ya codifica `tabla` en la URL
   como lista con `;` (fila a fila), pero no hay componente ni rama en el controlador; decidir si se
   captura como rejilla editable con selector de k o como texto pegado (MOTOR §5.1 `parsearTabla`).
3. `kaplan-meier` (E3) en TS contra `survfit`/`survdiff`: columnas tiempo, evento y grupo (≤ 6 niveles):
   hace falta el pegado de VARIAS columnas (`parsearPegado` solo toma la primera columna y avisa), es
   decir, `parsearTabla` de MOTOR §5.1 y un control multicolumna con selección de roles; gráfica `km`
   nueva; casos obligatorios de MOTOR §1.6; mediana con la regla de `quantile.survfit`; IC log-log
   explícito. Opcional `curva-roc` (AUC de Mann-Whitney + IC de DeLong).
4. Cierre como H1/H2: verificación completa, capturas ES/EN, revisión independiente, commit
   `BIOESTADISTICA: H3 …`, vista previa para el dueño. Antes de H3 conviene cerrar el merge de H1 + H2
   con el visto bueno del dueño, para que la vista previa de Vercel de `main` refleje la sección.

## Flujo de trabajo que funcionó (H0–H2) y trampas

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
- `astro check` cubre también `tests/`: un `any` implícito en una prueba rompe el check; anotar tipos en
  los callbacks de `filter`/`map` cuando el estrechamiento se pierde en bucles anidados.
- KaTeX con `strict: 'error'` y `output: 'mathml'` compila las ecuaciones en build; las letras griegas en
  Unicode dentro del `tex` pasan la compuerta, así que escribirlas como comandos LaTeX. Macros disponibles
  en `nucleo/macros.ts` (`\Sn`, `\Sp`, `\LRp`, `\LRn`, `\DOR`, `\logit`, `\expit`, `\se`…).
- `docs/performance/after.json` se reescribe con cada auditoría: restaurarlo (`git checkout --`) salvo
  commit deliberado.
- Memoria persistente del asistente: `~/.claude/projects/-Volumes-Bioinformatics-Programacion-UDG-CA-1190/memory/`
  (`project-bioestadistica-abierta.md`) apunta a estos archivos.

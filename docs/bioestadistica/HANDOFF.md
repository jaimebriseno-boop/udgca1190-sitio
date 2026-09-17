# Handoff — Bioestadística abierta

Fecha: 16 de septiembre de 2026. Para continuar en un contexto nuevo, en ESTA carpeta:
`/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta` (worktree de Orca; no hacer
`cd` al checkout principal `/Volumes/Bioinformatics/Programacion/UDG-CA-1190`, que está en `main`).

## Leer primero

1. [PROGRESO.md](PROGRESO.md): estado por hito y verificación conservada.
2. [DECISIONES.md](DECISIONES.md): desviaciones respecto a los diseños y convenciones fijadas en H0.
3. [PLAN.md](PLAN.md): plan maestro (catálogo de 24 calculadoras, slugs, hitos, riesgos).
4. Según el hito, las secciones pertinentes de [ESPECIFICACION.md](ESPECIFICACION.md) (estadística),
   [ARQUITECTURA.md](ARQUITECTURA.md) (Astro/cliente) y [MOTOR.md](MOTOR.md) (R, fixtures, webR).
   Son archivos de 60–80 KB: leerlos por rangos (`grep -n "^## "` y `sed -n`).
5. Como patrón de referencia: `data/bioestadistica/calculadoras/ic-proporcion.yml`,
   `src/lib/bioestadistica/calculadoras/ic-proporcion.ts`, `tests/bioestadistica/casos/ic-proporcion.json`
   e `ic-proporcion.test.ts`.

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
  `BIOESTADISTICA:` en español. Publicación = merge a `main` tras revisión del dueño (H1).
- Fuera de alcance: propedéutica (otro proyecto; sus archivos `PROGRESS.md`/`SESSION_HANDOFF.md` en la
  raíz son de ese trabajo y no se tocan); el pie restrictivo de Laboratorio queda al dueño.

## Estado Git

- Rama `jaimebriseno-boop/Bioestadistica-abierta`, base `main` = `44fa230`; H0 = `e69d80b` (95 archivos);
  empujada a `origin` (crea vista previa en Vercel, no toca producción).
- Remoto `https://github.com/jaimebriseno-boop/udgca1190-sitio.git`; `main` despliega en Vercel.
- Antes de cambiar nada: `git status --short --branch`, `git log --oneline -3`, y comprobar que `main`
  no avanzó (`git fetch && git log --oneline main..origin/main`); si avanzó, `git merge origin/main`
  (o rebase) antes de seguir.

## Mapa de archivos

| Ruta | Función |
|---|---|
| `data/bioestadistica/calculadoras/<slug>.yml` | Contenido bilingüe + entradas, ejemplo, `r.codigo`, referencias, `grafica` (esquema Zod en `src/content.config.ts`) |
| `data/bioestadistica/referencias.bib` | Referencias metodológicas; clave faltante rompe el build (`Referencias.astro`) |
| `src/lib/bioestadistica/nucleo/tipos.ts` | Contrato: `Estimacion`, `Resultado`, `Definicion`, `Presentacion`, `Contexto`, `DatosGrafica` |
| `src/lib/bioestadistica/primitivas/` | erf/lgamma/beta y gamma incompletas, Brent, distribuciones (p/q/d) validadas contra R |
| `src/lib/bioestadistica/metodos/proporciones.ts` | Seis IC de una proporción con la aritmética de `binom::binom.confint` |
| `src/lib/bioestadistica/nucleo/` | `formato` (Intl, pistas), `plantillas` (`{var}`, `{ref:key}`), `bandas` (LR, κ, ICC, Cohen, NNT), `macros` (KaTeX), `codigoR` (`rellenarR`, contrato, `parsearJsonR`), `comparar` (TS vs R), `svg` (ic-forest, escalas, ejes), `entrada` (parseo de números), `exportar` (URL, CSV, Markdown) |
| `src/lib/bioestadistica/calculadoras/<slug>.ts` | `definicion` pura: `claves`, `avisos`, `salidas`, `validar`, `calcular`, `presentar`, `grafica` |
| `src/bioestadistica/` | Navegador: `montar` (re-entrante), `controlador` (ciclo genérico), `estado-url`, `dom`, `cita`, `registro` (`import.meta.glob`) |
| `src/components/bioestadistica/` | `CampoNumero`, `ResultadoCelda`, `Interpretacion`, `Avisos`, `Ecuacion` (KaTeX→MathML), `Grafica`, `CodigoR`, `Exportar`, `Referencias`, `Autoria`, `Cita`, `CardCalculadora` |
| `src/components/pages/CalculadoraPage.astro`, `BioestadisticaIndexPage.astro` | Página de calculadora (SSR del ejemplo + `#bio-datos`) e índice por grupos |
| `src/pages/herramientas/bioestadistica{.astro,/[slug].astro}` y `src/pages/en/...` | Rutas (primeras `getStaticPaths` del repo) |
| `src/i18n.mjs` | Claves `tools.bio.*`, `bio.*`, `bio.ui.*` en ES y EN; `tPrefijo(lang, 'bio.ui.')` |
| `scripts/bio-fixtures.mjs` | Casos + YAML → snippets `.R` → `Rscript` → `tests/bioestadistica/fixtures/<slug>.json` (`--solo`, `--check`) |
| `tests/bioestadistica/` | `casos/`, `r/` (instalar, correr_casos, primitivas), `r/generado/` (commiteado), `fixtures/`, `tolerancias.ts`, `util.ts`, `*.test.ts` |
| `docs/bioestadistica/` | PLAN, ESPECIFICACION, ARQUITECTURA, MOTOR, DECISIONES, PROGRESO, HANDOFF |

## Cómo se añade una calculadora (patrón H0)

1. YAML en `data/bioestadistica/calculadoras/<slug>.yml`: bloque neutro (`grupo`, `orden`, `motor`,
   `entradas`, `ejemplo`, `r.paquetes`, `r.codigo` con marcadores `{id}`, `referencias`, `grafica`) y bloques
   `es`/`en` de forma idéntica. El snippet R debe contener `res <- list(` y
   `cat(toJSON(res, auto_unbox = TRUE, digits = NA))`; solo paquetes ligeros (base, binom, PropCIs, exact2x2,
   irr, pwr, survival, jsonlite); epiR/DescTools/pROC solo como línea comentada. Claves del JSON = ids de
   salida = claves de `etiquetas` de salida.
2. Módulo puro `src/lib/bioestadistica/calculadoras/<slug>.ts` que exporta `definicion` (mismo `id` que el
   slug). Métodos reutilizables en `metodos/`. Nada de DOM ni `astro:*`; imports con `.ts`.
3. Referencias nuevas en `referencias.bib` (con `pmid` si existe).
4. `tests/bioestadistica/casos/<slug>.json` (el caso `ejemplo` se antepone solo) →
   `npm run fixtures:bio -- --solo <slug>` → `tests/bioestadistica/<slug>.test.ts` (fixture + igualdad del
   snippet + propiedades). `contenido.test.ts`, `sintaxis.test.ts` e `i18n.test.ts` descubren la nueva
   calculadora solos.
5. Si la calculadora necesita un control nuevo (tabla 2×2, columna pegada, opción) o una gráfica nueva,
   añadirlo en `src/components/bioestadistica/`, en `nucleo/svg.ts` (renderizador puro) y en los enums de
   `content.config.ts`/`tipos.ts`; `CalculadoraPage` lanza error de build si un YAML declara un tipo de
   entrada sin control.

## Comandos

```sh
cd /Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta
git status --short --branch && git log --oneline -3
npm run build            # 37 páginas al cierre de H0
npm run check            # 0 errores / 0 advertencias (121 hints preexistentes)
npm run test             # performance + bio (4 + 261 al cierre de H0)
npm run fixtures:bio     # regenera fixtures con Rscript (solo si cambian plantillas o casos)
npm run fixtures:bio:check
npm run audit:performance          # sin --check-data-baseline (ver pendiente ajeno)
npm run preview -- --host 127.0.0.1 --port 4321
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,2000 --screenshot=/tmp/calc.png "http://127.0.0.1:4321/herramientas/bioestadistica/ic-proporcion/?x=68&n=80"
# comprobar el DOM tras ejecutar el JS: --virtual-time-budget=4000 --dump-dom <url>
```

## Reglas que deben conservarse

- «El R que ves es el R que valida»: el snippet vive una sola vez en el YAML (o en `rScript`), lo muestra la
  página, lo ejecutará webR y lo ejecuta `Rscript` para el fixture, sin transformarlo.
- La biblioteca nunca redondea; `Infinity`/`NaN` significan «no definido» con aviso; entradas inválidas
  lanzan `RangeError`; Haldane-Anscombe es opción explícita (`corr: 0 | 0.5`) que viaja al snippet.
- Tolerancias en `tests/bioestadistica/tolerancias.ts` (cerrado 1e-12 + suelo 1e-14; cuantiles 1e-9;
  exactos 1e-8; OR condicional 5e-4; potencia 1e-6). No aflojar tolerancias para que algo pase: reportar.
- Sintaxis TS borrable (`erasableSyntaxOnly`), imports relativos con `.ts`, `import type`; Node 22.22
  ejecuta `.ts` sin transpilar y un `.mjs` puede importar `.ts`.
- Textos de interfaz solo por `t()`/`tPrefijo()`/YAML; paridad ES/EN vigilada por `contenido.test.ts` e
  `i18n.test.ts`. Tokens `--udg-*`; nunca rojo y navy en un mismo componente; sin botón primario rojo.
- Nada de la sección bajo una ruta con segmento `/data/`; ningún recurso externo declarado en HTML/CSS
  (webR solo por `import()` tras consentimiento, H4).
- Una sola región `aria-live` (interpretación + avisos); estado en la URL con `replaceState(history.state, …)`.
- Fixtures y `.R` generados se commitean junto con el cambio de plantilla o de casos
  (`fixtures:bio:check` y `plantilla_sha256` lo obligan).

## H1 · Vertical completa (siguiente)

Entregables (PLAN «Hitos» y ESPECIFICACION A1–A3):

1. `prueba-diagnostica-2x2` (A1): entradas `vp, fp, fn, vn` (enteros ≥ 0), `nivel`, método de IC de
   proporciones (`opcion`: wilson por defecto, clopper-pearson, agresti-coull, jeffreys, wald) y `corr`
   (0 | 0.5, Haldane-Anscombe). Salidas: `n, sn, sp, vpp, vpn, prev, exactitud, youden, lr_pos, lr_neg, dor`
   (PLAN fija `sn`; ESPECIFICACION/MOTOR escriben `se`: usar `sn` y el mismo id en el snippet R). IC:
   proporciones con `metodos/proporciones.ts`; LR± por Simel 1991 (log); DOR por Woolf; Youden por delta.
   Ejemplo transversal: 68 / 6 / 12 / 114 (NS1 vs RT-PCR, ilustrativo). Casos mínimos: el ejemplo;
   68/0/12/120 (LR+ ∞ y Haldane); 5/1/2/7; 0/6/80/114; 80/0/0/120; nivel 0.90 y 0.99; cada método de IC.
   Snippet R: el de MOTOR §3.2 parametrizado (`methods = metodo`, `corr`, IC de Youden). Avisos: celda
   cero, n pequeño (fila < 10), prevalencia extrema, Wald no recomendado. Bandas LR con
   `bandas.ts` (Jaeschke). Gráfica: `ic-forest` de Sn/Sp/VPP/VPN/exactitud y un segundo panel logarítmico
   para LR±/DOR con referencia en 1 (decidir si `Presentacion.grafica` admite varias gráficas o si el
   renderizador compone dos paneles; hoy `Grafica.astro` pinta un solo SVG).
   Componente nuevo `Tabla2x2Input.astro` (`<th scope>`, totales como `<output>`): decidir cómo lo declara
   el YAML (p. ej. un campo opcional `disposicion: tabla2x2` o detectar los ids `vp,fp,fn,vn`); las cuatro
   celdas siguen siendo entradas `entero` para el controlador.
2. `probabilidad-posprueba` (A2): preprueba `P` (proporción), `lr_pos`, `lr_neg` (o Sn/Sp de las que se
   derivan); salidas momios pre/post, posprueba si + y si −, ganancia absoluta. Nomograma de Fagan en
   `nucleo/svg.ts` (tipo `fagan` en `DatosGrafica`): ejes logit/log portados de
   `public/herramientas/propedeutica-basada-en-evidencia/app/js/app.js` (`dibujarFagan`, líneas 506–549:
   `y_pre(u) = T + ((u+3)/6)·H`, `y_post(v) = T + ((3−v)/6)·H`, `y_lr(w) = T + ((6−w)/12)·H`), como función
   pura de coordenadas. Casos: P 0.30 con LR 17 y 0.158; P 0.01 con LR 0.1; P 0.999 con LR 100; LR 1; P 0.
   R: fórmula transcrita (`post <- function(p, lr) …`), sin paquetes.
3. `valores-predictivos` (A3): Sn, Sp, prevalencia, opcionales `n_d` y `n_nd`; VPP/VPN con IC logit de
   Mercaldo 2007 cuando hay n; LR±; frecuencias naturales por 1,000; gráfica de curvas VPP/VPN frente a la
   prevalencia (tipo de gráfica nuevo; ampliar el enum `grafica` en `content.config.ts` y `tipos.ts`).
   Casos: 0.85/0.95/0.30 con 80/120; P 0.001; Sn = 1 (logit ajustado); P = 1 (VPN indefinido).
4. Referencias nuevas en `referencias.bib`: Yerushalmy 1947, Youden 1950, Vecchio 1966, Simel 1991,
   Glas 2003, Woolf 1955, Altman & Bland 1994 (BMJ 308:1552 y 309:102), Deeks & Altman 2004, Bayes 1763,
   Fagan 1975, Jaeschke 1994, Straus 2019, Mercaldo 2007, Gigerenzer & Edwards 2003, Fletcher 2014,
   Haldane 1956, Anscombe 1956 (con PMID cuando exista; confirmar datos bibliográficos marcados
   «[verificar]» en la especificación antes de publicar).
5. Cierre: secuencia de verificación completa; capturas ES/EN de las tres páginas (escritorio, 400 px,
   impresión); revisión de código independiente (agente `code-reviewer`) y corrección; commit
   `BIOESTADISTICA: H1 …`; vista previa para el dueño; con su visto bueno, merge a `main` (publica).
   Al publicar, actualizar `docs/performance/REVIEW.md` con la secuencia reproducible ampliada y capturar
   una nueva base documentada si se decide arreglar el pendiente de `signos.json`.

## Flujo de trabajo que funcionó en H0 (y trampas)

- Agentes en paralelo sobre archivos disjuntos (numérica / oráculo R / interfaz Astro / pruebas) con el
  orquestador escribiendo antes los contratos (`tipos.ts`, YAML, `proporciones.ts`), y un `code-reviewer`
  independiente al final: encontró fallos reales (URL parcial rellenada con el ejemplo, nivel no
  representable en el selector) que ni las pruebas ni las capturas veían.
- La extensión de Chrome no alcanza localhost en este equipo: usar Chrome headless (`--screenshot`,
  `--dump-dom` con `--virtual-time-budget`).
- La salida de un comando de Bash se persiste a archivo por encima de ~25 KB: leer archivos grandes por
  rangos.
- `toJSON(digits = NA)` de jsonlite escribe 15 cifras: las tolerancias «cerradas» necesitan suelo absoluto.
- Para tipar un `.ts` suelto con `tsc` fuera del `tsconfig`: `--ignoreConfig --allowJs` además de las
  banderas de Astro (`--moduleResolution bundler --allowImportingTsExtensions --erasableSyntaxOnly
  --verbatimModuleSyntax`); `astro check` ya cubre todo el proyecto.
- KaTeX con `strict: 'error'` y `output: 'mathml'` compila las ecuaciones en build; las letras griegas en
  Unicode dentro del `tex` pasan la compuerta, así que escribirlas como comandos LaTeX.
- `docs/performance/after.json` se reescribe con cada auditoría: restaurarlo (`git checkout --`) salvo
  commit deliberado.
- Memoria persistente del asistente: `~/.claude/projects/-Volumes-Bioinformatics-Programacion-UDG-CA-1190/memory/`
  (`project-bioestadistica-abierta.md`) apunta a estos archivos.

# Progreso — Bioestadística abierta

Actualizado: 17 de septiembre de 2026 (H3 publicado). Leer después [HANDOFF.md](HANDOFF.md).

## Estado del corte

Carpeta de trabajo: worktree de Orca `/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta`,
rama `jaimebriseno-boop/Bioestadistica-abierta` (sigue a `origin/jaimebriseno-boop/Bioestadistica-abierta`).
El 17 de septiembre de 2026 el dueño revisó las páginas reales («quedó excelente») y pidió publicar:
la rama se lleva a `main` por avance rápido (fast-forward; `main` no había avanzado desde `b9e00e6`),
con lo que H0, H1 y H2 quedan publicados en udgca1190.com.mx vía Vercel. H3 siguió el mismo camino el
mismo día: el dueño pidió «publicalo» tras el resumen de la verificación y `main` avanzó de `ef95363` a
`c1ff89f` (19 calculadoras publicadas). Los hitos siguientes se construyen igual en esta rama y se
publican con cada visto bueno.

| Hito | Estado | Commit |
|---|---|---|
| H0 · Cimientos + calculadora «IC de una proporción» | Terminado y verificado | `e69d80b` |
| H1 · Vertical completa: prueba diagnóstica 2×2, posprueba (Fagan), valores predictivos | Terminado, verificado y **publicado** (17-sep-2026) | `2c37184` (+ `033f464`) |
| H2 · Asociación 2×2 (RR/OR/RRA/NNT, χ²/Fisher, McNemar) + columnas pegadas (descriptivos, IC media, media desde mediana) | Terminado, verificado y **publicado** (17-sep-2026) | `1772462`, `e02aa46`, `08a3d94`, `35bffcb` |
| H3 · Tamaño de muestra (C1–C7), kappa, Kaplan-Meier | Terminado, verificado y **publicado** (17-sep-2026; ROC opcional queda para después) | `f04f4dd`, `c1ff89f` |
| H4 · webR («Verificar con R», consentimiento, ClientRouter, política de hosts) | **Siguiente** | — |
| H5 · Modelos (logística, Cox, lineal, ICC) con webR | Pendiente | — |
| H6 · Enlace con Propedéutica (`?signo=`) | Pendiente | — |
| H7 · Documentación (README, COMO_AÑADIR, CHANGELOG de fixtures) | Pendiente | — |

## Hecho en H3

- Nueve calculadoras bilingües con YAML + módulo puro + casos + fixture de R + prueba (19 en total).
  Grupo «Tamaño de muestra y poder» completo: `muestra-una-proporcion` (Cochran, corrección por
  población finita, modo inverso «precisión con el n disponible»), `muestra-una-media` (z y t iterada por
  punto fijo, CPF, inverso), `muestra-dos-proporciones` (Fleiss con y sin corrección de continuidad,
  `power.prop.test` y `pwr.2p.test` con h de Cohen como comparación, razón de asignación r),
  `muestra-dos-medias` y `muestra-medias-pareadas` (t no central exacta idéntica a
  `power.t.test(tol = 1e-10)`, aproximación de Guenther, inverso; C5 desde σ_d o desde σ y ρ),
  `muestra-prueba-diagnostica` (Buderer 1996, curva frente a la prevalencia) y `muestra-correlacion`
  (z de Fisher, `pwr.r.test`, inverso). Todas con el bloque común C0 (α uni/bilateral, poder, pérdidas
  n/(1 − L), techo una sola vez al final) y curva de poder o de precisión con línea de referencia.
  Grupo «Concordancia»: `kappa` (tabla k×k pegada, 2 ≤ k ≤ 10; κ simple, lineal y cuadrática; EE de
  Fleiss, Cohen y Everitt; z y p como `irr::kappa2`; κ máxima; PABAK e índices de Byrt con k = 2).
  Grupo «Modelos»: `kaplan-meier` (tres columnas pegadas, hasta dos grupos; Greenwood log-log o log;
  mediana con la regla de `quantile.survfit` e IC de Brookmeyer-Crowley; S(t) en dos tiempos opcionales;
  log-rank; tabla de vida completa validada contra `survfit`).
- Métodos nuevos en `src/lib/bioestadistica/metodos/`: `muestra-comun`, `muestra-estimacion`,
  `muestra-proporciones`, `muestra-medias`, `muestra-diagnostica`, `muestra-correlacion`, `kappa`,
  `supervivencia`; `uniroot` (traducción de `R_zeroin2`) pasa a `primitivas/raices.ts`.
- Infraestructura: `PegarTabla.astro` + `parsearTablaPegada`/`resumenTabla`/`textoDeTabla` + rama `tabla` del
  controlador; `Resultado.extras` (vectores de longitud variable) comparados elemento a elemento;
  `GraficaCurvas.referenciaY`; renderizador `km` (escalones, banda de IC recortada, censuras, marcadores
  t₁/t₂, tabla en riesgo alineada con las marcas del eje); convenio «0 = sin dato» para las entradas
  opcionales; guarda de caracteres de control en los YAML; barrido ampliado a las 19 calculadoras con
  contador por calculadora y opcionales en blanco; 31 referencias nuevas (89 en total); claves
  `bio.ui.*` de tabla y de grupos; tarjeta `bio-modelos` en beta.
- Pruebas nuevas: `muestra-una-proporcion` y `muestra-una-media` (119), `muestra-dos-proporciones` (67),
  `muestra-dos-medias` y `muestra-medias-pareadas` (94), `muestra-prueba-diagnostica` y
  `muestra-correlacion` (93), `kappa` (67), `kaplan-meier` (94), `primitivas` (+1, `qt` con ν grande
  contra R), `svg` (+10 del `km`, referenciaY), `comparar` (extras), `pegado` (tabla, forma cuadrada,
  coma en tablas de conteos), `exportar` (nota del enlace), `contenido.test.ts` (km, caracteres de
  control); 159 casos de fixture nuevos (302 en total, 19 calculadoras).
- Docs: DECISIONES (sección H3 con las desviaciones de cada constructor), PROGRESO, HANDOFF (H3 hecho,
  plan de H4, reglas del entorno compartido y trampas nuevas).

## Verificación conservada (H3)

`npm run build` 73 páginas (40 de la sección: índice + 19 calculadoras × 2 idiomas) · `npm run check` 0
errores / 0 advertencias (124 hints preexistentes) · `npm run test` 4 + 1,833 pruebas en verde ·
`npm run fixtures:bio:check` sin deriva (19 calculadoras, 302 casos) · `npm run barrido:bio` 75,039
combinaciones × 2 idiomas con 150,078 SVG y 0 problemas (contador por calculadora: ninguna en cero; con
las ramas que la revisión vio sin ejercer: paradoja de kappa, Landis «moderado», p_e ≈ 1, censura > 50 %,
log-rank con varianza nula, grupo nunca en riesgo, IC de la mediana con nodos no monótonos) ·
`npm run audit:performance` sin recursos externos ni faltantes (`after.json` restaurado) · capturas de
las nueve páginas nuevas en ES y EN a 1280 px y del índice, revisadas (celdas, avisos, interpretación,
ecuaciones, gráficas con marcador y referencia, banda y tabla en riesgo de Kaplan-Meier) · cada agente
constructor contrastó su calculadora con R en sus propios casos límite y dejó capturas propias ·
revisión de código independiente en dos partes, todas las correcciones aplicadas antes del commit y
registradas en DECISIONES «H3». Parte A (kappa, Kaplan-Meier e infraestructura; agente `code-reviewer` con
dos sub-revisiones): numérica fuera de los fixtures con 128 casos nuevos de kappa (1 664 valores) y 55 de
Kaplan-Meier (6 484 valores), más oráculos que no comparten código con el proyecto (`DescTools::CohenKappa`
y `vcd::Kappa` para el EE de kappa, 7.3e-13 y 1.1e-15; `lpSolve::lp.transport` para la κ máxima en 647
pares de marginales, déficit 0) y 13 DOI y 7 PMID recomprobados; dos altos (el snippet abortaba con
varianza nula del log-rank; el IC de la mediana no ordenaba los nodos como `approx`), tres medios (grupo
nunca en riesgo, `z_h0`/`p_h0` mal condicionados con p_e → 1, la tubería de fixtures perdía la forma de un
vector de longitud 1) y siete bajos; sub-revisión de interfaz: un alto (una tabla regular no cuadrada
pasaba como k × k), cinco medios y seis bajos; sub-revisión de contenido bilingüe: un crítico (la frase
«coincidieron en {po}» era falsa con ponderación), cinco altos (κ máxima con pesos sin ecuación, `t_fuera`
con el seguimiento del grupo más corto, «IC no definido a no definido», texto alternativo de la gráfica,
Cohen 1968 citado sin ponderar), ocho medios y ocho bajos. Parte B (las siete de tamaño de muestra): 30 636
casos nuevos TS-vs-R (uso máximo de tolerancia 0.44 %), `pnt` frente a `pt(ncp=)` en 704 combinaciones
(3e-10), fórmulas contra las fuentes originales, 7 PMID y 10 DOI; un crítico (la variante t de una media
publicaba un n por debajo del mínimo real, con R y TS en la misma fase de un ciclo de periodo 2), cinco
altos («undefined» visible en inglés, `power.prop.test` sin `extendInt`, `n_ptt` sin las guardas del
snippet, total ajustado como techo de la suma, `qt` inexacta con ν ≥ 1e8), cuatro medios y siete
sugerencias (perfil `potencia` apretado a 1e-8; techo explícito en las ecuaciones de pérdidas; aviso
`supera_poblacion`). Sin corregir, por decisión documentada: la esquina de `pnt` con ν < 1 (R también da un
artefacto) y las claves del `.bib` cuyo año ya no coincide con el nombre.

## Hecho en H2

- Seis calculadoras bilingües con YAML + módulo puro + casos + fixture de R + prueba. Grupo
  «Asociación y efecto en tablas 2×2» completo: `efecto-2x2` (RR de Katz, OR de Woolf, RRA de Newcombe
  método 10 o Wald, RRR, NNT de Altman; selectores de diseño cohorte/casos-controles/transversal, método
  de la RRA y Haldane-Anscombe; bosque de tres paneles), `chi-cuadrada-fisher` (χ² de Pearson, Yates
  acotada como R, variante N−1 de Campbell, Fisher exacto «minlike», OR condicional de `fisher.test` con
  su IC, φ con signo, regla de Cochran; barras observado/esperado) y `mcnemar` (χ² sin y con corrección
  de Edwards, p exacto binomial, δ pareada Wald/Agresti-Min, OR pareado; barras de discordantes con el
  esperado bajo H0). Grupo «Concordancia y descriptivos»: `ic-media` (IC t de la media, IC χ² de la DE),
  `media-desde-mediana` (Luo 2018, Wan 2014, Hozo 2005 en tres escenarios; cuartiles ausentes viajan a
  R como `NA`) y `descriptivos` (primera calculadora con columna pegada: momentos, cuantiles tipo 7,
  G₁/G₂, Shapiro-Wilk AS R94 portado con diferencia máxima frente a R de 9.4e-16 en W y 7.5e-14 en p,
  cercas de Tukey, media geométrica; histograma de Sturges con curva normal y caja).
- Métodos nuevos en `src/lib/bioestadistica/metodos/`: `efecto`, `independencia`, `pareadas`, `medias`,
  `resumenes`, `descriptivos`, `shapiro`.
- Infraestructura: `nucleo/pegado.ts` (`parsearPegado`, `resumenPegado`) + `PegarColumna.astro` + rama
  `columna` del controlador (`err_sin_datos`, `err_n_min`); `nucleo/avisos.ts` (los avisos con
  parámetros se interpolan igual en build y en el navegador: defecto latente desde H1 corregido);
  `codigoR.ts` interpola `number[]` como `c(...)` multilínea y `NaN` como `NA` (sin `rScript`);
  renderizadores `barras` (trama para blanco y negro) e `histograma-boxplot` en `nucleo/svg.ts`; tipos
  `GraficaBarras`/`GraficaHistogramaBoxplot`; perfiles `efecto-2x2`, `chi-cuadrada-fisher`, `mcnemar`,
  `ic-media`, `media-desde-mediana`, `descriptivos` y `shapiro` en `tolerancias.ts`; `bandaAsimetria` y
  `bandaAsimetriaResumen`; 33 referencias nuevas verificadas contra PubMed y Crossref (58 en total); ocho
  claves `bio.ui.*` nuevas.
- Pruebas nuevas: `efecto-2x2` (52), `chi-cuadrada-fisher` (45), `mcnemar` (45), `ic-media` (35),
  `media-desde-mediana` (50), `descriptivos` (56), `shapiro` (8), `pegado` (36), `avisos` (8), `svg` (+26),
  `bandas` (+2), `entrada` y `exportar` (convenios de miles, enlace sin columna), `codigoR` (vectores y
  `NA`), `contenido.test.ts` (gráficas nuevas, avisos interpolados con parámetros en el ejemplo y en
  todos los casos del fixture, orden exacto de las celdas, veto a `rScript`); 89 casos de fixture nuevos
  (143 en total, 10 calculadoras).
- Docs: DECISIONES (sección H2), PROGRESO, HANDOFF (plan de H3 y trampas nuevas), ARQUITECTURA §6.4.

## Verificación conservada (H2)

`npm run build` 55 páginas (22 de la sección: índice + 10 calculadoras × 2 idiomas) · `npm run check` 0
errores / 0 advertencias (124 hints preexistentes) · `npm run test` 4 + 1,004 pruebas en verde ·
`npm run fixtures:bio:check` sin deriva (10 calculadoras, 143 casos) · `npm run audit:performance` en
verde (sin recursos externos ni faltantes; el único `false` es el de `signos.json`, pendiente ajeno) ·
capturas de las seis páginas nuevas en ES y EN a 1280 px, dos a 400 px e impresión (PDF) revisadas, más
el índice, el controlador de `descriptivos` leyendo una columna desde la URL y los estados de
casos-controles y transversal de `efecto-2x2` por URL tras la revisión · revisión de código
independiente (agente `code-reviewer`, que entregó dos sub-revisiones: pruebas y fixtures —con la
medición del uso de cada tolerancia por campo, máximo 2.9 % del presupuesto, y del OR condicional
frente a R, 8.9e-15— y textos y bibliografía —fórmulas `tex` contra el código, paridad es/en, `{ref:}`
de Métodos, 14 PMID y 28 DOI recomprobados—): ninguna tolerancia aflojada ni defecto numérico; dos
hallazgos altos de texto (atribución al Cochrane Handbook; Métodos de B1 sin depender del diseño), dos
altos de cobertura (prueba tautológica del arreglo de avisos; mediana igual a un cuartil sin caso de R),
ocho medios y dieciséis bajos, todos corregidos antes del commit `1772462` (detalle en DECISIONES «H2»).
El revisor principal entregó después sus propios hallazgos sobre ese commit (252 casos límite nuevos
TS-vs-R con 3,881 comparaciones y una sola discrepancia, la de la media compensada; barrido de 44,729
combinaciones × 2 idiomas con 89,458 SVG): un alto (valores separados por espacios concatenados en
silencio), cinco medios (coma de miles, CV con media ≤ 0, píldora y URL de impresión con errores de
captura, enlace compartido sin la columna, orden de las celdas) y cuatro bajos, más el espejo «1.234,5»
heredado de H0; todos corregidos en el commit de seguimiento y reverificados por el revisor con su
barrido (0 problemas) y por la suite. Su reverificación destapó una regresión del propio arreglo de la
media (la varianza centrada con la media de una pasada se apartaba 4.7e-3 de `var()` de R en una
columna mal condicionada), corregida con el caso de fixture `mal_condicionado` en un tercer commit. Su
barrido queda en el repositorio como `npm run barrido:bio` (`scripts/bio-barrido.mjs`), ampliado a las
diez calculadoras, y forma parte de la secuencia de cierre de hito. Además, cada agente constructor contrastó su calculadora con R
en sus propios casos límite (p. ej. 30 columnas de n 3 a 5,000 para Shapiro-Wilk).

## Hecho en H1

- Tres calculadoras del grupo «Pruebas diagnósticas», bilingües, con YAML + módulo puro + casos +
  fixture de R + prueba: `prueba-diagnostica-2x2` (Sn, Sp, VPP, VPN, prevalencia, exactitud, índice de
  Youden, LR±, DOR; selector del método de IC y corrección de Haldane-Anscombe), `probabilidad-posprueba`
  (Bayes en momios, nomograma de Fagan) y `valores-predictivos` (VPP/VPN para cualquier prevalencia, IC
  logit de Mercaldo, frecuencias naturales por 1,000, curvas frente a la prevalencia).
- Métodos nuevos en `src/lib/bioestadistica/metodos/`: `razones.ts` (log-Wald: Simel, Woolf, Haldane),
  `diagnostico.ts` (núcleo 2×2), `bayes.ts`, `predictivos.ts` (Mercaldo estándar y ajustado).
- Gráficas: `DatosGrafica` es una unión (`ic-forest` con paneles apilados, `fagan`, `curvas`) y
  `nucleo/svg.ts` las dibuja sin DOM; estilos globales por tokens en `Grafica.astro`.
- Interfaz: `Tabla2x2Input.astro` (tabla con `<th scope>`, totales como `<output>`, ordinales 1–4 con
  leyenda), `CampoOpcion.astro` (selector genérico; el nivel de confianza también lo usa),
  `CalculadoraPage` reparte campos, tabla y selectores según el YAML (`tabla2x2`, `opciones`);
  el controlador repinta totales (`[data-total]`) y exporta los rótulos de las opciones.
- Contenido y esquema: `content.config.ts` admite `tabla2x2` y `grafica: curvas` y exige los rótulos de
  tabla y de cada opción en los dos idiomas; 4 claves `bio.ui.*` nuevas; 19 referencias nuevas en
  `referencias.bib` con PMID y DOI comprobados contra PubMed y Crossref; `formatCita` no añade punto tras
  un título que termina en «?».
- Pruebas: `prueba-diagnostica-2x2.test.ts` (47), `probabilidad-posprueba.test.ts` (29),
  `valores-predictivos.test.ts` (40), `svg.test.ts` ampliada (33), `contenido.test.ts` ampliada
  (gráficas por tipo, tabla 2×2, selectores, claves huérfanas), `util.ts` con `contextoDePrueba` y
  `conDerivadas`; perfiles nuevos en `tolerancias.ts` sin aflojar ninguno.
- Docs: DECISIONES (sección H1 con todas las desviaciones y su motivo), PROGRESO, HANDOFF.

## Verificación conservada (H1)

`npm run build` 47 páginas (10 de la sección: índice + 4 calculadoras × 2 idiomas) · `npm run check` 0
errores / 0 advertencias (124 hints preexistentes) · `npm run test` 4 + 471 pruebas ·
`npm run fixtures:bio:check` sin deriva (4 calculadoras, 54 casos: 13 + 17 + 10 + 14; 0 discrepancias
TS/R en ningún campo, incluidos ∞, `NA` y las certezas) · `npm run audit:performance` sin recursos
externos ni faltantes · capturas de las tres páginas en ES y EN a 1280 px, 400 px e impresión (PDF)
revisadas · revisión de código independiente (agente `code-reviewer`): seis hallazgos reales (dos medios: el recorte del nomograma sacaba el punto del LR de su recta; el párrafo de Métodos atribuía la corrección de Haldane a una celda en 0 que no siempre existía), todos corregidos antes del commit; además cruzó TypeScript contra R en 44 casos límite fuera de los fixtures (niveles 0.8 y 0.999, Sn/Sp en 0 y 1, prevalencias 0 y 1, celdas en 0 con cada método de IC, n de 1.8 millones, LR de 1e12 y 1e-300) con coincidencia total, barrió unas 200 mil combinaciones de `presentar()` y `renderGrafica()` en los dos idiomas sin excepciones ni marcadores sin rellenar, y sondeó el escapado del SVG con inyecciones en todos los huecos de texto.

Pendiente ajeno a la sección: `audit:performance -- --check-data-baseline` sigue fallando porque
`signos.json` de propedéutica cambió en `main` y `docs/performance/baseline.json` no se actualizó.

## Siguiente paso

1. H3 según [HANDOFF.md](HANDOFF.md) («H3 · Por patrón»): tamaño de muestra y poder (C1–C7, bloque
   común C0, gráfica `potencia`), `kappa` (tabla k×k) y `kaplan-meier` (pegado multicolumna, gráfica
   `km`); opcional `curva-roc`. Cierre con la misma secuencia (build, check, test, fixtures, barrido,
   capturas, revisión independiente) y publicación con el visto bueno del dueño.
2. Pendientes ajenos: `docs/performance/baseline.json` (signos.json de propedéutica).

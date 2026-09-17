# Progreso — Bioestadística abierta

Actualizado: 17 de septiembre de 2026 (cierre de H2). Leer después [HANDOFF.md](HANDOFF.md).

## Estado del corte

Carpeta de trabajo: worktree de Orca `/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta`,
rama `jaimebriseno-boop/Bioestadistica-abierta` (sigue a `origin/jaimebriseno-boop/Bioestadistica-abierta`).
La rama lleva `origin/main` fusionado (`b9e00e6`, con los dos commits de propedéutica posteriores a la
base) y NO está fusionada en `main`: nada de esta sección está publicado en udgca1190.com.mx. Se
publica con el visto bueno del dueño sobre las páginas reales y el merge a `main` (Vercel).

| Hito | Estado | Commit |
|---|---|---|
| H0 · Cimientos + calculadora «IC de una proporción» | Terminado y verificado | `e69d80b` |
| H1 · Vertical completa: prueba diagnóstica 2×2, posprueba (Fagan), valores predictivos | Terminado y verificado; pendiente del visto bueno del dueño y del merge | `2c37184` (+ `033f464`) |
| H2 · Asociación 2×2 (RR/OR/RRA/NNT, χ²/Fisher, McNemar) + columnas pegadas (descriptivos, IC media, media desde mediana) | **Terminado y verificado; pendiente del visto bueno del dueño y del merge (junto con H1)** | ver `git log --oneline -3` (commit `BIOESTADISTICA: H2 …`) |
| H3 · Tamaño de muestra (C1–C7), kappa, Kaplan-Meier (opcional ROC) | Pendiente | — |
| H4 · webR («Verificar con R», consentimiento, ClientRouter, política de hosts) | Pendiente | — |
| H5 · Modelos (logística, Cox, lineal, ICC) con webR | Pendiente | — |
| H6 · Enlace con Propedéutica (`?signo=`) | Pendiente | — |
| H7 · Documentación (README, COMO_AÑADIR, CHANGELOG de fixtures) | Pendiente | — |

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
  `media-desde-mediana` (50), `descriptivos` (54), `shapiro` (8), `pegado` (36), `avisos` (8), `svg` (+26),
  `bandas` (+2), `entrada` y `exportar` (convenios de miles, enlace sin columna), `codigoR` (vectores y
  `NA`), `contenido.test.ts` (gráficas nuevas, avisos interpolados con parámetros en el ejemplo y en
  todos los casos del fixture, orden exacto de las celdas, veto a `rScript`); 88 casos de fixture nuevos
  (142 en total, 10 calculadoras).
- Docs: DECISIONES (sección H2), PROGRESO, HANDOFF (plan de H3 y trampas nuevas), ARQUITECTURA §6.4.

## Verificación conservada (H2)

`npm run build` 55 páginas (22 de la sección: índice + 10 calculadoras × 2 idiomas) · `npm run check` 0
errores / 0 advertencias (124 hints preexistentes) · `npm run test` 4 + 1,002 pruebas en verde ·
`npm run fixtures:bio:check` sin deriva (10 calculadoras, 142 casos) · `npm run audit:performance` en
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
barrido (0 problemas) y por la suite. Además, cada agente constructor contrastó su calculadora con R
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

1. Mostrar al dueño las páginas reales (vista previa de Vercel de la rama o `npm run preview -- --host
   127.0.0.1 --port 4321` → `/herramientas/bioestadistica/`, ahora con 10 calculadoras) y recoger
   correcciones de texto o de interpretación.
2. Con su visto bueno explícito: merge de la rama a `main` (publica H1 y H2 en udgca1190.com.mx) y anotar
   en `docs/performance/REVIEW.md` la secuencia de verificación de la sección.
3. Empezar H3 leyendo [HANDOFF.md](HANDOFF.md) (sección «H3 · Por patrón») y [DECISIONES.md](DECISIONES.md).

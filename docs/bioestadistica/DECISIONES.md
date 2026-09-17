# Bioestadística abierta — registro de decisiones de implementación

Complementa a [PLAN.md](PLAN.md) (plan maestro) y a los tres diseños de detalle
([ESPECIFICACION.md](ESPECIFICACION.md), [ARQUITECTURA.md](ARQUITECTURA.md),
[MOTOR.md](MOTOR.md)). Aquí se anotan las desviaciones respecto a esos documentos
y las decisiones tomadas al construir cada hito, con su motivo. Fecha en cada entrada.

## H0 · Cimientos (16 de septiembre de 2026)

**Entregado.** Colección `calculadoras` (Zod) y enum `seccion`; cinco tarjetas de la
sección en `data/herramientas.yml` + `data/i18n/en.yml`; bloque en `HerramientasPage`;
95 claves `bio.*` en `src/i18n.mjs` (ambos idiomas) y el helper `tPrefijo`;
`loadBib(ruta)` generalizado y `formatCita` con libros, capítulos, PMID e idioma;
`data/bioestadistica/referencias.bib`; biblioteca pura `src/lib/bioestadistica/`
(primitivas numéricas, `metodos/proporciones.ts`, `nucleo/*`,
`calculadoras/ic-proporcion.ts`); capa del navegador `src/bioestadistica/`; componentes
`src/components/bioestadistica/`; páginas `CalculadoraPage` y `BioestadisticaIndexPage`;
rutas `[slug].astro` es/en; pipeline de fixtures con R (`scripts/bio-fixtures.mjs`,
`tests/bioestadistica/**`). Primera calculadora publicada en el build:
`/herramientas/bioestadistica/ic-proporcion` (IC de una proporción, seis métodos).

**Verificación del cierre.** `npm run build` 37 páginas (antes 33); `npm run check` 0
errores y 0 advertencias; `npm run test` 4 + 261 pruebas en verde; fixtures sin deriva
(13 casos, 247 comparaciones TS/R, 0 discrepancias); 12,347 comparaciones de las
primitivas contra R 4.5.2; `npm run audit:performance` sin recursos externos ni faltantes;
capturas de escritorio, móvil (400 px) e impresión revisadas en Chrome headless; revisión
de código independiente con dos hallazgos altos y seis medios, todos corregidos y
cubiertos por pruebas donde procedía.

**Desviaciones respecto a los diseños, con motivo.**

- `registro.ts` (con `import.meta.glob`) vive en `src/bioestadistica/`, no en
  `src/lib/bioestadistica/`: `import.meta.glob` no existe en Node y `sintaxis.test.ts`
  importa toda la biblioteca pura con `node --test`.
- `svg.ts` es puro (devuelve una cadena) y vive en `nucleo/`: el SSR de Astro también lo
  necesita para renderizar la gráfica del ejemplo en build. `Definicion.grafica()` devuelve
  una descripción declarativa (`DatosGrafica`), no SVG.
- El código R relleno no forma parte de `Presentacion`: lo produce la capa genérica con
  `nucleo/codigoR.ts` a partir de `r.codigo` del YAML (o de `Definicion.rScript`), de modo
  que el snippet que ve el usuario, el que ejecuta webR y el que prueba `Rscript` salen
  de la misma función.
- Las claves de `Contexto.ui` van sin el prefijo `bio.ui.` (`tPrefijo(lang, 'bio.ui.')`).
- Interpretación y avisos comparten UNA región viva (`aria-live="polite"` en el
  envoltorio): dos regiones anunciaban cada tecleo por duplicado.
- El selector de nivel de confianza ofrece 90, 95 y 99 % pero acepta cualquier nivel
  válido del YAML (0.8–0.999) que traiga la URL: la opción se añade al vuelo, así lo que
  dice la URL y lo que se calcula nunca difieren.
- Un enlace con datos incompletos (p. ej. truncado por un gestor de correo) no se rellena
  con el ejemplo: los campos que faltan se reclaman como obligatorios y los resultados,
  el código R y Métodos quedan marcados como obsoletos con las exportaciones desactivadas.
- Formato de porcentajes: un límite que no llega a 1 (o no baja a 0) se muestra como
  «> 99.9 %» («< 0.1 %»), no como «100.0 %», para no confundirlo con el 1 exacto de
  Clopper-Pearson en x = n.
- Razones (`lr`, `x`): dos decimales, o tres cifras significativas si |x| < 0.1, como
  fija la especificación (§0, redondeo de pantalla).
- CSV: se neutralizan con apóstrofo las celdas que empezarían una fórmula de hoja de
  cálculo (`=`, `+`, `@`, tabulador, y `-` cuando no es un número formateado).

**Numérica (biblioteca de primitivas), desviaciones documentadas en el código.**

- Cuantiles: Brent con `tol = 0` y búsqueda en escala logarítmica en soportes positivos;
  criterio efectivo 2·ε·|x|, más fino que el `1e-14·max(1, |x|)` del diseño.
- `dbinom` usa el punto de silla de Loader (2000), no `lchoose`, para n del orden de 1e6;
  `lbeta` usa Stirling cuando los argumentos superan 10.
- `betaIncXY(a, b, x, y)` recibe el complemento exacto (lo usan `pbeta`, `pt`, `pf`,
  `pbinom`) para no perder precisión en colas extremas.
- `pnorm` en el tramo central pasa por `erfc` (mismo trabajo de Cody 1969).
- `qnorm` es AS 241 tal como se publicó: difiere de R en ≤ 3 ulp (R afina por debajo
  del ulp desde 4.1); ninguna tolerancia del proyecto lo distingue.
- La t no central (AS 243) tiene error absoluto ≤ 2.1e-15 pero relativo de hasta 4e-3 en
  la cola opuesta al parámetro de no centralidad; la propia ayuda de R lo advierte.
- El fixture de primitivas codifica cada número con ida y vuelta exacta (decimal o patrón
  IEEE-754), porque `toJSON(digits = NA)` de jsonlite solo escribe 15 cifras; por eso las
  tolerancias «cerradas» (1e-12) llevan además un suelo absoluto (1e-14).

**Compuerta MathML.** Se conserva `output: 'mathml'` de KaTeX (sin CSS ni fuentes en el
cliente): en Chrome, a 1280 y 400 px, fracciones anidadas, radicales y delimitadores se
ven correctamente. El plan B (`htmlAndMathml` + CSS/fuentes locales) queda documentado en
ARQUITECTURA §4 por si otro navegador lo exige.

**Pendiente conocido, ajeno a esta sección.** `npm run audit:performance --
--check-data-baseline` falla porque `signos.json` de propedéutica cambió en `main`
(commit `e5a49af`) y `docs/performance/baseline.json` (6 de septiembre) no se actualizó.
Sin esa opción la auditoría pasa. Corresponde capturar una nueva base documentada en un
commit deliberado, como pide `docs/performance/REVIEW.md`.

**Siguiente hito.** H1: `prueba-diagnostica-2x2` (componente `Tabla2x2Input`, gráfica
`ic-forest` de Sn/Sp/VPP/VPN/LR), `probabilidad-posprueba` (nomograma de Fagan en
`svg.ts`) y `valores-predictivos`; revisión del dueño sobre la página real; merge a `main`.

## H1 · Vertical completa: pruebas diagnósticas (17 de septiembre de 2026)

**Entregado.** Tres calculadoras del grupo «Pruebas diagnósticas», bilingües y con el
circuito completo YAML → módulo puro → casos → fixture de R → prueba:
`prueba-diagnostica-2x2` (A1: Sn, Sp, VPP, VPN, prevalencia, exactitud, índice de Youden,
LR±, DOR; selector del método de IC de proporciones y corrección de Haldane-Anscombe),
`probabilidad-posprueba` (A2: Bayes en forma de momios con nomograma de Fagan) y
`valores-predictivos` (A3: VPP/VPN para cualquier prevalencia, IC logit de Mercaldo,
frecuencias naturales por 1,000 y curvas frente a la prevalencia). Métodos nuevos en
`metodos/` (`razones.ts`, `diagnostico.ts`, `bayes.ts`, `predictivos.ts`); tres tipos de
gráfica en `nucleo/svg.ts` (bosque con paneles, `fagan`, `curvas`); componentes
`Tabla2x2Input` y `CampoOpcion`; 19 referencias nuevas en `referencias.bib` con PMID y DOI
comprobados contra PubMed y Crossref.

**Desviaciones respecto a los diseños, con motivo.**

- Ids de salida de A1: `sn` (como el PLAN), no `se` (como ESPECIFICACION/MOTOR): la sigla
  en español es Sn y el id viaja a etiquetas, JSON de R y fixtures.
- Selector de método de IC (`metodo`, tipo `opcion`) y corrección (`corr`, tipo `decimal`
  con `opciones: ["0", "0.5"]`): un `<select>` cuyo valor el controlador lee con el
  mismo `parsearNumero` de cualquier campo, así `{corr}` llega al snippet de R como número
  (`corr <- 0.5`) y no como cadena. Los rótulos de cada opción viven en `etiquetas` con la
  convención `<id>.<opcion>`; Zod exige que existan en los dos idiomas.
- Razones con celda en 0 (sin corrección): la estimación queda en 0 o ∞ y el intervalo en
  «no definido» (`[NaN, NaN]` en TS, `NA` en R) mediante una regla explícita en el snippet
  (`ic_log`: solo si ln(est) y EE son finitos) en vez de dejar que exp(∞ − ∞) produzca
  `NaN`/`Inf` de forma incidental. La corrección de Haldane-Anscombe afecta SOLO a LR± y
  DOR, nunca a las proporciones ni al índice de Youden, y el párrafo de Métodos la
  declara y cita cuando se aplica (`{nota_corr}` rellenado desde `interpretacion.metodos_haldane`).
- Jeffreys en el snippet de A1 no pasa por `binom` (su `"bayes"` es HPD): se escribe con
  `qbeta` de colas iguales, igual que en `ic-proporcion`.
- Denominadores vacíos (una fila o una columna de la tabla en 0) se rechazan en
  `validar()` con `err_fila_vacia`/`err_columna_vacia` sobre las dos celdas implicadas, en
  vez de mostrar `NaN`: `binom.confint(0, 0)` devuelve `NaN` sin error y no hay proporción
  que estimar.
- A3: los tamaños del estudio de validación son opcionales y «vacío» vale 0 (`derivar()`
  los rellena), de modo que el snippet de R siempre tiene sus marcadores y R decide con
  `n_d > 0 && n_nd > 0`; con un solo tamaño no hay IC y se avisa (`sin_n`). Sin tamaños,
  VPP y VPN viajan como escalares en el JSON (sin `ic` en TS). El párrafo de Métodos elige
  entre tres frases (`metodos_ic.con|ajustado|sin`) según haya intervalo y de qué variante.
- Logit ajustado de Mercaldo solo cuando Sn o Sp valen 0 o 1 (EE infinito), con aviso; la
  estimación puntual reportada sigue siendo la no ajustada y el intervalo es el del
  logit ajustado (Sn·n_D + 0.5)/(n_D + 1), n + 1 por grupo.
- A2 sin IC de la posprueba (la especificación lo dejaba como opcional): entradas solo P,
  LR+ y LR−. Las certezas (P = 0 o 1) se fijan explícitamente en el snippet y en TS
  (`post()` devuelve 0 o 1) para evitar el 0/0 de momios infinitos.
- Gráfica de A1: un solo SVG con dos paneles (`GraficaForest.paneles`): proporciones en
  escala lineal y razones en escala logarítmica con referencia en 1. `DatosGrafica` pasó a
  unión discriminada (`ic-forest` | `fagan` | `curvas`); el rótulo de panel se llama
  `rotulo` porque `titulo` es el de la gráfica entera. Las filas no dibujables en escala
  log (0, ∞, `NaN`) se omiten sin romper el dibujo y el dominio log se redondea a décadas.
- Nomograma de Fagan: leyenda bajo los ejes (etiqueta, LR, posprueba) en vez de rótulos
  junto al punto, que chocaban entre sí y con las marcas del eje derecho; los rótulos del
  eje central alternan lado y llevan un filete blanco (`#fff` literal: no hay token de
  blanco puro; es el fondo de `.grafica`). Geometría portada de `dibujarFagan` de
  propedéutica (preprueba en logit creciente hacia abajo, posprueba hacia arriba).
- Curvas de A3: el marcador lleva los valores exactos de VPP y VPN (`marcador.valores`),
  no una interpolación sobre la polilínea.
- Perfiles de tolerancia: `prueba-diagnostica-2x2` (todo `cerrado`) y
  `prueba-diagnostica-2x2-beta` (las seis proporciones en `cuantil`) para los casos con
  Clopper-Pearson o Jeffreys; A2 y A3 en `cerrado`. Ninguna tolerancia se aflojó.
- Interfaz de la tabla 2×2 (`Tabla2x2Input`): cada casilla lleva un ordinal 1–4 en gris que la
  leyenda de debajo repite con el rótulo completo (`etiquetas.vp`…), para no meter siglas en español
  en la página inglesa; los totales son `<output aria-live="off">` (el elemento es región viva por
  omisión y la página solo debe tener una) y el controlador los repinta con «–» si falta una celda;
  al imprimir se reduce el canal de la retícula para que la tabla quepa en una línea.
- El selector de nivel de confianza pasó a `CampoOpcion` (mismo `<select id="campo-nivel">` con
  las tres opciones y el nivel del ejemplo); `CampoOpcion` usa una rejilla de una columna encogible
  porque el ancho mínimo de un `<select>` es el de su opción más larga y empujaba la columna.
- `formatCita` ya no añade punto tras un título que termina en «?», «!» o «.» (Jaeschke
  1994).
- Pruebas de contenido nuevas: la gráfica se comprueba por tipo; la tabla 2×2 y los
  selectores exigen sus rótulos; ninguna clave de `interpretacion`/`avisos` del YAML puede
  quedar huérfana (sin uso en el módulo).

**Pendiente conocido.** El aviso permanente que la especificación pedía para VPP/VPN de A1
(«dependen de la prevalencia; no válidos en casos y controles») va en el párrafo de
interpretación `predictivos`, no como aviso amarillo siempre visible.


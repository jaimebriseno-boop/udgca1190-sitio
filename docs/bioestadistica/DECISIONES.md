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


## H2 · Patrón confirmado: asociación 2×2, pareadas y columnas pegadas (17 de septiembre de 2026)

**Entregado.** Seis calculadoras bilingües con el circuito completo YAML → módulo puro →
casos → fixture de R → prueba: grupo «Asociación y efecto en tablas 2×2» completo
(`efecto-2x2` B1: RR de Katz, OR de Woolf, RRA de Newcombe método 10 o Wald, RRR y NNT
de Altman con selectores de diseño, método de la RRA y Haldane-Anscombe;
`chi-cuadrada-fisher` B2: χ² de Pearson, Yates acotada como R, variante N−1 de Campbell,
Fisher exacto «minlike», OR condicional de `fisher.test` con su IC, φ con signo y regla
de Cochran; `mcnemar` B3: χ² sin y con corrección de Edwards, p exacto binomial, δ pareada
Wald/Agresti-Min y OR pareado) y tres del grupo «Concordancia y descriptivos» (`ic-media`
D4, `media-desde-mediana` D5 con Luo 2018, Wan 2014 y Hozo 2005, y `descriptivos` D6 con
la primera columna pegada: momentos, cuantiles tipo 7, G₁/G₂ de Joanes y Gill, Shapiro-
Wilk AS R94 portado, cercas de Tukey, media geométrica, histograma de Sturges con curva
normal y caja). Infraestructura nueva: `nucleo/pegado.ts` + `PegarColumna.astro` + rama
`columna` del controlador; `nucleo/avisos.ts` (interpolación de avisos compartida por
SSR y navegador); vectores y `NA` en `nucleo/codigoR.ts`; renderizadores `barras` e
`histograma-boxplot` en `nucleo/svg.ts`; métodos `efecto`, `independencia`, `pareadas`,
`medias`, `resumenes`, `descriptivos` y `shapiro` en `metodos/`; 33 referencias
verificadas contra PubMed y Crossref; ocho cadenas `bio.ui.*` nuevas.

**Desviaciones respecto a los diseños, con motivo.**

- Columnas pegadas SIN `rScript`: MOTOR §3.1 decía que «los vectores exigen rScript»,
  pero `codigoR.ts` interpola ahora un `number[]` como `c(...)` (líneas de ≤ 72
  caracteres con sangría de dos espacios) y `NaN` como `NA`. Motivo: el snippet copiable
  de una columna debe llevar los datos, que es lo que quien lo pega en RStudio necesita,
  y así el YAML sigue siendo la única fuente del R (mismo hash, mismo generador de
  fixtures, mismas pruebas). `rScript` queda para los modelos con `datos.csv` (H5).
- `NA_real_` en los snippets, nunca `NA` a secas para un escalar: `correr_casos.R`
  reserializa la salida con `fromJSON`/`toJSON` y un `NA` lógico escalar da la vuelta
  como `{}`, que el comparador rechaza; `NA_real_` viaja como la cadena `"NA"`. Un vector
  `c(NA, NA, NA)` sí viaja como `[null, null, null]`.
- `PropCIs::diffscoreci` NO es el método 10 de Newcombe (es un intervalo score tipo
  Miettinen-Nurminen resuelto por bisección a 1e-7): B1 escribe el método 10 a mano con
  los límites de Wilson, en el mismo orden de operaciones que `icWilson`, y deja
  `diffscoreci` como línea comentada. El snippet no carga `binom` ni `PropCIs`.
- B1: p₁, p₀, RRA y NNT se calculan SIN corrección; Haldane-Anscombe afecta solo a RR,
  OR y, por derivación, a la RRR. El IC del NNT se guarda siempre como
  `sort(1/|IC de la RRA|)` (igual en R); cuando la RRA cruza 0 la presentación lo escribe
  con la notación de Altman «NNTB x a ∞ a NNTH y» (patrón `etiquetas.nnt_altman`), sin
  cambiar los números almacenados. En «casos y controles» RR, RRA, RRR y NNT se muestran
  como «—» con la nota «no aplica» y R los calcula igual: el diseño solo cambia el texto.
  En «transversal» el RR se lee como razón de prevalencias (etiqueta estática y párrafo
  propio). Una columna en 0 (nadie con el desenlace) se admite y deja RR/OR en 0, ∞ o
  «no definido» con aviso; una fila en 0 se rechaza (`err_fila_vacia`).
- B2: un margen en 0 se rechaza en `validar()` (`err_fila_vacia`/`err_columna_vacia`)
  en vez de mostrar χ² y φ como 0/0 (la especificación admitía un mensaje; la validación
  es ese mensaje). No hay p unilateral de Fisher. El OR condicional replica `fisher.test`
  (`dnhyper`, `mnhyper`, `pnhyper`, `mle`, `ncp.L`, `ncp.U`, con los mismos corchetes y
  la transformación 1/t) y resuelve las raíces con una traducción literal de `R_zeroin2`
  (el `uniroot` de R) a su tolerancia por omisión (2⁻¹³ ≈ 1.22e-4), como función privada
  de `independencia.ts`: `brent` de las primitivas (zbrent de Numerical Recipes) no
  sigue los mismos iterados y, con esa tolerancia, paraba hasta 1.3e-3 lejos del oráculo
  (tabla 2/50/30/3), por encima del perfil `fisher_or`; con la traducción, la diferencia
  máxima frente a R es 1.5e-14. Se reproduce R y no la raíz exacta (de la que el
  `uniroot` de R se aparta hasta 1.8 % en esa tabla) para que «Verificar con R» coincida;
  el perfil `fisher_or` (5e-4) se conserva por si otra versión de R cambia `zeroin`.
  `p_fisher` puede rebasar 1 en un ulp (0/3/2/5 → 1.0000000000000002), igual que
  `fisher.test`, y no se recorta porque la biblioteca no redondea. Yates como R
  (`min(0.5, |O − E|)`; el aviso `yates_cero` se decide con |ad − bc| < n/2 en enteros,
  porque el estadístico deja un residuo de ~1e-29 en R y en TS cuando las cuatro |O − E|
  difieren en un ulp). La prueba recomendada sigue a Cochran (n < 20 o alguna E < 5 →
  Fisher; con n < 20 la esperada mínima nunca llega a 5, porque E_min ≤ n/4); Yates se
  muestra pero no se recomienda (Campbell 2007). `e_min` es una salida.
- B3: la corrección de Edwards se aplica solo si b ≠ c, como `mcnemar.test` (con b = c
  el estadístico corregido de R es 0); `p_exacta` replica la regla bilateral de
  `binom.test` (`relErr = 1 + 1e-7`); el intervalo de Agresti-Min va centrado en
  (b − c)/(n + 2) y recortado a [−1, 1] mientras el punto reportado sigue siendo
  (b − c)/n; el de Wald no se recorta; el OR pareado b/c lleva el intervalo derivado del
  de Clopper-Pearson de b/(b + c) (0 e ∞ en los bordes). b + c = 0 se admite con celdas
  «no definido» y párrafo alternativo; `pocos_discordantes` solo si 0 < b + c < 25.
- D4 solo con resumen (media, DE, n): la columna pegada vive en `descriptivos`, que ya
  entrega el IC t de la media. Evita un control de doble modo (campos o columna) y la
  ambigüedad de qué manda cuando hay ambos. Gráfica: bosque con «Media ± 1 DE» y
  «Media ± 2 DE» como filas para contrastar el intervalo con la dispersión.
- D5: selector explícito de escenario (s1/s2/s3); los cuartiles o extremos que el
  escenario no usa se rellenan con `NaN` en `derivar()` y llegan a R como `NA`. Los
  casos JSON llevan siempre los cinco números (JSON no admite `NaN`) y la ruta con `NA`
  se prueba aparte comprobando que el snippet relleno dice `q1 <- NA` y que R devuelve lo
  mismo. En s2 la caja de la gráfica usa Q₁ y Q₃ como extremos; en s1, la mediana como
  Q₁ y Q₃. Para s3 la banda de asimetría toma el cociente (rango o IQR) más alejado de 1
  en escala logarítmica; un resumen degenerado (0/0) se lee como compatible.
- D6: Shapiro-Wilk portado desde el listado Fortran publicado de AS R94 (StatLib) y de
  Royston 1992/1995, no desde `swilk.c` de R (GPL); se usan 6/π y arcsen√¾ exactos y el
  `qnorm` AS 241 en vez del `PPND` AS 111; los datos se dividen entre el rango sin
  restar el mínimo, como R. Precisión frente a R 4.5.2: 9.4e-16 en W y 7.5e-14 en p sobre
  30 columnas con n de 3 a 5000 (la tolerancia `shapiro` de 1e-8 queda holgada a
  propósito). Cuantiles tipo 7 con la expresión de R `(1 − h)·x[lo] + h·x[hi]`; media con
  la segunda pasada de `mean`; G₁/G₂ `NA` si n < 3 / n < 4 o varianza 0; el IC t va
  escrito a mano en el snippet porque `t.test` falla con datos constantes; W y p `NA` si
  n < 3, n > 5000 o rango 0; media geométrica `NA` con algún valor ≤ 0. Histograma: k de
  Sturges con paso «bonito» cuyo número de clases queda más cerca de k (el ejemplo da 9;
  `pretty` de R da 10). Ejemplo = `set.seed(1190); round(rnorm(40, 150, 45))`, que trae
  tres atípicos de Tukey y deja el aviso `atipicos` activo por omisión.
- Avisos con parámetros en SSR: `Avisos.astro` recibía solo los códigos activos y
  publicaba «{n_atipicos} valores…» hasta que el navegador repintaba (defecto latente
  desde H1, que ninguna calculadora anterior activaba en su ejemplo). `nucleo/avisos.ts`
  (`interpolar`, `paramsDeAvisos`) es ahora la única implementación, usada por la página
  y por el controlador.
- `parsearPegado` devuelve `{ valores, faltantes, ignorados, encabezado, variasColumnas }`
  (ARQUITECTURA §6.4 decía `{ columnas, filas, avisos }`): la calculadora recibe solo
  `number[]` y el recuento de lo omitido se muestra bajo el campo (`resumenPegado`, en
  `aria-describedby` y con `aria-live="off"`), no como aviso de la calculadora. Reglas:
  separador tabulador > `;` > coma, y la coma solo separa si alguna línea con coma no
  cumple el patrón de coma decimal `^[+\-−]?\d+,\d+$`; una sola línea con separador es
  una serie horizontal; varias líneas con separador toman la primera columna y avisan;
  la primera celda no numérica es el encabezado; faltantes = vacío, NA, NaN, N/A, #N/A,
  #¡N/A, #N/D, null, `.` y los guiones; las líneas vacías de en medio cuentan como
  faltantes. En una entrada `columna`, `min` es el número mínimo de valores
  (`err_n_min`), y `err_sin_datos` aparece cuando hay texto sin ningún número. La columna
  se registra siempre en las entradas (también `[]`) para que «Ejemplo cargado» y la URL
  comparen lo mismo que hay en pantalla.
- SVG: en `barras` las series secundarias se rellenan con una trama definida en
  `<defs>` (`fill` por atributo, color por CSS: legible en blanco y negro), la leyenda
  dibuja rectángulos (`leyendaSvg` ampliada con `muestra`/`relleno`), las marcas de los
  ejes de conteo son enteras (`ticksEnteros`) y los rótulos de categoría van a 13. En
  `histograma-boxplot` los paneles miden 170 (histograma) / 110 (solo curva normal) / 64
  (caja); con tres o más marcadores sus nombres pasan a la leyenda; el dominio x no se
  amplía a la curva normal (una DE grande se comería el histograma).
- Bibliografía: `publisher = {Oliver \& Boyd}` porque el parser parte `publisher` por
  « and »; `author = {Student}` con una sola llave (con dos, `authorsText` imprimía
  «undefined»); Yates 1934 conserva el nombre histórico de la revista; Pearson 1900 lleva
  «Series 5» en `journal`; los editores del Cochrane Handbook van en `author` porque el
  cargador no lee `editor`. Trece artículos de revistas de estadística no están en PubMed
  (sin `pmid`) y los cuatro libros no tienen DOI.
- `bandas.ts`: `bandaAsimetria(G₁)` (|G₁| < 0.5 simétrica; cola derecha/izquierda) y
  `bandaAsimetriaResumen` (cociente entre 0.5 y 2 compatible; ±∞ marcada; 0/0
  compatible).
- φ se atribuye a Yule 1912 (la especificación listaba además «Pearson 1904,
  Drapers' Company Research Memoirs [verificar]», sin datos bibliográficos confirmables):
  queda Yule como origen citable y Pearson 1900 para la χ².
- Diferencias de proporciones (RRA de B1 y δ pareada de B3) se presentan en puntos
  porcentuales (×100, un decimal, sin signo «%») en celda, resumen e interpretación, con
  la unidad en la etiqueta: con «%» se confundían con la RRR, que sí es un porcentaje.
- Métodos de B1 depende del diseño (`metodos_diseno.cohorte|transversal|casos_controles`
  → `{frase_medidas}`): en casos y controles solo declara la razón de momios; en
  transversal habla de razón de prevalencias. En transversal no se emite el párrafo del
  NNT y los párrafos del RR hablan de prevalencia, no de riesgo ni de «tratar».
- D5: el Cochrane Handbook (§6.5.2.5 y §6.5.2.6) respalda la conversión desde el IQR
  (Wan 2014) y desaconseja estimar la DE desde el rango; NO cita a Luo 2018. Los textos
  lo dicen así y advierten que el escenario S1 debe leerse con más cautela. Con n grande
  solo S1 tiende a la mediana; S2 y S3 convergen a 0.70·(Q₁ + Q₃)/2 + 0.30·mediana.
- D4: el intervalo χ² de la DE se describe como el intervalo clásico basado en
  (n − 1)s²/σ² ~ χ²_{n−1}, sin atribuirlo a un manual concreto.
- Pruebas añadidas tras la revisión: `contenido.test.ts` escribe cada aviso activo (del
  ejemplo y de todos los casos del fixture) con sus `params` y exige que ningún
  marcador quede sin parámetro (la red que faltaba al arreglo de los avisos en SSR), y
  falla si un módulo exporta `rScript` mientras el generador de fixtures solo conozca
  `r.codigo`; `bandas.test.ts` fija los cortes de las bandas de asimetría;
  `chi-cuadrada-fisher.test.ts` acumula la diferencia relativa máxima del OR
  condicional frente a R (< 1e-12) y sustituye dos aserciones tautológicas por fórmulas
  independientes; `descriptivos.test.ts` une `parsearPegado` con `validar`/`calcular`;
  casos nuevos de fixture: mediana igual a un cuartil (±∞ y 0 en el cociente de
  asimetría), S2 con n = 4 e `ic-media` con n = 3.
- Hallazgos del revisor principal sobre el commit de H2, corregidos en el commit de
  seguimiento: (1) una columna pegada con valores separados por espacios se concatenaba
  en silencio («1 2 3» → 123, porque `parsearNumero` quita los espacios de miles):
  `detectarSeparador` toma ahora el espacio como separador salvo que TODAS las líneas con
  espacio interno sean números con UN espacio de miles («1 234»); con dos o más huecos
  («150 160 170») se lee una serie, aunque «1 234 567» pierda la lectura de millón, que en
  una columna clínica es la menos probable; (2) «1,234.5» se leía como 1 (la coma pasaba
  por separador): las comas de miles con punto decimal se reconocen como número; el orden
  de detección queda tabulador > `;` > coma seguida de espacio > espacios > coma a secas;
  (3) con un error de captura la píldora «Ejemplo cargado» seguía visible junto al
  mensaje de error: el controlador la retira también en la rama de error (la URL de
  impresión conserva el último estado válido); (4) el coeficiente de variación con media
  ≤ 0 se mostraba como «−52.7 %» o «∞»: la celda pasa a «—» con nota, el párrafo no lo
  cita y se emite el aviso `cv_no_aplica` (el valor numérico sigue calculándose como en R);
  (5) «Compartir enlace» soltaba la columna pegada a partir de unos 245 valores (tope de
  1,500 caracteres de la URL) sin decirlo: `columnasOmitidas()` en `exportar.ts` es la
  misma condición con la que `codificarEstado` reintenta sin columnas y el botón avisa
  «Enlace copiado SIN la columna…» (`bio.ui.enlace_sin_columna`); (6) `chi-cuadrada-fisher`
  construía `celdas` agrupando estadísticos y valores p en vez de seguir `salidas`, y
  `contenido.test.ts` ordenaba los dos lados antes de comparar: ahora exige el mismo orden;
  (7) el comentario de la media de `descriptivos` prometía sumas compensadas «como R»
  cuando R acumula en doble sin compensar (x = [1e16, 1, 1, 1, −1e16, 2, 3, −2] daba 0.9375
  frente a 0.609375): se replica la aritmética de `mean()` de R (dos pasadas, sin
  Neumaier); al hacerlo, `varianza()` pasó a centrarse con la media de una pasada y el
  revisor lo detectó con un lote adversario (x = 1e9 + i·1e-6: 4.7e-3 de desviación
  frente a `var()`): `var()` de R centra con la misma media de dos pasadas, que es lo que
  se hace ahora, con el caso `mal_condicionado` en el fixture para que quede fijado; (8) el estimador y el EE de Agresti-Min se comparten entre el intervalo y su
  aviso de recorte; (9) la banda `direccion` de McNemar se usa en la interpretación o se
  retira; (10) `media-desde-mediana` avisa (`campos_ignorados`) cuando el escenario deja
  fuera un campo capturado. Comprobado que los rótulos del nomograma de Fagan sí pasan por
  `esc()` (línea 664 de `svg.ts`); (11) el espejo del hallazgo 2, heredado de H0: `parsearNumero`
  leía «1.234,5» (punto de miles y coma decimal, el convenio de buena parte del público
  hispanohablante) como 1.2345, en los campos y en el pegado. `normalizar` decide ahora por
  posición: con coma y punto a la vez, el signo de más a la derecha es el decimal y el otro
  debe agrupar de tres en tres («1,23.4» deja de ser un número); un signo repetido solo
  agrupa miles si forma grupos de tres («1.2.3» sigue siendo inválido); un signo que aparece
  una vez es el decimal («1,234» = 1.234, ambigüedad documentada y probada). `pegado.ts`
  reconoce ambos convenios de miles antes de tomar la coma como separador de columnas. El
  perfil `shapiro` se aprieta a 1e-10/1e-12 tras medir
  6.7e-16 en W y 2.2e-13 en p. Evidencia del revisor sin hallazgos: 252 casos límite nuevos
  TS-vs-R (3,881 comparaciones, 0 discrepancias reales) y 89,458 SVG renderizados sin
  excepciones ni marcadores sin rellenar.

**Pendiente conocido.** (1) Cuando la columna pegada no cabe en la URL (tope de 1,500
caracteres) el enlace se comparte sin los datos y no hay aviso visible. (2) No se
implementaron la p unilateral de Fisher ni el mid-p de McNemar, ni las opciones de D6
(cuantil tipo 6, clases de Freedman-Diaconis, Shapiro-Wilk desactivable) ni la DE de Shi
2020 para S3 de D5: son opcionales en la especificación y ningún texto promete lo que no
hace. (3) El camino SSR de los avisos (`Avisos.astro` + `CalculadoraPage`) y el repintado
del controlador (`pintarAvisos`) no tienen prueba de DOM: solo los cubren la prueba de
interpolación de `contenido.test.ts` y el `build` (H3 puede abrir un arnés de DOM
mínimo). (4) `docs/performance/baseline.json` sigue sin actualizar (ajeno a la sección).

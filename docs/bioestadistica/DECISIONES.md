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
  excepciones ni marcadores sin rellenar. Ese barrido queda en el repositorio como
  `npm run barrido:bio` (`scripts/bio-barrido.mjs`), ampliado a las diez calculadoras
  (60,646 combinaciones × 2 idiomas); al ampliarlo destapó que `valores-predictivos` (H1)
  entregaba `ic: ''` en VPP y VPN sin tamaños de validación en vez de omitir el intervalo,
  y se corrigió a la convención de A1 (sin `ic`).

**Pendiente conocido.** (1) Cuando la columna pegada no cabe en la URL (tope de 1,500
caracteres) el enlace se comparte sin los datos y no hay aviso visible. (2) No se
implementaron la p unilateral de Fisher ni el mid-p de McNemar, ni las opciones de D6
(cuantil tipo 6, clases de Freedman-Diaconis, Shapiro-Wilk desactivable) ni la DE de Shi
2020 para S3 de D5: son opcionales en la especificación y ningún texto promete lo que no
hace. (3) El camino SSR de los avisos (`Avisos.astro` + `CalculadoraPage`) y el repintado
del controlador (`pintarAvisos`) no tienen prueba de DOM: solo los cubren la prueba de
interpolación de `contenido.test.ts` y el `build` (H3 puede abrir un arnés de DOM
mínimo). (4) `docs/performance/baseline.json` sigue sin actualizar (ajeno a la sección).

## H3 · Por patrón: tamaño de muestra, kappa y Kaplan-Meier (en construcción, 17 de septiembre de 2026)

**Alcance acordado.** Dos oleadas sobre la misma rama: (1) las siete calculadoras de
tamaño de muestra y poder (`muestra-una-proporcion`, `muestra-una-media`,
`muestra-dos-proporciones`, `muestra-dos-medias`, `muestra-medias-pareadas`,
`muestra-prueba-diagnostica`, `muestra-correlacion`), que solo necesitan campos y
selectores existentes; (2) `kappa` (tabla k×k pegada) y `kaplan-meier` (tres columnas
pegadas), que necesitan un control nuevo y una gráfica nueva. `curva-roc` (opcional en
el PLAN) queda para después.

**Decisiones y desviaciones respecto a los diseños, con motivo.**

- La gráfica `potencia` del PLAN no es un renderizador nuevo: es `curvas` con una
  `referenciaY` (línea horizontal en el poder o la precisión objetivo), campo añadido a
  `GraficaCurvas`. Un renderizador aparte habría duplicado ejes, leyenda y marcador.
- `uniroot` de R (traducción literal de `R_zeroin2`, escrita en H2 dentro de
  `independencia.ts`) pasa a `primitivas/raices.ts` como `uniroot(f, a, b, { tol })`,
  junto a `brent`: lo usan el OR condicional de Fisher y ahora `power.prop.test`,
  `power.t.test` (con `tol = 1e-10`) y `pwr.r.test` (tolerancia por omisión). Regla: cuando
  el oráculo es una función de R que resuelve con `uniroot`, TypeScript resuelve con la
  misma rutina y los mismos corchetes; el objetivo es el número que imprime R.
- Convenio «0 = sin dato» para las entradas numéricas opcionales del grupo `muestra`
  (`n_dado` del modo inverso, `poblacion` de la CPF, `de_dif`/`sigma`/`rho` de C5) y para
  `t1`/`t2` de Kaplan-Meier, en vez de `NaN → NA`: `contenido.test.ts` exige que todo
  marcador del snippet esté en `ejemplo` (Zod `z.number()`, sin NaN) y el generador de
  fixtures rellena la plantilla con las entradas crudas de cada caso JSON (sin NaN ni
  null). Es el patrón de `valores-predictivos`; `NaN → NA` queda para
  `media-desde-mediana`, cuyo ejemplo y casos traen siempre los cinco números.
- Bloque común C0: las salidas viajan sin redondear y la presentación aplica el techo una
  sola vez en el titular (`techo()` de `metodos/muestra-comun.ts`, con tolerancia de 1e-9
  para no convertir 322.00000000001 en 323); el ajuste por pérdidas es n/(1 − L) sobre el
  n sin redondear; `alfa`/`lateralidad`/`poder`/`r` comparten rangos y `zAlfa` respeta la
  lateralidad como `qnorm(sig.level/tside, lower.tail = FALSE)` en R.
- C3: `power.prop.test` y `pwr.2p.test` solo existen para r = 1; con r ≠ 1 manda la fórmula
  cerrada de Fleiss (matemáticamente idéntica a la que `power.prop.test` invierte con r = 1)
  y los campos de comparación viajan como `NA`. C4/C5: la ecuación exacta de la t no
  central se escribe en el propio snippet con `uniroot(tol = 1e-10)` para que el fixture la
  valide también con r ≠ 1, y `power.t.test` se añade como comparación cuando r = 1.
- `Resultado.extras` (vectores de longitud variable) y su comparación elemento a elemento
  en `comparar.ts`: la tabla de vida de Kaplan-Meier (tiempos, en riesgo, eventos,
  censuras, S, EE de log S, IC) se valida entera contra `survfit`, no solo los escalares.
- Kaplan-Meier en H3 admite un máximo de dos grupos y tres columnas pegadas por separado
  (`tiempo`, `evento`, `grupo`): las salidas deben tener ids fijos y el pegado de una tabla
  con roles (`parsearTablaPegada` de MOTOR §5.1 con `datos.csv`) es infraestructura de H5. El
  log-rank de k grupos y los grupos ≥ 3 llegan con esa infraestructura.
- Kappa recibe la tabla k×k como texto pegado (`tipo: tabla`, lista plana por filas con k
  derivado por `derivar()`), no como rejilla editable: reutiliza el analizador de pegado y
  la codificación de la URL ya existente para `tabla`. La gráfica es un bosque (κ y, con
  k = 2, PABAK) con referencia en 0, no el mapa de calor de la especificación: un mapa de
  calor sería un renderizador más para una sola calculadora.
- Kaplan-Meier, renderizador `km` (`nucleo/svg.ts`): las marcas del eje del tiempo son los
  `tiemposRiesgo` cuando hay entre 2 y 9 dentro del dominio (y solo si no, `ticksLineales`),
  para que cada número de la tabla en riesgo caiga bajo el rótulo de su tiempo, como en las
  figuras publicadas; la banda de IC se recorta con `clipPath` y se parte en varios polígonos
  si un paso no trae IC, en vez de cerrarla con una tapa recta; con dos marcadores el lado del
  rótulo lo decide la posición (como en `curvas`) y lo que alterna es la banda; el margen
  izquierdo lo comparten las marcas de S y los rótulos de grupo de la tabla en riesgo.
- C3 (`muestra-dos-proporciones`): `pwr` no admite `alternative = "one.sided"`, así que la
  comparación unilateral se le pide con `"greater"` y `abs(h)`; los totales del titular son la
  suma de los dos grupos ya redondeados (268 = 134 + 134), porque el techo se aplica por grupo,
  mientras las salidas crudas siguen siendo n₁ + n₂ y n/(1 − L), idénticas a R; el snippet
  envuelve las dos llamadas de comparación en `tryCatch` para que un diseño irresoluble devuelva
  `NA_real_` en vez de detener el script; el caso `diferencia_minima` (0.50 frente a 0.505)
  dispara el aviso de diferencia pequeña porque 0.50 frente a 0.52 no cruza el corte de 0.01.
- Barrido (`scripts/bio-barrido.mjs`) ampliado a las 19 calculadoras con dos garantías nuevas:
  cuenta los casos que superan `validar()` por calculadora y falla si alguna queda en cero (un
  bloque con un id cambiado dejaría una calculadora sin ejercer en silencio), y barre los campos
  `requerido: false` también en blanco (`undefined`, como los entrega el controlador cuando el
  cuadro está vacío), porque el convenio «0 = sin dato» lo aplica `derivar()` y solo se
  comprueba si el vacío llega hasta él.
- C1/C2 (`muestra-una-proporcion`, `muestra-una-media`): el módulo común `muestra-estimacion.ts`
  exporta `SIN_DATO = 0` y `hayDato(x) = x ≥ 2`; el umbral es 2 y no 1 porque ni una población
  ni una muestra de un individuo admiten corrección ni intervalo, así que 0 y 1 significan lo
  mismo (caso `poblacion_uno` fijado contra R en las dos). El detalle de cada celda de tamaño
  usa `dec2` (con un decimal, 277.97 se escribía «278.0», igual que el techo) y σ y las
  precisiones de C2 se formatean con `sig4`, como `descriptivos`, para que 60 no se lea
  «60.000». La comprobación manual del encargo traía 279 y 310 para el ejemplo de C1; R da
  277.973 → 278 y 308.859 → 309, y eso es lo que se publica.
- C4/C5 (`muestra-dos-medias`, `muestra-medias-pareadas`): `derivar()` no calcula la DE de la
  diferencia; la regla σ_d = σ·√(2(1 − ρ)) vive en `calcular()` y en el snippet, idéntica en
  los dos lados, para que `de_dif` siga siendo una salida que R valida (`desde_rho`,
  `rho_alta`, `rho_cero`) y se conserve la distinción directa/derivada de los textos. Dos
  guardas explícitas en TypeScript y en los snippets: si con n = 2 ya se supera el poder, la
  respuesta es 2; si ni con 10⁷ se alcanza, es `NA`; sin ellas `uniroot` falla por falta de
  cambio de signo y `power.t.test` con `extendInt = "upX"` devolvería tamaños menores que 2.
  `n_dado` admite 0 y 1 como «sin modo inverso» y los opcionales llevan `min: 0` (con
  `min: 2` el ejemplo publicaba un error rojo en el campo).
- C6/C7 (`muestra-prueba-diagnostica`, `muestra-correlacion`): de 1 a 3 pares en `n_dado` se
  explica con el aviso `n_dado_corto` (parámetro `{minimo}`) y no con un error de campo;
  cuando `pwr.r.test` se detiene (r = 0.98 unilateral con poder 0.80 no baja del mínimo de
  cuatro pares) el snippet lo envuelve en `tryCatch` y devuelve `NA`, TypeScript `NaN`, y la
  banda `pwr` (`comparacion.con|sin`, `metodos_pwr.con|sin`) lo redacta; en la gráfica de C7,
  si el n clásico cae por debajo de cuatro pares, el marcador se lleva al mínimo del método,
  que es el techo que muestra la tabla, porque su rótulo se dibujaba fuera del lienzo.
- D1 (`kappa`): z y p se calculan como `irr::kappa2`, con la varianza bajo H0 (celdas
  esperadas `outer(pi, pj)`), portada literal de su `body()`; el EE del intervalo es el de
  Fleiss, Cohen y Everitt con las celdas observadas y `sqrt(max(0, ·))` para que el acuerdo
  perfecto dé 0 y no `NaN` por un ulp. `kappa2` ordena sus niveles como texto y con k = 10
  desplaza los pesos («1», «10», «2»: κ lineal 0.5944 en vez de 0.6109), así que el snippet
  numera las categorías desde 11 (caso `k10_lineal`). La κ máxima con pesos no es Σ mín(p_i·,
  p·_i), que puede quedar por debajo de la propia κ: se usa el óptimo del problema de transporte
  (Σ mín sin ponderar; esquina noroeste con pesos lineales o cuadráticos, exacta por la
  condición de Monge y contrastada con `lpSolve::lp.transport` en 600 tablas, diferencia 0).
  `{pabak}` viaja como «—» cuando k ≠ 2 y `metodos_byrt.no` menciona la κ máxima en vez de
  callar, porque Zod exige textos no vacíos.
- E3 (`kaplan-meier`): el snippet fija `factor(grupo, levels = sort(unique(grupo)))`, porque
  `factor()` ordena como texto y pondría el código 10 antes que el 2, numerando los grupos al
  revés que TypeScript (caso `codigos_10_y_2`); con el convenio 0 la regla t₁ ≤ t₂ solo se
  exige cuando los dos son > 0 (pedir solo el primer tiempo no puede ser `err_rango`) y el
  snippet guarda `t <= 0` en `s_en` (casos `sin_tiempos` y `solo_t2`); claves de
  interpretación añadidas al contrato: `tiempo.uno|dos|fuera` (la frase de S(t) que
  `resumen.uno|dos` interpola) y `metodos_logrank`. Limitación conocida: con un solo paciente
  por grupo la interpretación dice «1 pacientes (1 eventos)»; no hay mecanismo de plurales y
  solo aparece en una entrada degenerada.
- `svg.ts`, `curvas`: el rótulo «100 %» del eje Y se recortaba por arriba en las gráficas de
  poder (lo detectó C6/C7 en sus capturas); el margen superior se corrigió en el renderizador
  compartido, sin cambiar la geometría de las gráficas publicadas en H1/H2 más que en ese margen.
- Guarda nueva en `contenido.test.ts`: ningún texto de un YAML puede traer caracteres de
  control. Entre comillas dobles YAML convierte `\a`, `\b`, `\e`, `\f`, `\v` o `\0` en
  caracteres de control sin quejarse («z_{1-\alpha}» se publicó una vez como «z_{1-» + BEL +
  «lpha}» y solo se vio en la captura); un escape desconocido como `\c` sí aborta la carga y
  tumbó el build y `astro check` de todo el equipo hasta que su dueño lo pasó a comillas simples.
  Regla: en `simbolos`, `def:` y `nota:` el texto va en prosa o entre comillas simples.
- `techo()` y los tamaños minúsculos (hallazgo del barrido en C2, corregido por su constructor): la
  tolerancia de 1e-9 con la que `techo()` evita convertir 322.00000000001 en 323 hundía a 0 un tamaño
  positivo pero diminuto (σ = 10⁻⁶ frente a d = 0.1 da n_z = 1.6 × 10⁻¹⁰), el marcador de la gráfica
  caía en n = 0 y la curva de precisión lanzaba `RangeError`; en R `ceiling(1.6e-10)` es 1, así que la
  página además contradecía al `ceiling()` que documenta el snippet. C1 y C2 pasan toda la presentación
  y la gráfica por un helper `participantes(n)` que aplica `techo()` una sola vez y pone un suelo de 1
  cuando n > 0 (casos `n_diminuto` con p = 10⁻¹⁰ y con σ = 10⁻⁶, más pruebas de regresión que
  comprueban que `techo()` solo daría 0 y que ningún punto de la curva cae en n = 0). `validar()` no
  cambia: un cociente σ/d diminuto tiene respuesta legítima («un sujeto») y el aviso `n_pequeno` ya se
  activa ahí. El detalle del valor exacto usa cifras significativas por debajo de 1 (con `dec2` decía
  «0.00»).
- Formato del detalle «valor exacto» en el grupo `muestra` (decisión de integración, unificada en las
  siete): `dec2` por encima de 1 y `sig3` por debajo de 1. C0 decía un decimal, pero con `dec1` un
  crudo de 277.97 se lee «278.0», idéntico al techo, y el detalle deja de explicar de dónde sale la
  cifra; por debajo de 1, `dec2` escribía «0.00» y hacía creer que no hace falta nadie. Los valores
  crudos y los fixtures no cambian; solo la cadena de la celda y los «exacto» de interpretación y
  Métodos. C6 aplica el mismo suelo de 1 participante que C1/C2 (caso `n_diminuto`, 13 casos); C7 no
  lo necesita porque n = ((z_α + z_β)/C)² + 3 nunca baja de 3 y el n de `pwr` sale de un `uniroot`
  acotado en 4, fijado con un barrido de 216 extremos del dominio en su prueba.

**Revisión independiente de H3 (dos partes: A, kappa/Kaplan-Meier/infraestructura, con
sub-revisiones de interfaz y de contenido; B, las siete de tamaño de muestra).** Lo corregido en
infraestructura, con motivo:

- Forma de la tabla pegada (hallazgo alto): el controlador aplanaba las filas y `validar()` de kappa
  solo miraba √(celdas), así que una fila de cuatro conteos (1 × 4), una columna (4 × 1) o una tabla de
  2 × 8 pasaban como 2 × 2 o 4 × 4 y publicaban una κ de una tabla que nadie pegó. Ahora
  `esCuadrada(filas)` (`pegado.ts`) se comprueba ANTES de aplanar: `err_tabla_cuadrada` si la forma no
  es k × k, `err_tabla_incompleta` (clave nueva) si además se descartó alguna fila con celdas vacías o no
  numéricas (el error nombra la causa probable en vez de culpar a la cuadratura), y `err_n_min` si la
  tabla trae menos celdas que `min` (antes `min: 4` era declaración muerta en la rama `tabla`).
- `parsearTabla` pasa a llamarse `parsearTablaPegada`: MOTOR §5.1 reserva `parsearTabla(texto, {sep,
  decimal})` → `{columnas, filas, tipos, avisos}` (con cabecera obligatoria y guardas de tamaño) para el
  pegado con roles de H5; la función de H3 tiene otra firma y otro contrato y no debía usurpar el nombre.
- En una tabla de CONTEOS, «10,2» sin espacio ya no se lee como el decimal 10.2: si nada más separa y
  toda coma parte enteros no negativos, la coma separa casillas (una tabla 2 × 2 escrita a mano). En una
  columna sigue rigiendo la coma decimal. Documentado en la ayuda por su constructor.
- El enlace sin los datos pegados avisa ahora en todas partes, no solo en el botón «Compartir enlace»:
  nota persistente bajo la barra de herramientas mientras `columnasOmitidas()` sea cierto, la misma nota
  en la URL de impresión y bajo el enlace del Markdown exportado (`DatosMarkdown.notaUrl`), y el texto
  del botón en plural neutro («sin los datos pegados»: Kaplan-Meier omite tres columnas a la vez).
- Los `id` del SVG (`clipPath` del `km`, `aria-labelledby`) se derivan del slug (`bio-grafica-<slug>`)
  en SSR y en el controlador, para que dos gráficas en una misma página no los compartan (latente hoy).
- La guarda de caracteres de control cubre también `\t` (U+0009): `\times` y `\text{}` entre comillas
  dobles son los escapes más probables en esta sección y no aparecen en ningún YAML actual.
- `referencias.bib`: `gamer2019` y `therneau2024` citan ahora las versiones que validaron los fixtures
  (irr 0.85 y survival 3.8-6, ambas de 2026); las claves conservan su nombre para no tocar los YAML que
  las citan mientras sus constructores los corrigen, aunque su año ya no coincida con la clave.
- Resúmenes del pegado sin plural forzado («filas descartadas: 1») y «encabezado o rótulos omitidos»
  cuando lo retirado es una columna de rótulos.
- Pendientes no bloqueantes que la revisión deja anotados: no hay arnés de DOM para el controlador (se
  replicó `leer()` en Node); no existe `politica.test.ts` (la política de «ningún recurso externo» la
  vigila `audit:performance`, no una prueba); el `wrap="off"` del textarea de tabla en pantallas de 400
  px y el corte de `max-height` al imprimir no se comprobaron en navegador.
- Rótulo inglés de un valor no definido (hallazgo alto de la parte B): `NO_DEFINIDO.en` de
  `formato.ts` y `bio.ui.no_definido` decían «undefined», y como el modo inverso llega apagado, la
  celda de precisión o de poder del ejemplo cargado publicaba literalmente «undefined» en las siete
  páginas inglesas del grupo (en C4/C5 incluso en una frase: «undefined participants are required…»).
  Pasa a «not defined» (y `sin_ic` a «CI not defined»); las diez calculadoras de H0–H2 lo heredan. El
  barrido añade la regla «un texto que sea exactamente “undefined” es una fuga» en los dos idiomas (la
  palabra sigue siendo prosa legítima en inglés dentro de frases como «the geometric mean is undefined»).
- Kappa tras la revisión de contenido: `resumen` se parte en `resumen.simple` y `resumen.ponderada`
  (con pesos, «coincidieron en {po}» era falso: p₀ ponderado 86.5 % frente a 76 de 100 coincidencias
  exactas; la variante ponderada expone `{po_diagonal}`, el acuerdo exacto, y `paradoja.si` habla de
  «acuerdo observado»); el `tex` de la κ máxima publica las dos ramas (Σ mín sin ponderar; Σ w·m con m
  el reparto de la esquina noroeste); Cohen 1968 se cita solo con pesos; el aviso `paradoja` deja de
  llevar cifras (los parámetros de un aviso salen de `calcular()` sin formateador ni idioma, así que no
  pueden ir como «85.0 %»; remite a la interpretación, que sí pasa por `fmt`), y los otros dos avisos con
  parámetros solo llevan enteros; la ayuda de la tabla menciona los espacios y que los nombres de
  categoría pegados se omiten; `min: 4` retirado del YAML.
- Parte B de la revisión (tamaño de muestra), hallazgos numéricos y su regla:
  - CRÍTICO, C2: la variante t se resolvía por punto fijo con el techo dentro del bucle y entraba en un
    ciclo de periodo 2; se publicaba la fase en la que caía la pasada 50, no el menor n que cumple la
    condición, y R y TypeScript caían en la misma fase, así que el fixture validaba un número
    equivocado (σ = 1, d = 0.36, 80 %: publicaba 14 cuando con 14 la semiamplitud es 0.3608 y hace falta
    15; error siempre por defecto, 28 % de los casos con n entre 2 y 9). Regla: n_t es el MENOR entero
    n ≥ 2 con n ≥ (t_{n−1,1−α/2}·σ/d)², por búsqueda directa, en TypeScript y en el snippet a la vez, con
    prueba de mínimo (se cumple en n y no en n − 1). Lección: que TS y R coincidan no demuestra que el
    número sea el correcto cuando ambos implementan el mismo algoritmo; las propiedades matemáticas
    (mínimo, monotonía) necesitan su propia prueba.
  - ALTO, C3: `nPowerPropTest` buscaba la raíz en [1, 1e7] sin el `extendInt = "upX"` de
    `power.prop.test`, devolvía NaN donde R devuelve 392 443 982 (0.50 frente a 0.5001) y la nota lo
    atribuía a «solo con grupos iguales». Regla: reproducir la extensión del corchete de R o poner en el
    snippet la misma guarda; una nota por causa («solo con grupos iguales» ≠ «fuera del rango que R
    resuelve»).
  - ALTO, C4: `n_ptt` del snippet no llevaba las dos guardas que sí lleva `n1` (2 si con 2 ya se
    supera el poder; NA más allá de 10⁷), así que R y TS divergían en las dos direcciones (δ 1, σ 1000 →
    R 21 655 135, TS NaN; δ 1000, σ 0.001 → R 1.0008, TS 2). Regla: toda guarda del motor va también en
    el snippet, con caso de fixture en cada extremo.
  - ALTO, C4: `n_ajustado` era el techo de la suma (317) mientras `n_total` y la regla de C3 suman los
    techos por grupo (159 + 159 = 318; 317 repartido deja a un grupo en 142.2 < 143). Regla del grupo:
    los totales del titular son sumas de techos por grupo; el crudo n/(1 − L) queda en el detalle y en R.
  - ALTO, transversal: «undefined» visible en inglés (ver arriba).
  - ALTO, primitiva `qt`: invertir `pt()` con Brent pierde exactitud con grados de libertad grandes
    (la cola de `pt()` deja de resolver cuando t²/(ν + t²) se acerca al epsilon): 3.5e-9 relativo con
    ν = 1e9, 2.7e-6 con 1e11, 7 % con 1e16, muy por encima del perfil `cuantil`; alcanzable desde C2
    con d ≪ σ (σ = 60, d = 1e-6 daba n_t un 20 % distinto de R). Ahora `qt` devuelve el cuantil normal
    por encima de 1e20 (como `qt.c` de R) y, desde 1e5, la expansión de Cornish-Fisher de la t en
    potencias de 1/ν con cuatro términos (Fisher 1925; Abramowitz y Stegun 26.7.5), exacta a ~1e-16 en
    ese rango; por debajo de 1e5 sigue Brent sobre `pt()`, que ahí resuelve. Contrastado con R en 153
    puntos (p de 1e-100 a 0.999999, ν de 99 999 a 1e30), ver la prueba nueva de `primitivas.test.ts`.
  - MEDIO, esquina de `pnt` (documentada, no corregida): con ν = 0.2 (n_dado = 2, r = 0.1) y un cuantil
    crítico de 2.4 × 10¹⁴, TypeScript da poder 0 exacto y R 6.4e-8; pero el valor central `pt(q, 0.2,
    lower = FALSE)` es 5.0e-4 y la no centralidad es 1.4e-4, así que la cifra de R es también un
    artefacto de su `pnt` con ν < 1 (la cola no central no puede ser 8 000 veces menor que la central).
    Ambos se leen «0.0 %»; no se añade ese caso al fixture y queda anotado como límite de ambos lados.
  - MEDIO, `zNivel` duplicada en C6 con la forma `qnorm(a, lower = FALSE)` mientras el snippet escribe
    `qnorm(1 − a)`: 140 ulp de diferencia; se importa la de `proporciones.ts` (corrección de C6/C7).
  - MEDIO, ecuaciones con `z_{1−α/2}` aunque el contraste sea unilateral (C3, C4, C5, C7): se escribe
    `z_{1−α/k}` con k = 2 bilateral / 1 unilateral en los símbolos (corrección de sus constructores).
  - Sugerencias aceptadas: el perfil `potencia` pasa de 1e-6 a 1e-8 relativo (uso real máximo 1.4e-10;
    apretar sí, aflojar nunca); `n_aj = ⌈n/(1 − L)⌉` con techo explícito en las siete ecuaciones;
    aviso `supera_poblacion` en C1/C2 cuando el reclutamiento supera el censo; comentarios de C5 sobre
    `rho` corregidos («0 = sin dato», no `NaN`); prueba tautológica de C2 sustituida por la de mínimo.
    No aceptadas: renombrar las claves `chow2018` (año real 2017) y `gamer2019`/`therneau2024` (ahora
    2026) del .bib, porque tocaría los YAML de varios constructores por un detalle cosmético; `neyman1933`
    se declara en C4.
  - Cierre de C3 tras la revisión: `extenderUpX()` en `metodos/muestra-proporciones.ts` traduce
    literalmente la extensión de corchete de `uniroot(extendInt = "upX")` (paso inicial 0.01·máx(1e-4,
    |extremo|), duplicado en cada intento, primero el extremo inferior y luego el superior; un NaN detiene
    el bucle), porque el corchete final decide dónde para `zeroin` y de ahí que TS imprima el mismo número
    que R y no otra raíz igual de válida. Sobre 22 848 combinaciones con solución cerrada: 0 discrepancias
    por encima de 1e-6 (peor 2.5e-11) y 14 sin resolver que también fallan en R («did not succeed
    extending the interval endpoints», n < 0.37 participantes). Rótulos separados `nota_comparacion`
    («solo con grupos iguales») y `nota_sin_solucion` («fuera del rango que R resuelve»), tercera variante
    `comparacion.sin_solucion`, casos `diferencia_minuscula` (n_ppt = 392 443 981.61) y
    `pwr_fuera_de_rango` (n_ppt 5.25e10, `pwr` en NA porque se detiene en 1e9 sin extender); la h de
    Cohen usa cifras significativas por debajo de 0.1 («−0.0002» en vez de «0.000»).
  - Cierre de C2 tras la revisión: `n_t` = menor entero n ≥ 2 con n ≥ (t_{n−1,1−α/2}·σ/d)², buscado de
    uno en uno desde máx(2, ⌈n_z⌉) (cota inferior porque t > z; la condición es monótona, así que el
    primero que la cumple es el mínimo), con tope de 64 pasos y NA si se agotan, y guarda para el
    régimen por encima de 2⁵³ donde sumar uno no cambia el doble (R hace lo mismo). Al comparar las dos
    definiciones en R también cambiaron tres casos del fixture (`n_muy_pequeno` 6 → 7, `gl_minimo` 2 → 4,
    `n_diminuto` 1 → 2); caso nuevo `ciclo_periodo_2` (σ = 1, d = 0.36, 80 % → 15); 19 casos. Como `n_t`
    ya es entero, el detalle de su celda muestra la semiamplitud alcanzada con ese tamaño,
    t_{n−1}·σ/√n (141 sujetos alcanzan 9.99 frente a los 10 pedidos), que es lo que hace comprobable el
    mínimo. El titular `n`, la CPF y el modo inverso siguen sobre el cuantil normal, como fija el
    contrato del grupo; la ecuación y la explicación ya no hablan de «repetir el cálculo 50 veces».
  - Cierre de C4/C5 tras la revisión: `n_ptt` del snippet lleva las mismas dos guardas que `n1`
    (`if (poder_de(2) >= poder) 2 else if (poder_de(1e7) < poder) NA_real_ else power.t.test(...)$n`),
    con lo que δ = 1, σ = 1000 da NA en los dos lados y δ = 1000, σ = 0.001 da 2 en los dos (casos
    `sigma_enorme` y `efecto_enorme`; 16 casos); el titular a reclutar es la suma de techos por grupo
    (159 + 159 = 318) y la interpretación explica el reparto; C5 queda fijado en una prueba (un solo
    grupo: ambas vías dan 81); «no aplica» se reserva a r ≠ 1 y el diseño irresoluble se lee «no
    definido», como n₁.
  - Kaplan-Meier ata la cadena prohibida de su prueba A3 al formateador (`ctx.fmt.ic([NaN, NaN])`), de
    modo que un cambio futuro del rótulo no deja la prueba vigilando una cadena muerta; comprobó con una
    mutación que la prueba falla cuando el defecto vuelve.
  - Cierre de C6/C7 y C4/C5 (segunda tanda): `zNivel` única (la de `proporciones.ts`, forma literal del
    snippet); la diferencia de 2.18e-14 que citaba la revisión aparece al 99.9 % (donde las dos formas del
    cuantil divergen 9.4e-15), no en los niveles del fixture, cuyo 3.6e-15 residual es el ruido de las 15
    cifras de jsonlite en un n de cuatro dígitos enteros; caso nuevo `nivel_0999` (C6, 14 casos) con
    prueba de que `n_sn` queda por debajo de 2e-15 respecto a R y prueba de igualdad exacta de `zNivel`
    con `qnorm(1 − (1 − nivel)/2)`. `z_{1−α/k}` con k declarado en las diez apariciones de C4, las diez
    de C5 y las dos de C7 (fórmula clásica e inversa); `n_aj = ⌈n₁/(1−L)⌉ + ⌈n₂/(1−L)⌉` en C4 y
    `⌈n/(1−L)⌉` en C5; `neyman1933` citado en Métodos de C4 donde aparece el poder.
- Parte A de la revisión (numérica de kappa y Kaplan-Meier), hallazgos y regla:
  - ALTO, Kaplan-Meier: el snippet abortaba («system is exactly singular») donde TypeScript degradaba a
    NaN, con varianza nula del log-rank (p. ej. t = (5, 5), eventos (1, 1), grupos (0, 1)); quien copie
    el código a RStudio, o webR en H4, vería un error en vez de un resultado. Regla: `tryCatch` alrededor
    de `survdiff` y `NA_real_` en χ², p y gl, también cuando la varianza es 0 sin error (un grupo que
    nunca está en riesgo cuando ocurren los eventos daba χ² = 0, p = 1 y gl = 1 en R frente a NaN en TS).
  - ALTO, Kaplan-Meier: el límite inferior del IC de la mediana no reproducía `quantile.survfit` porque
    `approxConstante` suponía nodos ordenados y `approx()` de R los ordena antes de interpolar (la banda
    inferior de Ŝ no es monótona al principio de la curva): 238 de 2 999 curvas aleatorias discrepaban,
    todas log-log con nivel 0.99 o 0.999. Regla: ordenar los nodos como `approx`, caso de fixture con el
    reproductor (tiempos 1..10, eventos 1,1,0,1,1,1,0,1,1,0, 99.9 %: R [2, NA], TS daba [1, NaN]).
  - MEDIO, kappa: `z_h0` y `p_h0` son una resta de cantidades casi iguales y con p_e → 1 la cancelación
    amplificaba un ulp de diferencia hasta 1.5e-8 relativo ([9998, 1, 1, 0]). La revisión proponía un
    perfil propio; el constructor lo corrigió de raíz: `kappa2` hace toda su aritmética con los conteos
    enteros y divide entre n lo más tarde posible, y TypeScript partía de p = x/n; la función `pruebaH0()`
    reproduce esa agrupación paso a paso (solo para la prueba frente a cero; el resto conserva la del
    snippet, que es la que la página muestra) y los casos `pe_casi_uno_k2` y `pe_casi_uno` coinciden bit a
    bit con `cerrado`. El perfil `kappaH0` que se había preparado se retiró: no había nada que aflojar.
  - MEDIO, tubería de fixtures: `correr_casos.R` releía el JSON del snippet con `simplifyVector = TRUE` y
    un vector de longitud 1 (`"t_1": [4]`) volvía a escribirse como el escalar `4`, que `comparar()`
    rechaza; releerlo con `simplifyVector = FALSE` cambiaba los `null` por "NA" (102 diferencias en
    Kaplan-Meier). Ahora `correr_casos.R` solo comprueba que el texto sea JSON legible y lo copia TAL
    CUAL dentro de `casos` (Node lo relee e indenta): «no se transforma nada», literalmente. Los 19
    fixtures se regeneran idénticos.
  - Cierre de C3 (segunda tanda): `z_{1−α/k}` en Fleiss, el modo inverso y la h de Cohen, con k definido
    en cada ecuación; la ecuación de pérdidas escribe `⌈n₁/(1−L)⌉ + ⌈n₂/(1−L)⌉` (dos grupos, techo por
    grupo: 298 y no el 297 del techo de la suma); caso `extension_por_debajo` (0.001 frente a 0.998,
    α 0.20, poder 0.50: n_ppt = 0.826 en R y en TS); 19 casos.
  - Cierre de Kaplan-Meier (numérica): `survdiff` va en `tryCatch(..., error = function(err) NULL)` y sus
    resultados solo se leen si `lr$var[1, 1] > 0`; `chi2`, `gl` y `p` arrancan en `NA_real_` y TypeScript
    devuelve NaN también en `gl` con varianza nula (casos `logrank_singular`, `logrank_singular_empate`,
    `grupo_nunca_en_riesgo`). `approxConstante` ordena los pares por el nodo y promedia los repetidos,
    como `regularize.values` dentro de `approx()` con `ties = mean`, comprueba el rango con mínimo y máximo
    y trunca el índice al indexar (`x[2.5]` es `x[2]` en R): el reproductor pasa de [1, NaN] a [2, NaN]
    (casos `ic_mediana_no_monotona` al 99.9 % y al 99 %). Consecuencia que arrastró la decisión: con χ² y p
    en NaN, `decisionP(NaN)` habría publicado «no se rechaza la hipótesis nula, p = no definido»; se añade
    la banda `logrank: indefinido`, la clave `logrank.indefinido`, el aviso `logrank_indefinido` y la
    etiqueta `nota_sin_logrank` (las tres celdas del contraste muestran «—» con su nota). Cada regresión
    se probó por mutación (sin el `.sort()` fallan 4 de 93; con `gl: 1` sin varianza fallan 5; el snippet
    sin `tryCatch` sale de Rscript con código 1 y sin JSON). 24 casos, 93 pruebas.
  - Cierre de C1/C2 (segunda tanda): aviso `supera_poblacion` (con la población como único parámetro,
    entero) cuando hay población declarada y el reclutamiento con pérdidas la supera, con caso de fixture
    por calculadora; `n_aj = ⌈n/(1 − L)⌉` en las ecuaciones; la prueba tautológica del punto fijo se
    sustituyó por tres (propiedad de mínimo sobre una rejilla y sobre cada caso del fixture, el caso del
    ciclo con sus cifras, y la cota de arranque más el régimen enorme). 19 y 20 casos; 119 pruebas.
  - Kaplan-Meier, últimos retoques de la revisión: la ecuación `mediana` publica la regla real de
    `quantile.survfit` (m = (t₁ + t₂)/2 con t₁ = mín{t : Ŝ(t) ≤ ½} y t₂ = mín{t : Ŝ(t) < ½}; la nota
    explica el cruce de golpe, la meseta, el final exacto en 0.5 y la curva que nunca baja del 50 %) en
    vez de la definición ingenua `inf{t : Ŝ(t) < 0.5}` que el código no ejecutaba; ecuación `ic_log`
    propia para la otra escala del selector, con su nota. La prueba de los escenarios obligatorios de MOTOR
    §1.6 declara explícitamente sus dos sustituciones: «n = 1» se cubre con `n_2` porque una columna de un
    solo valor no pasa `N_MIN_KM = 2` (una curva de un paciente no tiene nada que estimar), y «tres grupos
    (gl = 2)» queda para el log-rank de k grupos de H5 (`MAX_GRUPOS_KM = 2`); ambos límites están anclados
    en la prueba con el mensaje del caso que habrá que añadir el día que cambien. 24 casos, 94 pruebas.

## H4 · webR: «Verificar con R» en el navegador (20 de septiembre de 2026)

Desviaciones y decisiones respecto a MOTOR §4, ARQUITECTURA §6.6–§6.7 y PLAN «H4», con su motivo:

- **Versión de R.** webR 0.6.0 (fijado en `WEBR_VERSION`; el CDN lo publica desde el 19 de mayo de
  2026) trae R 4.6.0, mientras que los fixtures se generaron con R 4.5.2 en la Mac. El panel muestra
  siempre la versión de R de la sesión («R 4.6.0 · webR 0.6.0 · 3.2 s»), como pedía PLAN «Riesgos»
  («la UI muestra ambos valores»); una discrepancia entre TS y webR que no aparezca frente a
  `Rscript` señalaría un cambio de método entre versiones de R o de un paquete, y es información,
  no ruido. Los siete paquetes del catálogo están en `repo.r-wasm.org` para R 4.6 (comprobado).
- **Tamaño anunciado.** `R.wasm` viaja comprimido (12.3 MB, `content-encoding: gzip`) más `R.js`,
  BLAS/LAPACK y el sistema de archivos perezoso; el consentimiento dice «unos 20 MB» (`DESCARGA_MB`)
  en vez de los «≈ 15 MB» del diseño, y añade «más los paquetes», que se nombran uno por uno.
- **Paquete ausente.** `webr::install()` solo avisa cuando un paquete no está en el repositorio y
  `library()` fallaría después con un mensaje de R menos claro; `instalar()` comprueba con
  `requireNamespace()` tras instalar y `verificarConR()` se detiene con `paquete_faltante` antes de
  ejecutar nada, con el texto «no está disponible en webR… (sí en R o RStudio)».
- **Hosts en un solo archivo, también en los textos.** El texto del consentimiento no contiene los
  nombres de host: lleva `{webr}`/`{repo}`/`{version}`/`{mb}`/`{paquetes}` y el controlador los
  interpola desde las constantes de `webr.ts` al pulsar el botón. Así `politica.test.ts` puede
  exigir que `r-wasm.org` no aparezca en ningún otro archivo de `src/` (ni `i18n.mjs`, ni
  componentes, ni comentarios) y la regla sigue siendo binaria.
- **Consentimiento de la visita.** Además del recordado en `localStorage` (`bio.webr.consentimiento
  = v1`), un consentimiento sin «recordar» vive en memoria del módulo (`concederConsentimiento(false)`)
  mientras dure el documento: con el `ClientRouter` sobrevive al cambio de calculadora, igual que
  la sesión de R, y no se vuelve a preguntar en cada página.
- **Segunda región viva.** La barra de estado del panel es `role="status"` (una región viva
  `polite` más, además de la de interpretación y avisos). La regla «una sola región aria-live»
  existe para no anunciar dos veces cada repintado al teclear; el estado de la verificación solo
  cambia tras un clic y sus etapas («Descargando R…», «Verificación terminada · Coincide en 11/11
  campos», o el motivo del error) son precisamente lo que una persona con lector de pantalla
  necesita oír. La revisión de H4 detectó que la primera versión reescribía la región cada segundo
  con el cronómetro (180 anuncios en el peor caso) y que el veredicto quedaba fuera de ella: ahora
  la región lleva solo el nombre de la etapa (se escribe únicamente cuando cambia) más el veredicto
  o el error al terminar, y el cronómetro vive en un `<span aria-hidden="true">` hermano. Al cancelar
  o liberar R el foco vuelve al botón «Verificar con R»; al aceptar, pasa al panel (`tabindex="-1"`)
  porque el botón que lo tenía se oculta. Los totales siguen con `aria-live="off"`.
- **Toda llamada al worker lleva temporizador.** La revisión señaló que `new Shelter()` y `purge()`
  eran las únicas operaciones sin `conTimeout`: un worker muerto (sin memoria, el caso que anticipa
  el aviso) dejaba la cola parada para siempre y, con el `ClientRouter`, para todas las calculadoras
  del documento. Ahora ambas vencen (`timeout_eval`; la purga con tope de 10 s) y cierran la sesión;
  el código `sesion_cerrada` (texto propio ES/EN) sustituye al `sin_consentimiento` que se lanzaba
  cuando una verificación encolada llegaba a una sesión ya cerrada.
- **CSP por cabecera, no `security.csp` de Astro.** El `security.csp` nativo emite `<meta>` con
  hashes para todo el sitio y su documentación declara que no es compatible con el `ClientRouter`;
  se usa una `Content-Security-Policy` en `vercel.json` acotada a las dos rutas de la sección
  (ES/EN), con `script-src 'self' 'wasm-unsafe-eval' https://webr.r-wasm.org`, `worker-src 'self'
  blob:` (webR envuelve su worker cross-origin en un blob) y `connect-src` a los dos orígenes.
  Consecuencia global: Astro incrustaba en el HTML los scripts y hojas menores de 4 KB (el script
  del menú de `Base.astro`, dos hojas pequeñas) y una CSP sin `'unsafe-inline'` los bloquearía, así
  que `astro.config.mjs` fija `build.inlineStylesheets: 'never'` y `vite.build.assetsInlineLimit:
  0` para todo el sitio (mismo contenido, servido como archivos con hash y caché inmutable). Se
  prefirió eso a abrir `'unsafe-inline'` o a mantener hashes a mano en `vercel.json`.
- **Tolerancias en la biblioteca.** `tests/bioestadistica/tolerancias.ts` pasó a
  `src/lib/bioestadistica/nucleo/tolerancias.ts` (el navegador necesita el mismo perfil que las
  pruebas) con `perfilPara(slug, entradas)`, que reproduce la única regla que hoy elige otro
  perfil (`prueba-diagnostica-2x2` con Clopper-Pearson o Jeffreys → `-beta`); `tolerancias.test.ts`
  comprueba contra TODOS los casos de los fixtures que `perfilPara` devuelve el `tol` declarado, de
  modo que añadir una regla de `tol` a un caso sin actualizar `perfilPara` falla. El archivo de
  `tests/` reexporta y las 22 pruebas que lo importan no cambiaron.
- **Obsolescencia del veredicto.** El resultado de una verificación vale para el código R que se
  ejecutó (`codigoVerificado`); si las entradas cambian, el panel se atenúa y dice «Las entradas
  cambiaron después de esta verificación» en vez de borrarse (el valor de R sigue siendo verdad
  para aquellas entradas) y el botón pasa a «Verificar de nuevo».
- **Formato de la tabla.** Los valores de TS y R se muestran sin locale y con hasta ocho cifras
  significativas (`toPrecision(8)`), la diferencia relativa en notación científica de un decimal y
  las filas de IC como «Sensibilidad (límite inferior)» con el id `sn.lo` en monoespaciada: es una
  lectura técnica de comprobación, no una cifra para el manuscrito (esas siguen en las celdas).
- **Sin transformación del snippet.** `verificarConR()` recibe `ultima.codigo`, el mismo texto que
  el controlador escribe en `<code data-codigo-r>` y que `Rscript` ejecuta para el fixture; el
  adaptador lo pasa a `captureR()` tal cual (`webr.test.ts` lo comprueba byte a byte).
- **Timeouts.** 180 s para descargar y arrancar R, 120 s por paquete, 60 s por snippet; el de
  ejecución cierra la sesión (`cerrarR()`) porque el canal `PostMessage` no admite interrupción, y
  el siguiente intento reinicia R (la descarga vuelve de la caché HTTP). Los temporizadores se
  limpian siempre (en Node, un `setTimeout` de tres minutos sin limpiar mantenía viva la prueba).
- **Prueba de humo fuera de `npm test`.** `npm run humo:webr` (`scripts/bio-humo-webr.mjs`) necesita
  red, el CDN y Chrome; sale con 2 (omitida) si el CDN no responde. Sirve `dist/` con las cabeceras
  de `vercel.json` para que la CSP se pruebe contra el build real y no solo en el código.
- **Revisión independiente de H4** (agente `code-reviewer`: 3 altos, 6 medios, 4 bajos; todos
  atendidos antes del commit). Además de los dos primeros puntos de esta sección (región viva y
  temporizadores): `child-src 'self' blob:` en la CSP como respaldo de `worker-src` (Safari < 15.4)
  y prueba de que las dos cadenas ES/EN son idénticas y de que los `source` casan con el índice y
  las calculadoras con y sin barra; `politica.test.ts` recorre también `data/bioestadistica/` y
  todo `public/` (el host podía colarse en una referencia bibliográfica que acaba en el HTML sin ser
  «recurso declarado»); botón «Olvidar mi decisión» (`retirarConsentimiento()`) para que el opt-in
  sea reversible desde la página como promete EXTERNOS.md; botón «Cancelar la verificación» y
  `cancelar()` en el adaptador (rechaza las operaciones en espera con `cancelado` y cierra R) más un
  plazo compartido entre la descarga del módulo y el arranque (antes podían sumar 2 × 180 s sin
  salida); si `codigoR()` lanza en el primer repintado, «Verificar con R» ejecuta el texto que está
  en pantalla (`<code data-codigo-r>`) y no una cadena vacía; `onProgreso` comprueba `señal.aborted`
  antes de tocar el DOM (la promesa sobrevive a la navegación, el DOM no); el módulo `webr.ts` se
  guarda a nivel de módulo del controlador para que la página siguiente pueda ofrecer «Liberar
  memoria» sin verificar; claves `bio.ui.verificando`, `r_listo` y `r_error` retiradas (muertas);
  el supuesto «una sola línea JSON por snippet» queda escrito en MOTOR §4 con su prueba. Dos
  matices de redacción en inglés («this very code» → «the exact code») aplicados.
- **`'unsafe-eval'` en la CSP: la prueba de humo corrigió a la revisión.** La revisión estática
  leyó `R.js` y concluyó que solo los paquetes con `EM_ASM`/`EM_JS` necesitaban `eval`; la primera
  corrida real de `npm run humo:webr` con la CSP de `vercel.json` falló siempre (R descargado entero,
  worker colgado hasta el timeout de 180 s, `EvalError` mudo sin violación declarada) y pasó en 1.7 s
  con `'unsafe-eval'` añadido. Se añade esa palabra clave y solo esa; `politica.test.ts` la exige
  ahora y sigue prohibiendo `'unsafe-inline'`. Lección registrada en HANDOFF: una CSP se demuestra
  con el binario corriendo, no leyendo su fuente.
- **Condiciones de R como proxies.** El humo en inglés con `kappa` (`library(irr)` emite el mensaje
  «Loading required package: lpSolve») falló con «Cannot convert object to primitive value»: webR
  entrega la condición como proxy de objeto R cuyo `toJs()` lanza (el elemento `call` no es
  convertible) y que tampoco admite `String()`. `textoDeCondicion` lee ahora `get('message')` →
  `toArray()` (forma real reproducida en Node con el paquete de webR), cae a `toJs()` y, si nada
  sirve, a un texto fijo; los flujos `stdout`/`stderr` tampoco se convierten a ciegas. Se conserva
  `captureConditions: true` porque los mensajes de carga de paquetes son información útil en el
  panel («Avisos de R»); con `false` desaparecen sin más.

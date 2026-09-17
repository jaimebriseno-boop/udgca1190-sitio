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

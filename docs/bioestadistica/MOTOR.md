# Bioestadística abierta — motor híbrido TS + webR, validación y exportación

Diseño del motor de cálculo, la integración con R/webR, el pipeline de validación y las exportaciones para la sección «Bioestadística abierta» del sitio Astro 6.4 del CA UDG-CA-1190. No cubre la especificación estadística (fórmulas, referencias) ni la arquitectura de páginas Astro: esas las escriben otros dos agentes. Aquí van la fontanería numérica, el contrato con R y las pruebas.

Repo: `/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta` (worktree, rama `jaimebriseno-boop/Bioestadistica-abierta`).

## 0. Hechos verificados en esta sesión que condicionan el diseño

Además de los hechos que el líder dio por verificados, comprobé cuatro cosas más:

| Hecho | Evidencia | Consecuencia |
|---|---|---|
| Node 22.22.3 ejecuta TypeScript sin transpilar (type stripping activo por defecto; existe la bandera `--no-experimental-strip-types`) | `printf 'const x: number = 2 …' \| node --input-type=module-typescript -` imprime `strip-ok 42` | Las pruebas `node --test` importan los módulos `.ts` de `src/lib/bioestadistica/` sin build, sin `tsx` ni dependencias nuevas. Restricción: solo sintaxis borrable (nada de `enum`, `namespace`, propiedades de parámetro) y los especificadores de importación deben llevar la extensión `.ts`. |
| `jsonlite::toJSON(list(a=Inf,b=NaN,c=NA_real_,d=1/3), auto_unbox=TRUE, digits=NA)` produce `{"a":"Inf","b":"NaN","c":"NA","d":0.333333333333333}` | Ejecutado con R 4.5.2 local (jsonlite 2.0.0) | El comparador TS debe mapear las cadenas `"Inf"`, `"-Inf"`, `"NaN"`, `"NA"` a `Infinity`, `-Infinity`, `NaN`, `null`. `digits = NA` da 15 cifras significativas: suficiente para tolerancias de 1e-9. |
| epiR 2.0.96 (CRAN, 2026-08-03) declara `Depends: survival` e `Imports: BiasedUrn, pander, sf, lubridate, zoo, flextable, officer, DFBA` | Página CRAN de epiR | Instalar epiR en webR arrastra `sf` (GDAL/GEOS/PROJ en wasm), `officer`, `flextable` y sus árboles: decenas de MB extra por verificación. **epiR no puede ser el paquete del snippet que se ejecuta en el navegador.** Queda como oráculo secundario local (sección 6.5). |
| El paquete npm `webr@0.6.0` desempaquetado pesa 48,623,808 bytes en 170 archivos (incluye la consola React/xterm, que no se necesita) | Registro npm | Autoalojar el núcleo (`webr.mjs`, `webr-worker.js`, `R.bin.*`, `vfs/`) implica varias decenas de MB sin comprimir en git; hay que medir `dist/` tras `npm pack` antes de decidir. Transferencia inicial ≈ 12 MB (dato del líder). |

Y las funciones reutilizables de propedéutica (`public/herramientas/propedeutica-basada-en-evidencia/app/js/app.js`): `odds`, `prob`, `post` (líneas 140-145), `fmtLr`, `fmtPc` (130-138), `celda` (385-388) y `dibujarFagan` (506-549, ejes con `y_pre(u) = T + ((u+3)/6)·H`, `y_post(v) = T + ((3−v)/6)·H`, `y_lr(w) = T + ((6−w)/12)·H`). La lógica de Fagan se reescribe en TS como función pura que devuelve coordenadas; el SVG lo pinta la capa de UI.

## 1. Biblioteca numérica `src/lib/bioestadistica/`

### 1.1 Árbol de módulos

```
src/lib/bioestadistica/
  tipos.ts                 Estimacion, Resultado, Aviso, MetodoId, Banda (solo tipos)
  primitivas/
    especiales.ts          erf/erfc (Cody), lgamma (Lanczos), lbeta, lchoose, log1p seguro
    incompletas.ts         betaInc (Lentz), gammaP/gammaQ (serie + fracción continua)
    distribuciones.ts      pnorm/qnorm/dnorm, pt/qt, pnt (t no central), pchisq/qchisq,
                           pbeta/qbeta, pgamma/qgamma, pf/qf, dbinom/pbinom, dhyper/phyper
    raices.ts              brent(f, a, b, tol), expandirIntervalo(f, x0, dir)
  tabla2x2.ts              diagnostica(vp, fp, fn, vn, op)          → Resultado<'diagnostica'>
  posprueba.ts             posprueba(pre, lr), nomogramaFagan(pre, lr) → coordenadas
  asociacion2x2.ts         asociacion(a, b, c, d, op)               → RR, OR, RD/RAR, NNT
  pruebas2x2.ts            chiCuadrada(tabla, {yates}), fisher(tabla), mcnemar(b, c, op)
  proporcion.ts            icProporcion(x, n, {metodo}), icDiferencia(x1, n1, x2, n2, {metodo})
  media.ts                 icMedia(n, media, sd), descriptivos(xs), histograma(xs, regla)
  hozo.ts                  mediaSdDesdeResumen({mediana, q1, q3, min, max, n}, metodo)
  kappa.ts                 kappaCohen(tabla, {pesos: 'ninguno'|'lineal'|'cuadratico'})
  roc.ts                   auc(valores, clase) (Mann–Whitney), icDeLong, coordenadasROC, puntoYouden
  muestra.ts               nDosProporciones, nDosMedias, potenciaT, nUnaProporcion, nEstimarMedia…
  supervivencia.ts         kaplanMeier(t, e, {nivel, tipoIC}), logRank(t, e, g)
  bandas.ts                bandaLr, bandaKappa, direccionNNT, icCruzaNulo (puras, sin texto)
  interpretar.ts           interpretar(resultado, plantillas, locale) → string[]
  formato.ts               fmt(valor, hint, locale), fmtIC(…)
  codigoR/
    index.ts               rellenarR(codigo, entradas), codigoR(plantilla, entradas), num(); contrato
    supervivencia.ts …     rScript(entradas) solo donde hace falta lógica (KM, modelos); el resto vive en YAML
  comparar.ts              comparar(resultadoTS, jsonR, tolerancias) → informe por campo
  entrada.ts               parsearTabla(texto) (TSV/CSV, coma decimal, faltantes)
  exportar.ts              aMarkdown, aCSV, estadoURL (codificar/decodificar)
  webr.ts                  cargador perezoso de webR (consentimiento, progreso, timeouts)
```

Los ejemplos («Cargar ejemplo») y las plantillas R simples viven en el YAML de cada calculadora (decisión de arquitectura), no aquí.

Reglas de dependencia: `primitivas/*` no importa nada; los módulos de calculadora importan solo `primitivas/` y `tipos.ts`; `interpretar.ts`, `formato.ts`, `codigoR/`, `comparar.ts` y `exportar.ts` no tocan el DOM; `webr.ts` es el único módulo con efectos externos (red, worker). Nada bajo `src/lib/bioestadistica/` importa de `astro:*`, así Node y Vite consumen los mismos archivos.

Compatibilidad doble Node/Vite: importaciones relativas con extensión explícita (`import { qnorm } from './primitivas/distribuciones.ts'`). Vite las resuelve; Node las exige; `astro/tsconfigs/base.json` ya trae `allowImportingTsExtensions: true` (verificado por plan-arquitectura). Se añade `"erasableSyntaxOnly": true` a `tsconfig.json` para que `astro check` rechace `enum`, `namespace` y propiedades de parámetro antes de que Node falle con `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Tipos siempre con `import type`.

### 1.2 Tipos públicos

```ts
// src/lib/bioestadistica/tipos.ts
export type MetodoId =
  | 'clopper-pearson' | 'wilson' | 'wilson-cc' | 'agresti-coull' | 'jeffreys'
  | 'log-wald' | 'wald' | 'newcombe-hibrido' | 'simel-log'
  | 'fisher-condicional' | 'yates' | 'sin-correccion' | 'mcnemar-exacto'
  | 'greenwood-log' | 'greenwood-log-log' | 'fleiss-cohen-everitt' | 'puntual';

export interface Estimacion {
  valor: number;              // puede ser Infinity, -Infinity o NaN (nunca se redondea aquí)
  ic?: [number, number];      // ausente cuando el método no da intervalo
  nivel?: number;             // 0.95
  metodo: MetodoId;
}

export interface Aviso {
  codigo: string;             // 'celda_cero' | 'haldane_aplicado' | 'esperados_bajos' | 'epv_bajo' …
  severidad: 'info' | 'aviso' | 'error';
  params?: Record<string, number | string>;   // la UI los interpola en el texto localizado
}

export interface Resultado<C extends string = string> {
  calculadora: C;
  version: 1;                                     // versión del contrato de campos
  entradas: Record<string, number | string | boolean>;
  valores: Record<string, Estimacion>;            // claves idénticas a las del JSON que imprime R
  bandas: Record<string, string>;                 // 'lr_pos' → 'grande' | 'moderado' | …
  avisos: Aviso[];
}
```

Ejemplo de uso:

```ts
import { diagnostica } from '../lib/bioestadistica/tabla2x2.ts';
const r = diagnostica(90, 10, 5, 95, { nivel: 0.95, metodoIC: 'clopper-pearson', haldane: false });
r.valores.se        // { valor: 0.9473684210526315, ic: [0.8812, 0.9847], nivel: 0.95, metodo: 'clopper-pearson' }
r.valores.lr_pos    // { valor: 9.947…, ic: [5.37, 18.4], metodo: 'simel-log' }
r.bandas.lr_pos     // 'moderado'
```

Los nombres de campo (`se`, `sp`, `vpp`, `vpn`, `prev`, `lr_pos`, `lr_neg`, `dor`, `exactitud`, `youden`, `n`) son los mismos en el objeto TS, en el JSON de R y en los fixtures. Esa igualdad es lo que vuelve trivial la comparación.

### 1.3 Primitivas: algoritmo y referencia de cada una

| Función | Algoritmo | Referencia de implementación | Precisión esperada |
|---|---|---|---|
| `erfc`, `pnorm` | Aproximación racional de Cody en tres tramos (la misma que `nmath/pnorm.c` de R) | Cody WJ. *Math Comp* 1969;23:631; R `src/nmath/pnorm.c` | ≈ 1e-16 relativa; colas hasta 1e-300 con `lower=false` |
| `qnorm` | AS 241 (PPND16) de Wichura | Wichura MJ. *Appl Stat* 1988;37:477; R `nmath/qnorm.c` | ≈ 1e-16 |
| `lgamma` | Lanczos g = 607/128, 15 coeficientes (Godfrey), reflexión para x < 0.5 | *Numerical Recipes* 3e §6.1 `gammln` | ≈ 1e-15 |
| `betaInc(a, b, x)` (I_x regularizada) | Fracción continua de Lentz modificada con cambio de simetría cuando x > (a+1)/(a+b+2); tope 2000 iteraciones y `eps = 1e-15` | NR 3e §6.4 `betacf`; Lentz 1976 | ≈ 1e-13 típica; degrada con a, b > 1e5 (aviso `precision_reducida`) |
| `gammaP`, `gammaQ` | Serie para x < a+1; fracción continua de Lentz en otro caso | NR 3e §6.2 `gser`/`gcf` | ≈ 1e-14 |
| `pchisq(x, k)` | `gammaP(k/2, x/2)` | — | hereda |
| `pt(t, ν)` | `1 − ½·I_x(ν/2, ½)` con x = ν/(ν+t²) | Abramowitz & Stegun 26.5.27 | hereda |
| `pnt(t, ν, δ)` (t no central) | AS 243 de Lenth: suma de betas incompletas, `errmax 1e-12`, `itrmax 1000` | Lenth RV. *Appl Stat* 1989;38:185; R `nmath/pnt.c` | ≈ 1e-10; necesaria para `power.t.test` |
| `pf(x, d1, d2)` | `I_{d1x/(d1x+d2)}(d1/2, d2/2)` | — | hereda |
| `dbinom`, `pbinom` | logaritmos con `lchoose`; `pbinom(k;n,p) = I_{1−p}(n−k, k+1)` | — | hereda |
| `dhyper`, `phyper` | `exp(lchoose(m,x)+lchoose(n,k−x)−lchoose(m+n,k))`; sumas en escala log | — | ≈ 1e-13 |
| `qbeta`, `qchisq`, `qt`, `qgamma`, `qf` | Brent sobre `F(x) − p` con corchete inicial y expansión geométrica; `tol = 1e-14·max(1,|x|)`, tope 200 iteraciones | Brent RP 1973; NR 3e §9.3 `zbrent` | ≈ 1e-12 en el cuantil |
| IC binomial exacto | `[qbeta(α/2, x, n−x+1), qbeta(1−α/2, x+1, n−x)]`, con 0 y 1 en los bordes x = 0 y x = n | Clopper & Pearson 1934 | 1e-9 frente a R |

Se elige invertir las CDF propias con Brent (en vez de portar AS 91 o AS 109) porque garantiza consistencia interna: `pchisq(qchisq(p)) = p` a la precisión de la máquina, y porque el oráculo R ya cubre la exactitud absoluta.

### 1.4 Convenciones numéricas

1. **La biblioteca nunca redondea.** Devuelve `number` en doble precisión; el formato con decimales y locale es responsabilidad exclusiva de `formato.ts` en la UI. Ninguna función acepta cadenas.
2. **Celdas cero.** Sin corrección: `LR+ = se/(1−sp)` con `sp = 1` devuelve `Infinity`; el IC queda `[NaN, NaN]` y se añade `aviso 'celda_cero'` con la celda afectada. Es la misma respuesta que R (`Inf`, `NaN`), así los fixtures también cubren estos casos.
3. **Corrección de Haldane–Anscombe.** Opción `haldane: boolean` (por defecto `false`). Cuando se activa, se suma 0.5 a las cuatro celdas antes de calcular OR/RR/LR y sus IC, y se emite `aviso 'haldane_aplicado'`. La opción viaja a la plantilla R (`corr <- 0.5`) para que TS y R hagan lo mismo; nunca se aplica en silencio.
4. **`NaN` significa «no definido», nunca «error de programación».** Un `n = 0` o una proporción con `x > n` es error de entrada: la función lanza `RangeError` con código (`entrada_invalida`) y la UI lo muestra antes de calcular.
5. **Cuantiles tipo 7** (el default de R) en `descriptivos`; la plantilla R pasa `type = 7` explícito.
6. **Continuidad e igualdad con R en detalles pequeños:** `chisq.test` limita la corrección de Yates a `min(0.5, |x − E|)`; `mcnemar.test` corrige por defecto; `survfit` usa `conf.type = "log"` por defecto pero el snippet pide `"log-log"` de forma explícita. Cada uno de esos detalles se refleja en un `MetodoId` y en un caso de fixture.
7. **Sin estado global ni `Math.random`.** Cualquier simulación futura recibe el generador como parámetro.

### 1.5 Reglas de pureza y testabilidad

- Funciones puras `(entradas, opciones) → Resultado`; sin DOM, sin `Intl`, sin `Date`.
- Cada módulo exporta también sus piezas intermedias (por ejemplo `seLogLr`, `varianzaGreenwood`) para probarlas por separado.
- Sintaxis TS borrable: `interface`, `type`, `satisfies`, `as const`; `import type` para tipos. Un test de humo (`tests/bioestadistica/sintaxis.test.ts`) importa todos los módulos: si Node no puede borrar la sintaxis, falla ahí y no en producción.
- Ningún módulo lee `window`, `localStorage` ni `navigator`, salvo `webr.ts` y `exportar.ts` (y estos reciben las dependencias como argumentos para poder simularlas: `aCSV(filas)` devuelve el texto, `descargar(texto, nombre, doc = document)` hace el Blob).

### 1.6 Kaplan–Meier y log-rank en TS: sí, fase 1

Es viable en unas 150 líneas y se compara contra `survfit`/`survdiff`.

```ts
export function kaplanMeier(t: number[], e: (0 | 1)[], op = { nivel: 0.95, tipoIC: 'log-log' as const }) {
  // 1. ordenar por tiempo; en empates los eventos preceden a las censuras (convención de survfit)
  // 2. en cada tiempo distinto con d_i > 0:  S_i = S_{i-1} · (1 − d_i/n_i)
  //    Greenwood acumulado: g_i = Σ d_j / (n_j (n_j − d_j))    (si n_j = d_j → g = Infinity, IC = [NaN, NaN])
  // 3. IC log-log (Kalbfleisch–Prentice): se = sqrt(g_i) / |ln S_i|;  [S^{exp(z·se)}, S^{exp(−z·se)}]
  //    IC log: [S·exp(−z·sqrt(g_i)), min(1, S·exp(z·sqrt(g_i)))]
  // 4. mediana (regla de quantile.survfit): primer tiempo con S_i < 0.5; si la curva vale exactamente 0.5 en una
  //    meseta, punto medio entre el primer tiempo con S_i ≤ 0.5 y el siguiente con S_i < 0.5; el IC de la mediana
  //    aplica el mismo criterio a las bandas inferior y superior
  // devuelve { pasos: [{t, nRiesgo, eventos, censuras, s, ee_log, lo, hi}], mediana: Estimacion, nivel, tipoIC }
  //    ee_log = sqrt(g_i) es el EE de log S: es lo que survfit expone como std.err (no el EE de S), y con ese
  //    campo se compara
}
export function logRank(t: number[], e: (0 | 1)[], g: string[]) {
  // en cada tiempo de evento y grupo j: e_j = d·n_j/n; V_jj = d·(n_j/n)(1 − n_j/n)(n − d)/(n − 1); V_jk = −d·n_j n_k (n−d) / (n² (n−1))
  // χ² = (O − E)ᵀ V⁻ (O − E) sobre k−1 grupos; gl = k − 1; p = pchisq(χ², gl, superior)
  // devuelve { chisq, gl, p, grupos: [{nombre, n, observados, esperados}] }   ← mismos campos que survdiff
}
```

Casos de fixture obligatorios: sin censuras; todo censurado tras el último evento; empates evento/censura; un grupo sin eventos; n = 1; meseta con S = 0.5 exacto (regla del punto medio); tres grupos (gl = 2).

## 2. Capa de interpretación

Separación estricta: la biblioteca produce números y **bandas categóricas** (`bandas.ts`), y la UI rellena **plantillas de idioma**. Los umbrales de banda (Jaeschke 1994 y McGee 2002 para LR, Landis y Koch 1977 para κ) los fija la especificación de métodos; aquí solo se define el mecanismo.

```ts
// bandas.ts (puro; sin texto)
export type BandaLr = 'grande' | 'moderado' | 'pequeno' | 'minimo' | 'nulo';
export function bandaLrPos(lr: number): BandaLr { /* ≥10, 5–10, 2–5, 1–2, ≈1 */ }
export function bandaLrNeg(lr: number): BandaLr { /* ≤0.1, 0.1–0.2, 0.2–0.5, 0.5–1, ≈1 */ }
export type BandaKappa = 'pobre' | 'leve' | 'aceptable' | 'moderado' | 'sustancial' | 'casi_perfecto';
export function direccionNNT(rar: number): 'beneficio' | 'dano' | 'nulo';
export function icCruzaNulo(ic: [number, number], nulo: 0 | 1): boolean;
```

Plantillas por idioma en `src/lib/bioestadistica/plantillas/es.json` y `en.json`, con las mismas claves. Sintaxis:

- `{campo}` valor con el formato por defecto del campo; `{campo:pct1}` con pista de formato.
- `{campo.lo:pct1}`, `{campo.hi:pct1}`, `{campo.ic:pct1}` → «88.1 % a 98.3 %».
- `{banda.lr_pos}` → etiqueta localizada de la banda (`bandas.lr_pos.moderado` → «cambio moderado»).
- `{aviso.haldane_aplicado}` → texto del aviso con sus `params`.
- Sin condicionales dentro del texto. Las frases condicionales son objetos con `cuando`:

```json
{
  "diagnostica.titulo": "Rendimiento diagnóstico",
  "diagnostica.frases": [
    { "texto": "La prueba detecta a {se:pct1} de los enfermos (IC {nivel:pct0}: {se.ic:pct1}) y descarta a {sp:pct1} de los sanos ({sp.ic:pct1})." },
    { "cuando": { "banda": "lr_pos", "en": ["grande", "moderado"] },
      "texto": "Un resultado positivo multiplica los momios de enfermedad por {lr_pos:lr} ({banda.lr_pos})." },
    { "cuando": { "banda": "lr_pos", "en": ["nulo"] },
      "texto": "Un resultado positivo apenas cambia la probabilidad (LR+ {lr_pos:lr}): el hallazgo no discrimina." },
    { "cuando": { "aviso": "celda_cero" },
      "texto": "Hay una celda con cero: las razones con infinito no tienen intervalo. Considera la corrección de Haldane–Anscombe." }
  ],
  "bandas.lr_pos.grande": "cambio grande", "bandas.lr_pos.moderado": "cambio moderado",
  "formato.pct": "{n} %", "formato.infinito": "∞", "formato.p_menor": "< 0.001"
}
```

Pistas de formato (`formato.ts`): `int`, `dec1`…`dec4`, `sig2`…`sig4`, `pct0`…`pct2` (multiplica por 100 y añade espacio fino U+202F antes de `%`, como «IC 95 %» en propedéutica), `p` (tres decimales o «< 0.001»), `lr` (tres cifras significativas, `∞` para infinito, «no definido» para NaN), `x` (razón con «×»). Números con `new Intl.NumberFormat(locale, { minimumFractionDigits, maximumFractionDigits })`, `locale = 'es-MX' | 'en-US'`; ambos usan punto decimal, pero el código nunca lo asume.

```ts
export function interpretar(r: Resultado, plantillas: Plantillas, locale: 'es-MX' | 'en-US'): string[] {
  const frases = plantillas[`${r.calculadora}.frases`] as Frase[];
  return frases.filter((f) => cumple(f.cuando, r)).map((f) => rellenar(f.texto, r, plantillas, locale));
}
```

Guardas contra deriva i18n (sección 6.4): un test comprueba que `es.json` y `en.json` tienen el mismo conjunto de claves, que cada `{campo}` de cada frase existe en `campos` de la plantilla R correspondiente y que cada `banda.x` referencia una banda producida por `bandas.ts` (unión de tipos exportada como arreglo `as const`).

## 3. Generación de código R por calculadora

### 3.1 Contrato de plantilla

Acordado con plan-arquitectura: para las calculadoras cerradas, el texto R vive en el YAML de la colección (`r.codigo` con `{marcadores}` y `r.paquetes`), junto a las etiquetas y el ejemplo, y lo rellena la misma función que la interpretación. Cuando hace falta lógica (vectores pegados, modelos, KM), el módulo de la calculadora exporta `rScript(entradas)` y `parsearR(json)` y anula la plantilla YAML. En memoria ambas variantes se normalizan a la misma forma:

```ts
// codigoR/index.ts
export interface PlantillaR {
  id: string;                    // 'diagnostica'
  paquetes: string[];            // paquetes que el snippet carga con library(); se instalan en webR
  codigo?: string;               // plantilla YAML con {marcadores}
  rScript?: (e: Entradas) => string;   // alternativa programática (anula `codigo`)
  campos: readonly string[];     // claves de `res`; deben coincidir con las etiquetas del YAML (test)
}
const MARCADOR = /\{([a-z][a-z0-9_]*)\}/g;   // {vp}, {nivel}, {corr}; nunca {x y} ni {{
export const num = (x: number) => Number.isFinite(x) ? String(x) : (() => { throw new RangeError('entrada no finita'); })();

export function rellenarR(codigo: string, e: Entradas): string {
  const s = codigo.replace(MARCADOR, (m, k) => {
    if (!(k in e)) throw new Error(`marcador {${k}} sin entrada`);        // también atrapa un {x} accidental del código R
    const v = e[k]; return typeof v === 'number' ? num(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : JSON.stringify(v);
  });
  if (!/^res <- list\(/m.test(s) || !s.includes('cat(toJSON(res')) throw new Error('el snippet rompe el contrato');
  return s;
}
export const codigoR = (p: PlantillaR, e: Entradas) => p.rScript ? p.rScript(e) : rellenarR(p.codigo!, e);
```

`String(x)` en JS es la representación más corta que reconstruye el mismo doble; R la lee de vuelta al mismo valor. Los marcadores son identificadores en minúsculas sin espacios, así que las llaves de R (`function(x, n) {` con espacio o salto tras la llave) no se confunden; si un `{ident}` del código R no corresponde a una entrada, el rellenado falla en vez de dejar texto a medias. Entradas booleanas de la UI se expresan como números en el snippet (`corr: 0 | 0.5`) para que el código R se lea solo.

El **mismo texto** sirve para los tres usos: el bloque copiable que ve el usuario, lo que ejecuta webR (captura de `stdout`) y lo que ejecuta `Rscript` para el fixture. El generador de fixtures lee el mismo YAML (con `js-yaml`, ya dependencia) e importa el mismo `rellenarR`; no hay «modos» ni transformaciones.

Paquetes admitidos en el snippet ejecutable (ligeros, sin `sf` ni `officer`): base R (`stats`), `binom`, `PropCIs`, `exact2x2`, `irr`, `pwr`, `survival`, `jsonlite`. `epiR`, `DescTools`, `pROC` y `Hmisc` aparecen solo como líneas comentadas «Equivalente en RStudio» al final del snippet, y como oráculo secundario local.

### 3.2 Ejemplo completo: diagnóstico 2×2

Salida de `codigoR(plantillaDiagnostica, { vp: 90, fp: 10, fn: 5, vn: 95, nivel: 0.95, metodo: 'wilson', corr: 0 })` (Wilson es el método por defecto del dominio; Clopper–Pearson y Agresti–Coull son opciones del mismo selector):

```r
# Rendimiento diagnóstico de una prueba (tabla 2×2) · Bioestadística abierta, UDG-CA-1190
# Se ejecuta igual en R, RStudio o webR. Al final imprime los resultados en JSON.
library(binom)      # IC de proporciones: "wilson" (por defecto), "exact" (Clopper–Pearson), "agresti-coull"
library(jsonlite)

vp <- 90; fp <- 10; fn <- 5; vn <- 95      # verdaderos/falsos positivos y negativos
nivel  <- 0.95
metodo <- "wilson"                          # método del IC para proporciones (selector de la interfaz)
corr   <- 0                                 # 0.5 = corrección de Haldane–Anscombe (celdas con cero)
a <- vp + corr; b <- fp + corr; c <- fn + corr; d <- vn + corr
z <- qnorm(1 - (1 - nivel) / 2)

ic_prop <- function(x, n) {                # proporción con IC → c(estimación, inferior, superior)
  ci <- binom.confint(x, n, conf.level = nivel, methods = metodo)
  c(ci$mean, ci$lower, ci$upper)
}
se   <- ic_prop(vp, vp + fn)               # sensibilidad
sp   <- ic_prop(vn, vn + fp)               # especificidad
vpp  <- ic_prop(vp, vp + fp)               # valor predictivo positivo (con la prevalencia de la muestra)
vpn  <- ic_prop(vn, vn + fn)
prev <- ic_prop(vp + fn, vp + fp + fn + vn)
exactitud <- ic_prop(vp + vn, vp + fp + fn + vn)

# Razones de verosimilitud con IC por el método logarítmico de Simel, Samsa y Matchar (1991)
ic_lr <- function(lr, x1, n1, x2, n2) {    # lr = (x1/n1) / (x2/n2)
  ee <- sqrt((1 - x1 / n1) / x1 + (1 - x2 / n2) / x2)
  c(lr, exp(log(lr) - z * ee), exp(log(lr) + z * ee))
}
lr_pos <- ic_lr((a / (a + c)) / (b / (b + d)), a, a + c, b, b + d)
lr_neg <- ic_lr((c / (a + c)) / (d / (b + d)), c, a + c, d, b + d)
dor_ee <- sqrt(1 / a + 1 / b + 1 / c + 1 / d)
dor    <- c(lr_pos[1] / lr_neg[1], exp(log(lr_pos[1] / lr_neg[1]) - z * dor_ee), exp(log(lr_pos[1] / lr_neg[1]) + z * dor_ee))

res <- list(n = vp + fp + fn + vn, se = se, sp = sp, vpp = vpp, vpn = vpn, prev = prev,
            exactitud = exactitud, youden = se[1] + sp[1] - 1,
            lr_pos = lr_pos, lr_neg = lr_neg, dor = dor)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalente en RStudio con epiR (no se ejecuta en el navegador: su árbol de dependencias pesa demasiado):
# epiR::epi.tests(as.table(matrix(c(vp, fp, fn, vn), nrow = 2, byrow = TRUE)), method = "exact", conf.level = nivel)
```

Convención del JSON: un vector de longitud 3 es `[estimación, inferior, superior]`; un escalar es un valor puntual. El comparador lo sabe por el `Resultado` TS (si el campo tiene `ic`). `auto_unbox = TRUE` deja los escalares sin corchetes; `digits = NA` conserva 15 cifras significativas.

Plantillas de las demás calculadoras (misma estructura; solo cambia el cuerpo):

| Calculadora | Paquetes del snippet | Funciones R que fijan el método |
|---|---|---|
| Posprueba / Fagan | ninguno | aritmética de momios; `res` con `momios_pre`, `momios_post`, `post` |
| RR / OR / RAR / NNT | ninguno (`exact2x2` opcional para OR exacta) | log-Wald; `fisher.test(m)$estimate` y `$conf.int` como OR condicional |
| χ² / Fisher / McNemar | ninguno | `chisq.test(m, correct = TRUE)`, `fisher.test(m)`, `mcnemar.test(m, correct = TRUE)`, `binom.test(b, b + c)` |
| IC proporción | `binom`, `PropCIs` | `binom.confint(methods = c("wilson","exact","agresti-coull"))`; Jeffreys con `qbeta(c(a/2, 1 − a/2), x + 0.5, n − x + 0.5)` (equal-tailed, el de Brown–Cai–DasGupta; `methods = "bayes"` de binom devuelve el intervalo HPD, que no es el mismo); `PropCIs::diffscoreci`, `PropCIs::wald2ci` |
| IC media, descriptivos | ninguno | `t.test(x)$conf.int`, `quantile(x, type = 7)`, `sd(x)` |
| Hozo / Wan / Luo | ninguno | fórmulas escritas en el snippet con `qnorm` (no hay paquete de referencia) |
| Kappa | `irr` | `irr::kappa2(ratings, weight = "unweighted")`; EE de Fleiss–Cohen–Everitt escrito en el snippet para el IC |
| Tamaño de muestra y potencia | `pwr` | `power.prop.test(..., tol = 1e-10)`, `power.t.test(..., tol = 1e-10)`, `pwr::pwr.2p.test`, `pwr::pwr.t.test` |
| Kaplan–Meier y log-rank | `survival` | `survfit(Surv(t, e) ~ g, conf.type = "log-log")`, `survdiff` |
| ROC / AUC | ninguno | AUC empírica (Mann–Whitney) e IC de DeLong escritos en base R con las componentes V10/V01 (reproducen `pROC::ci.auc`, verificado por plan-metodos-estadisticos); `pROC` solo como línea comentada |

`tol = 1e-10` en `power.*.test` importa: el `tol` por defecto de `uniroot` en R es `.Machine$double.eps^0.25 ≈ 1.2e-4`, y con él las n de R solo coinciden a cuatro cifras.

## 4. Integración con webR

### 4.1 Cargador perezoso `src/lib/bioestadistica/webr.ts`

```ts
export const WEBR_VERSION = '0.6.0';
export const WEBR_BASE_URL = `https://webr.r-wasm.org/v${WEBR_VERSION}/`;  // ÚNICO host externo del sitio (opt-in)
export const REPO_URL = 'https://repo.r-wasm.org/';
export type Estado = 'inactivo' | 'descargando' | 'iniciando' | 'instalando' | 'listo' | 'ejecutando' | 'error' | 'cerrado';
export interface Progreso { estado: Estado; detalle?: string; paquete?: string; ms?: number }

let webR: any = null; let inicio: Promise<void> | null = null; const instalados = new Set<string>();

export function hayConsentimiento(): boolean { try { return localStorage.getItem('bio.webr.consentimiento') === 'v1'; } catch { return false; } }
export function guardarConsentimiento(): void { try { localStorage.setItem('bio.webr.consentimiento', 'v1'); } catch {} }

export async function iniciarR(onProgreso: (p: Progreso) => void, timeoutMs = 180_000): Promise<void> {
  if (!hayConsentimiento()) throw new Error('sin_consentimiento');
  if (inicio) return inicio;
  inicio = (async () => {
    onProgreso({ estado: 'descargando', detalle: '≈ 12 MB' });
    const mod = await import(/* @vite-ignore */ `${WEBR_BASE_URL}webr.mjs`);
    webR = new mod.WebR({ baseUrl: WEBR_BASE_URL, repoUrl: REPO_URL, channelType: mod.ChannelType.PostMessage, interactive: false });
    onProgreso({ estado: 'iniciando' });
    await conTimeout(webR.init(), timeoutMs, 'init');
    onProgreso({ estado: 'listo' });
  })().catch((e) => { inicio = null; cerrarR(); throw e; });
  return inicio;
}

export async function instalar(paquetes: string[], onProgreso: (p: Progreso) => void): Promise<void> {
  for (const p of paquetes) {
    if (instalados.has(p)) continue;
    onProgreso({ estado: 'instalando', paquete: p });
    await conTimeout(webR.installPackages([p], { repos: REPO_URL, mount: true, quiet: true }), 120_000, `instalar ${p}`);
    instalados.add(p);
  }
}

let cola: Promise<unknown> = Promise.resolve();   // una ejecución a la vez: el timeout de cada llamada empieza cuando le toca
export function ejecutarJSON(codigo: string, timeoutMs = 60_000): Promise<unknown> {
  const turno = cola.then(() => ejecutarAhora(codigo, timeoutMs));
  cola = turno.catch(() => {});
  return turno;
}
async function ejecutarAhora(codigo: string, timeoutMs: number): Promise<unknown> {
  const shelter = await new webR.Shelter();
  try {
    const out = await conTimeout(shelter.captureR(codigo, { captureStreams: true, captureConditions: true, withAutoprint: false }), timeoutMs, 'eval');
    const stdout = out.output.filter((o: any) => o.type === 'stdout').map((o: any) => o.data).join('\n');
    const avisosR = out.output.filter((o: any) => o.type === 'stderr').map((o: any) => o.data);   // warnings de R → se muestran
    return { datos: parsearJsonR(stdout), avisosR };
  } finally { await shelter.purge(); }
}

export function cerrarR(): void { try { webR?.close(); } catch {} webR = null; inicio = null; instalados.clear(); }

function conTimeout<T>(p: Promise<T>, ms: number, etapa: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${etapa}`)), ms))]);
}
```

El módulo es un singleton (promesa memoizada `inicio`, cola `cola`) que solo se importa con `import()` dinámico desde el controlador de la calculadora, nunca en el montaje de la página; con el `<ClientRouter />` de `astro:transitions` que adopta la arquitectura, el módulo y la sesión de R sobreviven a la navegación entre calculadoras. `webr.ts` no escribe en `history` ni en la URL. `parsearJsonR` hace `JSON.parse` y recorre el objeto convirtiendo `"Inf"`, `"-Inf"`, `"NaN"`, `"NA"` en `Infinity`, `-Infinity`, `NaN`, `null`. Nota de implementación: confirmar en la referencia de la API de webR 0.6 que `installPackages(paquetes, { repos, mount, quiet })` mantiene esa firma (existe desde 0.3) y que `captureR` devuelve `output: {type, data}[]`; si algo cambió, el test de humo del navegador (sección 6.6) lo detecta.

### 4.2 Flujo de «Verificar con R» en la UI

1. Botón «Verificar con R». Si no hay consentimiento, aparece un panel con este texto (ES/EN en `plantillas`): «Se descargarán ≈ 15 MB desde webr.r-wasm.org y repo.r-wasm.org (R compilado a WebAssembly y los paquetes binom y jsonlite). Todo se ejecuta en tu navegador: tus datos no se envían a ningún servidor. Puede tardar y consumir memoria; no se recomienda en móviles con poca memoria.» Botones «Descargar y verificar» / «Cancelar» y casilla «Recordar en este navegador» (escribe `localStorage`).
2. Barra de progreso **por etapas** (indeterminada dentro de cada etapa: webR no expone bytes descargados): Descargando R → Iniciando R → Instalando binom → Ejecutando → Comparando. Cada etapa muestra el tiempo transcurrido.
3. `comparar(resultadoTS, jsonR, tolerancias)` produce una tabla campo por campo: valor TS, valor R, diferencia relativa y «Coincide / No coincide». El veredicto global es «Coincide en 11/11 campos» o «No coincide en lr_neg (TS 0.0543, R 0.0541)»; nunca se oculta el valor de R.
4. Errores: `sin_consentimiento` (no ocurre desde la UI); `timeout:init` → «No se pudo descargar R (¿sin conexión?)»; `timeout:eval` → se llama `cerrarR()` (con el canal PostMessage no hay interrupción; matar el worker es la única salida) y se avisa «R tardó demasiado; se cerró la sesión. Vuelve a intentar: la descarga suele venir de la caché»; error de R (`WebRError`) → se muestra el mensaje literal de R y el aviso de reportarlo.
5. Memoria: una sola instancia por documento; botón «Liberar memoria de R» que llama `cerrarR()`; aviso previo cuando `navigator.deviceMemory` (Chrome/Edge) es menor que 4 o el agente es iOS. Si el sitio navega entre documentos, la instancia se pierde y se reinicia en la siguiente verificación (el coste repetido es CPU de inicialización, 2–5 s, no la descarga).

### 4.3 Qué se cachea y qué no

- **Sí (caché HTTP del navegador):** `webr.mjs`, `webr-worker.js`, `R.bin.js`, `R.bin.wasm`, `R.bin.data` y los `.tgz` de paquetes, según las cabeceras `Cache-Control` que envíen `webr.r-wasm.org` y `repo.r-wasm.org` (no las controlamos; las rutas versionadas `/v0.6.0/` son estables, `/latest/` no lo es: por eso se fija la versión). La caché se comparte entre todas las páginas del sitio en la misma partición.
- **No:** el estado de la sesión de R (memoria wasm) y la instalación de paquetes en el sistema de archivos virtual. Con `mount: true` la instalación es un montaje `WORKERFS` barato en vez de descomprimir un tar.
- **Endurecimiento opcional:** un *service worker* propio con alcance `/herramientas/bioestadistica/` que sirva cache-first las peticiones a esos dos hosts (respuestas CORS, no opacas) y permita uso sin conexión tras la primera descarga. Es código propio en `public/`, compatible con la auditoría.

### 4.4 Autoalojar o CDN: evaluación y recomendación

| Opción | Peso en git | Dependencia externa | Control de caché | Esfuerzo |
|---|---|---|---|---|
| (a) CDN en tiempo de ejecución, versión fijada `v0.6.0` | 0 | webr.r-wasm.org + repo.r-wasm.org | ninguno | mínimo |
| (b) Núcleo de webR en `public/herramientas/bioestadistica/webr/0.6.0/`, paquetes desde repo | decenas de MB por versión (medir `dist/` del paquete npm: 48.6 MB desempaquetado en total) | solo repo.r-wasm.org | regla `vercel.json` inmutable para la carpeta versionada | bajo |
| (c) Todo autoalojado: núcleo + imagen de biblioteca construida con `rwasm` en el Mac mini | (b) + imagen ≈ 20–30 MB sin comprimir (estimación: survival + Matrix ≈ 15 MB, exact2x2 + exactci + ssanv ≈ 2 MB, irr + lpSolve ≈ 1 MB, binom, PropCIs, pwr, jsonlite < 3 MB; medir) | ninguna | total; posible uso sin conexión | medio: Docker (`ghcr.io/r-wasm/webr:v0.6.0`) + `rwasm::add_pkg()` + `rwasm::make_vfs_library()` y montaje con `webr::mount("/biblioteca", "<url>/biblioteca.data")` + `.libPaths()` |

**Recomendación para la versión 1: (a), CDN con versión fijada, opt-in explícito y documentado.** Razones: la descarga solo ocurre tras un clic informado, así que no viola la garantía que protege la auditoría (nada externo se carga al visitar la página); (b) no elimina la dependencia externa, solo la reduce a la mitad, y a cambio mete decenas de MB binarios en el historial de git en cada cambio de versión; y la sección todavía va a cambiar de conjunto de paquetes. `webr.ts` aísla `WEBR_BASE_URL` y `REPO_URL` como constantes, de modo que pasar a (b) o (c) es cambiar dos cadenas y copiar archivos.

**Ruta de endurecimiento:** cuando el conjunto de paquetes se congele (fin de fase 2), pasar directamente a (c): imagen de biblioteca construida en el Mac mini, núcleo y biblioteca en `public/herramientas/bioestadistica/webr/<versión>/`, regla de caché inmutable en `vercel.json`, y service worker cache-first. Si el historial de git preocupa, evaluar Git LFS en Vercel antes de subir los binarios.

### 4.5 Documentación y auditoría del opt-in

- `docs/bioestadistica/EXTERNOS.md`: lista los dos hosts, la versión fijada, qué se descarga, cuándo (solo tras el botón), que no se transmite ningún dato del usuario, y cómo se cambia a autoalojado.
- README, sección Herramientas: «Las calculadoras funcionan sin red. «Verificar con R» descarga, solo si el usuario lo pide, R en WebAssembly desde webr.r-wasm.org y paquetes desde repo.r-wasm.org; los datos nunca salen del navegador.»
- `scripts/audit-performance.py`: añadir una aserción nueva `assert not [e for e in external if 'r-wasm.org' in e['url']]` para garantizar que los hosts opt-in **jamás aparecen como recurso declarado** en HTML o CSS (solo dentro de `webr.ts`, vía `import()` dinámico que la auditoría no ve). Y un test Node (`tests/bioestadistica/politica.test.ts`) que recorre `src/` y `public/herramientas/bioestadistica/` y falla si `r-wasm.org` aparece fuera de `webr.ts`.
- Nada de la sección se publica bajo una ruta con el segmento `/data/` (evita el anclaje por hash de `--check-data-baseline`); los ejemplos van en TS (`ejemplos/`).

**Implementado en H4 (20-sep-2026), desviaciones respecto a §4.1–§4.5:** webR 0.6.0 trae R
4.6.0 (los fixtures se generaron con R 4.5.2 local: el panel muestra la versión de R de la
sesión); el núcleo pesa 12.3 MB comprimido (`R.wasm`) más `R.js`, BLAS/LAPACK y el sistema
de archivos perezoso, y el texto del consentimiento dice «unos 20 MB» (`DESCARGA_MB`);
`installPackages()` mantiene la firma `(paquetes, { repos, mount, quiet })` y `captureR()`
devuelve `output: {type, data}[]` como se supuso, pero `webr::install()` solo AVISA cuando
un paquete no está en el repositorio, así que `instalar()` comprueba después con
`requireNamespace()` y devuelve los faltantes (`paquete_faltante` antes de ejecutar nada);
las condiciones capturadas (`warning`, `message`) llegan como proxies de objeto R y se
leen con `toJs()`; `captureGraphics: false` evita abrir un dispositivo canvas; el
consentimiento de una visita sin «recordar» vive en memoria del módulo
(`concederConsentimiento(false)`); las dependencias con efectos (`import()`, almacén,
reloj, memoria) se inyectan con `configurar()` para probar el módulo en Node; y la política
de hosts añade una CSP por cabecera en `vercel.json` (ARQUITECTURA §6.8) que obligó a
desactivar la incrustación de scripts y estilos de Astro. Los siete paquetes del catálogo
(`binom`, `PropCIs`, `exact2x2`, `irr`, `pwr`, `survival`, `jsonlite`) están en
`repo.r-wasm.org` para R 4.6 (comprobado el 20-sep-2026).

Supuestos que fija la revisión de H4 y que las pruebas vigilan: (1) todo snippet imprime
exactamente una línea JSON y nada más (`cat(toJSON(res, auto_unbox = TRUE, digits = NA))`
al final, sin `print` previos): `webr.ts` une los trozos de stdout con `\n` y `correr_casos.R`
con `""`, y ambas tuberías coinciden solo bajo ese supuesto (`contenido.test.ts` exige el `cat`;
`webr.test.ts` fija que un JSON troceado por líneas se recompone); (2) `new Shelter()`,
`captureR()`, `purge()`, `installPackages()`, `evalRRaw()`, `import()` e `init()` llevan
temporizador (un worker muerto no deja la cola parada) y `cancelar()` rechaza lo pendiente y
cierra R; (3) la CSP lleva `'unsafe-eval'` porque el núcleo de webR lo necesita al arrancar
(medido por la prueba de humo, EXTERNOS.md) y mantiene cerrado `'unsafe-inline'`.

## 5. Modelos en webR (fase 2)

### 5.1 Entrada de datos

`entrada.ts`: `parsearTabla(texto, { sep: 'auto', decimal: 'auto' })` → `{ columnas, filas, tipos, avisos }`.

- Separador: el más frecuente en la primera línea entre `\t`, `;`, `,` (el pegado desde Excel es TSV).
- Coma decimal: si el separador es `\t` o `;` y más del 80 % de los valores no vacíos de una columna cumplen `^-?\d+,\d+$`, se convierte y se avisa `coma_decimal_convertida`.
- Faltantes: `''`, `NA`, `NaN`, `.`, `null`, `-`, `#N/A` → `null`; se cuentan por columna.
- Tipos: numérica si todos los no faltantes son números; binaria si tiene exactamente dos valores; categórica en otro caso.
- Guardas: máximo 50,000 filas y 200 columnas; primera línea obligatoria como cabecera; nombres duplicados renombrados y avisados.

### 5.2 Selección de roles

Selectores dependientes del tipo detectado: desenlace (binaria; se elige el nivel «evento»), predictores (multi, con tipo numérico/categórico y nivel de referencia), tiempo (numérica), evento (binaria), grupo (categórica). Guardas calculadas en TS antes de llamar a R: eventos por variable (EPV = eventos / número de parámetros incluidos los indicadores) con aviso si EPV < 10 (Peduzzi 1996); columnas con más del 20 % de faltantes; predictor constante; colinealidad perfecta (dos columnas iguales).

### 5.3 Datos hacia R sin romper la identidad del snippet

El snippet siempre lee `df <- read.csv("datos.csv")`. Para webR, la UI escribe antes el archivo con `webR.FS.writeFile('/home/web_user/datos.csv', bytes)` (directorio de trabajo). Junto al bloque de código, el botón «Descargar datos.csv» entrega el mismo archivo para quien copie el código a RStudio. El fixture usa el mismo `datos.csv` guardado en `tests/bioestadistica/casos/datos/`. Nunca se incrusta la tabla en el código: el snippet copiable no debe arrastrar datos.

### 5.4 Snippets

Logística:

```r
library(jsonlite)
df <- read.csv("datos.csv")
m  <- glm(desenlace ~ edad + sexo + pcr, data = df, family = binomial)
co <- summary(m)$coefficients
ci <- confint.default(m)            # IC de Wald; confint(m) daría el de perfil de verosimilitud
res <- list(n = nobs(m), excluidos = nrow(df) - nobs(m), eventos = sum(m$y), aic = AIC(m),
            epv = sum(m$y) / (length(coef(m)) - 1),
            separacion = any(abs(co[, 1]) > 10 | co[, 2] > 100),
            coef = data.frame(termino = rownames(co), beta = co[, 1], ee = co[, 2], z = co[, 3], p = co[, 4],
                              or = exp(co[, 1]), or_lo = exp(ci[, 1]), or_hi = exp(ci[, 2])))
cat(toJSON(res, auto_unbox = TRUE, digits = NA, dataframe = "rows"))
```

Cox:

```r
library(survival); library(jsonlite)
df <- read.csv("datos.csv")
m  <- coxph(Surv(tiempo, evento) ~ edad + grupo, data = df)
s  <- summary(m); ph <- cox.zph(m)
res <- list(n = m$n, eventos = m$nevent, concordancia = s$concordance[[1]], concordancia_ee = s$concordance[[2]],
            lrt = list(chisq = s$logtest[["test"]], gl = s$logtest[["df"]], p = s$logtest[["pvalue"]]),
            coef = data.frame(termino = rownames(s$conf.int), hr = s$conf.int[, 1], hr_lo = s$conf.int[, 3],
                              hr_hi = s$conf.int[, 4], p = s$coefficients[, 5]),
            ph = data.frame(termino = rownames(ph$table), chisq = ph$table[, 1], p = ph$table[, 3]))
cat(toJSON(res, auto_unbox = TRUE, digits = NA, dataframe = "rows"))
```

Kaplan–Meier por grupo con log-rank (sirve también para verificar la versión TS):

```r
f  <- survfit(Surv(tiempo, evento) ~ grupo, data = df, conf.type = "log-log")
d  <- survdiff(Surv(tiempo, evento) ~ grupo, data = df)
sm <- summary(f)
res <- list(curvas = data.frame(grupo = as.character(sm$strata), t = sm$time, n_riesgo = sm$n.risk,
                                eventos = sm$n.event, s = sm$surv, lo = sm$lower, hi = sm$upper),
            medianas = as.data.frame(summary(f)$table)[, c("records", "events", "median", "0.95LCL", "0.95UCL")],
            logrank = list(chisq = d$chisq, gl = length(d$n) - 1, p = pchisq(d$chisq, length(d$n) - 1, lower.tail = FALSE)))
```

Lineal múltiple: `lm`, `summary(m)$r.squared`, `$adj.r.squared`, `$sigma`, `$fstatistic[1]`, `confint(m)`, `AIC(m)`; mismo esquema `coef = data.frame(termino, beta, ee, t, p, lo, hi)`.

Datos para el gráfico de bosque: `coef` ordenado, con `escala: 'log'` para OR/HR y `'lineal'` para β; la UI pinta SVG.

Guardas en la salida: EPV < 10 → aviso; `separacion == TRUE` o *warning* de R «fitted probabilities numerically 0 or 1» capturado en `captureConditions` → aviso de separación (sugiere regresión penalizada de Firth en RStudio: `logistf`, fuera de alcance); `ph` con p < 0.05 en algún término → nota sobre el supuesto de riesgos proporcionales; `excluidos > 0` → nota de casos completos.

### 5.5 Respaldos en TS que valen la pena

- **Regresión lineal**: sí, trivial (ecuaciones normales con Cholesky o QR de Householder, ~60 líneas), permite resultado instantáneo y usa R solo como verificación. Fase 2.5.
- **Logística por IRLS**: sí, ~90 líneas (Newton–Raphson con pesos, tolerancia 1e-12). `glm` itera hasta `epsilon = 1e-8`, así que la comparación va a 1e-6 relativa. Fase 3.
- **Cox**: no. Empates de Efron, varianza robusta y `cox.zph` son demasiado para el beneficio; se queda en R.

## 6. Pipeline de validación

### 6.1 Principio

R es el oráculo y el código R que se prueba es, byte a byte, el que el usuario ve. El generador de fixtures no transforma el snippet: lo escribe a disco y lo ejecuta con `Rscript`.

```
tests/bioestadistica/
  casos/<calculadora>.json          entradas de cada caso, curadas a mano (id, entradas, nota)
  casos/datos/*.csv                 tablas para KM, glm, coxph, lm
  r/instalar.R                      instala los paquetes del oráculo
  r/correr_casos.R                  ejecuta cada snippet generado y reúne el JSON
  r/oraculo2_epiR.R                 oráculo secundario (epiR, DescTools) — opcional
  r/generado/<calculadora>/<id>.R   snippets tal cual se muestran (commiteados: se pueden abrir en RStudio)
  fixtures/<calculadora>.json       salida de R + metadatos de versión
  py/oraculo.py                     tercer oráculo (scipy/statsmodels) para cantidades núcleo
  tolerancias.ts                    tabla de tolerancias por campo
  *.test.ts                         pruebas node --test
scripts/bio-fixtures.mjs            orquestador Node: casos → snippets → Rscript → fixtures
```

### 6.2 Generación

`scripts/bio-fixtures.mjs [--solo diagnostica] [--check]`:

1. Lee la plantilla de cada calculadora desde el YAML de la colección (`r.codigo`, `r.paquetes`, `etiquetas`, `ejemplo`) con `js-yaml`, o importa `rScript` del módulo TS cuando existe (Node lee `.ts` directo); lee `casos/<calc>.json` y antepone siempre el caso `ejemplo` tomado del YAML, para que lo que ve el usuario al pulsar «Cargar ejemplo» sea lo primero que se prueba.
2. Escribe `r/generado/<calc>/<id>.R` con `codigoR(plantilla, entradas)` sin modificar; para casos con datos, copia el `datos.csv` al mismo directorio.
3. Ejecuta `Rscript tests/bioestadistica/r/correr_casos.R <calc>`, que hace, por archivo: `setwd(dirname(f)); out <- capture.output(source(f, local = new.env())); casos[[id]] <- fromJSON(paste(out, collapse = ""), simplifyVector = TRUE)` y al final imprime `toJSON(list(meta = …, casos = casos), digits = NA, pretty = TRUE)`.
4. Guarda `fixtures/<calc>.json` (formato acordado con plan-arquitectura: lista de casos, `esperado` con los mismos ids de salida que las etiquetas del YAML, `tol` nombra un perfil de `tolerancias.ts` o lo sobrescribe por campo):

```json
{
  "generado_por": "scripts/bio-fixtures.mjs",
  "meta": { "calculadora": "diagnostica", "generado": "2026-09-16T23:10:00Z",
            "R": "R version 4.5.2 (2025-10-31)", "plataforma": "aarch64-apple-darwin20",
            "paquetes": { "binom": "1.1-1.1", "jsonlite": "2.0.0" },
            "plantilla_sha256": "…" },
  "casos": [
    { "id": "ejemplo", "entradas": { "vp": 90, "fp": 10, "fn": 5, "vn": 95, "nivel": 0.95, "metodo": "wilson", "corr": 0 },
      "esperado": { "n": 200, "se": [0.947368421052632, 0.882651138829621, 0.97731188695085],
                    "sp": [0.904761904761905, 0.833508723777963, 0.947443690136567],
                    "lr_pos": [9.94736842105263, 5.50613635890583, 17.9708841289609],
                    "lr_neg": [0.0581717451523546, 0.0247296108901037, 0.136838058193009],
                    "dor": [171, 56.2669580032554, 519.683328149858], "youden": 0.852130325814536 },
      "tol": "diagnostica" },
    { "id": "celda_cero_fp", "entradas": { "vp": 40, "fp": 0, "fn": 3, "vn": 57, "nivel": 0.95, "metodo": "wilson", "corr": 0 },
      "esperado": { "lr_pos": ["Inf", "NaN", "NaN"] },
      "tol": "diagnostica" }
  ]
}
```

Un vector `[est, lo, hi]` llega tal cual de R (la estimación primero, porque es lo que se compara); quien necesite solo `[lo, hi]` lo rebana. `nivel` vive dentro de `entradas` porque el snippet lo lee de ahí. Con `--check` escribe en un directorio temporal y compara con lo commiteado: detecta deriva de versión de paquete o de plantilla sin tocar el repo. El `plantilla_sha256` (hash del texto de `r.codigo` o de `rScript.toString()`) permite que un test falle cuando alguien cambia la plantilla sin regenerar. Otro test comprueba que `campos` del módulo, las claves de `etiquetas` del YAML y las claves de `esperado` del caso `ejemplo` son el mismo conjunto.

Casos mínimos por calculadora: el ejemplo de la UI; celdas cero en cada posición; n pequeño (n = 1, 2); n grande (1e6); proporciones 0 y 1; nivel 0.90 y 0.99; con y sin Haldane; para KM, los cinco de la sección 1.6; para potencia, efectos diminutos y enormes (n cercano a los topes de `uniroot`).

### 6.3 Pruebas `node --test`

```ts
// tests/bioestadistica/diagnostica.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnostica } from '../../src/lib/bioestadistica/tabla2x2.ts';
import { codigoR } from '../../src/lib/bioestadistica/codigoR/index.ts';
import { comparar, normalizarR } from '../../src/lib/bioestadistica/comparar.ts';
import { plantillaDesdeYaml } from './util.ts';     // lee r.codigo, r.paquetes y etiquetas del YAML con js-yaml
import { TOL } from './tolerancias.ts';

const plantilla = plantillaDesdeYaml('diagnostica');
const fx = JSON.parse(readFileSync(new URL('./fixtures/diagnostica.json', import.meta.url), 'utf8'));
for (const caso of fx.casos) {
  test(`diagnostica · ${caso.id} coincide con R`, () => {
    const e = caso.entradas;
    const r = diagnostica(e.vp, e.fp, e.fn, e.vn, { nivel: e.nivel, haldane: e.corr > 0, metodoIC: e.metodo });
    const informe = comparar(r, normalizarR(caso.esperado), TOL[caso.tol]);
    assert.ok(informe.coincide, informe.discrepancias.map(String).join('\n'));
    assert.equal(codigoR(plantilla, e), readFileSync(new URL(`./r/generado/diagnostica/${caso.id}.R`, import.meta.url), 'utf8'));
  });
}
```

Regla de igualdad en `comparar.ts`: ambos `NaN` → igual; ambos infinitos del mismo signo → igual; si no, `|a − b| ≤ abs + rel · max(|a|, |b|)`.

Tabla de tolerancias (`tolerancias.ts`), documentada campo por campo:

| Clase de campo | rel | abs | Motivo |
|---|---|---|---|
| Cerrados (se, sp, RR, OR, RAR, NNT, κ, medias, χ² sin corrección) | 1e-12 | 1e-14 | solo aritmética en doble |
| IC que usan `qnorm`, `qt`, `qbeta`, `qchisq`; p-valores por `pchisq`/`pt`/`pnorm` | 1e-9 | 1e-12 | inversión por Brent y funciones incompletas |
| p-valores exactos (Fisher, McNemar exacto) | 1e-8 | 1e-15 | sumas de pmf en escala log |
| OR condicional y su IC (`fisher.test`) | 5e-4 | 1e-6 | R resuelve con `uniroot` a `tol ≈ 1.2e-4`; el TS es más preciso que el oráculo |
| n de potencia (`power.*.test` con `tol = 1e-10`; `pwr::*`) | 1e-6 | 1e-8 | iterativo en ambos lados |
| n redondeado hacia arriba | igualdad exacta | — | es lo que ve el usuario |
| KM: S(t) | 1e-12 | — | producto cerrado |
| KM: IC, log-rank χ² y p | 1e-9 | 1e-12 | Greenwood + `pchisq` |
| Mediana de supervivencia | igualdad exacta | — | tiempo observado (o punto medio de una meseta en 0.5) |
| Campos informativos `*_pwr` (por ejemplo `n_pwr` de `pwr.r.test` en la calculadora de correlación) | — | 1 tras el techo | solo comparación didáctica; el método por defecto es el cerrado (`n_clasico`, Fisher z) |
| glm / coxph / lm (fase 2; TS solo para lm/IRLS) | 1e-6 | 1e-8 | `epsilon` de IRLS en R |

Además: `sintaxis.test.ts` (importa todo), `primitivas.test.ts` (identidades: `pnorm(qnorm(p)) = p` en una rejilla de 1e-300 a 1−1e-16, simetrías, valores tabulados de A&S), `plantillas.test.ts` (claves ES = EN; placeholders existentes; bandas válidas), `politica.test.ts` (hosts externos solo en `webr.ts`; ninguna ruta `/data/`), `entrada.test.ts` (separadores, coma decimal, faltantes), `exportar.test.ts` (ida y vuelta del estado URL; CSV con BOM y escapado).

### 6.4 Paquetes de R y scripts npm

Instalación local (una vez; `epiR` y `DescTools` solo para el oráculo secundario):

```sh
Rscript -e 'install.packages(c("binom","PropCIs","exact2x2","irr","pwr","jsonlite","survival","epiR","DescTools"), repos = "https://cloud.r-project.org")'
```

`package.json`:

```json
"test:bio": "node --test tests/bioestadistica/*.test.ts",
"fixtures:bio": "node scripts/bio-fixtures.mjs",
"fixtures:bio:check": "node scripts/bio-fixtures.mjs --check",
"oraculo2:bio": "Rscript tests/bioestadistica/r/oraculo2_epiR.R && python3 tests/bioestadistica/py/oraculo.py"
```

Secuencia reproducible (se añade a `docs/performance/REVIEW.md`): `npm run build && npm run check && npm run test:performance && npm run test:bio && npm run audit:performance -- --check-data-baseline`. `test:bio` no necesita R: consume fixtures commiteados. `fixtures:bio` sí necesita R y solo lo corre quien cambie plantillas o casos.

### 6.5 Oráculos secundarios (baratos, independientes)

- `r/oraculo2_epiR.R`: para los casos de `diagnostica` y `asociacion` recalcula con `epiR::epi.tests` y `epiR::epi.2by2` y compara contra el fixture con las mismas tolerancias; salta con mensaje claro si epiR no está instalado. Para `kappa`, `vcd::Kappa` (ya instalado localmente) verifica κ y su EE en las tres ponderaciones; para ROC, `pROC::ci.auc`. Sirve para detectar que el snippet ligero se haya desviado del paquete de referencia didáctica.
- `py/oraculo.py` (verificado: `statsmodels.stats.proportion.proportion_confint(45, 60, method='wilson')`, `scipy.stats.fisher_exact`, `statsmodels.stats.inter_rater.cohens_kappa` funcionan en el Python local): Wilson, Agresti–Coull, Jeffreys, Fisher (p), χ², McNemar, κ, `power` de `statsmodels.stats.power` para `n`. Lee los fixtures y falla si Python y R discrepan más de 1e-8 en las cantidades cerradas (1e-4 en las iterativas). Es un guardián contra un error compartido entre la plantilla R y el TS.

### 6.6 Mac mini

- **Manual por defecto**: `fixtures:bio` se ejecuta a mano cuando cambian plantillas o casos y los fixtures se commitean en el mismo commit (el test de `plantilla_sha256` obliga).
- **Vigilancia semanal con launchd** (`~/Library/LaunchAgents/mx.udgca1190.bio-fixtures-check.plist`, `StartCalendarInterval` domingo 03:00): un script hace `git -C ~/bio-oracle pull`, `Rscript -e 'update.packages(ask = FALSE)'` en una biblioteca propia (`R_LIBS_USER=~/bio-oracle/rlib`) y `npm run fixtures:bio:check`. Si detecta deriva, escribe `~/bio-oracle/DERIVA-<fecha>.md` y notifica (correo o Telegram). **No hace commits**: una deriva puede significar que un paquete cambió de método y necesita revisión humana.
- **Humo de webR en navegador**: el mismo job puede correr Chrome headless (ya se usa en el repo) contra `npm run preview` y pulsar «Verificar con R» en cada calculadora; comprueba que la versión fijada de webR sigue publicada y que los paquetes siguen en repo.r-wasm.org.
- **Fase 3, API Plumber**: para simulaciones o modelos bayesianos que no quepan en el navegador, un servicio `plumber` en el Mac mini publicado con Tailscale Funnel (sin tocar DNS; da un hostname `*.ts.net` con TLS) o Cloudflare Tunnel (si se quiere un subdominio propio; exige la zona en Cloudflare). Regla de privacidad, escrita en la UI y en `EXTERNOS.md`: el envío al servidor es un botón aparte, apagado por defecto, con el texto «Esto envía tus entradas al servidor del CA»; nunca acepta datos a nivel de paciente, no registra cuerpos de petición y limita tasa por IP.

## 7. Exportaciones y estado

Todo en `exportar.ts`, sin dependencias.

**Markdown al portapapeles** (`aMarkdown(resultado, interpretacion, metodos, codigo, url)`): título, tabla `| Medida | Estimación | IC 95 % |`, párrafo «Interpretación», párrafo «Métodos» con las citas que aporta la especificación (por ejemplo «IC de Clopper–Pearson; IC de LR por el método log de Simel 1991; cálculo en el navegador, Bioestadística abierta v1, UDG-CA-1190»), línea «Verificado con R 4.5 (webR 0.6.0): coincide en 11/11 campos» solo si hubo verificación, bloque ```` ```r ```` con el snippet, y la URL con estado. `navigator.clipboard.writeText(md)`; respaldo con `textarea` oculto y `document.execCommand('copy')` para contextos no seguros. En fase 2, `ClipboardItem` con `text/html` para pegar la tabla en Word.

**CSV** (`aCSV(filas)` + `descargar(texto, nombre)`): BOM `﻿` para que Excel lea UTF-8, separador coma, comillas escapadas, punto decimal; `new Blob([texto], { type: 'text/csv;charset=utf-8' })`, `<a download="diagnostica-2026-09-16.csv">`, `URL.revokeObjectURL` tras el clic. El sitio permite descargas (no hay `sandbox` en los iframes).

**Impresión** (`@media print` en la hoja de la calculadora): oculta controles y panel de webR, muestra el bloque de código con `white-space: pre-wrap`, `table { break-inside: avoid }`, abre todos los `<details>` en `beforeprint` (patrón de virología), `@page { margin: 15mm }`.

**Estado en URL**: nombres cortos y versión, con los mismos nombres y unidades que las entradas del snippet: `?v=1&vp=90&fp=10&fn=5&vn=95&nivel=0.95&corr=0` (más `lang` y `embed`, que ya existen; `nivel` viaja como proporción y la interfaz lo muestra como 95 %). `codificarEstado(entradas, parametrosURL)` y `decodificarEstado(search)` validan tipo y rango; versión desconocida → se ignora con aviso. Siempre `history.replaceState(history.state, '', url)` con debounce de 300 ms, conservando `history.state` para no pisar el estado del `ClientRouter`; nunca `pushState`.

**Cargar ejemplo**: los valores viven en el YAML de la calculadora (`ejemplo:`, validado con Zod y renderizado en build), no en TS. El generador de fixtures toma ese mismo `ejemplo` como caso `ejemplo` de cada fixture: lo que el usuario ve al pulsar el botón está probado contra R.

## 8. Registro de riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | webr.r-wasm.org o repo.r-wasm.org caídos o con la versión retirada | media | «Verificar con R» no funciona; las calculadoras sí | Versión fijada; mensaje claro; las calculadoras nunca dependen de R; humo semanal en el Mac mini; ruta (c) autoalojada |
| 2 | Primera descarga ≈ 15 MB | alta | abandono, datos móviles | Opt-in con tamaño declarado; caché HTTP; `mount: true`; service worker cache-first en endurecimiento |
| 3 | Memoria en móviles (R wasm 150–300 MB) | media | pestaña cerrada por el sistema | Aviso previo por `deviceMemory`/iOS; una instancia; «Liberar memoria»; nunca carga automática |
| 4 | R sin interrupción en canal PostMessage | baja | UI colgada | `Promise.race` con timeout y `webR.close()`; reinicio limpio |
| 5 | epiR y DescTools demasiado pesados para el navegador | verificado | verificación inservible si se usaran | Snippets con base R y paquetes ligeros; epiR solo como oráculo local y línea comentada |
| 6 | Casos numéricos extremos (celdas cero, n = 0, p ∈ {0,1}, a o b > 1e5 en beta incompleta) | alta | NaN silenciosos o cuelgues | Contrato `Infinity`/`NaN` + avisos; `RangeError` para entradas inválidas; fixtures de borde; tope de iteraciones con aviso `precision_reducida` |
| 7 | Deriva de versión: R local ≠ webR ≠ snippet mostrado (por ejemplo, un cambio de `binom` o del `tol` de `uniroot`) | media | fixtures desactualizados o «No coincide» falsos | `meta.paquetes` en el fixture; `fixtures:bio:check` semanal; webR fijado en 0.6.0 (fija R 4.5 y la ruta `contrib/4.5` del repo); tolerancias documentadas; la UI muestra ambos valores |
| 8 | Detalles de método distintos entre TS y R (Yates acotado, `conf.type`, cuantil tipo 7, IC de Wald vs perfil) | alta al inicio | discrepancias reales | Cada detalle es un `MetodoId` con caso de fixture; los snippets pasan argumentos explícitos |
| 9 | Deriva i18n de plantillas | media | frases en un idioma sin equivalente | `plantillas.test.ts`: claves iguales, placeholders válidos, bandas válidas |
| 10 | Reglas de auditoría (recursos declarados, `/data/`, Google Fonts) | media | build roto | Sin recursos externos declarados; aserción nueva para `r-wasm.org`; rutas sin `/data/`; `politica.test.ts` |
| 11 | Type stripping de Node: sintaxis no borrable o importaciones sin `.ts` | media | `test:bio` no arranca | Regla de estilo; `sintaxis.test.ts`; `allowImportingTsExtensions` si `astro check` lo pide |
| 12 | Crecimiento de git si se autoaloja | media (fase de endurecimiento) | clones lentos | Carpeta versionada única; evaluar Git LFS en Vercel; decidir con medición de `dist/` |
| 13 | Portapapeles y descargas dentro de iframe | baja | botones inertes | Mismo origen, contexto seguro (HTTPS), gesto de usuario; respaldo `execCommand`; probado en humo |
| 14 | El snippet copiable con modelos podría arrastrar datos del usuario | baja | fuga por descuido | Los datos nunca se incrustan: `read.csv("datos.csv")` + descarga aparte |

## 9. Acuerdos con plan-arquitectura (2026-09-16)

- Cada calculadora es un documento propio; las páginas llevan `<ClientRouter />` de `astro:transitions`, así que `webr.ts` (singleton con promesa memoizada y cola de ejecución) sobrevive a la navegación. Respaldo si el router diera problemas: aceptar el reinicio por página y agrupar los modelos en una sola página con pestañas.
- `src/lib/bioestadistica/webr.ts` es el único módulo de `lib/` que depende del navegador; se carga solo con `import()` dinámico desde el controlador de la calculadora.
- `tsconfig.json`: no hace falta `allowImportingTsExtensions` (ya viene en la base de Astro); se añade `erasableSyntaxOnly: true`.
- Plantillas R en YAML (`r.codigo`, `r.paquetes`) rellenadas por `rellenarR`, con `rScript(entradas)` como anulación programática; mismos ids de salida en `campos`, etiquetas del YAML, `Resultado.valores`, JSON de R y `esperado` del fixture.
- Formato de fixture: lista de casos con `entradas`, `esperado` y `tol` (sección 6.2). Nada de la sección se sirve bajo `/data/`; los fixtures no se publican.
- Aserción contra `r-wasm.org` en `audit-performance.py` programada en el hito H4 junto con webR.
- El estado de la URL se escribe con `history.replaceState(history.state, '', url)`; `webr.ts` no toca `history`.

## 10. Orden de implementación sugerido (para el plan maestro)

1. `tipos.ts`, `primitivas/*`, `raices.ts` + `primitivas.test.ts` (identidades, valores tabulados).
2. `tabla2x2.ts`, `posprueba.ts`, `codigoR/diagnostica.ts`, `comparar.ts`, `casos/diagnostica.json`, `scripts/bio-fixtures.mjs`, `r/correr_casos.R`, `r/instalar.R`, `tolerancias.ts`, `diagnostica.test.ts`, scripts npm. Con esto queda demostrado el circuito completo TS → snippet → Rscript → fixture → test.
3. Resto de calculadoras cerradas, cada una con plantilla R + casos + fixture + test, en este orden: proporción, asociación, pruebas 2×2, media/descriptivos, Hozo, κ, muestra, supervivencia.
4. `bandas.ts`, `interpretar.ts`, `formato.ts`, `plantillas/es.json`, `plantillas/en.json`, `plantillas.test.ts`.
5. `webr.ts`, panel de consentimiento y verificación, `politica.test.ts`, aserción nueva en `audit-performance.py`, `docs/bioestadistica/EXTERNOS.md`, README.
6. `exportar.ts` + `exportar.test.ts`, impresión, estado URL, ejemplos.
7. Fase 2: `entrada.ts`, roles, snippets de modelos, `datos.csv` de casos, fixtures de glm/coxph/lm (solo como referencia de contrato mientras no haya TS).
8. Endurecimiento: imagen `rwasm` en el Mac mini, autoalojado, service worker, launchd.

Verificación de cierre de cada paso: `npm run test:bio`, `npm run check`, `npm run build && npm run audit:performance -- --check-data-baseline`.

/**
 * Prueba de normalidad de Shapiro-Wilk: estadístico W y su valor p.
 *
 * Reimplementación del algoritmo **AS R94** (Royston P. Remark AS R94: A remark
 * on Algorithm AS 181: the W test for normality. Appl Stat 1995;44:547-51), que
 * es el que ejecuta `shapiro.test` de R para todo 3 ≤ n ≤ 5000.
 *
 * PROCEDENCIA. El código de abajo se escribió a partir del listado Fortran
 * publicado del algoritmo (subrutina `SWILK` de la serie «Applied Statistics
 * Algorithms» de la Royal Statistical Society, distribuida por StatLib) y de la
 * descripción del método en Royston 1992 y 1995. NO es una traducción de
 * `nmath/swilk.c` de R, que está bajo GPL. Los bloques de constantes son los
 * publicados en las sentencias `DATA` del listado AS R94, y cada uno se
 * documenta en su declaración.
 *
 * DOS DESVIACIONES DELIBERADAS respecto al listado, ambas por precisión y
 * ninguna con efecto visible frente a R (ver `tests/bioestadistica/shapiro.test.ts`):
 *
 * 1. `SQRTH` (n = 3) y las constantes `PI6`/`STQR` del valor p exacto de n = 3
 *    aparecen en el listado con siete cifras (0.70711, 0.1909859E1, 0.1047198E1).
 *    Aquí se usan sus valores exactos (√½, 6/π y arcsen√¾ = π/3). El primero es
 *    irrelevante (W es una correlación al cuadrado: no depende de la escala de
 *    los coeficientes) y el segundo acerca el resultado a R, que también usa
 *    constantes de doble precisión: para `c(1, 2, 3)` R devuelve p =
 *    0.999999999999993 y aquí sale 1, es decir 7e-15 de diferencia.
 * 2. Los cuantiles normales salen de `qnorm` (AS 241 de Wichura, ~1e-16), el
 *    mismo algoritmo que usa R, en lugar del `PPND` (AS 111) del listado.
 *
 * El resto —el orden de las sumas, el esquema de Horner de `POLY`, la
 * normalización de los coeficientes y las dos ramas del valor p— reproduce el
 * listado paso a paso, de modo que las diferencias con R se quedan en el último
 * bit de las funciones elementales.
 *
 * Solo se implementa el caso sin censura (n₁ = n), que es el único que usa
 * `shapiro.test`.
 */
import { pnorm, qnorm } from '../primitivas/distribuciones.ts';

/** Estadístico W y su valor p (cola superior de la transformación normalizadora). */
export interface ResultadoShapiro {
  /** W ∈ (0, 1]: 1 = ajuste perfecto a la recta de los cuantiles normales. */
  w: number;
  /** P(W ≤ w observado) bajo normalidad. */
  p: number;
}

/** Tamaño mínimo que admite AS R94 (y `shapiro.test`). */
export const N_MIN_SHAPIRO = 3;
/** Tamaño máximo con el que AS R94 está calibrado (y que admite `shapiro.test`). */
export const N_MAX_SHAPIRO = 5000;

// ---------------------------------------------------------------------------
// Constantes publicadas en las sentencias DATA del listado AS R94
// ---------------------------------------------------------------------------

/**
 * `DATA C1`: aproximación polinómica de aₙ (el mayor coeficiente del vector de
 * pesos) en u = 1/√n. Royston 1992, ec. (6), recalibrada en AS R94.
 */
const C1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056] as const;

/** `DATA C2`: lo mismo para aₙ₋₁ (solo se usa con n > 5). Royston 1992, ec. (7). */
const C2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633] as const;

/** `DATA C3`: media μ de la transformación normalizadora para 4 ≤ n ≤ 11, en n. */
const C3 = [0.544, -0.39978, 0.025054, -6.714e-4] as const;

/** `DATA C4`: log σ de esa misma transformación para 4 ≤ n ≤ 11, en n. */
const C4 = [1.3822, -0.77857, 0.062767, -0.0020322] as const;

/** `DATA C5`: media μ de la transformación normalizadora para n ≥ 12, en log n. */
const C5 = [-1.5861, -0.31082, -0.083751, 0.0038915] as const;

/** `DATA C6`: log σ de esa misma transformación para n ≥ 12, en log n. */
const C6 = [-0.4803, -0.082676, 0.0030302] as const;

/** `DATA G`: γ(n) = −2.273 + 0.459 n, el desplazamiento de la rama 4 ≤ n ≤ 11. */
const G = [-2.273, 0.459] as const;

/** `DATA TH`: 0.375, la corrección de continuidad de Blom en los cuantiles esperados. */
const TH = 0.375;

/** `DATA SMALL`: valor p que devuelve el listado cuando log(1 − W) ≥ γ(n). */
const SMALL = 1e-19;

/** Rango por debajo del cual R reescala la columna antes de llamar al algoritmo. */
const RANGO_MINIMO = 1e-10;

/** 6/π y arcsen√¾ = π/3, exactos (`PI6` y `STQR` del listado, con siete cifras allí). */
const PI6 = 6 / Math.PI;
const STQR = Math.asin(Math.sqrt(0.75));

/**
 * `POLY` del listado: esquema de Horner c[0] + x·(c[1] + x·(c[2] + …)), con el
 * mismo orden de operaciones que el original (el resultado es el mismo doble).
 */
function poly(c: readonly number[], x: number): number {
  let p = c[c.length - 1] as number;
  for (let i = c.length - 2; i >= 1; i -= 1) p = p * x + (c[i] as number);
  return (c[0] as number) + p * x;
}

// ---------------------------------------------------------------------------
// Coeficientes del vector de pesos
// ---------------------------------------------------------------------------

/**
 * Coeficientes a₁…a_{⌊n/2⌋} (la mitad «baja» del vector de pesos; la otra mitad
 * es su reflejo cambiado de signo), con la normalización de AS R94.
 *
 * Parte de los cuantiles esperados de Blom mᵢ = Φ⁻¹((i − 0.375)/(n + 0.25)),
 * sustituye los dos extremos por las aproximaciones polinómicas en u = 1/√n
 * (`C1` y `C2`) y reescala el resto con el factor que devuelve ‖a‖ = 1.
 *
 * El vector devuelto está indexado desde 1 (la posición 0 queda sin usar) para
 * seguir el listado sin desfases.
 */
export function coeficientesShapiro(n: number): number[] {
  const n2 = Math.floor(n / 2);
  const a = new Array<number>(n2 + 1).fill(0);
  if (n === 3) {
    // El listado escribe 0.70711; W es una correlación al cuadrado y no depende
    // de la escala del vector de pesos, así que √½ exacto da el mismo W.
    a[1] = Math.SQRT1_2;
    return a;
  }
  const an = n;
  const an25 = an + 0.25;
  let summ2 = 0;
  for (let i = 1; i <= n2; i += 1) {
    a[i] = qnorm((i - TH) / an25);
    summ2 += (a[i] as number) * (a[i] as number);
  }
  summ2 *= 2;
  const ssumm2 = Math.sqrt(summ2);
  const rsn = 1 / Math.sqrt(an);
  const a1 = poly(C1, rsn) - (a[1] as number) / ssumm2;

  let i1: number;
  let fac: number;
  let a2 = 0;
  if (n > 5) {
    i1 = 3;
    a2 = -(a[2] as number) / ssumm2 + poly(C2, rsn);
    fac = Math.sqrt(
      (summ2 - 2 * (a[1] as number) ** 2 - 2 * (a[2] as number) ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2),
    );
  } else {
    i1 = 2;
    fac = Math.sqrt((summ2 - 2 * (a[1] as number) ** 2) / (1 - 2 * a1 ** 2));
  }
  a[1] = a1;
  if (n > 5) a[2] = a2;
  for (let i = i1; i <= n2; i += 1) a[i] = -(a[i] as number) / fac;
  return a;
}

// ---------------------------------------------------------------------------
// Valor p
// ---------------------------------------------------------------------------

/**
 * Valor p de W para un tamaño n, a partir de 1 − W (que el estadístico calcula
 * por separado para no perder cifras cuando W ≈ 1).
 *
 * - n = 3: distribución exacta, p = (6/π)·(arcsen√W − arcsen√¾), acotada a [0, 1].
 * - 4 ≤ n ≤ 11: y = −log(γ(n) − log(1 − W)) con γ(n) = poly(`G`, n); μ y σ por
 *   `C3` y `C4` evaluados en n.
 * - n ≥ 12: y = log(1 − W); μ y σ por `C5` y `C6` evaluados en log n.
 *
 * En las dos últimas ramas p = 1 − Φ((y − μ)/σ).
 */
export function pShapiro(w: number, w1: number, n: number): number {
  if (n === 3) {
    const p = PI6 * (Math.asin(Math.sqrt(w)) - STQR);
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }
  let y = Math.log(w1);
  const xx = Math.log(n);
  let m: number;
  let s: number;
  if (n <= 11) {
    const gamma = poly(G, n);
    if (y >= gamma) return SMALL;
    y = -Math.log(gamma - y);
    m = poly(C3, n);
    s = Math.exp(poly(C4, n));
  } else {
    m = poly(C5, xx);
    s = Math.exp(poly(C6, xx));
  }
  return pnorm((y - m) / s, 0, 1, false);
}

// ---------------------------------------------------------------------------
// Estadístico
// ---------------------------------------------------------------------------

/**
 * W de Shapiro-Wilk y su valor p para una columna de números.
 *
 * W se obtiene como el cuadrado del coeficiente de correlación entre los datos
 * ordenados y los coeficientes aᵢ, que es la forma numéricamente estable de
 * W = (Σ aᵢ x₍ᵢ₎)² / Σ(xᵢ − x̄)²; 1 − W se calcula aparte, como en el listado,
 * porque con n grande y datos muy normales W se acerca tanto a 1 que la resta
 * directa perdería todas las cifras del valor p.
 *
 * Los datos se dividen entre su rango antes de sumar, igual que el listado y
 * que R. Esto hace a W invariante frente a cambios de escala pero deja la
 * invariancia frente a traslaciones limitada por la precisión doble (sumar 10⁶
 * a la columna mueve W en ~1e-11, también en R).
 *
 * @throws {RangeError} si n < 3, n > 5000, algún valor no es finito o el rango es 0.
 */
export function shapiroWilk(datos: readonly number[]): ResultadoShapiro {
  const n = datos.length;
  if (n < N_MIN_SHAPIRO || n > N_MAX_SHAPIRO) {
    throw new RangeError(`entrada_invalida: Shapiro-Wilk necesita entre ${N_MIN_SHAPIRO} y ${N_MAX_SHAPIRO} valores`);
  }
  for (const v of datos) {
    if (!Number.isFinite(v)) throw new RangeError('entrada_invalida: la columna tiene un valor no finito');
  }
  let x = [...datos].sort((p, q) => p - q);
  let rango = (x[n - 1] as number) - (x[0] as number);
  if (rango === 0) throw new RangeError('entrada_invalida: todos los valores de la columna son iguales');
  if (rango < RANGO_MINIMO) {
    // Igual que `shapiro.test`: con un rango diminuto se reescala la columna
    // antes de entrar al algoritmo para no agotar la precisión al dividir.
    const r = rango;
    x = x.map((v) => v / r);
    rango = (x[n - 1] as number) - (x[0] as number);
  }

  const a = coeficientesShapiro(n);

  // Medias de los coeficientes (0 en aritmética exacta: el vector es
  // antisimétrico) y de los datos reescalados, en el orden del listado.
  let sx = (x[0] as number) / rango;
  let sa = -(a[1] as number);
  for (let i = 2, j = n - 1; i <= n; i += 1, j -= 1) {
    sx += (x[i - 1] as number) / rango;
    if (i !== j) sa += (i > j ? 1 : -1) * (a[Math.min(i, j)] as number);
  }
  sa /= n;
  sx /= n;

  let ssa = 0;
  let ssx = 0;
  let sax = 0;
  for (let i = 1, j = n; i <= n; i += 1, j -= 1) {
    const asa = i !== j ? (i > j ? 1 : -1) * (a[Math.min(i, j)] as number) - sa : -sa;
    const xsx = (x[i - 1] as number) / rango - sx;
    ssa += asa * asa;
    ssx += xsx * xsx;
    sax += asa * xsx;
  }

  // (√(ssa·ssx) − sax)(√(ssa·ssx) + sax)/(ssa·ssx) = 1 − r², sin la cancelación
  // catastrófica de calcular 1 − W directamente.
  const ssassx = Math.sqrt(ssa * ssx);
  const w1 = ((ssassx - sax) * (ssassx + sax)) / (ssa * ssx);
  const w = 1 - w1;
  return { w, p: pShapiro(w, w1, n) };
}

/**
 * Funciones incompletas regularizadas: beta I_x(a, b) y gamma P(a, x) / Q(a, x).
 *
 * Referencias:
 *  - Lentz WJ. «Generating Bessel functions in Mie scattering calculations
 *    using continued fractions». Appl Opt 1976;15:668-71 (algoritmo modificado
 *    de evaluación de fracciones continuas).
 *  - Thompson IJ, Barnett AR. J Comput Phys 1986;64:490-509.
 *  - Press WH y cols. «Numerical Recipes» 3.ª ed., §6.2 («gser», «gcf») y §6.4
 *    («betacf»).
 *
 * Este módulo no importa nada fuera de `primitivas/`.
 */

import { lbeta, lgamma } from './especiales.ts';

/** Criterio de parada relativo de las fracciones continuas (plan §1.3). */
const EPS = 1e-15;
/** Tope de iteraciones de la fracción continua de la beta incompleta. */
const MAX_ITER_BETA = 2000;
/** Tope de iteraciones de la serie y la fracción continua de la gamma. */
const MAX_ITER_GAMMA = 10000;
/** Piso para evitar divisiones por cero en el algoritmo de Lentz. */
const MINIMO = 1e-300;

/**
 * Fracción continua de la beta incompleta, evaluada con el algoritmo modificado
 * de Lentz (Numerical Recipes 3.ª ed. §6.4, «betacf»). Converge para
 * x < (a+1)/(a+b+2); fuera de ese rango se llama con los papeles cambiados.
 */
export function betaCF(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < MINIMO) d = MINIMO;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER_BETA; m++) {
    const m2 = 2 * m;
    // Paso par.
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < MINIMO) d = MINIMO;
    c = 1 + aa / c;
    if (Math.abs(c) < MINIMO) c = MINIMO;
    d = 1 / d;
    h *= d * c;
    // Paso impar.
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < MINIMO) d = MINIMO;
    c = 1 + aa / c;
    if (Math.abs(c) < MINIMO) c = MINIMO;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) <= EPS) return h;
  }
  return h;
}

/**
 * Beta incompleta regularizada I_x(a, b) = B(x; a, b)/B(a, b) cuando además se
 * conoce el complemento exacto y = 1 − x.
 *
 * Pasar `y` aparte no es un lujo: el doble más cercano a 1 − 1e-12 tiene un
 * complemento que se separa un 5e-5 relativo de 1e-12, porque los dobles se
 * espacian 1.1e-16 junto al 1. Ese error viaja íntegro a la cola pequeña, así
 * que quien conoce el complemento de origen (pbeta con `lower = FALSE`, pt, pf,
 * pbinom) debe entregarlo.
 *
 * Fracción continua de Lentz con cambio de simetría cuando x > (a+1)/(a+b+2)
 * (Numerical Recipes 3.ª ed. §6.4). Precisión ≈ 1e-13; se degrada con a, b > 1e5.
 *
 * Casos borde como R: I_0 = 0, I_1 = 1; a = 0 concentra la masa en 0 y b = 0 en 1.
 */
export function betaIncXY(a: number, b: number, x: number, y: number): number {
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(x)) return NaN;
  if (a < 0 || b < 0) {
    throw new RangeError(`betaInc: a y b deben ser ≥ 0 (a = ${a}, b = ${b})`);
  }
  if (x < 0 || x > 1) {
    throw new RangeError(`betaInc: x debe estar en [0, 1] (x = ${x})`);
  }
  if (a === 0 && b === 0) return x < 0.5 ? 0 : 1;
  // Distribución degenerada: a = 0 pone toda la masa en 0; b = 0, en 1.
  if (a === 0) return 1;
  if (b === 0) return x < 1 ? 0 : 1;
  if (x === 0) return 0;
  if (y <= 0) return 1;

  // Cada logaritmo se toma por la vía que no cancela: log1p cuando el argumento
  // ronda el 1, log directo cuando el valor exacto es el pequeño.
  const logX = x > 0.5 ? Math.log1p(-y) : Math.log(x);
  const logY = y > 0.5 ? Math.log1p(-x) : Math.log(y);
  const factor = Math.exp(a * logX + b * logY - lbeta(a, b));
  if (x < (a + 1) / (a + b + 2)) {
    return factor * betaCF(a, b, x) / a;
  }
  return 1 - factor * betaCF(b, a, y) / b;
}

/** I_x(a, b) con el complemento calculado por la vía habitual. */
export function betaInc(a: number, b: number, x: number): number {
  return betaIncXY(a, b, x, 1 - x);
}

/**
 * Serie de la gamma incompleta: P(a, x) para x < a+1
 * (Numerical Recipes 3.ª ed. §6.2, «gser»).
 */
function gammaSerie(a: number, x: number): number {
  let ap = a;
  let del = 1 / a;
  let suma = del;
  for (let i = 0; i < MAX_ITER_GAMMA; i++) {
    ap += 1;
    del *= x / ap;
    suma += del;
    if (Math.abs(del) < Math.abs(suma) * EPS) break;
  }
  return suma * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

/**
 * Fracción continua de la gamma incompleta: Q(a, x) para x ≥ a+1, evaluada con
 * el algoritmo modificado de Lentz (Numerical Recipes 3.ª ed. §6.2, «gcf»).
 */
function gammaFraccion(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / MINIMO;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITER_GAMMA; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < MINIMO) d = MINIMO;
    c = b + an / c;
    if (Math.abs(c) < MINIMO) c = MINIMO;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

/**
 * Gamma incompleta regularizada inferior P(a, x) = γ(a, x)/Γ(a).
 * Serie para x < a+1 y fracción continua en otro caso (NR 3.ª ed. §6.2).
 */
export function gammaP(a: number, x: number): number {
  if (Number.isNaN(a) || Number.isNaN(x)) return NaN;
  if (a <= 0) throw new RangeError(`gammaP: a debe ser > 0 (a = ${a})`);
  if (x < 0) throw new RangeError(`gammaP: x debe ser ≥ 0 (x = ${x})`);
  if (x === 0) return 0;
  if (x === Infinity) return 1;
  if (x < a + 1) return gammaSerie(a, x);
  return 1 - gammaFraccion(a, x);
}

/**
 * Gamma incompleta regularizada superior Q(a, x) = Γ(a, x)/Γ(a) = 1 − P(a, x),
 * calculada por la rama que conserva las cifras significativas en cada cola.
 */
export function gammaQ(a: number, x: number): number {
  if (Number.isNaN(a) || Number.isNaN(x)) return NaN;
  if (a <= 0) throw new RangeError(`gammaQ: a debe ser > 0 (a = ${a})`);
  if (x < 0) throw new RangeError(`gammaQ: x debe ser ≥ 0 (x = ${x})`);
  if (x === 0) return 1;
  if (x === Infinity) return 0;
  if (x < a + 1) return 1 - gammaSerie(a, x);
  return gammaFraccion(a, x);
}

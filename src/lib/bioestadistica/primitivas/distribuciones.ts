/**
 * Distribuciones de probabilidad: densidades, funciones de distribución y
 * cuantiles, con los mismos nombres, parámetros y valores por omisión que R.
 *
 * Referencias de implementación:
 *  - Cody WJ. Math Comp 1969;23:631-7 (aproximación racional de `pnorm`).
 *  - Wichura MJ. «Algorithm AS 241: the percentage points of the normal
 *    distribution». Appl Stat 1988;37:477-84 (PPND16, usado por `qnorm`).
 *  - Lenth RV. «Algorithm AS 243: cumulative distribution function of the
 *    non-central t distribution». Appl Stat 1989;38:185-9 (`pnt`).
 *  - Loader C. «Fast and accurate computation of binomial probabilities», 2000
 *    (`dbinom`).
 *  - Abramowitz M, Stegun IA. «Handbook of Mathematical Functions», 26.5.27
 *    (relación entre `pt` y la beta incompleta) y 26.4.14 (Wilson-Hilferty).
 *  - Brent RP 1973 / Numerical Recipes 3.ª ed. §9.3 (inversión de las CDF).
 *
 * Convenio de los cuantiles (plan del motor §1.3): en vez de portar AS 91 o
 * AS 109 se invierte con Brent la propia CDF de este módulo. Eso garantiza
 * `pchisq(qchisq(p, k), k) = p` a precisión de máquina y deja la exactitud
 * absoluta en manos del oráculo R. La búsqueda se hace en escala logarítmica
 * para los soportes positivos, de modo que la precisión es relativa en todo el
 * rango (de 1e-300 a 1e300) y no la absoluta de 1e-14 que fijaría una búsqueda
 * lineal; el criterio de Brent (2·ε·|x|) es por tanto más estricto que el
 * `1e-14·max(1, |x|)` del plan.
 *
 * Este módulo no importa nada fuera de `primitivas/`.
 */

import {
  LN_2PI,
  LN_SQRT_2PI,
  LN_SQRT_PI,
  SQRT_2_SOBRE_PI,
  UNO_SOBRE_SQRT_2PI,
  bd0,
  erfc,
  errorStirling,
  lbeta,
  lchoose,
  lgamma,
} from './especiales.ts';
import { betaInc, betaIncXY, gammaP, gammaQ } from './incompletas.ts';
import { brent, expandirIntervalo } from './raices.ts';

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

function exigirPositivo(nombre: string, v: number): void {
  if (!(v > 0)) {
    throw new RangeError(`${nombre} debe ser > 0 (recibido ${v})`);
  }
}

function exigirProbabilidad(p: number): void {
  if (!(p >= 0 && p <= 1)) {
    throw new RangeError(`p debe estar en [0, 1] (recibido ${p})`);
  }
}

function exigirEnteroNoNegativo(nombre: string, v: number): void {
  if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
    throw new RangeError(`${nombre} debe ser un entero ≥ 0 (recibido ${v})`);
  }
}

/** ¿`v` es entero salvo por el margen de redondeo que tolera R (1e-7)? */
function esEnteroTolerante(v: number): boolean {
  return Math.abs(v - Math.round(v)) <= 1e-7;
}

// ---------------------------------------------------------------------------
// Normal
// ---------------------------------------------------------------------------

/*
 * `pnorm` usa la aproximación racional de Cody en tres tramos (|x| ≤ 0.6744…,
 * |x| ≤ √32, resto), la misma que ANORM de SPECFUN. En los dos tramos externos
 * el factor e^{-x²/2} se parte en e^{-x̄²/2}·e^{-δ/2} con x̄ = trunc(16x)/16 para
 * no perder cifras al exponenciar; de ahí que las colas mantengan precisión
 * hasta donde llega el doble (≈ 1e-316, ya en el rango subnormal).
 */

const PN_A = [
  2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582,
  18154.981253343561249, 0.065682337918207449113,
] as const;
const PN_B = [
  47.20258190468824187, 976.09855173777669322, 10260.932208618978205,
  45507.789335026729956,
] as const;
const PN_P = [
  0.21589853405795699, 0.1274011611602473639, 0.022235277870649807,
  0.001421619193227893466, 2.9112874951168792e-5, 0.02307344176494017303,
] as const;
const PN_Q = [
  1.28426009614491121, 0.468238212480865118, 0.0659881378689285515,
  0.00378239633202758244, 7.29751555083966205e-5,
] as const;

/** √32, frontera entre el tramo intermedio y el asintótico de Cody. */
const SQRT_32 = 5.656854249492380195206754896838;
/** √2, para pasar de la escala normal a la de erfc. */
const SQRT_2 = 1.414213562373095048801688724210;

/**
 * Separa e^{-y²/2} en dos exponenciales para conservar cifras, y devuelve
 * `[cola inferior, cola superior]` de la normal estándar en `x`.
 */
function colasDesdeRazon(x: number, y: number, razon: number, log: boolean): [number, number] {
  const yTrunc = Math.trunc(y * 16) / 16;
  const delta = (y - yTrunc) * (y + yTrunc);
  let menor: number;
  let mayor: number;
  if (log) {
    menor = -yTrunc * yTrunc * 0.5 - delta * 0.5 + Math.log(razon);
    mayor = Math.log1p(-Math.exp(-yTrunc * yTrunc * 0.5) * Math.exp(-delta * 0.5) * razon);
  } else {
    menor = Math.exp(-yTrunc * yTrunc * 0.5) * Math.exp(-delta * 0.5) * razon;
    mayor = 1 - menor;
  }
  // `menor` es la cola que queda del lado de |x|: la superior si x > 0.
  return x > 0 ? [mayor, menor] : [menor, mayor];
}

/** Devuelve `[P(Z ≤ z), P(Z > z)]` (o sus logaritmos) para la normal estándar. */
function colasNormal(z: number, log: boolean): [number, number] {
  if (Number.isNaN(z)) return [NaN, NaN];
  if (z === Infinity) return log ? [0, -Infinity] : [1, 0];
  if (z === -Infinity) return log ? [-Infinity, 0] : [0, 1];

  const y = Math.abs(z);
  if (y <= 0.67448975) {
    let num = 0;
    let den = 0;
    if (y > Number.EPSILON * 0.5) {
      const zsq = z * z;
      num = PN_A[4] * zsq;
      den = zsq;
      for (let i = 0; i < 3; i++) {
        num = (num + PN_A[i]) * zsq;
        den = (den + PN_B[i]) * zsq;
      }
    }
    const t = z * (num + PN_A[3]) / (den + PN_B[3]);
    const inf = 0.5 + t;
    const sup = 0.5 - t;
    return log ? [Math.log(inf), Math.log(sup)] : [inf, sup];
  }

  if (y <= SQRT_32) {
    // Tramo intermedio: Φ(−y) = ½·erfc(y/√2). El argumento cae justo en el
    // tramo medio de CALERF (0.46875 < y/√2 ≤ 4), donde la aproximación de Cody
    // ya lleva incorporado el desdoblamiento de la exponencial.
    const menor = 0.5 * erfc(y / SQRT_2);
    const mayor = 1 - menor;
    const par: [number, number] = log
      ? [Math.log(menor), Math.log1p(-menor)]
      : [menor, mayor];
    return z > 0 ? [par[1], par[0]] : [par[0], par[1]];
  }

  // Tramo asintótico: desarrollo racional en 1/x².
  const zsq = 1 / (z * z);
  let num = PN_P[5] * zsq;
  let den = zsq;
  for (let i = 0; i < 4; i++) {
    num = (num + PN_P[i]) * zsq;
    den = (den + PN_Q[i]) * zsq;
  }
  let razon = zsq * (num + PN_P[4]) / (den + PN_Q[4]);
  razon = (UNO_SOBRE_SQRT_2PI - razon) / y;
  return colasDesdeRazon(z, y, razon, log);
}

/**
 * Densidad de la normal. Para |z| ≥ 5 el exponente se parte en dos trozos
 * exactos (como `dnorm.c` de R) para no perder cifras en la cola.
 */
export function dnorm(x: number, mu = 0, sd = 1, log = false): number {
  if (Number.isNaN(x) || Number.isNaN(mu) || Number.isNaN(sd)) return NaN;
  exigirPositivo('dnorm: sd', sd);
  if (!Number.isFinite(mu)) throw new RangeError(`dnorm: mu debe ser finito (recibido ${mu})`);
  if (!Number.isFinite(x)) return log ? -Infinity : 0;

  const z = Math.abs((x - mu) / sd);
  if (log) return -(LN_SQRT_2PI + 0.5 * z * z + Math.log(sd));
  if (z < 5) return UNO_SOBRE_SQRT_2PI * Math.exp(-0.5 * z * z) / sd;
  // Más allá de este punto e^{-z²/2} es cero incluso en subnormales.
  if (z > 38.5625) return 0;
  const z1 = Math.round(z * 65536) / 65536;
  const z2 = z - z1;
  return UNO_SOBRE_SQRT_2PI / sd * (Math.exp(-0.5 * z1 * z1) * Math.exp((-0.5 * z2 - z1) * z2));
}

/**
 * Función de distribución de la normal (Cody 1969). `lower = false` devuelve la
 * cola superior por su propia rama, sin restar de 1, y `log = true` devuelve el
 * logaritmo, que es la única forma de leer las colas por debajo de 1e-308.
 */
export function pnorm(q: number, mu = 0, sd = 1, lower = true, log = false): number {
  if (Number.isNaN(q) || Number.isNaN(mu) || Number.isNaN(sd)) return NaN;
  exigirPositivo('pnorm: sd', sd);
  if (!Number.isFinite(mu)) throw new RangeError(`pnorm: mu debe ser finito (recibido ${mu})`);
  const colas = colasNormal((q - mu) / sd, log);
  return lower ? colas[0] : colas[1];
}

/*
 * `qnorm` es AS 241 (PPND16) de Wichura: tres aproximaciones racionales de
 * grado 7 en q = p − ½ (|q| ≤ 0.425), en √(−log r) − 1.6 (r ≤ e^{-25}) y en
 * √(−log r) − 5 para el resto de la cola. Da ≈ 16 cifras hasta p ≈ 1e-316.
 */

const AS241_A = [
  3.3871328727963666080, 1.3314166789178437745e2, 1.9715909503065514427e3,
  1.3731693765509461125e4, 4.5921953931549871457e4, 6.7265770927008700853e4,
  3.3430575583588128105e4, 2.5090809287301226727e3,
] as const;
const AS241_B = [
  1, 4.2313330701600911252e1, 6.8718700749205790830e2, 5.3941960214247511077e3,
  2.1213794301586595867e4, 3.9307895800092710610e4, 2.8729085735721942674e4,
  5.2264952788528545610e3,
] as const;
const AS241_C = [
  1.42343711074968357734, 4.63033784615654529590, 5.76949722146069140550,
  3.64784832476320460504, 1.27045825245236838258, 2.41780725177450611770e-1,
  2.27238449892691845833e-2, 7.74545014278341407640e-4,
] as const;
const AS241_D = [
  1, 2.05319162663775882187, 1.67638483018380384940, 6.89767334985100004550e-1,
  1.48103976427480074590e-1, 1.51986665636164571966e-2,
  5.47593808499534494600e-4, 1.05075007164441684324e-9,
] as const;
const AS241_E = [
  6.65790464350110377720, 5.46378491116411436990, 1.78482653991729133580,
  2.96560571828504891230e-1, 2.65321895265761230930e-2,
  1.24266094738807843860e-3, 2.71155556874348757815e-5,
  2.01033439929228813265e-7,
] as const;
const AS241_F = [
  1, 5.99832206555887937690e-1, 1.36929880922735805310e-1,
  1.48753612908506148525e-2, 7.86869131145613259100e-4,
  1.84631831751005468180e-5, 1.42151175831644588870e-7,
  2.04426310338993978564e-15,
] as const;

/** Evalúa el polinomio de coeficientes `c` (grado 7) en `x` por Horner. */
function horner8(c: readonly number[], x: number): number {
  let s = c[7];
  for (let i = 6; i >= 0; i--) s = s * x + c[i];
  return s;
}

/*
 * Cuantil de la normal estándar por AS 241 (Wichura 1988), tal cual se publicó:
 * los mismos coeficientes y el mismo anidamiento de Horner en las tres ramas.
 *
 * Sobre 865 puntos de la rama central (p = k/1024 con |p − ½| ≤ 0.425) coincide
 * bit a bit con R 4.5.2 en 411; en los 454 restantes la diferencia no pasa de
 * 3 ulp (6.0e-16 relativo). Arbitrando con `pnorm` de R, 325 de esos empatan,
 * 84 favorecen a R y 45 a este módulo, o sea que R afina algo por debajo del
 * ulp respecto de AS 241 puro. No se persigue esa diferencia: el plan fija
 * AS 241 como algoritmo, la tolerancia del proyecto es 1e-12 relativa y el peor
 * error medido contra la rejilla de R es 5.6e-16.
 */
function qnormEstandar(p: number, lower: boolean): number {
  if (Number.isNaN(p)) return NaN;
  exigirProbabilidad(p);
  if (!lower) return -qnormEstandar(p, true);
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;

  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return q * horner8(AS241_A, r) / horner8(AS241_B, r);
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let valor: number;
  if (r <= 5) {
    r -= 1.6;
    valor = horner8(AS241_C, r) / horner8(AS241_D, r);
  } else {
    r -= 5;
    valor = horner8(AS241_E, r) / horner8(AS241_F, r);
  }
  return q < 0 ? -valor : valor;
}

/** Cuantil de la normal (AS 241 de Wichura, 1988). */
export function qnorm(p: number, mu = 0, sd = 1, lower = true): number {
  if (Number.isNaN(p) || Number.isNaN(mu) || Number.isNaN(sd)) return NaN;
  exigirPositivo('qnorm: sd', sd);
  if (!Number.isFinite(mu)) throw new RangeError(`qnorm: mu debe ser finito (recibido ${mu})`);
  return mu + sd * qnormEstandar(p, lower);
}

// ---------------------------------------------------------------------------
// Inversión genérica de CDF
// ---------------------------------------------------------------------------

/**
 * Traduce `(p, lower)` a una cola bien condicionada: nunca se calcula `1 − p`
 * cuando `p` está pegado a 1 por el lado en que se va a resolver.
 */
interface ColaObjetivo {
  /** Si hay que resolver `S(x) = meta` (cola superior) o `F(x) = meta`. */
  superior: boolean;
  /** Probabilidad objetivo, siempre ≤ 0.5. */
  meta: number;
}

function elegirCola(p: number, lower: boolean): ColaObjetivo {
  if (lower) {
    return p <= 0.5 ? { superior: false, meta: p } : { superior: true, meta: 1 - p };
  }
  return p <= 0.5 ? { superior: true, meta: p } : { superior: false, meta: 1 - p };
}

/**
 * Invierte una CDF de soporte positivo resolviendo `g(x) = 0` con `x = e^u`.
 * Trabajar en escala logarítmica da precisión relativa uniforme y deja que el
 * resultado sature en 0 (como hace R con, por ejemplo, `qchisq(1e-300, 1)`).
 *
 * `g` debe ser creciente en `x`. `uMax` es el logaritmo del extremo superior del
 * soporte (0 para la beta, ≈ 709.78 para los soportes no acotados).
 */
function cuantilLog(
  g: (x: number) => number,
  semilla: number,
  uMax = 709.782712893384,
  uMin = -1500,
): number {
  const h = (u: number): number => g(Math.exp(u));
  let u = Number.isFinite(semilla) && semilla > 0 ? Math.log(semilla) : 0;
  if (!(u > uMin)) u = uMin + 1;
  if (u > uMax) u = uMax;

  const g0 = h(u);
  if (g0 === 0) return Math.exp(u);

  let lo = u;
  let hi = u;
  let encontrado = false;
  let paso = 1;
  if (g0 < 0) {
    for (let i = 0; i < 4000; i++) {
      const sig = Math.min(hi + paso, uMax);
      const gs = h(sig);
      if (gs >= 0) { lo = hi; hi = sig; encontrado = true; break; }
      if (sig >= uMax) return Math.exp(uMax);
      hi = sig;
      paso *= 2;
    }
  } else {
    for (let i = 0; i < 4000; i++) {
      const sig = Math.max(lo - paso, uMin);
      const gs = h(sig);
      if (gs <= 0) { hi = lo; lo = sig; encontrado = true; break; }
      if (sig <= uMin) return 0;
      lo = sig;
      paso *= 2;
    }
  }
  if (!encontrado) {
    throw new RangeError('cuantil: no se pudo acorralar la raíz de la CDF');
  }
  return Math.exp(brent(h, lo, hi, { tol: 0, maxIter: 200 }));
}

// ---------------------------------------------------------------------------
// t de Student
// ---------------------------------------------------------------------------

/**
 * Función de distribución de la t de Student:
 * `P(T ≤ −|t|) = ½·I_{ν/(ν+t²)}(ν/2, ½)` (Abramowitz & Stegun 26.5.27).
 * Se calcula siempre la cola pequeña y se refleja, así no hay cancelación.
 */
export function pt(q: number, df: number, lower = true): number {
  if (Number.isNaN(q) || Number.isNaN(df)) return NaN;
  exigirPositivo('pt: df', df);
  if (q === Infinity) return lower ? 1 : 0;
  if (q === -Infinity) return lower ? 0 : 1;
  if (q === 0) return 0.5;

  // `cola` es siempre P(T ≤ −|q|), la cola pequeña. x = ν/(ν+t²) se acerca a 1
  // cuando t es diminuto y ahí su doble ya no distingue el complemento, así que
  // se entregan los dos, x e y = t²/(ν+t²), calculados por separado.
  const t2 = q * q;
  let cola: number;
  if (!Number.isFinite(t2)) {
    cola = 0;
  } else {
    const den = df + t2;
    cola = 0.5 * betaIncXY(df / 2, 0.5, df / den, t2 / den);
  }
  if (q < 0) return lower ? cola : 1 - cola;
  return lower ? 1 - cola : cola;
}

/**
 * Cuantil de la t de Student, invirtiendo `pt` con Brent.
 *
 * La semilla sale del desarrollo de la cola, I_x(a, b) ≈ x^a/(a·B(a, b)):
 * `x ≈ (p·ν·B(ν/2, ½))^{2/ν}` y `t = −√(ν(1−x)/x)`, lo que evita mil
 * duplicaciones del corchete cuando ν es pequeño y p diminuto. Límite físico:
 * para ν ≤ 2 y p ≲ 1e-300 el cuantil desborda el cuadrado en doble precisión
 * (t² > 1.8e308) y la CDF ya no se puede evaluar ahí.
 */
export function qt(p: number, df: number, lower = true): number {
  if (Number.isNaN(p) || Number.isNaN(df)) return NaN;
  exigirProbabilidad(p);
  exigirPositivo('qt: df', df);
  if (!lower) return -qt(p, df, true);
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  if (p > 0.5) return -qt(1 - p, df, true);

  // Semilla: cola de la t o, si esa forma no aplica, la normal reescalada.
  let semilla = -1;
  const logX = (2 / df) * (Math.log(p) + Math.log(df) + lbeta(df / 2, 0.5));
  if (logX < -1e-12) {
    const x = Math.exp(logX);
    if (x > 0 && x < 1) semilla = -Math.sqrt(df * (1 - x) / x);
  }
  if (!(semilla < 0) || !Number.isFinite(semilla)) {
    const z = qnormEstandar(p, true);
    semilla = df > 2 ? z * Math.sqrt(df / (df - 2)) : z;
    if (!(semilla < 0) || !Number.isFinite(semilla)) semilla = -1;
  }

  const g = (t: number): number => pt(t, df, true) - p;
  const gs = g(semilla);
  if (gs === 0) return semilla;
  const [a, b] = expandirIntervalo(g, semilla, gs < 0 ? 1 : -1, {
    paso: Math.abs(semilla) * 0.5,
  });
  return brent(g, a, b, { tol: 0, maxIter: 200 });
}

/**
 * Función de distribución de la t no central (AS 243, Lenth 1989):
 * suma de pares de betas incompletas ponderadas por una Poisson en λ = δ²,
 * con cota de error 2·s·(x_impar − g_impar), `errmax = 1e-12` e `itrmax = 1000`.
 * Equivale a `pt(q, df, ncp)` de R.
 */
export function pnt(q: number, df: number, ncp: number, lower = true): number {
  if (Number.isNaN(q) || Number.isNaN(df) || Number.isNaN(ncp)) return NaN;
  exigirPositivo('pnt: df', df);
  if (!Number.isFinite(ncp)) throw new RangeError(`pnt: ncp debe ser finito (recibido ${ncp})`);
  if (ncp === 0) return pt(q, df, lower);
  if (q === Infinity) return lower ? 1 : 0;
  if (q === -Infinity) return lower ? 0 : 1;

  const errmax = 1e-12;
  const itrmax = 1000;
  const reflejado = q < 0;
  const tt = reflejado ? -q : q;
  const del = reflejado ? -ncp : ncp;
  const colaInferior = lower !== reflejado;

  // δ tan grande que e^{-δ²/2} es cero, o ν tan grande que la t es normal:
  // aproximación de Abramowitz & Stegun 26.7.10, igual que AS 243.
  if (df > 4e5 || del * del > 2 * Math.LN2 * 1021) {
    const s = 1 / (4 * df);
    return pnorm(tt * (1 - s), del, Math.sqrt(1 + tt * tt * 2 * s), colaInferior, false);
  }

  let tnc = 0;
  const x = tt * tt / (tt * tt + df);
  if (x > 0) {
    const lambda = del * del;
    let p = 0.5 * Math.exp(-0.5 * lambda);
    let qq = SQRT_2_SOBRE_PI * p * del;
    let s = 0.5 - p;
    if (s < 1e-7) s = -0.5 * Math.expm1(-0.5 * lambda);
    let a = 0.5;
    const b = 0.5 * df;
    const rxb = Math.pow(1 - x, b);
    const albeta = LN_SQRT_PI + lgamma(b) - lgamma(0.5 + b);
    let xImpar = betaInc(a, b, x);
    let gImpar = 2 * rxb * Math.exp(a * Math.log(x) - albeta);
    let xPar = 1 - rxb;
    let gPar = b * x * rxb;
    tnc = p * xImpar + qq * xPar;

    let it = 1;
    for (;;) {
      a += 1;
      xImpar -= gImpar;
      xPar -= gPar;
      gImpar *= x * (a + b - 1) / a;
      gPar *= x * (a + b - 0.5) / (a + 0.5);
      p *= lambda / (2 * it);
      qq *= lambda / (2 * it + 1);
      s -= p;
      if (!(s > 0)) break;
      tnc += p * xImpar + qq * xPar;
      it++;
      const errbd = 2 * s * (xImpar - gImpar);
      if (Math.abs(errbd) < errmax) break;
      if (it > itrmax) break;
    }
  }

  tnc += pnorm(-del, 0, 1, true, false);
  const valor = Math.min(Math.max(tnc, 0), 1);
  return colaInferior ? valor : 1 - valor;
}

// ---------------------------------------------------------------------------
// Beta
// ---------------------------------------------------------------------------

/** Función de distribución de la beta: `I_q(a, b)`. */
export function pbeta(q: number, a: number, b: number, lower = true): number {
  if (Number.isNaN(q) || Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (a < 0 || b < 0) throw new RangeError(`pbeta: a y b deben ser ≥ 0 (a = ${a}, b = ${b})`);
  if (q <= 0) {
    // a = 0 concentra toda la masa en 0, así que F(0) = 1 (igual que R).
    if (a === 0) return lower ? 1 : 0;
    return lower ? 0 : 1;
  }
  if (q >= 1) return lower ? 1 : 0;
  if (a === 0) return lower ? 1 : 0;
  if (b === 0) return lower ? 0 : 1;
  // En la cola superior el punto es 1 − q, pero su complemento exacto es q.
  return lower ? betaIncXY(a, b, q, 1 - q) : betaIncXY(b, a, 1 - q, q);
}

/**
 * Cuantil de la beta, invirtiendo `pbeta` con Brent sobre (0, 1].
 * Casos borde como R, necesarios para Clopper-Pearson en x = 0 y x = n:
 * `qbeta(p, 0, b) = 0`, `qbeta(p, a, 0) = 1`, `qbeta(0, a, b) = 0`,
 * `qbeta(1, a, b) = 1`.
 */
export function qbeta(p: number, a: number, b: number, lower = true): number {
  if (Number.isNaN(p) || Number.isNaN(a) || Number.isNaN(b)) return NaN;
  exigirProbabilidad(p);
  if (a < 0 || b < 0) throw new RangeError(`qbeta: a y b deben ser ≥ 0 (a = ${a}, b = ${b})`);
  if (p === 0) return lower ? 0 : 1;
  if (p === 1) return lower ? 1 : 0;
  if (a === 0) return 0;
  if (b === 0) return 1;

  const { superior, meta } = elegirCola(p, lower);
  const g = superior
    ? (x: number): number => meta - pbeta(x, a, b, false)
    : (x: number): number => pbeta(x, a, b, true) - meta;
  return cuantilLog(g, a / (a + b), 0);
}

// ---------------------------------------------------------------------------
// Gamma y ji cuadrada
// ---------------------------------------------------------------------------

/** Función de distribución de la gamma con parametrización tasa, como R. */
export function pgamma(q: number, shape: number, rate = 1, lower = true): number {
  if (Number.isNaN(q) || Number.isNaN(shape) || Number.isNaN(rate)) return NaN;
  exigirPositivo('pgamma: shape', shape);
  exigirPositivo('pgamma: rate', rate);
  if (q <= 0) return lower ? 0 : 1;
  if (q === Infinity) return lower ? 1 : 0;
  const x = q * rate;
  return lower ? gammaP(shape, x) : gammaQ(shape, x);
}

/**
 * Cuantil de la gamma. La semilla es la aproximación de Wilson-Hilferty
 * (Abramowitz & Stegun 26.4.14) sobre la ji cuadrada equivalente, y el ajuste
 * final es Brent sobre `pgamma`.
 */
export function qgamma(p: number, shape: number, rate = 1, lower = true): number {
  if (Number.isNaN(p) || Number.isNaN(shape) || Number.isNaN(rate)) return NaN;
  exigirProbabilidad(p);
  exigirPositivo('qgamma: shape', shape);
  exigirPositivo('qgamma: rate', rate);
  if (p === 0) return lower ? 0 : Infinity;
  if (p === 1) return lower ? Infinity : 0;

  const { superior, meta } = elegirCola(p, lower);
  const z = qnormEstandar(meta, !superior);
  const gl = 2 * shape;
  const h = 2 / (9 * gl);
  let semilla = gl * Math.pow(1 - h + z * Math.sqrt(h), 3) / (2 * rate);
  if (!(semilla > 0) || !Number.isFinite(semilla)) semilla = shape / rate;

  const g = superior
    ? (x: number): number => meta - pgamma(x, shape, rate, false)
    : (x: number): number => pgamma(x, shape, rate, true) - meta;
  return cuantilLog(g, semilla);
}

/** Función de distribución de la ji cuadrada: `P(k/2, x/2)`. */
export function pchisq(q: number, df: number, lower = true): number {
  if (Number.isNaN(q) || Number.isNaN(df)) return NaN;
  exigirPositivo('pchisq: df', df);
  return pgamma(q, df / 2, 0.5, lower);
}

/** Cuantil de la ji cuadrada, invirtiendo `pchisq`. */
export function qchisq(p: number, df: number, lower = true): number {
  if (Number.isNaN(p) || Number.isNaN(df)) return NaN;
  exigirPositivo('qchisq: df', df);
  return qgamma(p, df / 2, 0.5, lower);
}

// ---------------------------------------------------------------------------
// F de Snedecor
// ---------------------------------------------------------------------------

/** Función de distribución de la F: `I_{d1q/(d1q+d2)}(d1/2, d2/2)`. */
export function pf(q: number, df1: number, df2: number, lower = true): number {
  if (Number.isNaN(q) || Number.isNaN(df1) || Number.isNaN(df2)) return NaN;
  exigirPositivo('pf: df1', df1);
  exigirPositivo('pf: df2', df2);
  if (q <= 0) return lower ? 0 : 1;
  if (q === Infinity) return lower ? 1 : 0;
  const den = df1 * q + df2;
  if (!Number.isFinite(den)) return lower ? 1 : 0;
  // Cada cola con su propio argumento, y con el complemento explícito: los dos
  // cocientes se obtienen del mismo denominador, así que ninguno se redondea
  // contra el 1.
  const x = df1 * q / den;
  const y = df2 / den;
  return lower ? betaIncXY(df1 / 2, df2 / 2, x, y) : betaIncXY(df2 / 2, df1 / 2, y, x);
}

/** Cuantil de la F, invirtiendo `pf` con Brent en escala logarítmica. */
export function qf(p: number, df1: number, df2: number, lower = true): number {
  if (Number.isNaN(p) || Number.isNaN(df1) || Number.isNaN(df2)) return NaN;
  exigirProbabilidad(p);
  exigirPositivo('qf: df1', df1);
  exigirPositivo('qf: df2', df2);
  if (p === 0) return lower ? 0 : Infinity;
  if (p === 1) return lower ? Infinity : 0;

  const { superior, meta } = elegirCola(p, lower);
  // Semilla: la F como cociente de dos ji cuadradas escaladas.
  let semilla = (qchisq(meta, df1, !superior) / df1) / (df2 > 2 ? df2 / (df2 - 2) : 1);
  if (!(semilla > 0) || !Number.isFinite(semilla)) semilla = 1;

  const g = superior
    ? (x: number): number => meta - pf(x, df1, df2, false)
    : (x: number): number => pf(x, df1, df2, true) - meta;
  return cuantilLog(g, semilla);
}

// ---------------------------------------------------------------------------
// Binomial
// ---------------------------------------------------------------------------

/**
 * Densidad binomial por el método del punto de silla de Loader (2000), que
 * separa el error de Stirling de la divergencia de cada celda. La forma directa
 * con `lchoose` pierde hasta 8 cifras cuando n ~ 1e6, porque la diferencia de
 * tres logaritmos de orden 1e7 se lleva el error absoluto al exponente.
 */
function dbinomBruto(x: number, n: number, p: number, q: number, log: boolean): number {
  if (p === 0) return x === 0 ? (log ? 0 : 1) : (log ? -Infinity : 0);
  if (q === 0) return x === n ? (log ? 0 : 1) : (log ? -Infinity : 0);
  if (x === 0) {
    if (n === 0) return log ? 0 : 1;
    const lc = p < 0.1 ? -bd0(n, n * q) - n * p : n * Math.log(q);
    return log ? lc : Math.exp(lc);
  }
  if (x === n) {
    const lc = q < 0.1 ? -bd0(n, n * p) - n * q : n * Math.log(p);
    return log ? lc : Math.exp(lc);
  }
  if (x < 0 || x > n) return log ? -Infinity : 0;
  const lc = errorStirling(n) - errorStirling(x) - errorStirling(n - x)
    - bd0(x, n * p) - bd0(n - x, n * q);
  const lf = LN_2PI + Math.log(x) + Math.log1p(-x / n);
  return log ? lc - 0.5 * lf : Math.exp(lc - 0.5 * lf);
}

/** Densidad binomial `P(X = k)` con `X ~ Bin(n, p)` (Loader 2000). */
export function dbinom(k: number, n: number, p: number, log = false): number {
  if (Number.isNaN(k) || Number.isNaN(n) || Number.isNaN(p)) return NaN;
  exigirEnteroNoNegativo('dbinom: n', n);
  exigirProbabilidad(p);
  if (!esEnteroTolerante(k)) return log ? -Infinity : 0;
  const x = Math.round(k);
  if (x < 0 || x > n) return log ? -Infinity : 0;
  return dbinomBruto(x, n, p, 1 - p, log);
}

/**
 * Función de distribución binomial vía la beta incompleta:
 * `P(X ≤ k) = I_{1−p}(n−k, k+1)`.
 */
export function pbinom(k: number, n: number, p: number, lower = true): number {
  if (Number.isNaN(k) || Number.isNaN(n) || Number.isNaN(p)) return NaN;
  exigirEnteroNoNegativo('pbinom: n', n);
  exigirProbabilidad(p);
  const x = Math.floor(k + 1e-7);
  if (x < 0) return lower ? 0 : 1;
  if (x >= n) return lower ? 1 : 0;
  // El punto de la cola inferior es 1 − p y su complemento exacto es p.
  return lower
    ? betaIncXY(n - x, x + 1, 1 - p, p)
    : betaIncXY(x + 1, n - x, p, 1 - p);
}

// ---------------------------------------------------------------------------
// Hipergeométrica
// ---------------------------------------------------------------------------

/** Rango del soporte de la hipergeométrica: `[max(0, k−n), min(k, m)]`. */
function soporteHiper(m: number, n: number, k: number): [number, number] {
  return [Math.max(0, k - n), Math.min(k, m)];
}

/**
 * log P(X = x) de la hipergeométrica con los parámetros de R: `m` bolas blancas,
 * `n` negras y `k` extracciones sin reemplazo.
 */
function ldhyper(x: number, m: number, n: number, k: number): number {
  return lchoose(m, x) + lchoose(n, k - x) - lchoose(m + n, k);
}

/** Densidad hipergeométrica, calculada en escala logarítmica. */
export function dhyper(x: number, m: number, n: number, k: number, log = false): number {
  if (Number.isNaN(x) || Number.isNaN(m) || Number.isNaN(n) || Number.isNaN(k)) return NaN;
  exigirEnteroNoNegativo('dhyper: m', m);
  exigirEnteroNoNegativo('dhyper: n', n);
  exigirEnteroNoNegativo('dhyper: k', k);
  if (k > m + n) throw new RangeError(`dhyper: k no puede superar m+n (k = ${k}, m+n = ${m + n})`);
  if (!esEnteroTolerante(x)) return log ? -Infinity : 0;
  const xr = Math.round(x);
  const [lo, hi] = soporteHiper(m, n, k);
  if (xr < lo || xr > hi) return log ? -Infinity : 0;
  const l = ldhyper(xr, m, n, k);
  return log ? l : Math.exp(l);
}

/**
 * Función de distribución hipergeométrica. Suma la cola más corta en escala
 * logarítmica (restando el máximo antes de exponenciar), de modo que ninguna
 * cola se pierde por desbordamiento a cero.
 */
export function phyper(x: number, m: number, n: number, k: number, lower = true): number {
  if (Number.isNaN(x) || Number.isNaN(m) || Number.isNaN(n) || Number.isNaN(k)) return NaN;
  exigirEnteroNoNegativo('phyper: m', m);
  exigirEnteroNoNegativo('phyper: n', n);
  exigirEnteroNoNegativo('phyper: k', k);
  if (k > m + n) throw new RangeError(`phyper: k no puede superar m+n (k = ${k}, m+n = ${m + n})`);
  const xr = Math.floor(x + 1e-7);
  const [lo, hi] = soporteHiper(m, n, k);
  if (xr < lo) return lower ? 0 : 1;
  if (xr >= hi) return lower ? 1 : 0;

  const izquierda = xr - lo + 1;
  const derecha = hi - xr;
  let desde: number;
  let hasta: number;
  let esInferior: boolean;
  if (izquierda <= derecha) {
    desde = lo; hasta = xr; esInferior = true;
  } else {
    desde = xr + 1; hasta = hi; esInferior = false;
  }

  const logs: number[] = [];
  let maximo = -Infinity;
  for (let i = desde; i <= hasta; i++) {
    const l = ldhyper(i, m, n, k);
    logs.push(l);
    if (l > maximo) maximo = l;
  }
  let suma = 0;
  for (const l of logs) suma += Math.exp(l - maximo);
  const acumulada = Math.exp(maximo) * suma;

  if (esInferior) return lower ? acumulada : 1 - acumulada;
  return lower ? 1 - acumulada : acumulada;
}

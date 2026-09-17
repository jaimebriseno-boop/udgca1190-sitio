/**
 * Funciones especiales en doble precisión.
 *
 * Reglas de la biblioteca (plan del motor §1.4 y §1.5):
 *  - nunca se redondea; `NaN` significa «no definido», nunca «error de programación»;
 *  - las entradas inválidas lanzan `RangeError` con mensaje en español;
 *  - sin DOM, sin `Intl`, sin `Date`, sin `Math.random`, sin estado global;
 *  - este módulo no importa nada fuera de `primitivas/`.
 *
 * Referencias generales:
 *  - Cody WJ. «Rational Chebyshev approximation for the error function».
 *    Math Comp 1969;23:631-7 (y el paquete SPECFUN, 1993).
 *  - Godfrey P. «A note on the computation of the convergent Lanczos complex
 *    gamma approximation» (g = 607/128, 15 coeficientes), 2001.
 *  - Press WH y cols. «Numerical Recipes» 3.ª ed., §6.1.
 *  - Loader C. «Fast and accurate computation of binomial probabilities», 2000.
 */

/** log(sqrt(2π)). */
export const LN_SQRT_2PI = 0.918938533204672741780329736406;
/** 1/sqrt(2π). */
export const UNO_SOBRE_SQRT_2PI = 0.398942280401432677939946059934;
/** log(sqrt(π)). */
export const LN_SQRT_PI = 0.572364942924700087071713675677;
/** sqrt(2/π). */
export const SQRT_2_SOBRE_PI = 0.797884560802865355879892119869;
/** log(2π). */
export const LN_2PI = 1.837877066409345483560659472811;

// ---------------------------------------------------------------------------
// erf y erfc: aproximación racional de Cody en tres tramos
// ---------------------------------------------------------------------------

/*
 * Cody 1969 / SPECFUN `CALERF` divide el dominio en tres tramos:
 *   |x| <= 0.46875        → erf por un cociente de polinomios en x²
 *   0.46875 < |x| <= 4    → erfc por un cociente de polinomios en |x|
 *   |x| > 4               → erfc por la expansión asintótica racional en 1/x²
 * En los dos últimos tramos el factor exp(-x²) se separa en exp(-x̄²)·exp(-δ)
 * con x̄ = trunc(16·|x|)/16, para que el argumento de la exponencial no pierda
 * cifras por redondeo. Ese desdoblamiento es lo que sostiene las colas hasta
 * los números subnormales (≈ 1e-320).
 */

const CODY_A = [
  3.16112374387056560e0, 1.13864154151050156e2, 3.77485237685302021e2,
  3.20937758913846947e3, 1.85777706184603153e-1,
] as const;
const CODY_B = [
  2.36012909523441209e1, 2.44024637934444173e2, 1.28261652607737228e3,
  2.84423683343917062e3,
] as const;
const CODY_C = [
  5.64188496988670089e-1, 8.88314979438837594e0, 6.61191906371416295e1,
  2.98635138197400131e2, 8.81952221241769090e2, 1.71204761263407058e3,
  2.05107837782607147e3, 1.23033935479799725e3, 2.15311535474403846e-8,
] as const;
const CODY_D = [
  1.57449261107098347e1, 1.17693950891312499e2, 5.37181101862009858e2,
  1.62138957456669019e3, 3.29079923573345963e3, 4.36261909014324716e3,
  3.43936767414372164e3, 1.23033935480374942e3,
] as const;
const CODY_P = [
  3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1,
  1.60837851487422766e-2, 6.58749161529837803e-4, 1.63153871373020978e-2,
] as const;
const CODY_Q = [
  2.56852019228982242e0, 1.87295284992346047e0, 5.27905102951428412e-1,
  6.05183413124413191e-2, 2.33520497626869185e-3,
] as const;

/** 1/sqrt(π), constante `SQRPI` de CALERF. */
const UNO_SOBRE_SQRT_PI = 5.6418958354775628695e-1;
/** Por debajo de este |x| basta el término lineal de la serie de erf. */
const X_MINUSCULO = 1.11e-16;

/** exp(-y²) calculado como exp(-ȳ²)·exp(-δ) para no perder cifras (Cody 1969). */
function expMenosCuadrado(y: number): number {
  const yTrunc = Math.trunc(y * 16) / 16;
  const delta = (y - yTrunc) * (y + yTrunc);
  return Math.exp(-yTrunc * yTrunc) * Math.exp(-delta);
}

/** erfc(|x|) en el tramo 0.46875 < |x| <= 4 (Cody 1969, tramo intermedio). */
function erfcTramoMedio(y: number): number {
  let num = CODY_C[8] * y;
  let den = y;
  for (let i = 0; i < 7; i++) {
    num = (num + CODY_C[i]) * y;
    den = (den + CODY_D[i]) * y;
  }
  const r = (num + CODY_C[7]) / (den + CODY_D[7]);
  return expMenosCuadrado(y) * r;
}

/** erfc(|x|) en el tramo |x| > 4 (Cody 1969, expansión asintótica racional). */
function erfcTramoLejano(y: number): number {
  const z = 1 / (y * y);
  let num = CODY_P[5] * z;
  let den = z;
  for (let i = 0; i < 4; i++) {
    num = (num + CODY_P[i]) * z;
    den = (den + CODY_Q[i]) * z;
  }
  let r = z * (num + CODY_P[4]) / (den + CODY_Q[4]);
  r = (UNO_SOBRE_SQRT_PI - r) / y;
  return expMenosCuadrado(y) * r;
}

/**
 * Función error erf(x) = (2/√π)∫₀ˣ e^{-t²} dt.
 * Cody WJ, Math Comp 1969;23:631-7 (tramo central del algoritmo CALERF).
 */
export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return 1;
  if (x === -Infinity) return -1;
  const y = Math.abs(x);
  if (y <= 0.46875) {
    const z = y > X_MINUSCULO ? x * x : 0;
    let num = CODY_A[4] * z;
    let den = z;
    for (let i = 0; i < 3; i++) {
      num = (num + CODY_A[i]) * z;
      den = (den + CODY_B[i]) * z;
    }
    return x * (num + CODY_A[3]) / (den + CODY_B[3]);
  }
  const c = y <= 4 ? erfcTramoMedio(y) : erfcTramoLejano(y);
  return x > 0 ? 1 - c : c - 1;
}

/**
 * Función error complementaria erfc(x) = 1 − erf(x), exacta en las colas.
 * Cody WJ, Math Comp 1969;23:631-7 (tramos intermedio y asintótico de CALERF).
 */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return 0;
  if (x === -Infinity) return 2;
  const y = Math.abs(x);
  if (y <= 0.46875) return 1 - erf(x);
  if (x < 0) {
    // 2 − erfc(|x|); para |x| grande erfc(|x|) → 0 y el resultado es 2.
    return 2 - (y <= 4 ? erfcTramoMedio(y) : erfcTramoLejano(y));
  }
  return y <= 4 ? erfcTramoMedio(y) : erfcTramoLejano(y);
}

// ---------------------------------------------------------------------------
// lgamma: Lanczos con g = 607/128 y 15 coeficientes (Godfrey)
// ---------------------------------------------------------------------------

/** g de Lanczos: 607/128. */
const LANCZOS_G = 607 / 128;

/** Coeficientes de Godfrey para g = 607/128 y n = 15 términos. */
const LANCZOS_C = [
  0.99999999999999709182, 57.156235665862923517, -59.597960355475491248,
  14.136097974741747174, -0.49191381609762019978, 0.33994649984811888699e-4,
  0.46523628927048575665e-4, -0.98374475304879564677e-4,
  0.15808870322491248884e-3, -0.21026444172410488319e-3,
  0.21743961811521264320e-3, -0.16431810653676389022e-3,
  0.84418223983852743293e-4, -0.26190838401581408670e-4,
  0.36899182659531622704e-5,
] as const;

/**
 * sen(πx) con reducción exacta del argumento; se usa en la reflexión de lgamma.
 * Devuelve exactamente 0 en los enteros para que lgamma dé +Infinity ahí.
 */
export function senoPi(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  let y = x % 2;
  if (y <= -1) y += 2;
  else if (y > 1) y -= 2;
  if (y === 0 || y === 1 || y === -1) return 0;
  if (y === 0.5) return 1;
  if (y === -0.5) return -1;
  return Math.sin(Math.PI * y);
}

/**
 * log Γ(x) por la aproximación de Lanczos (g = 607/128, 15 coeficientes de
 * Godfrey), con la fórmula de reflexión Γ(x)Γ(1−x) = π/sen(πx) para x < 0.5.
 * Numerical Recipes 3.ª ed. §6.1 («gammln»); precisión ≈ 1e-15 relativa.
 *
 * Igual que R: lgamma(0) = lgamma(−n entero) = +Infinity.
 */
export function lgamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return Infinity;
  if (x === -Infinity) return NaN;
  if (x <= 0 && Number.isInteger(x)) return Infinity;
  // Γ(1) = Γ(2) = 1: los dos ceros exactos de log Γ, que Lanczos solo alcanzaría
  // salvo medio ulp. R también los devuelve exactos.
  if (x === 1 || x === 2) return 0;

  if (x < 0.5) {
    // Reflexión: log Γ(x) = log(π/|sen(πx)|) − log Γ(1−x).
    const s = Math.abs(senoPi(x));
    if (s === 0) return Infinity;
    return Math.log(Math.PI / s) - lgamma(1 - x);
  }

  const z = x - 1;
  let suma = LANCZOS_C[0];
  for (let i = 1; i < 15; i++) suma += LANCZOS_C[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return LN_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(suma);
}

/**
 * log B(a, b) = log Γ(a) + log Γ(b) − log Γ(a+b).
 *
 * La resta directa de tres lgamma se cancela cuando los argumentos son grandes:
 * con a = b = 5e5 los sumandos valen ~6e6 y el resultado ~7e5, así que el error
 * absoluto de lgamma (≈ 1e-9) contamina la novena cifra. Por encima de 10 se usa
 * la identidad de Stirling, en la que solo intervienen logaritmos de cocientes
 * en (0, 1) y el error de Stirling `errorStirling`, que es exactamente la
 * corrección `lgammacor` del mismo desarrollo asintótico.
 *
 * Igual que R, lbeta(0, b) = +Infinity.
 */
export function lbeta(a: number, b: number): number {
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (a < 0 || b < 0) {
    throw new RangeError(`lbeta: a y b deben ser ≥ 0 (a = ${a}, b = ${b})`);
  }
  if (a === 0 || b === 0) return Infinity;
  if (a === Infinity || b === Infinity) return -Infinity;

  const p = Math.min(a, b);
  const q = Math.max(a, b);
  if (p >= 10) {
    const corr = errorStirling(p) + errorStirling(q) - errorStirling(p + q);
    return -0.5 * Math.log(q) + LN_SQRT_2PI + corr
      + (p - 0.5) * Math.log(p / (p + q)) + q * Math.log1p(-p / (p + q));
  }
  if (q >= 10) {
    const corr = errorStirling(q) - errorStirling(p + q);
    return lgamma(p) + corr + p - p * Math.log(p + q)
      + (q - 0.5) * Math.log1p(-p / (p + q));
  }
  return lgamma(p) + lgamma(q) - lgamma(p + q);
}

/**
 * log(n!) = log Γ(n+1). Definida para n ≥ 0 (real, no solo entero).
 */
export function lfactorial(n: number): number {
  if (Number.isNaN(n)) return NaN;
  if (n < 0) throw new RangeError(`lfactorial: n debe ser ≥ 0 (n = ${n})`);
  return lgamma(n + 1);
}

/**
 * log C(n, k) siguiendo la definición de R: k se redondea al entero más cercano,
 * k < 0 y (n entero con n < k) dan −Infinity, y el caso general se calcula como
 * −log(n+1) − log B(n−k+1, k+1) para evitar la cancelación de tres lgamma.
 */
export function lchoose(n: number, k: number): number {
  if (Number.isNaN(n) || Number.isNaN(k)) return NaN;
  const kr = Math.round(k);
  if (kr < 0) return -Infinity;
  if (kr === 0) return 0;
  if (kr === 1) return Math.log(Math.abs(n));
  if (n < 0) return lchoose(-n + kr - 1, kr);
  if (Number.isInteger(n)) {
    if (n < kr) return -Infinity;
    if (n - kr < 2) return lchoose(n, n - kr);
  } else if (n < kr - 1) {
    return -Infinity;
  }
  return -Math.log(n + 1) - lbeta(n - kr + 1, kr + 1);
}

// ---------------------------------------------------------------------------
// Piezas de Loader (2000) para densidades binomiales exactas con n grande
// ---------------------------------------------------------------------------

/*
 * `lchoose` pierde cifras cuando n ~ 1e6: los tres logaritmos valen ~1.3e7 y su
 * diferencia ~7e5, así que el error absoluto (≈ 1e-9) se traslada íntegro al
 * exponente de dbinom. Loader evita la resta calculando por separado el error
 * de Stirling y la divergencia de Kullback-Leibler de cada celda.
 */

/** log(n!) − log(√(2πn)·(n/e)ⁿ) tabulado para n = 0, 0.5, …, 15 (Loader 2000). */
const ERROR_STIRLING_MEDIOS = [
  0.0,
  0.1534264097200273452913848,
  0.0810614667953272582196702,
  0.0548141210519176538961390,
  0.0413406959554092940938221,
  0.03316287351993628748511048,
  0.02767792568499833914878929,
  0.02374616365629749597132920,
  0.02079067210376509311152277,
  0.01848845053267318523077934,
  0.01664469118982119216319487,
  0.01513497322191737887351255,
  0.01387612882307074799874573,
  0.01281046524292022692424986,
  0.01189670994589177009505572,
  0.01110455975820691732662991,
  0.010411265261972096497478567,
  0.009799416126158803298389475,
  0.009255462182712732917728637,
  0.008768700134139385462952823,
  0.008330563433362871256469318,
  0.007934114564314020547248100,
  0.007573675487951840794972024,
  0.007244554301320383179543912,
  0.006942840107209529865664152,
  0.006665247032707682442354394,
  0.006408994188004207068439631,
  0.006171712263039457647532867,
  0.005951370112758847735624416,
  0.005746216513010115682023589,
  0.005554733551962801371038690,
] as const;

const S0 = 1 / 12;
const S1 = 1 / 360;
const S2 = 1 / 1260;
const S3 = 1 / 1680;
const S4 = 1 / 1188;

/**
 * Error de Stirling: log(n!) − log(√(2πn)·(n/e)ⁿ).
 * Tabla exacta para n ≤ 15 en múltiplos de 1/2 y serie asintótica por encima
 * (Loader C, 2000, §5).
 */
export function errorStirling(n: number): number {
  if (n <= 15) {
    const dosN = n + n;
    if (dosN === Math.floor(dosN)) return ERROR_STIRLING_MEDIOS[dosN];
    return lgamma(n + 1) - (n + 0.5) * Math.log(n) + n - LN_SQRT_2PI;
  }
  const nn = n * n;
  if (n > 500) return (S0 - S1 / nn) / n;
  if (n > 80) return (S0 - (S1 - S2 / nn) / nn) / n;
  if (n > 35) return (S0 - (S1 - (S2 - S3 / nn) / nn) / nn) / n;
  return (S0 - (S1 - (S2 - (S3 - S4 / nn) / nn) / nn) / nn) / n;
}

/**
 * Divergencia «bd0» de Loader: x·log(x/np) + np − x, calculada por una serie
 * cuando x y np están cerca, donde la forma directa se cancela (Loader 2000, §4).
 */
export function bd0(x: number, np: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(np) || np === 0) return NaN;
  if (Math.abs(x - np) < 0.1 * (x + np)) {
    let v = (x - np) / (x + np);
    let s = (x - np) * v;
    let ej = 2 * x * v;
    v = v * v;
    for (let j = 1; j < 1000; j++) {
      ej *= v;
      const s1 = s + ej / (2 * j + 1);
      if (s1 === s) return s1;
      s = s1;
    }
  }
  return x * Math.log(x / np) + np - x;
}

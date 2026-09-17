/**
 * Proporciones pareadas de una tabla 2×2 (calculadora B3 de la especificación):
 * prueba de McNemar (1947), corrección de continuidad de Edwards (1948), prueba
 * exacta binomial sobre los pares discordantes, diferencia pareada con intervalo
 * de Wald o de Agresti-Min (2005) y razón de momios pareada b/c con el intervalo
 * derivado del de Clopper-Pearson (1934) de b/(b + c).
 *
 * Notación: filas = primera medición (prueba A, o «antes»), columnas = segunda
 * medición (prueba B, o «después»); `a` = (+,+), `b` = (+,−), `c` = (−,+),
 * `d` = (−,−); `n = a + b + c + d` y los pares discordantes son `b + c`. Solo
 * los discordantes aportan información a la prueba.
 *
 * Misma aritmética, en el mismo orden de operaciones, que el snippet de R de la
 * calculadora `mcnemar`, incluidos tres detalles de R que aquí se reproducen a
 * propósito:
 *
 *  1. `mcnemar.test(x, correct = TRUE)` aplica la corrección de Edwards SOLO
 *     cuando `b ≠ c` (`any(x - t(x) != 0)` en su código): con `b = c` el
 *     estadístico corregido es 0, no `(|b − c| − 1)²/(b + c)` = 1/(b + c).
 *  2. Con `b + c = 0` ambos estadísticos y sus valores p son `NaN` («no
 *     definido»), no 0 ni 1.
 *  3. El p exacto replica la regla bilateral de `binom.test`, con su holgura
 *     relativa de 1e-7 al contar las colas.
 *
 * Referencias: McNemar Q. Psychometrika 1947;12:153-7 · Edwards AL.
 * Psychometrika 1948;13:185-7 · Agresti A, Min Y. Stat Med 2005;24:729-40 ·
 * Newcombe RG. Stat Med 1998;17:2635-50 · Clopper CJ, Pearson ES. Biometrika
 * 1934;26:404-13.
 */
import { dbinom, pbinom, pchisq, qbeta } from '../primitivas/distribuciones.ts';
import { zNivel } from './proporciones.ts';
import type { Estimacion } from '../nucleo/tipos.ts';

/** Celdas de una tabla 2×2 pareada: a = (+,+), b = (+,−), c = (−,+), d = (−,−). */
export interface TablaPareada {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Métodos de intervalo para la diferencia pareada δ. */
export const METODOS_DELTA = ['wald', 'agresti-min'] as const;
export type MetodoDelta = (typeof METODOS_DELTA)[number];

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS_MCNEMAR = [
  'n',
  'n_disc',
  'p_a',
  'p_b',
  'chi2',
  'p_chi2',
  'chi2_edwards',
  'p_edwards',
  'p_exacta',
  'delta',
  'or_pareado',
] as const;

/** Holgura relativa con la que `binom.test` compara densidades al sumar la cola opuesta. */
const REL_ERR = 1 + 1e-7;

/** Lanza `RangeError` si alguna celda no es un entero ≥ 0 o si la tabla está vacía (n = 0). */
export function validarPareada(t: TablaPareada): void {
  for (const v of [t.a, t.b, t.c, t.d]) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError('entrada_invalida: las celdas deben ser enteros ≥ 0');
  }
  if (t.a + t.b + t.c + t.d < 1) throw new RangeError('entrada_invalida: la tabla necesita al menos un par (n ≥ 1)');
}

/**
 * χ² de McNemar sin corrección: (b − c)²/(b + c), con 1 grado de libertad.
 * `NaN` cuando no hay pares discordantes, igual que `mcnemar.test`.
 */
export function chi2McNemar(b: number, c: number): number {
  return (b - c) ** 2 / (b + c);
}

/**
 * χ² de McNemar con la corrección de continuidad de Edwards (1948):
 * (|b − c| − 1)²/(b + c). Como `mcnemar.test(correct = TRUE)`, la corrección NO
 * se aplica cuando b = c (el estadístico queda en 0) y el resultado es `NaN`
 * cuando b + c = 0.
 */
export function chi2Edwards(b: number, c: number): number {
  return (b === c ? 0 : (Math.abs(b - c) - 1) ** 2) / (b + c);
}

/**
 * Valor p bilateral de la prueba binomial exacta, replicando paso a paso la
 * rama `two.sided` de `stats::binom.test`: se suma la cola del lado observado y
 * todos los valores de la cola opuesta cuya densidad no supera la observada
 * multiplicada por 1 + 1e-7.
 *
 * @throws {RangeError} si (x, m) no son conteos válidos con m ≥ 1.
 */
export function pBinomialBilateral(x: number, m: number, p = 0.5): number {
  if (!Number.isInteger(x) || !Number.isInteger(m) || m < 1 || x < 0 || x > m) {
    throw new RangeError('entrada_invalida: se requieren enteros con 0 ≤ x ≤ m y m ≥ 1');
  }
  if (p === 0) return x === 0 ? 1 : 0;
  if (p === 1) return x === m ? 1 : 0;
  const d = dbinom(x, m, p);
  const media = m * p;
  if (x === media) return 1;
  if (x < media) {
    let y = 0;
    for (let i = Math.ceil(media); i <= m; i += 1) {
      if (dbinom(i, m, p) <= d * REL_ERR) y += 1;
    }
    return pbinom(x, m, p) + pbinom(m - y, m, p, false);
  }
  let y = 0;
  for (let i = 0; i <= Math.floor(media); i += 1) {
    if (dbinom(i, m, p) <= d * REL_ERR) y += 1;
  }
  return pbinom(y - 1, m, p) + pbinom(x - 1, m, p, false);
}

/** p exacto de McNemar: prueba binomial bilateral de b entre los b + c discordantes. `NaN` sin discordantes. */
export function pExactaMcNemar(b: number, c: number): number {
  return b + c > 0 ? pBinomialBilateral(b, b + c, 0.5) : NaN;
}

/**
 * Diferencia de proporciones pareadas δ = (b − c)/n.
 *
 * La estimación puntual es SIEMPRE (b − c)/n; solo cambia el intervalo:
 *
 * - `wald`: δ ± z·√((b + c) − (b − c)²/n)/n (como `PropCIs::diffpropci.Wald.mp`,
 *   que reporta el signo contrario porque parte de (c − b)/n).
 * - `agresti-min`: intervalo de Agresti y Min (2005), centrado en el estimador
 *   ajustado (b − c)/(n + 2) con error estándar √((b + c + 1) − (b − c)²/(n + 2))/(n + 2)
 *   y recortado a [−1, 1] (como `PropCIs::diffpropci.mp`).
 */
export function deltaPareada(
  b: number,
  c: number,
  n: number,
  op: { nivel?: number; metodo?: MetodoDelta } = {},
): Estimacion {
  const nivel = op.nivel ?? 0.95;
  const metodo: MetodoDelta = op.metodo ?? 'wald';
  const z = zNivel(nivel);
  const est = (b - c) / n;
  if (metodo === 'agresti-min') {
    const [lo, hi] = limitesAgrestiMin(b, c, n, z);
    return { valor: est, ic: [Math.max(-1, lo), Math.min(1, hi)], nivel, metodo: 'agresti-min' };
  }
  const se = Math.sqrt(b + c - (b - c) ** 2 / n) / n;
  return { valor: est, ic: [est - z * se, est + z * se], nivel, metodo: 'wald' };
}

/**
 * Límites de Agresti y Min (2005) ANTES de recortarlos a [−1, 1]: el estimador
 * ajustado (b − c)/(n + 2) más o menos z veces su error estándar. Es el único
 * sitio donde vive esa aritmética, para que el intervalo y el aviso de recorte
 * no puedan desincronizarse.
 */
function limitesAgrestiMin(b: number, c: number, n: number, z: number): [number, number] {
  const est = (b - c) / (n + 2);
  const se = Math.sqrt(b + c + 1 - (b - c) ** 2 / (n + 2)) / (n + 2);
  return [est - z * se, est + z * se];
}

/** ¿El intervalo de Agresti-Min tocó alguno de los topes −1 o 1? */
export function agrestiMinRecortado(b: number, c: number, n: number, nivel = 0.95): boolean {
  const [lo, hi] = limitesAgrestiMin(b, c, n, zNivel(nivel));
  return lo < -1 || hi > 1;
}

/**
 * Razón de momios pareada b/c con el intervalo que se obtiene al pasar el
 * intervalo de Clopper-Pearson de π = b/(b + c) a la escala de momios,
 * π/(1 − π) (Fleiss, Levin y Paik 2003, cap. 13). Sin pares discordantes la
 * razón no está definida y no hay intervalo.
 *
 * Los extremos son exactos, no recortados: con b = 0 el límite inferior es 0 y
 * con c = 0 el superior es ∞, igual que en R.
 */
export function orPareado(b: number, c: number, nivel = 0.95): Estimacion {
  if (!(nivel > 0 && nivel < 1)) throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0 y 1');
  if (b + c === 0) return { valor: NaN, ic: [NaN, NaN], nivel, metodo: 'clopper-pearson' };
  const alfa = 1 - nivel;
  const pl = b === 0 ? 0 : qbeta(alfa / 2, b, c + 1);
  const pu = c === 0 ? 1 : qbeta(1 - alfa / 2, b + 1, c);
  return { valor: b / c, ic: [pl / (1 - pl), pu / (1 - pu)], nivel, metodo: 'clopper-pearson' };
}

/** Salidas de la calculadora `mcnemar`, en el orden de `SALIDAS_MCNEMAR`. */
export type ValoresMcNemar = Record<(typeof SALIDAS_MCNEMAR)[number], Estimacion>;

/**
 * Núcleo de la calculadora B3: las once salidas de la tabla pareada.
 *
 * @throws {RangeError} si las celdas no son enteros ≥ 0, si n = 0, si el nivel
 * no está en (0, 1) o si el método de la diferencia no es uno de los admitidos.
 */
export function mcnemar(
  a: number,
  b: number,
  c: number,
  d: number,
  op: { nivel?: number; metodo?: MetodoDelta } = {},
): ValoresMcNemar {
  validarPareada({ a, b, c, d });
  const nivel = op.nivel ?? 0.95;
  const metodo: MetodoDelta = op.metodo ?? 'wald';
  if (!(METODOS_DELTA as readonly string[]).includes(metodo)) {
    throw new RangeError(`entrada_invalida: método de la diferencia desconocido (${String(metodo)})`);
  }
  if (!(nivel > 0 && nivel < 1)) throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0 y 1');

  const n = a + b + c + d;
  const chi2 = chi2McNemar(b, c);
  const edwards = chi2Edwards(b, c);
  return {
    n: { valor: n, metodo: 'puntual' },
    n_disc: { valor: b + c, metodo: 'puntual' },
    p_a: { valor: (a + b) / n, metodo: 'puntual' },
    p_b: { valor: (a + c) / n, metodo: 'puntual' },
    chi2: { valor: chi2, metodo: 'sin-correccion' },
    p_chi2: { valor: pchisq(chi2, 1, false), metodo: 'sin-correccion' },
    chi2_edwards: { valor: edwards, metodo: 'edwards' },
    p_edwards: { valor: pchisq(edwards, 1, false), metodo: 'edwards' },
    p_exacta: { valor: pExactaMcNemar(b, c), metodo: 'binomial-exacto' },
    delta: deltaPareada(b, c, n, { nivel, metodo }),
    or_pareado: orPareado(b, c, nivel),
  };
}

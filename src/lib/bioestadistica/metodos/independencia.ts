/**
 * Pruebas de independencia en una tabla 2×2 (calculadora B2 de la
 * especificación): χ² de Pearson, χ² con la corrección de Yates tal como la
 * acota R, χ² «N−1» de Campbell (2007), prueba exacta de Fisher bilateral
 * («minlike») y razón de momios condicional de `fisher.test` con su intervalo,
 * más el coeficiente φ con signo.
 *
 * Notación de asociación: filas = grupo o exposición (1, 2), columnas =
 * desenlace (sí, no): a, b / c, d; n₁ = a + b, n₀ = c + d (totales de fila),
 * m₁ = a + c, m₀ = b + d (totales de columna), n = a + b + c + d.
 *
 * Todo reproduce `stats::chisq.test` y `stats::fisher.test` de R hasta el
 * detalle, porque el snippet de R de la calculadora es el oráculo:
 *
 * - `chisq.test` calcula `sum((abs(O − E) − YATES)^2 / E)` recorriendo la
 *   matriz por columnas (a, c, b, d) y con `YATES = min(0.5, |O − E|)` sobre
 *   TODAS las celdas (en 2×2 las cuatro diferencias son iguales). Si
 *   |ad − bc| < n/2 la corrección deja el estadístico en 0.
 * - `fisher.test` trabaja con la hipergeométrica no central: soporte
 *   `lo…hi`, `logdc = dhyper(soporte, m, n, k, log = TRUE)` y la familia
 *   `dnhyper`/`mnhyper`/`pnhyper`. El p bilateral suma las probabilidades no
 *   mayores que la observada con tolerancia relativa `1 + 1e-7`; la estimación
 *   puntual es la máxima verosimilitud condicional y el intervalo, el par de
 *   valores del parámetro que dejan α/2 en cada cola.
 * - Las raíces de `fisher.test` las resuelve `uniroot`, cuya tolerancia por
 *   omisión es `.Machine$double.eps^0.25 ≈ 1.22e-4`: la estimación y el
 *   intervalo del OR condicional que publica R están definidos POR esa
 *   tolerancia, así que aquí se reproduce `uniroot` (algoritmo zeroin) con la
 *   misma tolerancia y la misma sucesión de iterados. Ver `uniroot` más abajo.
 *
 * Referencias: Pearson K. Philos Mag 1900;50:157-75 · Yates F. J R Stat Soc
 * Suppl 1934;1:217-35 · Fisher RA. J R Stat Soc 1935;98:39-82 · Cochran WG.
 * Biometrics 1954;10:417-51 · Campbell I. Stat Med 2007;26:3661-75 · Yule GU.
 * J R Stat Soc 1912;75:579-652 · Cohen J. Statistical Power Analysis for the
 * Behavioral Sciences, 2.ª ed., 1988.
 */
import { uniroot } from '../primitivas/raices.ts';
import { dhyper, pchisq, phyper } from '../primitivas/distribuciones.ts';
import { validarCeldas } from './razones.ts';
import type { Tabla2x2 } from './razones.ts';
import type { Estimacion } from '../nucleo/tipos.ts';

/** Ids de salida: claves del JSON de R = celdas de la interfaz = campos del fixture. */
export const SALIDAS_INDEPENDENCIA = [
  'n',
  'e_a',
  'e_b',
  'e_c',
  'e_d',
  'e_min',
  'chi2',
  'p_chi2',
  'chi2_yates',
  'p_yates',
  'chi2_n1',
  'p_n1',
  'p_fisher',
  'or_cond',
  'phi',
] as const;
export type SalidaIndependencia = (typeof SALIDAS_INDEPENDENCIA)[number];
export type ValoresIndependencia = Record<SalidaIndependencia, Estimacion>;

/** Prueba que recomienda la regla de Cochran (1954) para estos datos. */
export type PruebaRecomendada = 'pearson' | 'fisher';

/** Dirección de la asociación según el signo de φ. */
export type SentidoAsociacion = 'positiva' | 'negativa' | 'nula';

/**
 * Lanza `RangeError` si las celdas no son enteros ≥ 0 o si alguna fila o
 * alguna columna suma 0: con un margen en 0 las frecuencias esperadas valen 0,
 * χ² y φ quedan en 0/0 y no hay independencia que contrastar.
 */
export function validarTablaIndependencia(a: number, b: number, c: number, d: number): void {
  validarCeldas({ a, b, c, d });
  if (a + b === 0 || c + d === 0 || a + c === 0 || b + d === 0) {
    throw new RangeError('entrada_invalida: cada fila y cada columna de la tabla debe sumar al menos 1');
  }
}

function exigirNivel(nivel: number): void {
  if (!(nivel > 0 && nivel < 1)) {
    throw new RangeError(`entrada_invalida: el nivel de confianza debe estar entre 0 y 1 (nivel = ${nivel})`);
  }
}

// ---------------------------------------------------------------------------
// Frecuencias esperadas y estadísticos χ²
// ---------------------------------------------------------------------------

/** Frecuencias esperadas bajo independencia, celda a celda, y la más pequeña. */
export interface Esperados {
  e_a: number;
  e_b: number;
  e_c: number;
  e_d: number;
  e_min: number;
}

/**
 * `E_ij = (total de la fila i)(total de la columna j) / n`, igual que
 * `outer(rowSums(m), colSums(m)) / n` en R.
 */
export function esperados(t: Tabla2x2): Esperados {
  const { a, b, c, d } = t;
  const n = a + b + c + d;
  const f1 = a + b;
  const f2 = c + d;
  const c1 = a + c;
  const c2 = b + d;
  const e_a = (f1 * c1) / n;
  const e_b = (f1 * c2) / n;
  const e_c = (f2 * c1) / n;
  const e_d = (f2 * c2) / n;
  return { e_a, e_b, e_c, e_d, e_min: Math.min(e_a, e_b, e_c, e_d) };
}

/**
 * `sum((|O − E| − corr)^2 / E)` en el orden en que R recorre la matriz (por
 * columnas: a, c, b, d), para que la suma en doble precisión sea la misma.
 */
function estadisticoChi2(t: Tabla2x2, e: Esperados, corr: number): number {
  const termino = (o: number, esp: number): number => {
    const r = Math.abs(o - esp) - corr;
    return (r * r) / esp;
  };
  return termino(t.a, e.e_a) + termino(t.c, e.e_c) + termino(t.b, e.e_b) + termino(t.d, e.e_d);
}

/**
 * Corrección de continuidad tal como la acota `chisq.test`:
 * `YATES = min(0.5, |O − E|)` sobre las cuatro celdas. En una tabla 2×2 las
 * cuatro diferencias valen |ad − bc|/n, así que la corrección queda por debajo
 * de 0.5 cuando |ad − bc| < n/2 y entonces el estadístico corregido es 0.
 */
export function correccionYates(t: Tabla2x2, e: Esperados): number {
  const dif = Math.min(
    Math.abs(t.a - e.e_a),
    Math.abs(t.c - e.e_c),
    Math.abs(t.b - e.e_b),
    Math.abs(t.d - e.e_d),
  );
  return Math.min(0.5, dif);
}

/** χ² de Pearson (1900) con 1 grado de libertad, sin corrección. */
export function chi2Pearson(t: Tabla2x2): number {
  return estadisticoChi2(t, esperados(t), 0);
}

/** χ² con la corrección de continuidad de Yates (1934), acotada como en R. */
export function chi2Yates(t: Tabla2x2): number {
  const e = esperados(t);
  return estadisticoChi2(t, e, correccionYates(t, e));
}

/** χ² «N−1» de Campbell (2007): el de Pearson multiplicado por (n − 1)/n. */
export function chi2N1(chi2: number, n: number): number {
  return (chi2 * (n - 1)) / n;
}

/** Valor p de un estadístico χ² con 1 grado de libertad (cola superior). */
export function pChi2(estadistico: number): number {
  return pchisq(estadistico, 1, false);
}

/**
 * Coeficiente φ con signo (Yule 1912): (ad − bc)/√(n₁n₀m₁m₀). En una tabla 2×2
 * |φ| = √(χ²/n); el signo indica el sentido de la asociación.
 */
export function phiCoef(t: Tabla2x2): number {
  const { a, b, c, d } = t;
  return (a * d - b * c) / Math.sqrt((a + b) * (c + d) * ((a + c) * (b + d)));
}

/**
 * Regla de Cochran (1954): con alguna frecuencia esperada menor de 5 o con
 * n < 20 la aproximación χ² es dudosa y se recomienda la prueba exacta de
 * Fisher. (Con n < 20 la esperada mínima nunca llega a 5, porque
 * E_min ≤ n/4; las dos condiciones se enuncian por separado igual que en la
 * literatura.) La corrección de Yates no se recomienda: es conservadora
 * (Campbell 2007), aunque se muestre para comparar.
 */
export function pruebaRecomendada(n: number, eMin: number): PruebaRecomendada {
  return n < 20 || eMin < 5 ? 'fisher' : 'pearson';
}

/** Sentido de la asociación a partir del signo de φ. `NaN` → 'nula'. */
export function sentidoPhi(phi: number): SentidoAsociacion {
  if (Number.isNaN(phi) || phi === 0) return 'nula';
  return phi > 0 ? 'positiva' : 'negativa';
}

// ---------------------------------------------------------------------------
// Prueba exacta de Fisher: hipergeométrica no central
// ---------------------------------------------------------------------------

/**
 * Tolerancia por omisión de `uniroot` en R (`.Machine$double.eps^0.25`): la que
 * usa `fisher.test` y con la que hay que resolver para reproducir sus cifras.
 * La traducción de `R_zeroin2` vive en `primitivas/raices.ts` (`uniroot`).
 */
export { TOL_UNIROOT } from '../primitivas/raices.ts';

/**
 * Núcleo condicional de `fisher.test`: el soporte de a dados los márgenes y la
 * familia de funciones que R define dentro de la prueba.
 *
 * Parametrización de `dhyper(x, m, n, k)` en R: `m` = total de la columna 1
 * (a + c), `n` = total de la columna 2 (b + d) y `k` = total de la fila 1
 * (a + b); la celda observada es x = a.
 */
export interface NucleoFisher {
  /** Extremos del soporte: `max(0, k − n)` y `min(k, m)`. */
  lo: number;
  hi: number;
  /** Celda observada a. */
  x: number;
  soporte: readonly number[];
  /** `dhyper(soporte, m, n, k, log = TRUE)`. */
  logdc: readonly number[];
  /** Distribución no central normalizada para un parámetro `ncp` (razón de momios). */
  dnhyper(ncp: number): number[];
  /** Media de la hipergeométrica no central. */
  mnhyper(ncp: number): number;
  /** Cola acumulada (inferior o superior) de la hipergeométrica no central. */
  pnhyper(q: number, ncp: number, colaSuperior: boolean): number;
}

/** Construye el núcleo condicional de una tabla 2×2, como hace `fisher.test`. */
export function nucleoFisher(t: Tabla2x2): NucleoFisher {
  const { a, b, c, d } = t;
  const m = a + c;
  const n = b + d;
  const k = a + b;
  const x = a;
  const lo = Math.max(0, k - n);
  const hi = Math.min(k, m);

  const soporte: number[] = [];
  for (let s = lo; s <= hi; s += 1) soporte.push(s);
  const logdc = soporte.map((s) => dhyper(s, m, n, k, true));

  const dnhyper = (ncp: number): number[] => {
    const ln = Math.log(ncp);
    const d0 = logdc.map((v, i) => v + ln * (soporte[i] as number));
    let maximo = Number.NEGATIVE_INFINITY;
    for (const v of d0) if (v > maximo) maximo = v;
    const e = d0.map((v) => Math.exp(v - maximo));
    let total = 0;
    for (const v of e) total += v;
    return e.map((v) => v / total);
  };

  const mnhyper = (ncp: number): number => {
    if (ncp === 0) return lo;
    if (ncp === Number.POSITIVE_INFINITY) return hi;
    const dens = dnhyper(ncp);
    let s = 0;
    for (let i = 0; i < dens.length; i += 1) s += (soporte[i] as number) * (dens[i] as number);
    return s;
  };

  const pnhyper = (q: number, ncp: number, colaSuperior: boolean): number => {
    // R usa aquí la celda observada `x`, no `q` (solo se llama con q = x).
    if (ncp === 1) return colaSuperior ? phyper(x - 1, m, n, k, false) : phyper(x, m, n, k);
    if (ncp === 0) return (colaSuperior ? q <= lo : q >= lo) ? 1 : 0;
    if (ncp === Number.POSITIVE_INFINITY) return (colaSuperior ? q <= hi : q >= hi) ? 1 : 0;
    const dens = dnhyper(ncp);
    let s = 0;
    for (let i = 0; i < dens.length; i += 1) {
      const sop = soporte[i] as number;
      if (colaSuperior ? sop >= q : sop <= q) s += dens[i] as number;
    }
    return s;
  };

  return { lo, hi, x, soporte, logdc, dnhyper, mnhyper, pnhyper };
}

/**
 * Valor p bilateral «minlike» de la prueba exacta de Fisher: suma de las
 * probabilidades de las tablas no más probables que la observada, con la misma
 * tolerancia relativa para los empates que usa `fisher.test` (1 + 1e-7).
 */
export function pFisherBilateral(t: Tabla2x2, nucleo = nucleoFisher(t)): number {
  const relErr = 1 + 1e-7;
  const dens = nucleo.dnhyper(1);
  const umbral = (dens[nucleo.x - nucleo.lo] as number) * relErr;
  let s = 0;
  for (const v of dens) if (v <= umbral) s += v;
  return s;
}

/** Máxima verosimilitud condicional de la razón de momios (`fisher.test$estimate`). */
function mleCondicional(nf: NucleoFisher): number {
  const { lo, hi, x } = nf;
  if (x === lo) return 0;
  if (x === hi) return Number.POSITIVE_INFINITY;
  const mu = nf.mnhyper(1);
  if (mu > x) return uniroot((t) => nf.mnhyper(t) - x, 0, 1);
  if (mu < x) return 1 / uniroot((t) => nf.mnhyper(1 / t) - x, Number.EPSILON, 1);
  return 1;
}

/** Límite superior del intervalo del OR condicional (`ncp.U` de `fisher.test`). */
function ncpSuperior(nf: NucleoFisher, alfa: number): number {
  const { hi, x } = nf;
  if (x === hi) return Number.POSITIVE_INFINITY;
  const p = nf.pnhyper(x, 1, false);
  if (p < alfa) return uniroot((t) => nf.pnhyper(x, t, false) - alfa, 0, 1);
  if (p > alfa) return 1 / uniroot((t) => nf.pnhyper(x, 1 / t, false) - alfa, Number.EPSILON, 1);
  return 1;
}

/** Límite inferior del intervalo del OR condicional (`ncp.L` de `fisher.test`). */
function ncpInferior(nf: NucleoFisher, alfa: number): number {
  const { lo, x } = nf;
  if (x === lo) return 0;
  const p = nf.pnhyper(x, 1, true);
  if (p > alfa) return uniroot((t) => nf.pnhyper(x, t, true) - alfa, 0, 1);
  if (p < alfa) return 1 / uniroot((t) => nf.pnhyper(x, 1 / t, true) - alfa, Number.EPSILON, 1);
  return 1;
}

/**
 * Razón de momios condicional de `fisher.test` con su intervalo bilateral al
 * nivel pedido. En los bordes del soporte la estimación es 0 o ∞ y el límite
 * correspondiente también, igual que en R.
 */
export function orCondicional(t: Tabla2x2, nivel = 0.95, nucleo = nucleoFisher(t)): Estimacion {
  exigirNivel(nivel);
  const alfa = (1 - nivel) / 2;
  return {
    valor: mleCondicional(nucleo),
    ic: [ncpInferior(nucleo, alfa), ncpSuperior(nucleo, alfa)],
    nivel,
    metodo: 'fisher-condicional',
  };
}

/** ¿La celda observada cae en un extremo del soporte (OR condicional 0 o ∞)? */
export function orEnBorde(t: Tabla2x2, nucleo = nucleoFisher(t)): boolean {
  return nucleo.x === nucleo.lo || nucleo.x === nucleo.hi;
}

// ---------------------------------------------------------------------------
// Conjunto completo
// ---------------------------------------------------------------------------

export interface OpcionesIndependencia {
  nivel?: number;
}

/**
 * Las quince salidas de la calculadora B2 para una tabla 2×2, en el mismo
 * orden y con los mismos nombres que el JSON del snippet de R.
 */
export function independencia2x2(
  a: number,
  b: number,
  c: number,
  d: number,
  op: OpcionesIndependencia = {},
): ValoresIndependencia {
  validarTablaIndependencia(a, b, c, d);
  const nivel = op.nivel ?? 0.95;
  exigirNivel(nivel);

  const t: Tabla2x2 = { a, b, c, d };
  const n = a + b + c + d;
  const e = esperados(t);
  const chi2 = estadisticoChi2(t, e, 0);
  const yates = estadisticoChi2(t, e, correccionYates(t, e));
  const n1 = chi2N1(chi2, n);
  const nucleo = nucleoFisher(t);

  const puntual = (valor: number): Estimacion => ({ valor, metodo: 'puntual' });
  return {
    n: puntual(n),
    e_a: puntual(e.e_a),
    e_b: puntual(e.e_b),
    e_c: puntual(e.e_c),
    e_d: puntual(e.e_d),
    e_min: puntual(e.e_min),
    chi2: { valor: chi2, metodo: 'sin-correccion' },
    p_chi2: { valor: pChi2(chi2), metodo: 'sin-correccion' },
    chi2_yates: { valor: yates, metodo: 'yates' },
    p_yates: { valor: pChi2(yates), metodo: 'yates' },
    chi2_n1: { valor: n1, metodo: 'n-menos-1' },
    p_n1: { valor: pChi2(n1), metodo: 'n-menos-1' },
    p_fisher: { valor: pFisherBilateral(t, nucleo), metodo: 'fisher-exacto' },
    or_cond: orCondicional(t, nivel, nucleo),
    phi: { valor: phiCoef(t), metodo: 'puntual' },
  };
}

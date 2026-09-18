/**
 * Kappa de Cohen, simple y ponderada, sobre una tabla k×k de acuerdo entre dos
 * evaluadores (calculadora D1 de la especificación): acuerdo observado y
 * esperado, κ, el error estándar asintótico de Fleiss, Cohen y Everitt (1969)
 * con su intervalo de Wald, la prueba frente a κ = 0, el κ máximo que permiten
 * los marginales y, con dos categorías, PABAK y los índices de prevalencia y de
 * sesgo de Byrt, Bishop y Carlin (1993).
 *
 * Misma aritmética y mismo orden de sumas que el snippet de R de la calculadora
 * `kappa`. Tres detalles que se reproducen a propósito:
 *
 * - Las sumas sobre la tabla recorren primero las columnas y luego las filas,
 *   que es el orden en que `sum()` de R recorre una matriz (column-major).
 * - El intervalo usa la varianza asintótica con las celdas OBSERVADAS; la
 *   prueba frente a κ = 0 usa la varianza bajo la hipótesis nula, con las
 *   celdas ESPERADAS. Son dos fórmulas distintas del mismo artículo de 1969, y
 *   `irr::kappa2` publica la segunda: por eso el z de la página es el suyo y no
 *   κ/EE.
 * - En el acuerdo perfecto el radicando del EE es 0 salvo por el redondeo; el
 *   `Math.max(0, …)` solo absorbe ese ulp y deja EE = 0 e IC [1, 1].
 *
 * Nada se redondea: `NaN` significa «no definido» (PABAK y los índices de Byrt
 * con más de dos categorías), igual que el `NA_real_` del snippet.
 *
 * Referencias: Cohen J. Educ Psychol Meas 1960;20:37-46 · Cohen J. Psychol Bull
 * 1968;70:213-20 · Fleiss JL, Cohen J, Everitt BS. Psychol Bull 1969;72:323-7 ·
 * Landis JR, Koch GG. Biometrics 1977;33:159-74 · Byrt T, Bishop J, Carlin JB.
 * J Clin Epidemiol 1993;46:423-9.
 */
import { pnorm, qnorm } from '../primitivas/distribuciones.ts';
import type { Estimacion } from '../nucleo/tipos.ts';

/** Esquema de pesos de acuerdo; `lineal` y `cuadratica` solo tienen sentido con categorías ordinales. */
export type Ponderacion = 'ninguna' | 'lineal' | 'cuadratica';

/** Opciones del selector, en el orden en que se presentan. */
export const PONDERACIONES = ['ninguna', 'lineal', 'cuadratica'] as const;

/** Nombre del esquema en `irr::kappa2` (el que viaja al snippet de R). */
export const TIPO_R: Readonly<Record<Ponderacion, 'unweighted' | 'equal' | 'squared'>> = {
  ninguna: 'unweighted',
  lineal: 'equal',
  cuadratica: 'squared',
};

/** Número mínimo y máximo de categorías de la tabla. */
export const K_MIN = 2;
export const K_MAX = 10;

/** n por debajo del cual el error estándar asintótico no es de fiar. */
export const N_PEQUENO = 30;

/** Acuerdo observado a partir del cual la paradoja de kappa es plausible (Feinstein y Cicchetti). */
export const PO_PARADOJA = 0.8;

/** κ por debajo del cual la paradoja de kappa es plausible. */
export const KAPPA_PARADOJA = 0.4;

/** Ids de salida = claves del JSON de R = celdas de la interfaz = claves del fixture. */
export const SALIDAS_KAPPA = [
  'n',
  'po',
  'pe',
  'kappa',
  'ee',
  'z_h0',
  'p_h0',
  'kappa_max',
  'pabak',
  'indice_prevalencia',
  'indice_sesgo',
] as const;

export type SalidaKappa = (typeof SALIDAS_KAPPA)[number];

/** Valores de una tabla de acuerdo, en el orden de `SALIDAS_KAPPA`. */
export type ValoresKappa = Record<SalidaKappa, Estimacion>;

export interface OpcionesKappa {
  /** Nivel del intervalo de Wald de κ (0.95 por omisión). */
  nivel?: number;
  /** Esquema de pesos de acuerdo (`ninguna` por omisión). */
  ponderacion?: Ponderacion;
}

/** Tabla capturada una vez quitadas las categorías que nadie usó. */
export interface TablaReducida {
  /** Número de categorías que quedan tras eliminar las vacías. */
  k: number;
  /** Índices (base 0, sobre la tabla capturada) de las categorías sin observaciones en fila ni columna. */
  vacias: number[];
  /** Tabla ya sin las categorías vacías, por filas. */
  tabla: number[][];
  /** Casos clasificados. */
  n: number;
  /**
   * Casos de la diagonal: en cuántos coincidieron EXACTAMENTE los dos
   * evaluadores. Es el acuerdo que se cuenta sin pesos, y no coincide con `po`
   * cuando hay ponderación, porque entonces `po` incluye el crédito parcial de
   * las categorías vecinas. La interfaz necesita los dos para no afirmar que
   * coincidieron en un 86.5 % cuando coincidieron en 76 de 100.
   */
  exactos: number;
}

export interface ResultadoKappa extends TablaReducida {
  /** Proporciones observadas de la tabla reducida, por filas. */
  p: number[][];
  /** Marginales de fila (evaluador A) y de columna (evaluador B). */
  marginales: { filas: number[]; columnas: number[] };
  /** Matriz de pesos de acuerdo aplicada. */
  w: number[][];
  valores: ValoresKappa;
}

/**
 * Lado de una tabla cuadrada pegada como lista por filas: √(x.length) cuando la
 * lista tiene un número cuadrado de celdas, `NaN` cuando no.
 */
export function ladoTabla(x: readonly number[]): number {
  if (x.length === 0) return Number.NaN;
  const k = Math.round(Math.sqrt(x.length));
  return k * k === x.length ? k : Number.NaN;
}

/** Lista por filas → matriz k×k. La longitud tiene que ser exactamente k². */
export function comoMatriz(x: readonly number[], k: number): number[][] {
  if (!Number.isInteger(k) || k < 1 || x.length !== k * k) {
    throw new RangeError(`entrada_invalida: se esperaban ${k * k} celdas y llegaron ${x.length}`);
  }
  const m: number[][] = [];
  for (let i = 0; i < k; i += 1) m.push(x.slice(i * k, (i + 1) * k) as number[]);
  return m;
}

/**
 * Pesos de acuerdo w_ij (Cohen 1968): sin ponderar la identidad; lineales
 * 1 − |i − j|/(k − 1); cuadráticos 1 − ((i − j)/(k − 1))². Con k = 2 los tres
 * esquemas coinciden con la identidad.
 */
export function pesos(k: number, ponderacion: Ponderacion): number[][] {
  const w: number[][] = [];
  for (let i = 0; i < k; i += 1) {
    const fila: number[] = [];
    for (let j = 0; j < k; j += 1) {
      const d = i - j;
      if (ponderacion === 'lineal') fila.push(1 - Math.abs(d) / (k - 1));
      else if (ponderacion === 'cuadratica') fila.push(1 - (d / (k - 1)) ** 2);
      else fila.push(d === 0 ? 1 : 0);
    }
    w.push(fila);
  }
  return w;
}

/** Índices de las categorías que nadie usó: fila y columna en 0 a la vez. */
export function categoriasVacias(tabla: readonly (readonly number[])[]): number[] {
  const k = tabla.length;
  const fuera: number[] = [];
  for (let i = 0; i < k; i += 1) {
    let suma = 0;
    for (let j = 0; j < k; j += 1) suma += (tabla[i] as readonly number[])[j] as number;
    for (let j = 0; j < k; j += 1) suma += (tabla[j] as readonly number[])[i] as number;
    if (suma === 0) fuera.push(i);
  }
  return fuera;
}

/** Quita de la tabla las filas y columnas indicadas (las categorías vacías). */
function sinCategorias(tabla: readonly (readonly number[])[], fuera: readonly number[]): number[][] {
  const quitar = new Set(fuera);
  const salida: number[][] = [];
  for (let i = 0; i < tabla.length; i += 1) {
    if (quitar.has(i)) continue;
    const fila: number[] = [];
    for (let j = 0; j < tabla.length; j += 1) {
      if (!quitar.has(j)) fila.push((tabla[i] as readonly number[])[j] as number);
    }
    salida.push(fila);
  }
  return salida;
}

/** Suma de una matriz en el orden de `sum()` de R: columna por columna. */
function sumaMatriz(k: number, celda: (i: number, j: number) => number): number {
  let s = 0;
  for (let j = 0; j < k; j += 1) {
    for (let i = 0; i < k; i += 1) s += celda(i, j);
  }
  return s;
}

/**
 * Tabla con los mismos marginales que maximiza el acuerdo ponderado, por la
 * regla de la esquina noroeste. Con pesos lineales o cuadráticos alcanza el
 * óptimo del problema de transporte, porque |i − j| y (i − j)² cumplen la
 * condición de Monge; sin ponderar NO lo alcanza, y ahí el máximo tiene forma
 * cerrada: Σ_i mín(p_i·, p·_i), es decir, el mínimo entre el marginal de fila y
 * el de COLUMNA DE LA MISMA categoría (no el de otra).
 */
export function esquinaNoroeste(filas: readonly number[], columnas: readonly number[]): number[][] {
  const a = [...filas];
  const b = [...columnas];
  const m: number[][] = a.map(() => b.map(() => 0));
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const v = Math.min(a[i] as number, b[j] as number);
    (m[i] as number[])[j] = ((m[i] as number[])[j] as number) + v;
    a[i] = (a[i] as number) - v;
    b[j] = (b[j] as number) - v;
    if ((a[i] as number) <= 0) i += 1;
    else j += 1;
  }
  return m;
}

/** Comprueba que la lista pegada sea una tabla cuadrada de conteos enteros no negativos. */
function validarTabla(x: readonly number[]): number {
  const k = ladoTabla(x);
  if (!Number.isFinite(k) || k < K_MIN || k > K_MAX) {
    throw new RangeError(`entrada_invalida: la tabla debe ser cuadrada, de ${K_MIN}×${K_MIN} a ${K_MAX}×${K_MAX}`);
  }
  for (const celda of x) {
    if (typeof celda !== 'number' || !Number.isInteger(celda) || celda < 0) {
      throw new RangeError('entrada_invalida: las celdas deben ser enteros mayores o iguales que 0');
    }
  }
  return k;
}

/**
 * Prueba frente a κ = 0, reproduciendo `irr::kappa2` PASO A PASO, incluida su
 * agrupación de las sumas.
 *
 * No basta con la fórmula: `kappa2` trabaja con los CONTEOS y divide entre n lo
 * más tarde posible (`sum(x*w)/n`, `outer(tm1, tm2)/n`), mientras que el resto
 * de la calculadora parte de `p = x/n`. Las dos rutas difieren en un ulp, y con
 * acuerdo esperado cercano a 1 ese ulp se amplifica: κ divide entre (1 − pₑ),
 * así que en la tabla [9998, 1, 1, 0] una diferencia de 2.2e-16 en pₑ se
 * convierte en 1.1e-8 relativo en κ y, por tanto, en z. Como el oráculo de z y
 * p es `kappa2`, aquí se copia su aritmética y no la del snippet; las dos
 * coinciden hasta el último bit en los regímenes bien condicionados.
 *
 * `tabla` son conteos enteros; `w`, los pesos de acuerdo; `n`, el total.
 */
function pruebaH0(tabla: readonly number[][], w: readonly number[][], n: number, k: number): { z: number; p: number } {
  const celda = (m: readonly number[][], i: number, j: number): number => (m[i] as readonly number[])[j] as number;

  // Totales de fila y de columna en conteos: enteros exactos, sin redondeo.
  const tm1: number[] = [];
  const tm2: number[] = [];
  for (let i = 0; i < k; i += 1) {
    let s = 0;
    for (let j = 0; j < k; j += 1) s += celda(tabla, i, j);
    tm1.push(s);
  }
  for (let j = 0; j < k; j += 1) {
    let s = 0;
    for (let i = 0; i < k; i += 1) s += celda(tabla, i, j);
    tm2.push(s);
  }

  // agreeP <- sum(ttab * weighttab)/ns ; eij <- outer(tm1, tm2)/ns ; chanceP <- sum(eij * weighttab)/ns
  const agreeP = sumaMatriz(k, (i, j) => celda(tabla, i, j) * celda(w, i, j)) / n;
  const eij = (i: number, j: number): number => ((tm1[i] as number) * (tm2[j] as number)) / n;
  const chanceP = sumaMatriz(k, (i, j) => eij(i, j) * celda(w, i, j)) / n;
  const value = (agreeP - chanceP) / (1 - chanceP);

  // w.i <- apply(rep(tm2/ns, nc) * weighttab, 2, sum) ; w.j <- apply(rep(tm1/ns, each = nc) * weighttab, 1, sum)
  const p1 = tm1.map((v) => v / n);
  const p2 = tm2.map((v) => v / n);
  const wi: number[] = [];
  const wj: number[] = [];
  for (let a = 0; a < k; a += 1) {
    let s = 0;
    for (let b = 0; b < k; b += 1) s += (p2[b] as number) * celda(w, b, a);
    wi.push(s);
  }
  for (let a = 0; a < k; a += 1) {
    let s = 0;
    for (let b = 0; b < k; b += 1) s += (p1[b] as number) * celda(w, a, b);
    wj.push(s);
  }

  // varkappa <- (sum((eij/ns) * (weighttab - outer(w.i, w.j, "+"))^2) - chanceP^2)/(ns * (1 - chanceP)^2)
  const varkappa =
    (sumaMatriz(k, (i, j) => (eij(i, j) / n) * (celda(w, i, j) - ((wi[i] as number) + (wj[j] as number))) ** 2) -
      chanceP ** 2) /
    (n * (1 - chanceP) ** 2);
  const z = value / Math.sqrt(varkappa);
  return { z, p: 2 * (1 - pnorm(Math.abs(z))) };
}

/**
 * Tabla pegada → tabla sin las categorías vacías, con sus totales.
 *
 * Una categoría que nadie usó no aporta acuerdo y encogería los pesos de las
 * demás (w depende de k): se elimina antes de cualquier cuenta, igual que en R.
 *
 * @throws {RangeError} si la tabla no es cuadrada, si tiene celdas que no son
 * enteros no negativos o si no quedan al menos dos categorías con observaciones.
 */
export function reducir(x: readonly number[]): TablaReducida {
  const kCapturada = validarTabla(x);
  const completa = comoMatriz(x, kCapturada);
  const vacias = categoriasVacias(completa);
  const tabla = sinCategorias(completa, vacias);
  const k = tabla.length;
  if (k < K_MIN) throw new RangeError('entrada_invalida: hacen falta al menos dos categorías con observaciones');

  let n = 0;
  for (let j = 0; j < k; j += 1) {
    for (let i = 0; i < k; i += 1) n += (tabla[i] as number[])[j] as number;
  }
  if (n < 1) throw new RangeError('entrada_invalida: la tabla no tiene ninguna observación');

  let exactos = 0;
  for (let i = 0; i < k; i += 1) exactos += (tabla[i] as number[])[i] as number;

  return { k, vacias, tabla, n, exactos };
}

/**
 * Kappa de Cohen de una tabla k×k pegada por filas (filas = evaluador A,
 * columnas = evaluador B, mismas categorías en el mismo orden).
 *
 * @throws {RangeError} si la tabla no es cuadrada, si tiene celdas que no son
 * enteros no negativos, si no quedan al menos dos categorías con observaciones
 * o si el nivel de confianza está fuera de (0, 1).
 */
export function kappaCohen(x: readonly number[], op: OpcionesKappa = {}): ResultadoKappa {
  const nivel = op.nivel ?? 0.95;
  if (!(nivel > 0 && nivel < 1)) throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0 y 1');
  const ponderacion = op.ponderacion ?? 'ninguna';

  const reducida = reducir(x);
  const { k, tabla, n } = reducida;
  const w = pesos(k, ponderacion);
  const p = tabla.map((fila) => fila.map((celda) => celda / n));
  const pi: number[] = [];
  const pj: number[] = [];
  for (let i = 0; i < k; i += 1) {
    let s = 0;
    for (let j = 0; j < k; j += 1) s += (p[i] as number[])[j] as number;
    pi.push(s);
  }
  for (let j = 0; j < k; j += 1) {
    let s = 0;
    for (let i = 0; i < k; i += 1) s += (p[i] as number[])[j] as number;
    pj.push(s);
  }

  const po = sumaMatriz(k, (i, j) => ((w[i] as number[])[j] as number) * ((p[i] as number[])[j] as number));
  const pe = sumaMatriz(k, (i, j) => ((w[i] as number[])[j] as number) * (pi[i] as number) * (pj[j] as number));
  const kappa = (po - pe) / (1 - pe);

  // Medias ponderadas de fila y de columna: wi = w %*% pj, wj = t(w) %*% pi.
  const wi: number[] = [];
  const wj: number[] = [];
  for (let i = 0; i < k; i += 1) {
    let s = 0;
    for (let j = 0; j < k; j += 1) s += ((w[i] as number[])[j] as number) * (pj[j] as number);
    wi.push(s);
  }
  for (let j = 0; j < k; j += 1) {
    let s = 0;
    for (let i = 0; i < k; i += 1) s += ((w[i] as number[])[j] as number) * (pi[i] as number);
    wj.push(s);
  }

  // Varianza asintótica con las celdas observadas (Fleiss, Cohen y Everitt 1969).
  const radicando =
    sumaMatriz(
      k,
      (i, j) =>
        ((p[i] as number[])[j] as number) *
        (((w[i] as number[])[j] as number) - ((wi[i] as number) + (wj[j] as number)) * (1 - kappa)) ** 2,
    ) -
    (kappa - pe * (1 - kappa)) ** 2;
  const ee = Math.sqrt(Math.max(0, radicando)) / ((1 - pe) * Math.sqrt(n));
  const z = qnorm(1 - (1 - nivel) / 2);

  const h0 = pruebaH0(tabla, w, n, k);

  // κ máximo con estos marginales.
  let poMax = 0;
  if (ponderacion === 'ninguna') {
    for (let i = 0; i < k; i += 1) poMax += Math.min(pi[i] as number, pj[i] as number);
  } else {
    const m = esquinaNoroeste(pi, pj);
    poMax = sumaMatriz(k, (i, j) => ((w[i] as number[])[j] as number) * ((m[i] as number[])[j] as number));
  }

  const dos = k === 2;
  const a = (tabla[0] as number[])[0] as number;
  const b = (tabla[0] as number[])[1] as number | undefined;
  const c = dos ? ((tabla[1] as number[])[0] as number) : Number.NaN;
  const d = dos ? ((tabla[1] as number[])[1] as number) : Number.NaN;

  return {
    ...reducida,
    p,
    marginales: { filas: pi, columnas: pj },
    w,
    valores: {
      n: { valor: n, metodo: 'puntual' },
      po: { valor: po, metodo: 'puntual' },
      pe: { valor: pe, metodo: 'puntual' },
      kappa: {
        valor: kappa,
        ic: [Math.max(-1, kappa - z * ee), Math.min(1, kappa + z * ee)],
        nivel,
        metodo: 'fleiss-cohen-everitt',
      },
      ee: { valor: ee, metodo: 'fleiss-cohen-everitt' },
      z_h0: { valor: h0.z, metodo: 'fleiss-cohen-everitt' },
      p_h0: { valor: h0.p, metodo: 'fleiss-cohen-everitt' },
      kappa_max: { valor: (poMax - pe) / (1 - pe), metodo: 'puntual' },
      pabak: { valor: dos ? 2 * po - 1 : Number.NaN, metodo: 'puntual' },
      indice_prevalencia: { valor: dos ? Math.abs(a - d) / n : Number.NaN, metodo: 'puntual' },
      indice_sesgo: { valor: dos ? Math.abs((b as number) - c) / n : Number.NaN, metodo: 'puntual' },
    },
  };
}

/**
 * Media y desviación estándar estimadas a partir de un resumen publicado
 * (mediana con rango y/o rango intercuartílico), calculadora D5 de la
 * especificación. Es la pieza que hace falta para meter en un metaanálisis un
 * estudio que reportó mediana e IQR en vez de media y DE.
 *
 * Tres escenarios, los mismos de Wan 2014 y Luo 2018:
 *
 *   S1 · mínimo, mediana y máximo        (a, m, b)
 *   S2 · Q₁, mediana y Q₃                (q₁, m, q₃)
 *   S3 · los cinco números               (a, q₁, m, q₃, b)
 *
 * Tres métodos, que la calculadora muestra a la vez porque difieren:
 *
 *   - Luo et al. 2018: media con pesos óptimos, el valor por defecto.
 *   - Wan et al. 2014: media por promedios ponderados y DE a partir del rango
 *     esperado ξ(n) y del IQR esperado η(n) de una normal.
 *   - Hozo et al. 2005: el primero, por tramos de n; solo con mínimo y máximo.
 *
 * Todos suponen que los datos son aproximadamente normales: el cociente de
 * asimetría del propio resumen ((b − m)/(m − a) y (q₃ − m)/(m − q₁)) avisa
 * cuándo ese supuesto es dudoso (`nucleo/bandas.ts`, Cochrane Handbook §6.5.2).
 *
 * Las fórmulas y su orden son los del snippet de R de la calculadora. La
 * biblioteca no redondea: un resumen degenerado (todos los valores iguales) da
 * DE 0 y cocientes 0/0 = `NaN`, que es «no definido», igual que en R.
 *
 * Referencias: Hozo SP, Djulbegovic B, Hozo I. BMC Med Res Methodol 2005;5:13 ·
 * Wan X, Wang W, Liu J, Tong T. BMC Med Res Methodol 2014;14:135 · Luo D, Wan X,
 * Liu J, Tong T. Stat Methods Med Res 2018;27:1785-805 · Higgins JPT et al.
 * Cochrane Handbook, versión 6, §6.5.2.
 */
import { qnorm } from '../primitivas/distribuciones.ts';

/** Escenario de reporte: qué estadísticos trae el artículo. */
export type EscenarioResumen = 's1' | 's2' | 's3';

export const ESCENARIOS_RESUMEN = ['s1', 's2', 's3'] as const;

/**
 * Resumen reportado. Los campos que el escenario no usa pueden llegar como
 * `NaN` («no capturado»), igual que viajan al snippet de R como `NA`.
 */
export interface ResumenReportado {
  /** Mínimo (a). */
  min: number;
  /** Primer cuartil (q₁). */
  q1: number;
  /** Mediana (m). */
  mediana: number;
  /** Tercer cuartil (q₃). */
  q3: number;
  /** Máximo (b). */
  max: number;
}

/** Las siete estimaciones que produce la calculadora, en el orden del JSON de R. */
export interface EstimacionResumen {
  media_luo: number;
  media_wan: number;
  media_hozo: number;
  de_wan: number;
  de_hozo: number;
  asim_rango: number;
  asim_iqr: number;
}

/** Campos del resumen que cada escenario necesita, en orden creciente. */
export const CAMPOS_ESCENARIO: Readonly<Record<EscenarioResumen, ReadonlyArray<keyof ResumenReportado>>> = {
  s1: ['min', 'mediana', 'max'],
  s2: ['q1', 'mediana', 'q3'],
  s3: ['min', 'q1', 'mediana', 'q3', 'max'],
};

/**
 * n mínimo por escenario. Con dos observaciones el mínimo y el máximo ya son
 * los dos datos; los cuartiles, en cambio, no significan nada por debajo de
 * cuatro (y η(n) de Wan se construye sobre ellos).
 */
export const N_MINIMO: Readonly<Record<EscenarioResumen, number>> = { s1: 2, s2: 4, s3: 4 };

/** ¿El escenario aporta mínimo y máximo, es decir, admite el método de Hozo? */
export function admiteHozo(escenario: EscenarioResumen): boolean {
  return escenario === 's1' || escenario === 's3';
}

/** ¿El escenario aporta cuartiles? */
export function admiteCuartiles(escenario: EscenarioResumen): boolean {
  return escenario === 's2' || escenario === 's3';
}

/**
 * Lanza `RangeError` si el resumen no es utilizable en ese escenario: escenario
 * desconocido, n entero por debajo del mínimo, un campo requerido no finito o
 * los valores requeridos fuera de orden.
 */
export function validarResumenReportado(r: ResumenReportado, n: number, escenario: EscenarioResumen): void {
  const campos = CAMPOS_ESCENARIO[escenario];
  if (!campos) throw new RangeError(`entrada_invalida: escenario desconocido: ${String(escenario)}`);
  if (!Number.isInteger(n) || n < N_MINIMO[escenario]) {
    throw new RangeError(`entrada_invalida: ${escenario} requiere n entero ≥ ${N_MINIMO[escenario]}`);
  }
  let previo = Number.NEGATIVE_INFINITY;
  for (const campo of campos) {
    const v = r[campo];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new RangeError(`entrada_invalida: ${escenario} requiere ${campo} finito`);
    }
    if (v < previo) throw new RangeError(`entrada_invalida: el resumen no está ordenado en ${campo}`);
    previo = v;
  }
}

// ---------------------------------------------------------------------------
// Luo et al. 2018: media con pesos óptimos
// ---------------------------------------------------------------------------

/** Peso del punto medio del rango en S1: w₁ = 4/(4 + n^0.75). */
export function w1Luo(n: number): number {
  return 4 / (4 + Math.pow(n, 0.75));
}

/** Peso del punto medio del IQR en S2: w₂ = 0.70 + 0.39/n. */
export function w2Luo(n: number): number {
  return 0.7 + 0.39 / n;
}

/** Peso del punto medio del rango en S3: w₃ = 2.2/(2.2 + n^0.75). */
export function w3Luo(n: number): number {
  return 2.2 / (2.2 + Math.pow(n, 0.75));
}

/** Peso del punto medio del IQR en S3: w₄ = 0.70 − 0.72/n^0.55. */
export function w4Luo(n: number): number {
  return 0.7 - 0.72 / Math.pow(n, 0.55);
}

/**
 * Media estimada por Luo et al. 2018. Los pesos se obtuvieron minimizando el
 * error cuadrático medio bajo normalidad, de modo que la estimación se desplaza
 * de la mediana hacia el centro del rango (o del IQR) según el tamaño de la
 * muestra: con n grande, w₁ → 0 y la media estimada tiende a la mediana.
 */
export function mediaLuo(r: ResumenReportado, n: number, escenario: EscenarioResumen): number {
  validarResumenReportado(r, n, escenario);
  const { min: a, q1, mediana: m, q3, max: b } = r;
  if (escenario === 's1') {
    const w1 = w1Luo(n);
    return (w1 * (a + b)) / 2 + (1 - w1) * m;
  }
  if (escenario === 's2') {
    const w2 = w2Luo(n);
    return (w2 * (q1 + q3)) / 2 + (1 - w2) * m;
  }
  const w3 = w3Luo(n);
  const w4 = w4Luo(n);
  return (w3 * (a + b)) / 2 + (w4 * (q1 + q3)) / 2 + (1 - w3 - w4) * m;
}

// ---------------------------------------------------------------------------
// Wan et al. 2014: media y DE
// ---------------------------------------------------------------------------

/** Media estimada por Wan et al. 2014 (promedios ponderados, sin dependencia de n). */
export function mediaWan(r: ResumenReportado, n: number, escenario: EscenarioResumen): number {
  validarResumenReportado(r, n, escenario);
  const { min: a, q1, mediana: m, q3, max: b } = r;
  if (escenario === 's1') return (a + 2 * m + b) / 4;
  if (escenario === 's2') return (q1 + m + q3) / 3;
  return (a + 2 * q1 + 2 * m + 2 * q3 + b) / 8;
}

/**
 * Rango esperado de n normales estándar, ξ(n) = 2·Φ⁻¹((n − 0.375)/(n + 0.25)):
 * la aproximación de Blom que usa Wan 2014 para convertir b − a en una DE.
 */
export function xiWan(n: number): number {
  return 2 * qnorm((n - 0.375) / (n + 0.25));
}

/** IQR esperado de n normales estándar, η(n) = 2·Φ⁻¹((0.75n − 0.125)/(n + 0.25)). */
export function etaWan(n: number): number {
  return 2 * qnorm((0.75 * n - 0.125) / (n + 0.25));
}

/**
 * DE estimada por Wan et al. 2014: el rango (o el IQR) observado dividido entre
 * el que cabría esperar de una normal con DE 1 y el mismo n. En S3 se promedian
 * las dos estimaciones.
 */
export function deWan(r: ResumenReportado, n: number, escenario: EscenarioResumen): number {
  validarResumenReportado(r, n, escenario);
  const { min: a, q1, q3, max: b } = r;
  const xi = xiWan(n);
  const eta = etaWan(n);
  if (escenario === 's1') return (b - a) / xi;
  if (escenario === 's2') return (q3 - q1) / eta;
  return ((b - a) / xi + (q3 - q1) / eta) / 2;
}

// ---------------------------------------------------------------------------
// Hozo et al. 2005: media y DE por tramos de n (solo con mínimo y máximo)
// ---------------------------------------------------------------------------

/** Media de Hozo et al. 2005: (a + 2m + b)/4 con n ≤ 25; la mediana con n > 25. */
export function mediaHozo(min: number, mediana: number, max: number, n: number): number {
  return n <= 25 ? (min + 2 * mediana + max) / 4 : mediana;
}

/**
 * DE de Hozo et al. 2005, por tramos: la fórmula cerrada con n ≤ 15, el rango
 * entre 4 con 15 < n ≤ 70 y el rango entre 6 con n > 70. Los saltos entre
 * tramos son discontinuos (es la crítica que motivó a Wan 2014).
 */
export function deHozo(min: number, mediana: number, max: number, n: number): number {
  if (n <= 15) return Math.sqrt((Math.pow(min - 2 * mediana + max, 2) / 4 + Math.pow(max - min, 2)) / 12);
  if (n <= 70) return (max - min) / 4;
  return (max - min) / 6;
}

// ---------------------------------------------------------------------------
// Asimetría del propio resumen
// ---------------------------------------------------------------------------

/** Cociente de asimetría del rango: (b − m)/(m − a). Vale 1 en un resumen simétrico. */
export function asimetriaRango(r: ResumenReportado): number {
  return (r.max - r.mediana) / (r.mediana - r.min);
}

/** Cociente de asimetría del IQR: (q₃ − m)/(m − q₁). Vale 1 en un resumen simétrico. */
export function asimetriaIqr(r: ResumenReportado): number {
  return (r.q3 - r.mediana) / (r.mediana - r.q1);
}

/**
 * Cociente listo para `bandaAsimetriaResumen`: un resumen degenerado (todos los
 * valores iguales) da 0/0, que como estimación es «no definido» pero como
 * lectura es perfecta simetría, así que se envía como 1. El valor que se
 * publica y se compara con R sigue siendo el `NaN` de `asimetriaRango`.
 */
export function cocienteParaBanda(cociente: number, degenerado: boolean): number {
  return degenerado ? 1 : cociente;
}

/**
 * De dos cocientes de asimetría, el que más se aleja de 1 en escala
 * multiplicativa (0.5 y 2 están igual de lejos). Un cociente no definido o 0
 * es lo más extremo posible.
 */
export function cocienteMasExtremo(a: number, b: number): number {
  const distancia = (c: number): number => (Number.isNaN(c) ? Number.POSITIVE_INFINITY : Math.abs(Math.log(c)));
  return distancia(a) >= distancia(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Entrada única
// ---------------------------------------------------------------------------

/**
 * Las siete estimaciones del escenario, con `NaN` donde el método no aplica
 * (Hozo sin mínimo ni máximo; el cociente del rango en S2; el del IQR en S1),
 * exactamente donde el snippet de R devuelve `NA`.
 */
export function estimarDesdeResumen(
  r: ResumenReportado,
  n: number,
  escenario: EscenarioResumen,
): EstimacionResumen {
  validarResumenReportado(r, n, escenario);
  const hozo = admiteHozo(escenario);
  return {
    media_luo: mediaLuo(r, n, escenario),
    media_wan: mediaWan(r, n, escenario),
    media_hozo: hozo ? mediaHozo(r.min, r.mediana, r.max, n) : Number.NaN,
    de_wan: deWan(r, n, escenario),
    de_hozo: hozo ? deHozo(r.min, r.mediana, r.max, n) : Number.NaN,
    asim_rango: hozo ? asimetriaRango(r) : Number.NaN,
    asim_iqr: admiteCuartiles(escenario) ? asimetriaIqr(r) : Number.NaN,
  };
}

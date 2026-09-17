/**
 * Medidas de asociación y efecto de una tabla 2×2 (calculadora B1 de la
 * especificación): riesgo de cada grupo con el intervalo de Wilson, riesgo
 * relativo (Katz 1978), razón de momios (Woolf 1955; Cornfield 1951), reducción
 * absoluta del riesgo (intervalo híbrido de Newcombe 1998, método 10, o Wald),
 * reducción relativa del riesgo y número necesario a tratar (Altman 1998).
 *
 * Notación: filas = exposición o tratamiento, columnas = desenlace:
 * a = expuestos con el desenlace, b = expuestos sin él, c = no expuestos con él,
 * d = no expuestos sin él; n₁ = a + b, n₀ = c + d. Es la misma que
 * `epiR::epi.2by2` con `method = "cohort.count"`.
 *
 * Misma aritmética y mismo orden de operaciones que el snippet de R de la
 * calculadora. La corrección de Haldane-Anscombe (`corr = 0.5`) afecta SOLO al
 * riesgo relativo, a la razón de momios y, por derivarse del RR, a la reducción
 * relativa; nunca a p₁, p₀, la reducción absoluta ni el NNT. El diseño del
 * estudio no cambia ningún número: solo cómo se leen (en casos y controles
 * únicamente la razón de momios es interpretable).
 *
 * Referencias: Cornfield J. J Natl Cancer Inst 1951;11:1269-75 · Woolf B. Ann
 * Hum Genet 1955;19:251-3 · Katz D, Baptista J, Azen SP, Pike MC. Biometrics
 * 1978;34:469-74 · Newcombe RG. Stat Med 1998;17:873-90 · Laupacis A, Sackett
 * DL, Roberts RS. N Engl J Med 1988;318:1728-33 · Altman DG. BMJ
 * 1998;317:1309-12 · Wilson EB. JASA 1927;22:209-12.
 */
import { icWilson, zNivel } from './proporciones.ts';
import { corregir, icLog, validarCeldas } from './razones.ts';
import type { Correccion, Tabla2x2 } from './razones.ts';
import type { Estimacion } from '../nucleo/tipos.ts';

/** Diseños admitidos: solo cambian la lectura de los resultados, no los cálculos. */
export const DISENOS = ['cohorte', 'casos_controles', 'transversal'] as const;
export type Diseno = (typeof DISENOS)[number];

/** Métodos de IC de la reducción absoluta del riesgo que ofrece el selector. */
export const METODOS_RRA = ['newcombe', 'wald'] as const;
export type MetodoRra = (typeof METODOS_RRA)[number];

/** Salidas: ids = claves del JSON de R = celdas de la interfaz, en orden de presentación. */
export const SALIDAS_EFECTO = ['n', 'p1', 'p0', 'rr', 'or', 'rra', 'rrr', 'nnt'] as const;
export type SalidaEfecto = (typeof SALIDAS_EFECTO)[number];

export type ValoresEfecto = Record<SalidaEfecto, Estimacion>;

export interface OpcionesEfecto {
  nivel?: number;
  metodoRra?: MetodoRra;
  corr?: Correccion;
}

/**
 * Lanza `RangeError` si las celdas no son enteros ≥ 0 o si alguna FILA suma 0:
 * sin expuestos (o sin no expuestos) no hay riesgo que estimar en ese grupo.
 *
 * Una COLUMNA en 0 sí se admite: que nadie presente el desenlace (a = c = 0) o
 * que todos lo presenten es un resultado posible; el riesgo relativo queda en
 * 0/0 y la calculadora lo avisa.
 */
export function validarTablaEfecto(a: number, b: number, c: number, d: number): void {
  validarCeldas({ a, b, c, d });
  if (a + b === 0 || c + d === 0) {
    throw new RangeError('entrada_invalida: cada fila de la tabla debe sumar al menos 1');
  }
}

/** ¿Alguna celda vale 0 (el RR o la OR quedan en 0 o ∞ sin intervalo, salvo corrección)? */
export function hayCeldaCero(a: number, b: number, c: number, d: number): boolean {
  return a === 0 || b === 0 || c === 0 || d === 0;
}

/** x², escrito como producto para reproducir `x^2` de R bit a bit (R_pow devuelve `x * x` si el exponente es 2). */
function cuad(x: number): number {
  return x * x;
}

/**
 * Medidas de asociación y efecto completas de una tabla 2×2.
 *
 * El orden de las operaciones reproduce el del snippet de R: los riesgos y su
 * intervalo de Wilson sobre las celdas SIN corregir; el RR y la OR sobre las
 * celdas corregidas; la RRA a partir de los riesgos; la RRR invirtiendo el
 * intervalo del RR, y el NNT como recíproco de la RRA y de sus límites,
 * ordenados de menor a mayor.
 */
export function efecto2x2(
  a: number,
  b: number,
  c: number,
  d: number,
  op: OpcionesEfecto = {},
): ValoresEfecto {
  validarTablaEfecto(a, b, c, d);
  const nivel = op.nivel ?? 0.95;
  const metodoRra = op.metodoRra ?? 'newcombe';
  const corr = op.corr ?? 0;
  if (!METODOS_RRA.includes(metodoRra)) {
    throw new RangeError(`entrada_invalida: método de IC de la RRA desconocido «${String(metodoRra)}»`);
  }

  const n = a + b + c + d;
  const z = zNivel(nivel);
  const n1 = a + b;
  const n0 = c + d;

  // Riesgos con el intervalo de Wilson; la corrección nunca se aplica aquí.
  const p1 = icWilson(a, n1, nivel);
  const p0 = icWilson(c, n0, nivel);
  const [l1, u1] = p1.ic as [number, number];
  const [l0, u0] = p0.ic as [number, number];

  // Razones sobre las celdas corregidas (Haldane-Anscombe es decisión explícita).
  const t: Tabla2x2 = corregir({ a, b, c, d }, corr);
  const n1c = t.a + t.b;
  const n0c = t.c + t.d;
  const rr = icLog(t.a / n1c / (t.c / n0c), Math.sqrt(1 / t.a - 1 / n1c + 1 / t.c - 1 / n0c), nivel, 'katz');
  const or = icLog((t.a * t.d) / (t.b * t.c), Math.sqrt(1 / t.a + 1 / t.b + 1 / t.c + 1 / t.d), nivel, 'woolf');

  // Reducción absoluta del riesgo: híbrido de Newcombe (método 10) o Wald.
  const rraValor = p1.valor - p0.valor;
  let rraIc: [number, number];
  if (metodoRra === 'newcombe') {
    rraIc = [
      rraValor - Math.sqrt(cuad(p1.valor - l1) + cuad(u0 - p0.valor)),
      rraValor + Math.sqrt(cuad(u1 - p1.valor) + cuad(p0.valor - l0)),
    ];
  } else {
    const ee = Math.sqrt((p1.valor * (1 - p1.valor)) / n1 + (p0.valor * (1 - p0.valor)) / n0);
    rraIc = [rraValor - z * ee, rraValor + z * ee];
  }
  const rra: Estimacion = {
    valor: rraValor,
    ic: rraIc,
    nivel,
    metodo: metodoRra === 'newcombe' ? 'newcombe-hibrido' : 'wald',
  };

  // Reducción relativa: 1 − RR con el intervalo del RR invertido (NA si el del RR no existe).
  const rrIc = rr.ic as [number, number];
  const rrr: Estimacion = { valor: 1 - rr.valor, ic: [1 - rrIc[1], 1 - rrIc[0]], nivel, metodo: 'katz' };

  // NNT = 1/|RRA| y los recíprocos de los límites, ordenados (Altman 1998).
  const nntLo = 1 / Math.abs(rraIc[0]);
  const nntHi = 1 / Math.abs(rraIc[1]);
  const nnt: Estimacion = {
    valor: 1 / Math.abs(rraValor),
    ic: nntLo <= nntHi ? [nntLo, nntHi] : [nntHi, nntLo],
    nivel,
    metodo: 'altman',
  };

  return { n: { valor: n, metodo: 'puntual' }, p1, p0, rr, or, rra, rrr, nnt };
}

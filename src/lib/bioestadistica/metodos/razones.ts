/**
 * Razones de una tabla 2×2 con intervalo por el método logarítmico
 * («log-Wald»): exp(ln R ± z·EE). Razones de verosimilitud según Simel, Samsa y
 * Matchar (1991) y razón de momios diagnóstica según Woolf (1955; Glas 2003).
 *
 * Misma aritmética, en el mismo orden de operaciones, que el snippet de R de la
 * calculadora `prueba-diagnostica-2x2`. Las celdas llegan YA corregidas: sumar
 * 0.5 (Haldane 1956; Anscombe 1956) es una decisión explícita de quien llama
 * (`corregir`), nunca silenciosa. Un intervalo es «no definido» (`[NaN, NaN]`)
 * cuando ln(R) o el error estándar no son finitos, es decir, cuando alguna
 * celda que interviene vale 0; la estimación puntual se conserva (0, ∞ o NaN).
 *
 * Referencias: Simel DL, Samsa GP, Matchar DB. J Clin Epidemiol 1991;44:763-70
 * · Woolf B. Ann Hum Genet 1955;19:251-3 · Glas AS et al. J Clin Epidemiol
 * 2003;56:1129-35 · Haldane JBS. Ann Hum Genet 1956;20:309-11.
 */
import { zNivel } from './proporciones.ts';
import type { Estimacion, MetodoId } from '../nucleo/tipos.ts';

/** Celdas de una tabla 2×2 en la notación clásica: a = VP, b = FP, c = FN, d = VN. */
export interface Tabla2x2 {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Correcciones admitidas: ninguna o Haldane-Anscombe (+0.5 en cada celda). */
export const CORRECCIONES = [0, 0.5] as const;
export type Correccion = (typeof CORRECCIONES)[number];

/** Lanza `RangeError` si alguna celda no es un entero ≥ 0. */
export function validarCeldas(t: Tabla2x2): void {
  for (const v of [t.a, t.b, t.c, t.d]) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError('entrada_invalida: las celdas deben ser enteros ≥ 0');
  }
}

/** Tabla con la corrección sumada a cada celda (0 la deja intacta). */
export function corregir(t: Tabla2x2, corr: Correccion): Tabla2x2 {
  if (corr !== 0 && corr !== 0.5) throw new RangeError('entrada_invalida: la corrección debe ser 0 o 0.5');
  return { a: t.a + corr, b: t.b + corr, c: t.c + corr, d: t.d + corr };
}

/**
 * Estimación con intervalo log-Wald: exp(ln est − z·ee) a exp(ln est + z·ee).
 * `[NaN, NaN]` si ln(est) o ee no son finitos (celda con 0 sin corrección).
 */
export function icLog(est: number, ee: number, nivel: number, metodo: MetodoId): Estimacion {
  const z = zNivel(nivel);
  const ln = Math.log(est);
  const ic: [number, number] =
    Number.isFinite(ln) && Number.isFinite(ee) ? [Math.exp(ln - z * ee), Math.exp(ln + z * ee)] : [NaN, NaN];
  return { valor: est, ic, nivel, metodo };
}

/** Error estándar de ln(LR) para LR = (x1/n1)/(x2/n2) (Simel 1991, ecuación 3). */
function eeSimel(x1: number, n1: number, x2: number, n2: number): number {
  return Math.sqrt((1 - x1 / n1) / x1 + (1 - x2 / n2) / x2);
}

/** LR+ = (a/(a+c)) / (b/(b+d)) = Sn / (1 − Sp), con IC de Simel. */
export function lrPositivo(t: Tabla2x2, nivel = 0.95): Estimacion {
  const { a, b, c, d } = t;
  const lr = a / (a + c) / (b / (b + d));
  return icLog(lr, eeSimel(a, a + c, b, b + d), nivel, 'simel-log');
}

/** LR− = (c/(a+c)) / (d/(b+d)) = (1 − Sn) / Sp, con IC de Simel. */
export function lrNegativo(t: Tabla2x2, nivel = 0.95): Estimacion {
  const { a, b, c, d } = t;
  const lr = c / (a + c) / (d / (b + d));
  return icLog(lr, eeSimel(c, a + c, d, b + d), nivel, 'simel-log');
}

/** Razón de momios diagnóstica DOR = ad / bc, con IC de Woolf. */
export function dorWoolf(t: Tabla2x2, nivel = 0.95): Estimacion {
  const { a, b, c, d } = t;
  const dor = (a * d) / (b * c);
  return icLog(dor, Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d), nivel, 'woolf');
}

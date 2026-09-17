/**
 * Núcleo de la tabla diagnóstica 2×2 (calculadora A1 de la especificación):
 * sensibilidad, especificidad, valores predictivos, prevalencia y exactitud como
 * proporciones binomiales con el IC elegido; índice de Youden con IC delta;
 * razones de verosimilitud (Simel) y razón de momios diagnóstica (Woolf).
 *
 * Notación: filas = resultado de la prueba (+, −), columnas = estándar de
 * referencia (enfermo, sano): a = VP, b = FP, c = FN, d = VN. Es la misma que
 * `epiR::epi.tests`.
 *
 * Misma aritmética y mismo orden que el snippet de R de la calculadora. La
 * corrección de Haldane-Anscombe (`corr = 0.5`) afecta SOLO a las razones (LR±,
 * DOR), nunca a las proporciones ni al índice de Youden.
 *
 * Referencias: Yerushalmy J. Public Health Rep 1947;62:1432-49 · Youden WJ.
 * Cancer 1950;3:32-5 · Simel DL et al. J Clin Epidemiol 1991;44:763-70 · Glas
 * AS et al. J Clin Epidemiol 2003;56:1129-35.
 */
import { icProporcion, zNivel } from './proporciones.ts';
import { corregir, dorWoolf, lrNegativo, lrPositivo, validarCeldas } from './razones.ts';
import type { Correccion, Tabla2x2 } from './razones.ts';
import type { Estimacion } from '../nucleo/tipos.ts';

/** Métodos de IC de proporciones que ofrece el selector (Wilson por defecto). */
export const METODOS_IC_2X2 = ['wilson', 'clopper-pearson', 'agresti-coull', 'jeffreys', 'wald'] as const;
export type MetodoIc2x2 = (typeof METODOS_IC_2X2)[number];

export interface OpcionesDiagnostico {
  nivel?: number;
  metodo?: MetodoIc2x2;
  corr?: Correccion;
}

/** Salidas del núcleo 2×2: ids = claves del JSON de R = celdas de la interfaz. */
export const SALIDAS_2X2 = [
  'n',
  'sn',
  'sp',
  'vpp',
  'vpn',
  'prev',
  'exactitud',
  'youden',
  'lr_pos',
  'lr_neg',
  'dor',
] as const;
export type Salida2x2 = (typeof SALIDAS_2X2)[number];

export type ValoresDiagnostico = Record<Salida2x2, Estimacion>;

/**
 * Lanza `RangeError` si las celdas no son enteros ≥ 0 o si alguna fila
 * (positivos, negativos) o columna (enfermos, sanos) suma 0: sin denominador no
 * hay proporción que estimar.
 */
export function validarTabla(vp: number, fp: number, fn: number, vn: number): void {
  validarCeldas({ a: vp, b: fp, c: fn, d: vn });
  if (vp + fn === 0 || fp + vn === 0 || vp + fp === 0 || fn + vn === 0) {
    throw new RangeError('entrada_invalida: cada fila y cada columna de la tabla debe sumar al menos 1');
  }
}

/** ¿Alguna celda vale 0 (las razones quedan en 0 o ∞ sin intervalo, salvo corrección)? */
export function hayCeldaCero(vp: number, fp: number, fn: number, vn: number): boolean {
  return vp === 0 || fp === 0 || fn === 0 || vn === 0;
}

/** Rendimiento diagnóstico completo de una tabla 2×2. */
export function diagnostico2x2(
  vp: number,
  fp: number,
  fn: number,
  vn: number,
  op: OpcionesDiagnostico = {},
): ValoresDiagnostico {
  validarTabla(vp, fp, fn, vn);
  const nivel = op.nivel ?? 0.95;
  const metodo = op.metodo ?? 'wilson';
  const corr = op.corr ?? 0;
  if (!METODOS_IC_2X2.includes(metodo)) throw new RangeError(`entrada_invalida: método de IC desconocido «${String(metodo)}»`);

  const n = vp + fp + fn + vn;
  const prop = (x: number, m: number): Estimacion => icProporcion(x, m, { nivel, metodo });
  const sn = prop(vp, vp + fn);
  const sp = prop(vn, vn + fp);
  const vpp = prop(vp, vp + fp);
  const vpn = prop(vn, vn + fn);
  const prev = prop(vp + fn, n);
  const exactitud = prop(vp + vn, n);

  // Índice de Youden J = Sn + Sp − 1 con IC de Wald por el método delta.
  const z = zNivel(nivel);
  const j = sn.valor + sp.valor - 1;
  const jEe = Math.sqrt((sn.valor * (1 - sn.valor)) / (vp + fn) + (sp.valor * (1 - sp.valor)) / (vn + fp));
  const youden: Estimacion = { valor: j, ic: [j - z * jEe, j + z * jEe], nivel, metodo: 'delta' };

  const tabla: Tabla2x2 = corregir({ a: vp, b: fp, c: fn, d: vn }, corr);
  return {
    n: { valor: n, metodo: 'puntual' },
    sn,
    sp,
    vpp,
    vpn,
    prev,
    exactitud,
    youden,
    lr_pos: lrPositivo(tabla, nivel),
    lr_neg: lrNegativo(tabla, nivel),
    dor: dorWoolf(tabla, nivel),
  };
}

/**
 * Tamaño de muestra para estimar la sensibilidad y la especificidad de una
 * prueba diagnóstica con precisión absoluta, según Buderer (1996).
 *
 * El diseño tiene dos mitades independientes. Cada una es un intervalo de Wald
 * para una proporción con semiamplitud w:
 *
 *   n_D = z² · Sn(1 − Sn) / w²        enfermos necesarios para la sensibilidad
 *   n_D̄ = z² · Sp(1 − Sp) / w²        sanos necesarios para la especificidad
 *
 * En un estudio de pacientes consecutivos no se recluta por estado de
 * enfermedad, así que hay que reclutar hasta que aparezcan esos enfermos (o
 * esos sanos), y ahí entra la prevalencia esperada:
 *
 *   N_Sn = n_D / P          N_Sp = n_D̄ / (1 − P)          N = máx(N_Sn, N_Sp)
 *
 * Todo viaja SIN redondear, igual que el JSON del snippet de R: el techo se
 * aplica una sola vez, al final, en la presentación (`techo()` de
 * `muestra-comun.ts`). Redondear antes de comparar con el oráculo escondería
 * errores de una unidad.
 *
 * Referencias: Buderer NM. Acad Emerg Med 1996;3:895–900 (fórmula original) ·
 * Simel DL, Samsa GP, Matchar DB. J Clin Epidemiol 1991;44:763–70 (variante por
 * razones de verosimilitud) · Lwanga SK, Lemeshow S. WHO 1991 (ajuste por
 * pérdidas) · Newcombe RG. Stat Med 1998;17:857–72 (por qué Wald se queda corto
 * con proporciones extremas).
 *
 * Puro: sin DOM, sin `Intl`, sin acceso al sistema de archivos.
 */
import { ajustarPerdidas } from './muestra-comun.ts';
// `zNivel` vive en `proporciones.ts` y evalúa `qnorm(1 - (1 - nivel)/2)`, que es
// literalmente lo que escribe el snippet de R. Tener aquí una copia con
// `qnorm((1 - nivel)/2, lower = FALSE)` daba el mismo número salvo unos pocos
// ulp (9.4e-15 relativo al 99.9 % de confianza), y esa diferencia se propagaba
// al cuadrado en n_D y otra vez al dividir entre la prevalencia.
import { zNivel } from './proporciones.ts';

/** Parámetros del diseño de Buderer. Proporciones en escala 0–1. */
export interface DisenoBuderer {
  /** Sensibilidad esperada, estrictamente entre 0 y 1. */
  sn: number;
  /** Especificidad esperada, estrictamente entre 0 y 1. */
  sp: number;
  /** Prevalencia esperada donde se aplicará la prueba, estrictamente entre 0 y 1. */
  prev: number;
  /** Semiamplitud del intervalo de confianza (precisión absoluta), > 0. */
  w: number;
  /** Nivel de confianza (0.8–0.999). */
  nivel: number;
  /** Pérdidas previstas (0–0.5). */
  perdidas: number;
}

/** Salidas del diseño, sin redondear y en el orden en que las presenta la calculadora. */
export interface ResultadoBuderer {
  /** Cuantil normal del nivel de confianza: `qnorm(1 − (1 − nivel)/2)`. */
  z: number;
  /** Enfermos necesarios para estimar Sn con precisión ±w. */
  n_d: number;
  /** Pacientes consecutivos necesarios para reunir esos enfermos: n_D/P. */
  n_sn: number;
  /** Sanos necesarios para estimar Sp con precisión ±w. */
  n_nd: number;
  /** Pacientes consecutivos necesarios para reunir esos sanos: n_D̄/(1 − P). */
  n_sp: number;
  /** El mayor de los dos requisitos: es el que manda. */
  n_total: number;
  /** n_total inflado por las pérdidas previstas. */
  n_ajustado: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS_BUDERER = ['z', 'n_d', 'n_sn', 'n_nd', 'n_sp', 'n_total', 'n_ajustado'] as const;
export type SalidaBuderer = (typeof SALIDAS_BUDERER)[number];

/** Semiamplitud mínima y máxima admitidas (una precisión de ±50 puntos ya no es un estudio). */
export const W_MINIMO = 0.005;
export const W_MAXIMO = 0.5;

/**
 * Por encima de esta Sn (o Sp) el intervalo de Wald se sale de [0, 1] y
 * subestima el tamaño necesario: hay que preferir Wilson o Clopper-Pearson.
 */
export const PROPORCION_EXTREMA = 0.95;

/** Por debajo de esta prevalencia, N_Sn se dispara y conviene muestrear por estado de enfermedad. */
export const PREVALENCIA_BAJA = 0.05;

/** Por encima de esta prevalencia, el que se dispara es N_Sp. */
export const PREVALENCIA_ALTA = 0.95;

/** A partir de esta semiamplitud el intervalo resultante es demasiado ancho para ser informativo. */
export const W_GRANDE = 0.15;

/** Una proporción del diseño debe estar estrictamente entre 0 y 1 (en 0 o en 1 la varianza es 0 y n = 0). */
function exigirProporcionEstricta(nombre: string, p: number): void {
  if (!(typeof p === 'number' && p > 0 && p < 1)) {
    throw new RangeError(`entrada_invalida: ${nombre} debe estar estrictamente entre 0 y 1 (recibido ${String(p)})`);
  }
}

/**
 * Valida el diseño completo y lanza `RangeError` en la primera entrada
 * imposible, con la misma convención que el resto de la biblioteca.
 */
export function validarBuderer(d: DisenoBuderer): void {
  exigirProporcionEstricta('la sensibilidad', d.sn);
  exigirProporcionEstricta('la especificidad', d.sp);
  exigirProporcionEstricta('la prevalencia', d.prev);
  if (!(d.w >= W_MINIMO && d.w <= W_MAXIMO)) {
    throw new RangeError(`entrada_invalida: la semiamplitud debe estar entre ${W_MINIMO} y ${W_MAXIMO}`);
  }
  if (!(d.nivel >= 0.8 && d.nivel <= 0.999)) {
    throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0.8 y 0.999');
  }
  if (!(d.perdidas >= 0 && d.perdidas <= 0.5)) {
    throw new RangeError('entrada_invalida: las pérdidas deben estar entre 0 y 0.5');
  }
}

/** Enfermos necesarios para estimar una proporción p con semiamplitud w: z²·p(1 − p)/w². */
export function nWald(p: number, w: number, z: number): number {
  return (z * z * p * (1 - p)) / (w * w);
}

/**
 * Pacientes consecutivos que hay que reclutar para estimar la SENSIBILIDAD con
 * precisión ±w, dada la prevalencia esperada. Es la curva que dibuja la gráfica.
 */
export function totalParaSn(sn: number, prev: number, w: number, z: number): number {
  return nWald(sn, w, z) / prev;
}

/** Lo mismo para la ESPECIFICIDAD: el denominador es 1 − P (los sanos). */
export function totalParaSp(sp: number, prev: number, w: number, z: number): number {
  return nWald(sp, w, z) / (1 - prev);
}

/** Diseño completo de Buderer (1996), sin redondear. */
export function muestraDiagnostica(d: DisenoBuderer): ResultadoBuderer {
  validarBuderer(d);
  const z = zNivel(d.nivel);
  const n_d = nWald(d.sn, d.w, z);
  const n_nd = nWald(d.sp, d.w, z);
  const n_sn = n_d / d.prev;
  const n_sp = n_nd / (1 - d.prev);
  const n_total = Math.max(n_sn, n_sp);
  return { z, n_d, n_sn, n_nd, n_sp, n_total, n_ajustado: ajustarPerdidas(n_total, d.perdidas) };
}

/** ¿Manda la sensibilidad o la especificidad? Con empate exacto manda Sn (es la primera mitad del diseño). */
export function mandaEn(r: ResultadoBuderer): 'sn' | 'sp' {
  return r.n_sn >= r.n_sp ? 'sn' : 'sp';
}

/**
 * Bloque común de las calculadoras de tamaño de muestra (C0 de la
 * especificación): cuantiles normales de α y del poder, ajuste por pérdidas y
 * el techo que se aplica UNA sola vez, al final, en la presentación.
 *
 * Todo lo que devuelven las calculadoras del grupo `muestra` viaja SIN
 * redondear (igual que el JSON de R); redondear antes de comparar con el
 * oráculo ocultaría errores de una unidad.
 *
 * Referencias: Lwanga SK, Lemeshow S. Sample Size Determination in Health
 * Studies. WHO 1991 (ajuste por pérdidas) · Cohen J. Statistical Power Analysis
 * for the Behavioral Sciences, 2.ª ed., 1988.
 */
import { qnorm } from '../primitivas/distribuciones.ts';

/** Lateralidad de la prueba: `bilateral` (α/2 por cola) o `unilateral`. */
export const LATERALIDADES = ['bilateral', 'unilateral'] as const;
export type Lateralidad = (typeof LATERALIDADES)[number];

/** Lanza `RangeError` si α, poder o pérdidas están fuera de los rangos de la especificación. */
export function validarComun(alfa: number, poder: number, perdidas: number): void {
  if (!(alfa >= 0.001 && alfa <= 0.2)) throw new RangeError('entrada_invalida: α debe estar entre 0.001 y 0.20');
  if (!(poder >= 0.5 && poder <= 0.99)) throw new RangeError('entrada_invalida: el poder debe estar entre 0.50 y 0.99');
  if (!(perdidas >= 0 && perdidas <= 0.5)) throw new RangeError('entrada_invalida: las pérdidas deben estar entre 0 y 0.5');
}

/** z de α según la lateralidad: `qnorm(1 − α/2)` bilateral, `qnorm(1 − α)` unilateral. Igual que `qnorm(sig.level/tside, lower.tail = FALSE)` en R. */
export function zAlfa(alfa: number, lateralidad: Lateralidad): number {
  const tside = lateralidad === 'bilateral' ? 2 : 1;
  return qnorm(alfa / tside, 0, 1, false);
}

/** z del poder: `qnorm(1 − β)` = `qnorm(poder)`. */
export function zPoder(poder: number): number {
  return qnorm(poder);
}

/** Ajuste por pérdidas previstas: n/(1 − L), sin redondear (Lwanga y Lemeshow 1991). */
export function ajustarPerdidas(n: number, perdidas: number): number {
  return n / (1 - perdidas);
}

/**
 * Techo de la presentación: entero hacia arriba, una sola vez y al final. Un
 * valor no finito se devuelve tal cual («no definido»). Se tolera el ruido de
 * la coma flotante (1e-9 relativo) para que 322.00000000001 no se convierta en
 * 323 cuando R y TS imprimen 322.
 */
export function techo(n: number): number {
  if (!Number.isFinite(n)) return n;
  const redondo = Math.round(n);
  return Math.abs(n - redondo) <= 1e-9 * Math.max(1, Math.abs(n)) ? redondo : Math.ceil(n);
}

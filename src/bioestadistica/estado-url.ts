/**
 * La URL como documento de la calculadora: quien comparte el enlace comparte
 * los datos capturados y quien lo abre ve el mismo resultado. La codificación
 * vive en `nucleo/exportar.ts` (puro y probado); aquí solo se conecta con
 * `location` y con el historial.
 *
 * `history.replaceState` conserva `history.state` a propósito: el `ClientRouter`
 * de la sección (hito H4) guarda ahí el índice y el desplazamiento de cada
 * entrada, y pasar `null` rompería los botones de atrás y adelante.
 */
import { codificarEstado, decodificarEstado, hayEstado } from '../lib/bioestadistica/nucleo/exportar.ts';
import type { EntradaDef, Entradas } from '../lib/bioestadistica/nucleo/tipos.ts';

/** Parámetro que fuerza la carga del ejemplo aunque la URL traiga datos. */
export const PARAM_EJEMPLO = 'ejemplo';

/** Entradas presentes en la URL actual. */
export function leerURL(defs: EntradaDef[], search: string = window.location.search): Partial<Entradas> {
  return decodificarEstado(search, defs);
}

/** ¿La URL trae datos de esta calculadora? */
export function hayEstadoEnURL(defs: EntradaDef[], search: string = window.location.search): boolean {
  return hayEstado(search, defs);
}

/** ¿La URL pide explícitamente el ejemplo (`?ejemplo=1`)? */
export function forzarEjemplo(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get(PARAM_EJEMPLO) === '1';
}

/** URL absoluta de la página actual con las entradas como parámetros. */
export function urlConEstado(
  entradas: Entradas,
  defs: EntradaDef[],
  base: string = window.location.href,
): string {
  const u = new URL(base);
  u.search = codificarEstado(entradas, defs);
  u.hash = '';
  return u.href;
}

/** Escribe el estado en la barra de direcciones sin añadir una entrada al historial. */
export function escribirURL(entradas: Entradas, defs: EntradaDef[]): void {
  window.history.replaceState(window.history.state, '', urlConEstado(entradas, defs));
}

/** Quita los parámetros de la URL (botón «Limpiar»). */
export function limpiarURL(): void {
  window.history.replaceState(window.history.state, '', window.location.pathname);
}

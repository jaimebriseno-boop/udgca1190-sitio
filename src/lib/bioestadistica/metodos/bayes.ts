/**
 * Teorema de Bayes en forma de momios (calculadora A2 de la especificación):
 * momios posprueba = momios preprueba × razón de verosimilitud (Fagan 1975).
 *
 * Misma aritmética y mismo orden que el snippet de R de la calculadora
 * `probabilidad-posprueba`. Las certezas se fijan explícitamente (p = 0 → 0,
 * p = 1 → 1): «la evidencia no cambia certezas» y, de paso, se evita el 0/0 de
 * momios infinitos.
 *
 * Referencias: Bayes T. Philos Trans R Soc 1763;53:370-418 · Fagan TJ. N Engl
 * J Med 1975;293:257 · Jaeschke R, Guyatt GH, Sackett DL. JAMA 1994;271:703-7.
 */

/** Momios a partir de una probabilidad: p / (1 − p); ∞ en p = 1. */
export function momios(p: number): number {
  return p / (1 - p);
}

/** Probabilidad a partir de unos momios: o / (1 + o). */
export function probabilidadDeMomios(o: number): number {
  return o / (1 + o);
}

/** Lanza `RangeError` si la probabilidad no está en [0, 1] o la razón no es un número ≥ 0. */
export function validarPosprueba(p: number, lr: number): void {
  if (!(p >= 0 && p <= 1)) throw new RangeError('entrada_invalida: la probabilidad preprueba debe estar entre 0 y 1');
  if (!(Number.isFinite(lr) && lr >= 0)) throw new RangeError('entrada_invalida: la razón de verosimilitud debe ser un número ≥ 0');
}

/**
 * Probabilidad posprueba: momios preprueba × LR, de vuelta a probabilidad.
 * Certezas fijas: 0 → 0 y 1 → 1, exactamente como el snippet de R.
 */
export function posprueba(p: number, lr: number): number {
  validarPosprueba(p, lr);
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const o = (p / (1 - p)) * lr;
  return o / (1 + o);
}

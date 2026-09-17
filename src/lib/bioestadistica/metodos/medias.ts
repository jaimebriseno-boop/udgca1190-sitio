/**
 * Intervalos de confianza a partir del resumen de una variable continua
 * (calculadora D4 de la especificación): la media por la t de Student y la
 * desviación estándar por la χ².
 *
 * Las fórmulas y el ORDEN de las operaciones son los del snippet de R que
 * acompaña a la calculadora, para que TypeScript y el oráculo coincidan hasta
 * el último bit que permite la inversión de los cuantiles:
 *
 *   tcrit    <- qt(1 - (1 - nivel)/2, n - 1)
 *   eem      <- de/sqrt(n)
 *   media_ic <- c(media, media - tcrit*eem, media + tcrit*eem)
 *   de_ic    <- c(de, de*sqrt((n - 1)/qchisq(1 - (1 - nivel)/2, n - 1)),
 *                    de*sqrt((n - 1)/qchisq((1 - nivel)/2, n - 1)))
 *
 * El intervalo de la media es el de `t.test(x, conf.level = nivel)$conf.int`
 * cuando se parte de los datos crudos; aquí se parte del resumen publicado, que
 * es lo que suele estar disponible al leer un artículo.
 *
 * La biblioteca no redondea y no recorta: con DE = 0 el intervalo colapsa a un
 * punto y quien llama emite el aviso correspondiente.
 *
 * Referencias: Student. Biometrika 1908;6:1-25 · Gardner MJ, Altman DG. BMJ
 * 1986;292:746-50 · Altman DG. Practical Statistics for Medical Research, 1991,
 * §8.4 · Altman DG et al. Statistics with Confidence, 2.ª ed., 2000, cap. 4.
 */
import { qchisq, qt } from '../primitivas/distribuciones.ts';
import type { Estimacion } from '../nucleo/tipos.ts';

/** Lanza `RangeError` si (DE, n) no forman un resumen utilizable: DE finita ≥ 0 y n entero ≥ 2. */
export function validarDispersion(de: number, n: number): void {
  if (typeof de !== 'number' || !Number.isFinite(de) || de < 0) {
    throw new RangeError('entrada_invalida: la desviación estándar debe ser un número finito ≥ 0');
  }
  if (!Number.isInteger(n) || n < 2) {
    throw new RangeError('entrada_invalida: se requiere n entero ≥ 2 para estimar la dispersión');
  }
}

/** Lanza `RangeError` si el resumen (media, DE, n) no es utilizable. */
export function validarResumen(media: number, de: number, n: number): void {
  if (typeof media !== 'number' || !Number.isFinite(media)) {
    throw new RangeError('entrada_invalida: la media debe ser un número finito');
  }
  validarDispersion(de, n);
}

/** Lanza `RangeError` si el nivel de confianza no está estrictamente entre 0 y 1. */
function validarNivel(nivel: number): void {
  if (!(nivel > 0 && nivel < 1)) {
    throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0 y 1');
  }
}

/** Error estándar de la media: s/√n. */
export function eemDe(de: number, n: number): number {
  validarDispersion(de, n);
  return de / Math.sqrt(n);
}

/**
 * Cuantil bilateral de la t de Student con n − 1 grados de libertad:
 * t_{n−1, 1−α/2}. Es el multiplicador que sustituye al 1.96 de la normal y
 * tiende a él al crecer n.
 */
export function tCritico(n: number, nivel = 0.95): number {
  if (!Number.isInteger(n) || n < 2) throw new RangeError('entrada_invalida: se requiere n entero ≥ 2');
  validarNivel(nivel);
  return qt(1 - (1 - nivel) / 2, n - 1);
}

/**
 * IC de la media a partir del resumen (Student 1908):
 * x̄ ± t_{n−1, 1−α/2} · s/√n.
 */
export function icMediaResumen(media: number, de: number, n: number, nivel = 0.95): Estimacion {
  validarResumen(media, de, n);
  validarNivel(nivel);
  const t = qt(1 - (1 - nivel) / 2, n - 1);
  const ee = de / Math.sqrt(n);
  return { valor: media, ic: [media - t * ee, media + t * ee], nivel, metodo: 't' };
}

/**
 * IC de la desviación estándar poblacional a partir de la distribución χ² de
 * (n − 1)s²/σ² (Altman et al. 2000):
 * [ s·√((n−1)/χ²_{n−1, 1−α/2}), s·√((n−1)/χ²_{n−1, α/2}) ].
 *
 * Es un intervalo de colas iguales sobre la varianza, no el más corto posible,
 * y depende mucho más de la normalidad que el de la media.
 */
export function icDesviacion(de: number, n: number, nivel = 0.95): Estimacion {
  validarDispersion(de, n);
  validarNivel(nivel);
  const lo = de * Math.sqrt((n - 1) / qchisq(1 - (1 - nivel) / 2, n - 1));
  const hi = de * Math.sqrt((n - 1) / qchisq((1 - nivel) / 2, n - 1));
  return { valor: de, ic: [lo, hi], nivel, metodo: 'chi2-varianza' };
}

/** Límites de «media ± k·DE», el rango donde caen los datos individuales (no una media poblacional). */
export function limitesDe(media: number, de: number, k: number): [number, number] {
  return [media - k * de, media + k * de];
}

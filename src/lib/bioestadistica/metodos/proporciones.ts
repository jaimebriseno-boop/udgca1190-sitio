/**
 * Intervalos de confianza de una proporción binomial (calculadora D3 de la
 * especificación; reutilizados por Sn, Sp, VPP, VPN, prevalencia, etc.).
 *
 * Seis métodos con la MISMA aritmética que el oráculo R: `binom::binom.confint`
 * para Wilson, Clopper-Pearson ("exact"), Agresti-Coull y Wald ("asymptotic"),
 * y fórmulas explícitas para Wilson con corrección de continuidad (Newcombe
 * 1998, método 4) y Jeffreys de colas iguales (Brown, Cai y DasGupta 2001).
 * No se aplican recortes a [0, 1] que R no aplique (Wald y Agresti-Coull pueden
 * salirse del rango: es una propiedad del método que la interfaz debe mostrar).
 *
 * Referencias: Wilson EB. JASA 1927;22:209-12 · Clopper CJ, Pearson ES.
 * Biometrika 1934;26:404-13 · Agresti A, Coull BA. Am Stat 1998;52:119-26 ·
 * Newcombe RG. Stat Med 1998;17:857-72 · Brown LD, Cai TT, DasGupta A. Stat Sci
 * 2001;16:101-33.
 */
import { qbeta, qnorm } from '../primitivas/distribuciones.ts';
import type { Estimacion, MetodoId } from '../nucleo/tipos.ts';

export const METODOS_PROPORCION = [
  'wilson',
  'wilson-cc',
  'clopper-pearson',
  'agresti-coull',
  'jeffreys',
  'wald',
] as const;
export type MetodoProporcion = (typeof METODOS_PROPORCION)[number];

/** Lanza `RangeError` si (x, n) no son conteos válidos: enteros, n ≥ 1, 0 ≤ x ≤ n. */
export function validarConteos(x: number, n: number): void {
  if (!Number.isInteger(x) || !Number.isInteger(n) || n < 1 || x < 0 || x > n) {
    throw new RangeError('entrada_invalida: se requieren enteros con 0 ≤ x ≤ n y n ≥ 1');
  }
}

/** Cuantil normal bilateral del nivel de confianza: z = Φ⁻¹(1 − α/2). */
export function zNivel(nivel: number): number {
  if (!(nivel > 0 && nivel < 1)) throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0 y 1');
  return qnorm(1 - (1 - nivel) / 2);
}

function estimacion(x: number, n: number, nivel: number, metodo: MetodoId, lo: number, hi: number): Estimacion {
  return { valor: x / n, ic: [lo, hi], nivel, metodo };
}

/** Wald (asintótico): p̂ ± z·√(p̂(1−p̂)/n). Igual que `binom.confint(methods = "asymptotic")`, sin recorte. */
export function icWald(x: number, n: number, nivel = 0.95): Estimacion {
  validarConteos(x, n);
  const z = zNivel(nivel);
  const p = x / n;
  const se = Math.sqrt((p * (1 - p)) / n);
  return estimacion(x, n, nivel, 'wald', p - z * se, p + z * se);
}

/** Wilson (score, 1927). Misma secuencia de operaciones que `binom.confint(methods = "wilson")`. */
export function icWilson(x: number, n: number, nivel = 0.95): Estimacion {
  validarConteos(x, n);
  const z = zNivel(nivel);
  const z2 = z * z;
  const p = x / n;
  const p1 = p + (0.5 * z2) / n;
  const p2 = z * Math.sqrt((p * (1 - p) + (0.25 * z2) / n) / n);
  const p3 = 1 + z2 / n;
  return estimacion(x, n, nivel, 'wilson', (p1 - p2) / p3, (p1 + p2) / p3);
}

/** Agresti-Coull (1998): Wald sobre ñ = n + z², p̃ = (x + z²/2)/ñ. Igual que `binom.confint(methods = "agresti-coull")`, sin recorte. */
export function icAgrestiCoull(x: number, n: number, nivel = 0.95): Estimacion {
  validarConteos(x, n);
  const z = zNivel(nivel);
  const z2 = z * z;
  const xt = x + 0.5 * z2;
  const nt = n + z2;
  const pt = xt / nt;
  const h = z * Math.sqrt((pt * (1 - pt)) / nt);
  return estimacion(x, n, nivel, 'agresti-coull', pt - h, pt + h);
}

/** Clopper-Pearson (1934), «exacto»: cuantiles beta; 0 en x = 0 y 1 en x = n, como `binom.confint(methods = "exact")`. */
export function icClopperPearson(x: number, n: number, nivel = 0.95): Estimacion {
  validarConteos(x, n);
  if (!(nivel > 0 && nivel < 1)) throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0 y 1');
  const a = 1 - nivel;
  const lo = x === 0 ? 0 : qbeta(a / 2, x, n - x + 1);
  const hi = x === n ? 1 : qbeta(1 - a / 2, x + 1, n - x);
  return estimacion(x, n, nivel, 'clopper-pearson', lo, hi);
}

/** Jeffreys de colas iguales (Brown, Cai y DasGupta 2001): Beta(x + ½, n − x + ½); 0 y 1 en los extremos. */
export function icJeffreys(x: number, n: number, nivel = 0.95): Estimacion {
  validarConteos(x, n);
  if (!(nivel > 0 && nivel < 1)) throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0 y 1');
  const a = 1 - nivel;
  const lo = x === 0 ? 0 : qbeta(a / 2, x + 0.5, n - x + 0.5);
  const hi = x === n ? 1 : qbeta(1 - a / 2, x + 0.5, n - x + 0.5);
  return estimacion(x, n, nivel, 'jeffreys', lo, hi);
}

/** Wilson con corrección de continuidad (Newcombe 1998, método 4); L = 0 si x = 0, U = 1 si x = n; recortado a [0, 1] igual que el snippet R. */
export function icWilsonCC(x: number, n: number, nivel = 0.95): Estimacion {
  validarConteos(x, n);
  const z = zNivel(nivel);
  const z2 = z * z;
  const p = x / n;
  const lo =
    x === 0
      ? 0
      : Math.max(0, (2 * n * p + z2 - 1 - z * Math.sqrt(z2 - 2 - 1 / n + 4 * p * (n * (1 - p) + 1))) / (2 * (n + z2)));
  const hi =
    x === n
      ? 1
      : Math.min(1, (2 * n * p + z2 + 1 + z * Math.sqrt(z2 + 2 - 1 / n + 4 * p * (n * (1 - p) - 1))) / (2 * (n + z2)));
  return estimacion(x, n, nivel, 'wilson-cc', lo, hi);
}

/** IC de una proporción por el método indicado (Wilson por defecto). */
export function icProporcion(
  x: number,
  n: number,
  op: { nivel?: number; metodo?: MetodoProporcion } = {},
): Estimacion {
  const nivel = op.nivel ?? 0.95;
  switch (op.metodo ?? 'wilson') {
    case 'wilson':
      return icWilson(x, n, nivel);
    case 'wilson-cc':
      return icWilsonCC(x, n, nivel);
    case 'clopper-pearson':
      return icClopperPearson(x, n, nivel);
    case 'agresti-coull':
      return icAgrestiCoull(x, n, nivel);
    case 'jeffreys':
      return icJeffreys(x, n, nivel);
    case 'wald':
      return icWald(x, n, nivel);
  }
}

/** Los seis métodos a la vez (para la calculadora comparativa y la gráfica). */
export function icProporcionTodos(x: number, n: number, nivel = 0.95): Record<MetodoProporcion, Estimacion> {
  return {
    wilson: icWilson(x, n, nivel),
    'wilson-cc': icWilsonCC(x, n, nivel),
    'clopper-pearson': icClopperPearson(x, n, nivel),
    'agresti-coull': icAgrestiCoull(x, n, nivel),
    jeffreys: icJeffreys(x, n, nivel),
    wald: icWald(x, n, nivel),
  };
}

/** Amplitud del intervalo (hi − lo); NaN si no hay IC. */
export function amplitud(e: Estimacion): number {
  return e.ic ? e.ic[1] - e.ic[0] : NaN;
}

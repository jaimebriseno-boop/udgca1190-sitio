/**
 * Tamaño de muestra y poder para comparar medias (C4 y C5 de la
 * especificación): el método exacto de la t no central, idéntico a
 * `power.t.test` de R, y la aproximación normal clásica con la corrección de
 * Guenther (1981) que se muestra como fila didáctica.
 *
 * Bajo la hipótesis alternativa el estadístico t sigue una t NO central con
 * `df = ν` y parámetro de no centralidad `λ = |Δ| / SE`; el poder es la masa de
 * esa distribución por encima del valor crítico de la t central. R lo escribe
 * así en el cuerpo de `power.t.test` (R 4.5.2):
 *
 *     nu <- pmax(1e-07, n - 1) * tsample
 *     pt(qt(sig.level/tside, nu, lower.tail = FALSE), nu,
 *        ncp = sqrt(n/tsample) * delta/sd, lower.tail = FALSE)
 *
 * con `tsample` = 2 (dos muestras, n por grupo) o 1 (pareadas), y resuelve
 * `uniroot(..., c(2, 1e7), tol = 1e-10, extendInt = "upX")`. Este módulo
 * reproduce esa misma función y ese mismo buscador de raíces (la traducción
 * literal de `zeroin` que vive en `primitivas/raices.ts`), y además la
 * generaliza a una razón de asignación `r = n2/n1` cualquiera, que
 * `power.t.test` no cubre: con `r ≠ 1`, ν = n₁(1 + r) − 2 y
 * λ = |Δ| / (σ·√(1/n₁ + 1/(r·n₁))).
 *
 * Todo viaja SIN redondear: el techo lo aplica la presentación una sola vez.
 *
 * Referencias: Student. Biometrika 1908;6:1–25 · Guenther WC. Am Stat
 * 1981;35:243–4 · Cohen J. Statistical Power Analysis for the Behavioral
 * Sciences, 2.ª ed., 1988 · Lenth RV. Appl Stat 1989 (AS 243, la `pnt` que
 * usa este módulo) · Lachin JM. Control Clin Trials 1981;2:93–113.
 */
import { pnorm, pnt, qt } from '../primitivas/distribuciones.ts';
import { uniroot } from '../primitivas/raices.ts';
import { zAlfa, zPoder } from './muestra-comun.ts';
import type { Lateralidad } from './muestra-comun.ts';

/** Extremo inferior del corchete de `power.t.test`: con menos de dos por grupo no hay varianza que estimar. */
export const N_MINIMO = 2;

/** Extremo superior del corchete de `power.t.test`. */
export const N_MAXIMO = 1e7;

/** `tol` con la que la especificación (§0) llama a `power.t.test`. */
export const TOL_POTENCIA = 1e-10;

/** Número de colas de la prueba: 2 si es bilateral, 1 si es unilateral (el `tside` de R). */
export function tside(lateralidad: Lateralidad): 1 | 2 {
  return lateralidad === 'bilateral' ? 2 : 1;
}

/**
 * Poder EXACTO de la t de Student de dos muestras independientes con n₁ y
 * n₂ = r·n₁, por la t no central.
 *
 * El signo de Δ no cambia nada: la hipótesis alternativa se plantea sobre la
 * magnitud de la diferencia, así que entra `|Δ|` (es lo que hace R cuando la
 * prueba es bilateral, `delta <- abs(delta)`).
 */
export function poderDosMedias(
  n1: number,
  delta: number,
  sigma: number,
  alfa: number,
  lateralidad: Lateralidad,
  r: number,
): number {
  const nu = Math.max(1e-7, n1 * (1 + r) - 2);
  const ncp = Math.abs(delta) / (sigma * Math.sqrt(1 / n1 + 1 / (r * n1)));
  return pnt(qt(alfa / tside(lateralidad), nu, false), nu, ncp, false);
}

/**
 * Poder EXACTO de la t de Student pareada (o de una muestra) con n pares y
 * desviación estándar de las diferencias `deDif`: ν = n − 1 y
 * λ = √n·|Δ|/σ_d. Es, literalmente, el `p.body` de `power.t.test` con
 * `tsample = 1`.
 */
export function poderPareadas(
  n: number,
  delta: number,
  deDif: number,
  alfa: number,
  lateralidad: Lateralidad,
): number {
  const nu = Math.max(1e-7, n - 1);
  const ncp = (Math.sqrt(n) * Math.abs(delta)) / deDif;
  return pnt(qt(alfa / tside(lateralidad), nu, false), nu, ncp, false);
}

/**
 * Menor n real que alcanza el poder objetivo, con el corchete y la tolerancia
 * de `power.t.test`.
 *
 * Dos bordes que R resuelve extendiendo el intervalo (`extendInt = "upX"`) y
 * aquí se resuelven de forma explícita, porque un tamaño de muestra menor que
 * dos no significa nada y un `uniroot` sin cambio de signo sería un error:
 *
 * - si con el mínimo (2) ya se supera el poder pedido, la respuesta es 2;
 * - si ni con 10⁷ se alcanza (efecto ridículamente pequeño), es «no definido»
 *   (`NaN` aquí, `NA_real_` en R), no un número enorme inventado.
 *
 * El snippet de R de cada calculadora lleva escritas estas mismas dos guardas,
 * para que el oráculo y TypeScript sigan devolviendo el mismo número.
 */
export function resolverN(poderEn: (n: number) => number, poder: number): number {
  if (poderEn(N_MINIMO) >= poder) return N_MINIMO;
  if (poderEn(N_MAXIMO) < poder) return Number.NaN;
  return uniroot((n) => poderEn(n) - poder, N_MINIMO, N_MAXIMO, { tol: TOL_POTENCIA });
}

/** n₁ exacto (t no central) para comparar dos medias independientes con razón de asignación r. */
export function n1DosMedias(
  delta: number,
  sigma: number,
  alfa: number,
  lateralidad: Lateralidad,
  poder: number,
  r: number,
): number {
  return resolverN((n1) => poderDosMedias(n1, delta, sigma, alfa, lateralidad, r), poder);
}

/** n exacto (t no central) de un contraste pareado: número de PARES, no de mediciones. */
export function nPareadas(
  delta: number,
  deDif: number,
  alfa: number,
  lateralidad: Lateralidad,
  poder: number,
): number {
  return resolverN((n) => poderPareadas(n, delta, deDif, alfa, lateralidad), poder);
}

/**
 * `power.t.test(type = "two.sample")$n` reproducido byte a byte en su propia
 * parametrización (ν = (n − 1)·2, λ = √(n/2)·|Δ|/σ), para poder enseñar la
 * comparación cuando los grupos son iguales. Con r ≠ 1 `power.t.test` no
 * aplica y la calculadora devuelve `NaN` (el `NA_real_` del snippet).
 */
export function nPowerTTestDosMuestras(
  delta: number,
  sigma: number,
  alfa: number,
  lateralidad: Lateralidad,
  poder: number,
): number {
  const poderEn = (n: number): number => {
    const nu = Math.max(1e-7, n - 1) * 2;
    const ncp = (Math.sqrt(n / 2) * Math.abs(delta)) / sigma;
    return pnt(qt(alfa / tside(lateralidad), nu, false), nu, ncp, false);
  };
  return resolverN(poderEn, poder);
}

/**
 * Aproximación normal clásica con la corrección de Guenther (1981) para dos
 * medias independientes:
 *
 *     n₁ = (1 + 1/r)·(z_{1−α/2} + z_{1−β})²·σ²/Δ² + z_{1−α/2}²/4
 *
 * El último término es la corrección: sin él la fórmula normal se queda una o
 * dos unidades por debajo de la solución exacta, porque ignora que σ se estima.
 */
export function n1NormalDosMedias(
  delta: number,
  sigma: number,
  alfa: number,
  lateralidad: Lateralidad,
  poder: number,
  r: number,
): number {
  const za = zAlfa(alfa, lateralidad);
  const zb = zPoder(poder);
  return ((1 + 1 / r) * (za + zb) ** 2 * sigma ** 2) / delta ** 2 + za ** 2 / 4;
}

/**
 * Aproximación normal de Guenther (1981) para un contraste de una muestra o
 * pareado: `n = (z_{1−α/2} + z_{1−β})²·σ_d²/Δ² + z_{1−α/2}²/2`. La corrección
 * es la mitad de la de dos muestras porque solo hay una varianza que estimar.
 */
export function nNormalPareadas(
  delta: number,
  deDif: number,
  alfa: number,
  lateralidad: Lateralidad,
  poder: number,
): number {
  const za = zAlfa(alfa, lateralidad);
  const zb = zPoder(poder);
  return ((za + zb) ** 2 * deDif ** 2) / delta ** 2 + za ** 2 / 2;
}

/**
 * Poder aproximado por la normal: `Φ(|Δ|/SE − z_{1−α/2})` (modo inverso de C0).
 * Se muestra junto al exacto para que se vea cuánto se aparta la aproximación
 * cuando la muestra es pequeña.
 */
export function poderNormal(delta: number, ee: number, alfa: number, lateralidad: Lateralidad): number {
  return pnorm(Math.abs(delta) / ee - zAlfa(alfa, lateralidad));
}

/** Error estándar de la diferencia de dos medias independientes: `σ·√(1/n₁ + 1/n₂)`. */
export function eeDosMedias(sigma: number, n1: number, n2: number): number {
  return sigma * Math.sqrt(1 / n1 + 1 / n2);
}

/**
 * Desviación estándar de las diferencias a partir de la DE de cada medición y
 * de la correlación entre ambas: `σ_d = σ·√(2(1 − ρ))`.
 *
 * Con ρ → 1 las dos mediciones son casi la misma y σ_d → 0: por eso el YAML
 * corta ρ en 0.98 y la especificación bloquea ρ ≥ 0.99.
 */
export function deDiferencias(sigma: number, rho: number): number {
  return sigma * Math.sqrt(2 * (1 - rho));
}

/** d de Cohen: la diferencia que importa medida en desviaciones estándar. */
export function dCohen(delta: number, de: number): number {
  return Math.abs(delta) / de;
}

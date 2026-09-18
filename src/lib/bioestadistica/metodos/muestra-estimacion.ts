/**
 * Tamaño de muestra para ESTIMAR un parámetro con una precisión absoluta
 * prefijada (C1 y C2 de la especificación): una proporción y una media, con
 * corrección por población finita y con el modo inverso (qué precisión alcanza
 * un n ya disponible).
 *
 * Cada función reproduce, operación por operación y en el mismo orden, la línea
 * correspondiente del snippet de R que la página muestra y que `Rscript`
 * ejecuta para el fixture. En R, `x^2` con exponente 2 es literalmente `x * x`
 * (`R_pow`), así que `z^2 * p * (1 - p) / d^2` y `(z * z * p * (1 - p)) / (d * d)`
 * producen el mismo doble.
 *
 * Nada se redondea aquí: el techo lo aplica la presentación una sola vez, al
 * final (`techo()` de `muestra-comun.ts`).
 *
 * Referencias:
 * - Cochran WG. Sampling Techniques. 3.ª ed. Wiley 1977 (n₀ y corrección por
 *   población finita).
 * - Lwanga SK, Lemeshow S. Sample Size Determination in Health Studies. OMS
 *   1991 (ajuste por pérdidas previstas).
 * - Student. The probable error of a mean. Biometrika 1908;6:1–25 (variante t).
 */
import { qt } from '../primitivas/distribuciones.ts';
import { zNivel } from './proporciones.ts';

/**
 * Pasos que explora la búsqueda del menor n de la variante t. Son los mismos
 * que hace el snippet (`for (i in 1:64)`), para que TypeScript y R recorran
 * exactamente la misma secuencia de cuantiles. La brecha entre el mínimo y
 * `⌈n_z⌉` es del orden de (1 + z²)/2 —menos de 6 sujetos incluso al 99.9 %—,
 * así que 64 pasos sobran; el tope solo garantiza que el bucle termine.
 */
export const PASOS_T = 64;

/**
 * Valor de una entrada opcional que significa «no se capturó»: 0, el mismo
 * convenio que `n_d`/`n_nd` de `valores-predictivos` y que comparten las siete
 * calculadoras del grupo `muestra`. Un 0 viaja al snippet de R como un número
 * más y los casos de fixture (JSON estricto, sin `NaN`) pueden escribirlo, así
 * que las DOS ramas de cada opcional quedan validadas contra el oráculo.
 */
export const SIN_DATO = 0;

/**
 * `true` si la entrada opcional trae un valor utilizable. El umbral es 2, no 1:
 * ni una población de un solo individuo ni una muestra de uno admiten
 * corrección ni intervalo, así que 0 y 1 significan lo mismo, «sin dato».
 */
export function hayDato(x: number): boolean {
  return x >= 2;
}

/** Proporción esperada estrictamente dentro de (0, 1): con 0 o 1 la varianza es 0 y n₀ sería 0. */
function exigirProporcionEsperada(p: number): void {
  if (!(p > 0 && p < 1)) {
    throw new RangeError('entrada_invalida: la proporción esperada debe estar entre 0 y 1 (exclusivos)');
  }
}

/** Desviación estándar esperada: finita y positiva. */
function exigirSigma(sigma: number): void {
  if (!(Number.isFinite(sigma) && sigma > 0)) {
    throw new RangeError('entrada_invalida: la desviación estándar esperada debe ser mayor que 0');
  }
}

/** Precisión absoluta (semiamplitud del intervalo): finita y positiva. */
function exigirPrecision(d: number): void {
  if (!(Number.isFinite(d) && d > 0)) {
    throw new RangeError('entrada_invalida: la precisión absoluta debe ser mayor que 0');
  }
}

/** Población finita: un entero no negativo (0 y 1 = «sin población declarada»). */
function exigirPoblacion(poblacion: number): void {
  if (!Number.isInteger(poblacion) || poblacion < 0) {
    throw new RangeError('entrada_invalida: la población finita debe ser un entero mayor o igual que 0');
  }
}

/**
 * Tamaño con el que se evalúa la precisión: un número positivo. No se exige que
 * sea entero porque la misma función dibuja la curva de precisión frente a n,
 * que recorre valores continuos; que la entrada del modo inverso sea un entero
 * lo comprueba `validar()` de la calculadora, y el «sin dato» (0) lo filtra la
 * calculadora antes de llamar aquí.
 */
function exigirNEvaluado(n: number): void {
  if (!(Number.isFinite(n) && n > 0)) {
    throw new RangeError('entrada_invalida: el tamaño de muestra debe ser mayor que 0');
  }
}

// ---------------------------------------------------------------------------
// Corrección por población finita (Cochran 1977)
// ---------------------------------------------------------------------------

/**
 * Corrección por población finita: `n = n₀ / (1 + (n₀ − 1)/N)`. Sin población
 * declarada (0) devuelve `n₀` sin tocar, igual que la rama
 * `if (poblacion >= 2) … else n0` del snippet.
 *
 * La corrección nunca sube el tamaño: para `N ≥ 2` y `n₀ > 1` el denominador es
 * mayor que 1, y el resultado tiende a `N` cuando `n₀ → ∞`.
 */
export function conCpf(n0: number, poblacion: number): number {
  exigirPoblacion(poblacion);
  if (!hayDato(poblacion)) return n0;
  return n0 / (1 + (n0 - 1) / poblacion);
}

/**
 * Inversa exacta de `conCpf`: el `n₀` (tamaño sin corregir) que, corregido por
 * una población de `N`, daría el `n` observado. Se despeja de
 * `n = n₀N/(N + n₀ − 1)`:
 *
 *     n₀ = n (N − 1) / (N − n)
 *
 * Con `n = N` (censo) el denominador es 0 y el resultado es `+∞`: la precisión
 * que se alcanza midiendo a toda la población es 0. Con `n > N` el cociente es
 * negativo, que es como se propaga «se pidió más muestra que población».
 * Sin población declarada (0) devuelve `n` tal cual.
 */
export function sinCpf(n: number, poblacion: number): number {
  exigirPoblacion(poblacion);
  if (!hayDato(poblacion)) return n;
  return (n * (poblacion - 1)) / (poblacion - n);
}

// ---------------------------------------------------------------------------
// C1 · Estimar una proporción
// ---------------------------------------------------------------------------

/**
 * Tamaño sin corregir para estimar una proporción con precisión absoluta `d`
 * (semiamplitud del intervalo de Wald):
 *
 *     n₀ = z²_{1−α/2} · p(1−p) / d²   (Cochran 1977)
 *
 * `p = 0.5` es el peor caso: maximiza `p(1−p)` y, por tanto, `n₀`.
 */
export function nProporcion(p: number, d: number, nivel: number): number {
  exigirProporcionEsperada(p);
  exigirPrecision(d);
  const z = zNivel(nivel);
  return (z * z * p * (1 - p)) / (d * d);
}

/**
 * Precisión absoluta alcanzable con `n` participantes: invierte exactamente
 * `n(d)`, incluida la corrección por población finita.
 *
 *     d(n) = z_{1−α/2} · √( p(1−p) / n₀(n) ),   n₀(n) = n(N−1)/(N−n)
 *
 * Vale para cualquier `n > 0`, porque la misma función dibuja la curva de la
 * gráfica. El «sin dato» del modo inverso (0) lo filtra la calculadora, que en
 * ese caso publica `NaN`, igual que el `NA_real_` del snippet.
 */
export function precisionProporcion(p: number, n: number, poblacion: number, nivel: number): number {
  exigirProporcionEsperada(p);
  exigirNEvaluado(n);
  return zNivel(nivel) * Math.sqrt((p * (1 - p)) / sinCpf(n, poblacion));
}

// ---------------------------------------------------------------------------
// C2 · Estimar una media
// ---------------------------------------------------------------------------

/**
 * Tamaño para estimar una media con precisión absoluta `d` usando el cuantil
 * normal:
 *
 *     n_z = (z_{1−α/2} · σ / d)²   (Cochran 1977)
 */
export function nMedia(sigma: number, d: number, nivel: number): number {
  exigirSigma(sigma);
  exigirPrecision(d);
  const z = zNivel(nivel);
  const t = (z * sigma) / d;
  return t * t;
}

/**
 * Variante con la t de Student: el MENOR entero `n ≥ 2` que cumple
 *
 *     n ≥ ( t_{n−1, 1−α/2} · σ / d )²
 *
 * Se busca de uno en uno desde `max(2, ⌈n_z⌉)`, que es cota inferior porque
 * `t > z`. La condición es monótona —al subir n el lado izquierdo crece en 1 y
 * el derecho baja, porque `t_{n−1}` decrece con los grados de libertad—, así
 * que el primer n que la cumple es el mínimo y a partir de ahí se sigue
 * cumpliendo.
 *
 * NO se resuelve por punto fijo. Iterar `n ← (t_{⌈n⌉−1}·σ/d)²` entra en un
 * ciclo de periodo 2 y publica la fase en la que caiga la última pasada, que
 * puede quedar POR DEBAJO del mínimo: con σ = 1, d = 0.36 y 80 % de confianza
 * el punto fijo da 14, pero con 14 sujetos la semiamplitud es 0.3608 y no baja
 * de 0.36 hasta n = 15.
 *
 * El mínimo es 2 porque una media sin al menos dos observaciones no tiene
 * intervalo, y los grados de libertad se acotan a 1: con n = 2, `n − 1` vale 1,
 * y `qt` no está definida con 0.
 */
export function nMediaT(sigma: number, d: number, nivel: number): number {
  exigirSigma(sigma);
  exigirPrecision(d);
  const cola = 1 - (1 - nivel) / 2;
  let n = Math.max(2, Math.ceil(nMedia(sigma, d, nivel)));
  if (!Number.isFinite(n)) return Number.NaN;
  for (let i = 0; i < PASOS_T; i += 1) {
    const t = (qt(cola, Math.max(1, n - 1)) * sigma) / d;
    if (n >= t * t) return n;
    // Con n por encima de 2^53 sumar uno no cambia el doble: el bucle no puede
    // avanzar y n ya es el menor tamaño representable que se puede publicar.
    if (n + 1 === n) return n;
    n += 1;
  }
  return Number.NaN;
}

/**
 * Semiamplitud que se alcanza de verdad con `n` sujetos usando el cuantil de la
 * t, `t_{n−1,1−α/2}·σ/√n`. Es lo que hace comprobable el tamaño de la variante
 * t: con el n que publica queda por debajo de la precisión pedida, y con n − 1
 * no. Los grados de libertad se acotan a 1 igual que en `nMediaT`.
 */
export function precisionMediaT(sigma: number, n: number, nivel: number): number {
  exigirSigma(sigma);
  exigirNEvaluado(n);
  return (qt(1 - (1 - nivel) / 2, Math.max(1, n - 1)) * sigma) / Math.sqrt(n);
}

/**
 * Precisión absoluta alcanzable con `n` sujetos si la desviación estándar real
 * es `σ`: invierte `n_z(d)` con la misma corrección por población finita.
 *
 *     d(n) = z_{1−α/2} · σ / √( n_z(n) )
 *
 * Vale para cualquier `n > 0` (la curva de la gráfica la recorre entera); el
 * «sin dato» del modo inverso (0) lo filtra la calculadora.
 */
export function precisionMedia(sigma: number, n: number, poblacion: number, nivel: number): number {
  exigirSigma(sigma);
  exigirNEvaluado(n);
  return (zNivel(nivel) * sigma) / Math.sqrt(sinCpf(n, poblacion));
}

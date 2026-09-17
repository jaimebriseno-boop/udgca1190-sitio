/**
 * Descriptivos de una columna pegada (calculadora D6 de la especificación):
 * momentos, cuantiles del tipo 7, cercas de Tukey, media geométrica, clases de
 * Sturges y el resumen completo con el IC t de la media.
 *
 * Misma aritmética y mismo orden que el snippet de R de la calculadora
 * `descriptivos`. Tres detalles de R que se reproducen aquí a propósito:
 *
 * - `mean()` no es una suma simple: R acumula, divide entre n y corrige con la
 *   media de los residuos, `s + Σ(xᵢ − s)/n`. Esa segunda pasada recupera casi
 *   toda la precisión de la primera, que R hace SIN compensar, y aquí se
 *   reproduce tal cual, también sin compensar. Ver la nota de `media()`.
 * - `quantile(type = 7)` interpola sobre el índice 1 + (n − 1)p y deja el valor
 *   sin tocar cuando los dos vecinos coinciden (Hyndman y Fan 1996).
 * - `sd()` divide entre n − 1, y `var()` centra con su propia media de una sola
 *   pasada, no con la de dos pasadas de `mean()`.
 *
 * Nada se redondea: `NaN` significa «no definido» (G₁ con n < 3 o columna
 * constante, G₂ con n < 4, media geométrica con algún valor ≤ 0, Shapiro-Wilk
 * fuera de 3 ≤ n ≤ 5000 o con rango 0), igual que el `NA` del snippet.
 *
 * Referencias: Tukey JW. Exploratory Data Analysis, Addison-Wesley 1977 ·
 * Hyndman RJ, Fan Y. Am Stat 1996;50:361-5 · Joanes DN, Gill CA. The
 * Statistician 1998;47:183-9 · Sturges HA. J Am Stat Assoc 1926;21:65-6 ·
 * Royston P. Appl Stat 1995;44:547-51.
 */
import { qt } from '../primitivas/distribuciones.ts';
import { N_MAX_SHAPIRO, N_MIN_SHAPIRO, shapiroWilk } from './shapiro.ts';
import type { BinHistograma, CajaResumen, Estimacion } from '../nucleo/tipos.ts';

/** Número mínimo de valores de la columna: con uno solo no hay dispersión. */
export const N_MIN_COLUMNA = 2;

/** Multiplicador de las cercas de Tukey (1977): 1.5 × IQR a cada lado de la caja. */
export const K_TUKEY = 1.5;

/** Ids de salida = claves del JSON de R = celdas de la interfaz = claves del fixture. */
export const SALIDAS_DESCRIPTIVOS = [
  'n',
  'media',
  'de',
  'eem',
  'mediana',
  'q1',
  'q3',
  'iqr',
  'min',
  'max',
  'rango',
  'cv',
  'g1',
  'g2',
  'media_geom',
  'sw_w',
  'sw_p',
  'n_atipicos',
] as const;
export type SalidaDescriptivos = (typeof SALIDAS_DESCRIPTIVOS)[number];
export type ValoresDescriptivos = Record<SalidaDescriptivos, Estimacion>;

// ---------------------------------------------------------------------------
// Sumas y momentos
// ---------------------------------------------------------------------------

/**
 * Media aritmética EXACTAMENTE como `mean()` de R: una primera pasada que
 * acumula en doble sin compensar, s = Σx/n, y una segunda que corrige con la
 * media de los residuos, s + Σ(xᵢ − s)/n.
 *
 * No se usa una suma compensada a propósito, aunque sería más exacta. El
 * oráculo de esta calculadora es R, y el acumulador `LDOUBLE` de su código C es
 * `long double`, que en arm64 (este equipo, y Apple Silicon en general) es el
 * mismo doble de 64 bits. Compensar aquí separaría el resultado del oráculo en
 * cuanto la columna mezclara magnitudes muy distintas: con
 * [1e16, 1, 1, 1, −1e16, 2, 3, −2], R da 0.609375 y una suma de Neumaier daría
 * otra cosa. La segunda pasada es la que recupera casi toda la precisión.
 */
export function media(x: readonly number[]): number {
  const n = x.length;
  let s = 0;
  for (const v of x) s += v;
  s /= n;
  if (!Number.isFinite(s)) return s;
  let t = 0;
  for (const v of x) t += v - s;
  return s + t / n;
}

/** Momento central muestral mₖ = (1/n)·Σ(xᵢ − x̄)ᵏ, con la media de R. */
export function momentoCentral(x: readonly number[], k: number, m: number): number {
  return media(x.map((v) => (v - m) ** k));
}

/**
 * Varianza muestral con denominador n − 1, como `var()` de R.
 *
 * Ojo al detalle: `var()` centra con su propia media de UNA pasada (Σx/n), no
 * con la de dos pasadas de `mean()`. La diferencia es de segundo orden, porque
 * la suma de cuadrados es estacionaria en la media, pero se reproduce igual
 * para que TypeScript y R hagan las mismas operaciones en el mismo orden.
 */
export function varianza(x: readonly number[]): number {
  const n = x.length;
  let s = 0;
  for (const v of x) s += v;
  const m = s / n;
  let ss = 0;
  for (const v of x) ss += (v - m) ** 2;
  return ss / (n - 1);
}

/** Desviación estándar muestral, √(Σ(xᵢ − x̄)²/(n − 1)). */
export function desviacion(x: readonly number[]): number {
  return Math.sqrt(varianza(x));
}

/**
 * Asimetría G₁ (Joanes y Gill 1998, «tipo 2»: la de SPSS y SAS):
 * G₁ = (m₃/m₂^{3/2})·√(n(n − 1))/(n − 2). `NaN` con n < 3 o columna constante.
 */
export function asimetriaG1(x: readonly number[], m = media(x)): number {
  const n = x.length;
  const m2 = momentoCentral(x, 2, m);
  if (n < 3 || !(m2 > 0)) return Number.NaN;
  return (momentoCentral(x, 3, m) / m2 ** 1.5) * (Math.sqrt(n * (n - 1)) / (n - 2));
}

/**
 * Curtosis G₂ (Joanes y Gill 1998, «tipo 2», en exceso sobre la normal):
 * G₂ = [(n + 1)(m₄/m₂² − 3) + 6]·(n − 1)/((n − 2)(n − 3)).
 * `NaN` con n < 4 o columna constante.
 */
export function curtosisG2(x: readonly number[], m = media(x)): number {
  const n = x.length;
  const m2 = momentoCentral(x, 2, m);
  if (n < 4 || !(m2 > 0)) return Number.NaN;
  return (((n + 1) * (momentoCentral(x, 4, m) / m2 ** 2 - 3) + 6) * (n - 1)) / ((n - 2) * (n - 3));
}

/** Media geométrica exp((1/n)·Σ ln xᵢ); `NaN` si algún valor no es positivo. */
export function mediaGeometrica(x: readonly number[]): number {
  if (!x.every((v) => v > 0)) return Number.NaN;
  return Math.exp(media(x.map((v) => Math.log(v))));
}

// ---------------------------------------------------------------------------
// Cuantiles del tipo 7 y cercas de Tukey
// ---------------------------------------------------------------------------

/**
 * Cuantil del tipo 7 (el de `quantile()` de R por omisión; Hyndman y Fan 1996)
 * sobre una copia YA ORDENADA de la columna.
 *
 * índice = 1 + (n − 1)p; con `lo = ⌊índice⌋` y `hi = ⌈índice⌉`, el resultado es
 * x₍ₗₒ₎ salvo que índice > lo y x₍ₕᵢ₎ ≠ x₍ₗₒ₎, en cuyo caso se interpola
 * (1 − h)·x₍ₗₒ₎ + h·x₍ₕᵢ₎ con h = índice − lo. La condición «x₍ₕᵢ₎ ≠ x₍ₗₒ₎» es
 * la de R y evita mover un cuantil que cae entre dos valores repetidos.
 */
export function cuantilTipo7(ordenado: readonly number[], p: number): number {
  const n = ordenado.length;
  const indice = 1 + Math.max(n - 1, 0) * p;
  const lo = Math.floor(indice);
  const hi = Math.ceil(indice);
  const qs = ordenado[lo - 1] as number;
  const alto = ordenado[hi - 1] as number;
  if (indice > lo && alto !== qs) {
    const h = indice - lo;
    return (1 - h) * qs + h * alto;
  }
  return qs;
}

/** Cuartiles y mediana del tipo 7, en el orden [Q₁, mediana, Q₃]. */
export function cuartilesTipo7(ordenado: readonly number[]): [number, number, number] {
  return [cuantilTipo7(ordenado, 0.25), cuantilTipo7(ordenado, 0.5), cuantilTipo7(ordenado, 0.75)];
}

/** Cercas de Tukey: Q₁ − k·IQR y Q₃ + k·IQR (k = 1.5 por omisión). */
export function cercasTukey(q1: number, q3: number, k = K_TUKEY): { inferior: number; superior: number } {
  const iqr = q3 - q1;
  return { inferior: q1 - k * iqr, superior: q3 + k * iqr };
}

/** Valores fuera de las cercas de Tukey, en el orden en que aparecen en la columna. */
export function atipicosTukey(x: readonly number[], q1: number, q3: number, k = K_TUKEY): number[] {
  const { inferior, superior } = cercasTukey(q1, q3, k);
  return x.filter((v) => v < inferior || v > superior);
}

/**
 * Resumen de cinco números con bigotes de Tukey para el diagrama de caja: los
 * bigotes llegan al dato más extremo que queda DENTRO de las cercas, y lo que
 * sobra se dibuja como punto.
 */
export function cajaTukey(x: readonly number[], k = K_TUKEY): CajaResumen {
  const ordenado = [...x].sort((a, b) => a - b);
  const [q1, mediana, q3] = cuartilesTipo7(ordenado);
  const { inferior, superior } = cercasTukey(q1, q3, k);
  const dentro = ordenado.filter((v) => v >= inferior && v <= superior);
  const minimo = ordenado[0] as number;
  const maximo = ordenado[ordenado.length - 1] as number;
  return {
    min: minimo,
    q1,
    mediana,
    q3,
    max: maximo,
    bigoteInf: dentro.length > 0 ? (dentro[0] as number) : minimo,
    bigoteSup: dentro.length > 0 ? (dentro[dentro.length - 1] as number) : maximo,
    atipicos: ordenado.filter((v) => v < inferior || v > superior),
  };
}

// ---------------------------------------------------------------------------
// Clases del histograma (solo para la gráfica: R no las valida)
// ---------------------------------------------------------------------------

/** Número de clases de Sturges (1926): k = ⌈log₂ n + 1⌉. */
export function clasesSturges(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(n) + 1));
}

/** Mantisas admitidas en un corte «bonito»: 1, 2, 2.5 o 5 por una potencia de diez. */
const BASES_BONITAS = [1, 2, 2.5, 5] as const;

/**
 * Paso «bonito» al estilo de `pretty()` de R: el menor número de la forma
 * 1, 2, 2.5 o 5 por una potencia de diez que llegue a `minimo`.
 */
export function pasoBonito(minimo: number): number {
  if (!(minimo > 0) || !Number.isFinite(minimo)) return 1;
  const exp = Math.floor(Math.log10(minimo));
  const potencia = 10 ** exp;
  const base = minimo / potencia;
  const escala = base <= 1 ? 1 : base <= 2 ? 2 : base <= 2.5 ? 2.5 : base <= 5 ? 5 : 10;
  return escala * potencia;
}

/** Pasos bonitos de las tres décadas alrededor de `objetivo`, en orden creciente. */
function pasosCandidatos(objetivo: number): number[] {
  const exp = Math.floor(Math.log10(objetivo));
  const salida: number[] = [];
  for (let e = exp - 1; e <= exp + 1; e += 1) {
    for (const base of BASES_BONITAS) salida.push(base * 10 ** e);
  }
  return salida.sort((a, b) => a - b);
}

/**
 * Ancho de clase del histograma: el paso bonito cuyo número de intervalos
 * queda más cerca de `k` cuando las clases empiezan en ⌊mín/paso⌋·paso.
 *
 * No se toma sin más el menor paso que cubra el rango con k clases, porque el
 * redondeo al alza puede reducir el histograma a la mitad de las clases que
 * pide Sturges (con 40 valores en [47, 226] daría cinco). Igual que `pretty()`
 * de R, se prefiere el corte redondo que deja el número de clases más próximo a
 * k; los empates los gana el paso menor, que da más detalle.
 */
export function pasoHistograma(minimo: number, maximo: number, k: number): number {
  const objetivo = (maximo - minimo) / k;
  if (!(objetivo > 0) || !Number.isFinite(objetivo)) return 1;
  let mejor = pasoBonito(objetivo);
  let mejorDistancia = Number.POSITIVE_INFINITY;
  for (const paso of pasosCandidatos(objetivo)) {
    const desde = Math.floor(minimo / paso) * paso;
    const clases = Math.max(1, Math.ceil((maximo - desde) / paso));
    const distancia = Math.abs(clases - k);
    if (distancia < mejorDistancia) {
      mejor = paso;
      mejorDistancia = distancia;
    }
  }
  return mejor;
}

/**
 * Clases del histograma por la regla de Sturges con cortes redondos: k =
 * ⌈log₂ n + 1⌉ intervalos de ancho «bonito» que empiezan en ⌊mín/paso⌋·paso.
 *
 * Los intervalos son [desde, hasta) salvo el último, que incluye su extremo
 * derecho para que el máximo caiga dentro (como `include.lowest` de `hist()`).
 * Una columna constante devuelve una sola clase centrada en el valor. Esto
 * alimenta solo la gráfica: no hay campo equivalente en el JSON de R.
 */
export function binsSturges(x: readonly number[]): BinHistograma[] {
  const n = x.length;
  // Sin `Math.min(...x)`: una columna pegada puede tener decenas de miles de
  // valores y el operador de propagación desbordaría la pila de llamadas.
  let minimo = x[0] as number;
  let maximo = x[0] as number;
  for (const v of x) {
    if (v < minimo) minimo = v;
    if (v > maximo) maximo = v;
  }
  if (maximo === minimo) return [{ desde: minimo - 0.5, hasta: minimo + 0.5, n }];
  const k = clasesSturges(n);
  const paso = pasoHistograma(minimo, maximo, k);
  const desde = Math.floor(minimo / paso) * paso;
  const clases = Math.max(1, Math.ceil((maximo - desde) / paso));
  const bins: BinHistograma[] = [];
  for (let i = 0; i < clases; i += 1) bins.push({ desde: desde + i * paso, hasta: desde + (i + 1) * paso, n: 0 });
  for (const v of x) {
    const i = Math.min(clases - 1, Math.max(0, Math.floor((v - desde) / paso)));
    (bins[i] as BinHistograma).n += 1;
  }
  return bins;
}

// ---------------------------------------------------------------------------
// Resumen completo
// ---------------------------------------------------------------------------

/** Lanza `RangeError` si la columna no trae al menos dos números finitos. */
export function validarColumna(x: readonly number[]): void {
  if (!Array.isArray(x) || x.length < N_MIN_COLUMNA) {
    throw new RangeError(`entrada_invalida: la columna necesita al menos ${N_MIN_COLUMNA} valores`);
  }
  for (const v of x) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new RangeError('entrada_invalida: la columna tiene un valor que no es un número finito');
    }
  }
}

export interface OpcionesDescriptivos {
  nivel?: number;
  /** Multiplicador de las cercas de Tukey; 1.5 por omisión. */
  k?: number;
}

/**
 * W de Shapiro-Wilk y su valor p, o `NaN` en los tres casos en que el snippet
 * de R no llama a `shapiro.test`: n < 3, n > 5000 o rango 0.
 */
function shapiroONaN(x: readonly number[], rango: number): { w: number; p: number } {
  if (x.length < N_MIN_SHAPIRO || x.length > N_MAX_SHAPIRO || !(rango > 0)) {
    return { w: Number.NaN, p: Number.NaN };
  }
  return shapiroWilk(x);
}

/** Descriptivos completos de una columna, en el mismo orden que el snippet de R. */
export function descriptivos(x: readonly number[], op: OpcionesDescriptivos = {}): ValoresDescriptivos {
  validarColumna(x);
  const nivel = op.nivel ?? 0.95;
  if (!(nivel > 0 && nivel < 1)) throw new RangeError('entrada_invalida: el nivel de confianza debe estar entre 0 y 1');
  const k = op.k ?? K_TUKEY;
  const n = x.length;

  const m = media(x);
  const de = desviacion(x);
  const eem = de / Math.sqrt(n);
  const tcrit = qt(1 - (1 - nivel) / 2, n - 1);

  const ordenado = [...x].sort((a, b) => a - b);
  const [q1, mediana, q3] = cuartilesTipo7(ordenado);
  const minimo = ordenado[0] as number;
  const maximo = ordenado[n - 1] as number;
  const rango = maximo - minimo;
  const sw = shapiroONaN(ordenado, rango);

  return {
    n: { valor: n, metodo: 'puntual' },
    media: { valor: m, ic: [m - tcrit * eem, m + tcrit * eem], nivel, metodo: 't' },
    de: { valor: de, metodo: 'puntual' },
    eem: { valor: eem, metodo: 'puntual' },
    mediana: { valor: mediana, metodo: 'cuantil-7' },
    q1: { valor: q1, metodo: 'cuantil-7' },
    q3: { valor: q3, metodo: 'cuantil-7' },
    iqr: { valor: q3 - q1, metodo: 'cuantil-7' },
    min: { valor: minimo, metodo: 'puntual' },
    max: { valor: maximo, metodo: 'puntual' },
    rango: { valor: rango, metodo: 'puntual' },
    cv: { valor: de / m, metodo: 'puntual' },
    g1: { valor: asimetriaG1(x, m), metodo: 'joanes-gill' },
    g2: { valor: curtosisG2(x, m), metodo: 'joanes-gill' },
    media_geom: { valor: mediaGeometrica(x), metodo: 'puntual' },
    sw_w: { valor: sw.w, metodo: 'shapiro-wilk' },
    sw_p: { valor: sw.p, metodo: 'shapiro-wilk' },
    n_atipicos: { valor: atipicosTukey(x, q1, q3, k).length, metodo: 'puntual' },
  };
}

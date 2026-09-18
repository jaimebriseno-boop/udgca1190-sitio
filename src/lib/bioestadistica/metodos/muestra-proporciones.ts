/**
 * Tamaño de muestra para comparar DOS proporciones independientes (C3 de la
 * especificación): fórmula de Fleiss con y sin corrección de continuidad,
 * razón de asignación r, alternativa de Cohen (h, arcoseno) y modo inverso
 * («poder dado n»).
 *
 * Todo sale SIN redondear, igual que el JSON de R; el techo lo aplica la
 * presentación una sola vez y por grupo (`techo` de `muestra-comun.ts`).
 *
 * Los dos valores que R obtiene con `uniroot` (`power.prop.test` y
 * `pwr::pwr.2p.test`) se reproducen aquí con la traducción literal de
 * `uniroot` de `primitivas/raices.ts`, con el MISMO corchete y la MISMA
 * tolerancia que usa cada función de R: el objetivo no es la raíz «verdadera»,
 * sino el número que imprime R.
 *
 * Referencias:
 *  - Fleiss JL. Statistical Methods for Rates and Proportions, 2.ª ed., Wiley
 *    1981; Fleiss JL, Levin B, Paik MC, 3.ª ed., Wiley 2003, §4.2 (fórmula con
 *    varianza agrupada bajo H0 y razón de asignación).
 *  - Fleiss JL, Tytun A, Ury HK. Biometrics 1980;36:343-6 (corrección de
 *    continuidad, que aproxima la prueba exacta de Fisher).
 *  - Casagrande JT, Pike MC, Smith PG. Biometrics 1978;34:483-6.
 *  - Lachin JM. Control Clin Trials 1981;2:93-113.
 *  - Cohen J. Statistical Power Analysis for the Behavioral Sciences, 2.ª ed.,
 *    Erlbaum 1988, cap. 6 (h = 2·arcsen√p₁ − 2·arcsen√p₂).
 *  - Champely S. pwr: Basic Functions for Power Analysis, 2020.
 */
import { pnorm, qnorm } from '../primitivas/distribuciones.ts';
import { uniroot } from '../primitivas/raices.ts';
import type { Estimacion } from '../nucleo/tipos.ts';
import { validarComun, zAlfa, zPoder } from './muestra-comun.ts';
import type { Lateralidad } from './muestra-comun.ts';

/** Selector de la corrección de continuidad: `si` la aplica, `no` la omite. */
export const CORRECCIONES_CONTINUIDAD = ['si', 'no'] as const;
export type CorreccionContinuidad = (typeof CORRECCIONES_CONTINUIDAD)[number];

/**
 * Ids de salida, en el orden en que se presentan = claves del JSON de R =
 * claves de `etiquetas` = claves de `esperado` en los fixtures.
 */
export const SALIDAS_DOS_PROPORCIONES = [
  'z_alfa',
  'z_beta',
  'n1_fleiss',
  'n2_fleiss',
  'n1_cc',
  'n2_cc',
  'n1',
  'n2',
  'n_total',
  'n_ajustado',
  'n_ppt',
  'h_cohen',
  'n_pwr_h',
  'poder_dado',
] as const;
export type SalidaDosProporciones = (typeof SALIDAS_DOS_PROPORCIONES)[number];

/** Parámetros del diseño. `nDado` < 2 significa «sin modo inverso» (no se capturó). */
export interface DisenoDosProporciones {
  p1: number;
  p2: number;
  alfa: number;
  lateralidad: Lateralidad;
  poder: number;
  /** Razón de asignación n₂/n₁ (1 = grupos iguales). */
  r: number;
  correccion: CorreccionContinuidad;
  /** Pérdidas previstas, 0 a 0.5. */
  perdidas: number;
  /** n₁ del modo inverso; 0 (o 1) = no se pidió el poder para un n dado. */
  nDado: number;
}

/** Valores del diseño, sin redondear. */
export type ValoresDosProporciones = Record<SalidaDosProporciones, Estimacion>;

/** Mínimo de participantes por grupo que tiene sentido en el modo inverso. */
export const N_DADO_MINIMO = 2;

/**
 * Lanza `RangeError` si algún parámetro sale de los rangos de la especificación.
 * Las proporciones deben ser distintas: con p₁ = p₂ no hay diferencia que
 * detectar y la fórmula divide entre cero.
 */
export function validarDosProporciones(d: DisenoDosProporciones): void {
  for (const [nombre, p] of [
    ['p1', d.p1],
    ['p2', d.p2],
  ] as const) {
    if (!(p > 0 && p < 1)) throw new RangeError(`entrada_invalida: ${nombre} debe estar entre 0 y 1 (exclusivos)`);
  }
  if (d.p1 === d.p2) throw new RangeError('entrada_invalida: p1 y p2 deben ser distintas');
  if (!(d.r >= 0.1 && d.r <= 10)) throw new RangeError('entrada_invalida: la razón de asignación debe estar entre 0.1 y 10');
  if (!(CORRECCIONES_CONTINUIDAD as readonly string[]).includes(d.correccion)) {
    throw new RangeError(`entrada_invalida: corrección «${d.correccion}» desconocida`);
  }
  if (!Number.isInteger(d.nDado) || d.nDado < 0) {
    throw new RangeError('entrada_invalida: n dado debe ser un entero no negativo');
  }
  validarComun(d.alfa, d.poder, d.perdidas);
}

/** Proporción agrupada bajo H₀ con razón de asignación r: p̄ = (p₁ + r·p₂)/(r + 1). */
export function pAgrupada(p1: number, p2: number, r: number): number {
  return (p1 + r * p2) / (r + 1);
}

/**
 * n₁ de Fleiss SIN corrección de continuidad, para cualquier r:
 *
 *   n₁ = [z_α√((r+1)p̄q̄) + z_β√(r·p₁q₁ + p₂q₂)]² / (r·(p₁ − p₂)²)
 *
 * Con r = 1 es exactamente lo que resuelve `power.prop.test`, porque
 * (p₁+p₂)(1 − (p₁+p₂)/2) = 2p̄q̄.
 */
export function n1Fleiss(d: Pick<DisenoDosProporciones, 'p1' | 'p2' | 'alfa' | 'lateralidad' | 'poder' | 'r'>): number {
  const { p1, p2, r } = d;
  const za = zAlfa(d.alfa, d.lateralidad);
  const zb = zPoder(d.poder);
  const dif = Math.abs(p1 - p2);
  const pbar = pAgrupada(p1, p2, r);
  const qbar = 1 - pbar;
  const suma = za * Math.sqrt((r + 1) * pbar * qbar) + zb * Math.sqrt(r * p1 * (1 - p1) + p2 * (1 - p2));
  return (suma * suma) / (r * dif * dif);
}

/**
 * Corrección de continuidad de Fleiss, Tytun y Ury (1980) sobre el n₁ sin
 * corregir:
 *
 *   n₁' = (n₁/4)·[1 + √(1 + 2(r+1)/(r·n₁·|p₁ − p₂|))]²
 *
 * Aproxima la prueba exacta de Fisher; el n sin corregir aproxima la χ² de
 * Pearson.
 */
export function n1FleissCc(n1: number, p1: number, p2: number, r: number): number {
  const raiz = 1 + Math.sqrt(1 + (2 * (r + 1)) / (r * n1 * Math.abs(p1 - p2)));
  return (n1 / 4) * raiz * raiz;
}

/**
 * Poder alcanzable con n₁ participantes en el grupo 1 y n₂ = r·n₁ en el 2, por
 * la fórmula normal de Fleiss sin corrección (C0 de la especificación):
 *
 *   1 − β = Φ[(|p₁ − p₂|√(r·n₁) − z_α√((r+1)p̄q̄)) / √(r·p₁q₁ + p₂q₂)]
 *
 * Es la inversa exacta de `n1Fleiss`, y con r = 1 coincide con el cuerpo de
 * `power.prop.test`.
 */
export function poderFleiss(
  n1: number,
  d: Pick<DisenoDosProporciones, 'p1' | 'p2' | 'alfa' | 'lateralidad' | 'r'>,
): number {
  const { p1, p2, r } = d;
  const za = zAlfa(d.alfa, d.lateralidad);
  const dif = Math.abs(p1 - p2);
  const pbar = pAgrupada(p1, p2, r);
  const qbar = 1 - pbar;
  return pnorm(
    (dif * Math.sqrt(r * n1) - za * Math.sqrt((r + 1) * pbar * qbar)) /
      Math.sqrt(r * p1 * (1 - p1) + p2 * (1 - p2)),
  );
}

/**
 * Extensión de corchete de `uniroot(..., extendInt = "upX")` de R, traducida
 * literalmente de `src/library/stats/R/nlm.R`.
 *
 * No es un detalle: `power.prop.test` pide la raíz en `[1, 1e7]` PERO con
 * `extendInt = "upX"`, así que cuando el n buscado cae fuera de ese corchete R
 * no falla, sino que estira el extremo que haga falta y devuelve un número. Con
 * una diferencia diminuta entre las proporciones (0.50 frente a 0.5001) el n
 * ronda los 3.9e8 y R lo resuelve; quedarse en `[1, 1e7]` devolvía «no
 * definido» donde el oráculo sí tiene respuesta.
 *
 * El paso inicial es `0.01·máx(1e-4, |extremo|)` y se DUPLICA en cada intento,
 * de modo que el corchete final —y con él el punto en el que para zeroin— queda
 * determinado por esta secuencia: reproducirla es lo que hace que TypeScript
 * imprima el mismo número que R y no solo una raíz igual de válida.
 *
 * Con `upX` el criterio es f(inferior) ≤ 0 ≤ f(superior). Un `NaN` detiene el
 * bucle en vez de continuarlo, igual que el `isTRUE()` de R: `uniroot` recibe
 * entonces un extremo indefinido y lanza, que es el `stop()` del original.
 *
 * @throws {RangeError} si se agotan las iteraciones sin encontrar el cambio de signo.
 */
function extenderUpX(
  f: (x: number) => number,
  lower: number,
  upper: number,
  maxIter = 1000,
): [number, number] {
  const paso = (u: number): number => 0.01 * Math.max(1e-4, Math.abs(u));
  let lo = lower;
  let hi = upper;
  let fLo = f(lo);
  let fHi = f(hi);
  // `doX` de R: si los dos extremos ya están del lado correcto, no se toca nada.
  if (!(fLo > 0 || fHi < 0)) return [lo, hi];

  let it = 0;
  const agotado = (): never => {
    throw new RangeError(`uniroot upX: sin cambio de signo tras ${maxIter} extensiones`);
  };
  let delta = paso(lo);
  while (fLo > 0) {
    if ((it += 1) > maxIter) agotado();
    lo -= delta;
    fLo = f(lo);
    delta *= 2;
  }
  delta = paso(hi);
  while (fHi < 0) {
    if ((it += 1) > maxIter) agotado();
    hi += delta;
    fHi = f(hi);
    delta *= 2;
  }
  return [lo, hi];
}

/**
 * `power.prop.test(p1, p2, sig.level, power, alternative, tol = 1e-10)$n` de R,
 * reproducido con el mismo `p.body`, el mismo corchete de partida `[1, 1e7]`,
 * la misma extensión `extendInt = "upX"` y la misma tolerancia. Solo tiene
 * sentido con grupos iguales (r = 1); el llamador devuelve `NaN` («NA») en otro
 * caso.
 *
 * Devuelve `NaN` solo donde R también se rinde: cuando ni siquiera estirando el
 * corchete aparece un cambio de signo (el n cae tan cerca de cero que la
 * extensión hacia abajo entra en los negativos y `sqrt(n)` deja de existir).
 */
export function nPowerPropTest(
  p1: number,
  p2: number,
  alfa: number,
  lateralidad: Lateralidad,
  poder: number,
): number {
  const tside = lateralidad === 'bilateral' ? 2 : 1;
  const qu = qnorm(alfa / tside, 0, 1, false);
  const cuerpo = (n: number): number =>
    pnorm(
      (Math.sqrt(n) * Math.abs(p1 - p2) - qu * Math.sqrt((p1 + p2) * (1 - (p1 + p2) / 2))) /
        Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
    );
  const objetivo = (n: number): number => cuerpo(n) - poder;
  try {
    const [lo, hi] = extenderUpX(objetivo, 1, 1e7);
    return uniroot(objetivo, lo, hi, { tol: 1e-10 });
  } catch {
    return Number.NaN;
  }
}

/** h de Cohen (1988), idéntico a `pwr::ES.h`: 2·arcsen√p₁ − 2·arcsen√p₂. Conserva el signo. */
export function hCohen(p1: number, p2: number): number {
  return 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2));
}

/**
 * `pwr::pwr.2p.test(h, sig.level, power, alternative)$n`, reproducido con su
 * `p.body`, su corchete `[2 + 1e-10, 1e9]` y su tolerancia por omisión (la de
 * `uniroot`, ≈ 1.2e-4).
 *
 * `pwr` no admite `alternative = "one.sided"`: la prueba unilateral se pide con
 * `"greater"`, que exige h > 0. Por eso se pasa |h|, como hace el propio `pwr`
 * con `alternative = "two.sided"`; el sentido de la hipótesis lo fija quien
 * declara la lateralidad, no el signo de la diferencia.
 */
export function nPwr2p(h: number, alfa: number, lateralidad: Lateralidad, poder: number): number {
  const hAbs = Math.abs(h);
  const cuerpo =
    lateralidad === 'bilateral'
      ? (n: number): number =>
          pnorm(qnorm(alfa / 2, 0, 1, false) - hAbs * Math.sqrt(n / 2), 0, 1, false) +
          pnorm(qnorm(alfa / 2, 0, 1, true) - hAbs * Math.sqrt(n / 2), 0, 1, true)
      : (n: number): number => pnorm(qnorm(alfa, 0, 1, false) - hAbs * Math.sqrt(n / 2), 0, 1, false);
  try {
    return uniroot((n) => cuerpo(n) - poder, 2 + 1e-10, 1e9);
  } catch {
    return Number.NaN;
  }
}

/**
 * Todos los valores del diseño, sin redondear y en el orden de
 * `SALIDAS_DOS_PROPORCIONES`.
 *
 * @throws {RangeError} si algún parámetro sale de rango (ver `validarDosProporciones`).
 */
export function muestraDosProporciones(d: DisenoDosProporciones): ValoresDosProporciones {
  validarDosProporciones(d);
  const { p1, p2, r, correccion, perdidas, nDado } = d;
  const conCc = correccion === 'si';

  const za = zAlfa(d.alfa, d.lateralidad);
  const zb = zPoder(d.poder);

  const n1F = n1Fleiss(d);
  const n2F = r * n1F;
  const n1C = n1FleissCc(n1F, p1, p2, r);
  const n2C = r * n1C;

  const n1 = conCc ? n1C : n1F;
  const n2 = r * n1;
  const nTotal = n1 + n2;
  const nAjustado = nTotal / (1 - perdidas);

  // `power.prop.test` y `pwr.2p.test` suponen grupos iguales: con r ≠ 1 la
  // comparación no existe y se reporta «no definido» (el NA_real_ del snippet).
  const igual = r === 1;
  const nPpt = igual ? nPowerPropTest(p1, p2, d.alfa, d.lateralidad, d.poder) : Number.NaN;
  const h = hCohen(p1, p2);
  const nPwr = igual ? nPwr2p(h, d.alfa, d.lateralidad, d.poder) : Number.NaN;

  const poderDado = nDado >= N_DADO_MINIMO ? poderFleiss(nDado, d) : Number.NaN;

  const metodoElegido = conCc ? 'fleiss-cc' : 'fleiss';
  return {
    z_alfa: { valor: za, metodo: 'puntual' },
    z_beta: { valor: zb, metodo: 'puntual' },
    n1_fleiss: { valor: n1F, metodo: 'fleiss' },
    n2_fleiss: { valor: n2F, metodo: 'fleiss' },
    n1_cc: { valor: n1C, metodo: 'fleiss-cc' },
    n2_cc: { valor: n2C, metodo: 'fleiss-cc' },
    n1: { valor: n1, metodo: metodoElegido },
    n2: { valor: n2, metodo: metodoElegido },
    n_total: { valor: nTotal, metodo: metodoElegido },
    n_ajustado: { valor: nAjustado, metodo: metodoElegido },
    n_ppt: { valor: nPpt, metodo: 'fleiss' },
    h_cohen: { valor: h, metodo: 'puntual' },
    n_pwr_h: { valor: nPwr, metodo: 'normal' },
    poder_dado: { valor: poderDado, metodo: 'normal' },
  };
}

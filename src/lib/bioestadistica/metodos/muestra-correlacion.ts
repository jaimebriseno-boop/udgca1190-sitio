/**
 * Tamaño de muestra para detectar una correlación de Pearson, por la
 * transformación z de Fisher.
 *
 * Fisher (1915, 1921) mostró que con n pares independientes de una normal
 * bivariada, C = artanh(r) = ½·ln((1 + r)/(1 − r)) es casi normal con error
 * estándar 1/√(n − 3). De ahí sale la fórmula clásica, la que se enseña y la
 * que esta calculadora muestra como resultado principal:
 *
 *   n = ((z_{1−α/tside} + z_{1−β}) / C)² + 3          1 − β = Φ(|C|·√(n − 3) − z_{1−α/tside})
 *
 * `pwr::pwr.r.test` resuelve el mismo problema con dos refinamientos: corrige el
 * sesgo de C con el término r/(2(n − 1)) y toma el valor crítico de la t con
 * n − 2 grados de libertad en vez del de la normal. Da uno o dos sujetos menos y
 * aquí se muestra como comparación, no como resultado: `potenciaPwr` y
 * `nPwrCorrelacion` son la traducción literal de su `p.body` y de su
 * `uniroot(..., c(4 + 1e-10, 1e9))`, resuelto con el `uniroot` de R que vive en
 * `primitivas/raices.ts` y con su tolerancia por omisión. El objetivo no es la
 * raíz «verdadera», sino el número que imprime R.
 *
 * Todo viaja SIN redondear: el techo se aplica una sola vez, al final, en la
 * presentación (`techo()` de `muestra-comun.ts`).
 *
 * Referencias: Fisher RA. Biometrika 1915;10:507–21 · Fisher RA. Metron
 * 1921;1:3–32 · Cohen J. Statistical Power Analysis for the Behavioral
 * Sciences, 2.ª ed., 1988 · Champely S. pwr: Basic Functions for Power
 * Analysis, 2020 · Lwanga SK, Lemeshow S. WHO 1991 (ajuste por pérdidas).
 *
 * Puro: sin DOM, sin `Intl`, sin acceso al sistema de archivos.
 */
import { pnorm, qt } from '../primitivas/distribuciones.ts';
import { TOL_UNIROOT, uniroot } from '../primitivas/raices.ts';
import { LATERALIDADES, ajustarPerdidas, validarComun, zAlfa, zPoder } from './muestra-comun.ts';
import type { Lateralidad } from './muestra-comun.ts';

/** Parámetros del diseño. */
export interface DisenoCorrelacion {
  /** Correlación que se quiere poder detectar; distinta de 0 y |r| ≤ 0.98. */
  r: number;
  /** Nivel de significación (0.001–0.2). */
  alfa: number;
  lateralidad: Lateralidad;
  /** Poder objetivo (0.5–0.99). */
  poder: number;
  /** Pérdidas previstas (0–0.5). */
  perdidas: number;
  /** n ya disponible para el modo inverso; 0 = no capturado (poder no definido). */
  n_dado: number;
}

/** Salidas del diseño, sin redondear y en el orden en que las presenta la calculadora. */
export interface ResultadoCorrelacion {
  /** z de α según la lateralidad. */
  z_alfa: number;
  /** z del poder: `qnorm(poder)`. */
  z_beta: number;
  /** Transformación z de Fisher de r: artanh(r). */
  c_fisher: number;
  /** Fórmula clásica: ((z_α + z_β)/C)² + 3. */
  n_clasico: number;
  /** `pwr::pwr.r.test(...)$n`, como comparación. */
  n_pwr: number;
  /** n_clasico inflado por las pérdidas previstas. */
  n_ajustado: number;
  /** Modo inverso: poder alcanzable con `n_dado` pares; `NaN` sin n dado. */
  poder_dado: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS_CORRELACION = [
  'z_alfa',
  'z_beta',
  'c_fisher',
  'n_clasico',
  'n_pwr',
  'n_ajustado',
  'poder_dado',
] as const;
export type SalidaCorrelacion = (typeof SALIDAS_CORRELACION)[number];

/** |r| máximo admitido: por encima, C se dispara y el diseño deja de tener sentido práctico. */
export const R_MAXIMO = 0.98;

/** Por debajo de este |r| el tamaño necesario se cuenta por miles. */
export const R_PEQUENA = 0.05;

/** La z de Fisher necesita al menos cuatro pares (`pwr.r.test` exige n ≥ 4; el EE, n > 3). */
export const N_MINIMO_CORRELACION = 4;

/** Corchete de `uniroot` en `pwr.r.test`: `c(4 + 1e-10, 1e+09)`. */
export const CORCHETE_PWR: readonly [number, number] = [4 + 1e-10, 1e9];

/**
 * `alternative` de `pwr.r.test` traducido a su `tside`: 1 = «less», 2 =
 * «two.sided», 3 = «greater». Con una hipótesis unilateral el lado lo fija el
 * signo de r, igual que haría quien escribe la llamada a mano.
 */
export type TsidePwr = 1 | 2 | 3;

export function tsideDe(lateralidad: Lateralidad, r: number): TsidePwr {
  if (lateralidad === 'bilateral') return 2;
  return r > 0 ? 3 : 1;
}

/** Nombre del `alternative` de R que corresponde a cada `tside`. */
export function alternativaDe(tside: TsidePwr): 'less' | 'two.sided' | 'greater' {
  return tside === 2 ? 'two.sided' : tside === 3 ? 'greater' : 'less';
}

/** Lanza `RangeError` si el diseño es imposible. */
export function validarCorrelacion(d: DisenoCorrelacion): void {
  if (!(typeof d.r === 'number' && Math.abs(d.r) <= R_MAXIMO)) {
    throw new RangeError(`entrada_invalida: |r| debe ser ≤ ${R_MAXIMO} (recibido ${String(d.r)})`);
  }
  if (d.r === 0) throw new RangeError('entrada_invalida: r = 0 no describe ningún efecto que detectar');
  if (!(LATERALIDADES as readonly string[]).includes(d.lateralidad)) {
    throw new RangeError(`entrada_invalida: lateralidad desconocida (${String(d.lateralidad)})`);
  }
  validarComun(d.alfa, d.poder, d.perdidas);
  // De 1 a 3 pares NO es una entrada imposible: es una muestra real, demasiado
  // corta para la z de Fisher (su error estándar va con 1/√(n − 3)). El poder
  // inverso sale `NaN`, igual que el `NA_real_` del snippet, y la calculadora
  // lo explica con un aviso en vez de rechazar el campo.
  if (!(Number.isInteger(d.n_dado) && d.n_dado >= 0)) {
    throw new RangeError('entrada_invalida: n dado debe ser un entero ≥ 0 (0 = no capturado)');
  }
}

/** Transformación z de Fisher: artanh(r) = ½·ln((1 + r)/(1 − r)). */
export function zFisher(r: number): number {
  return Math.atanh(r);
}

/** Fórmula clásica de la z de Fisher: ((z_α + z_β)/C)² + 3. */
export function nClasico(c: number, za: number, zb: number): number {
  const suma = za + zb;
  return (suma / c) ** 2 + 3;
}

/** Modo inverso con la fórmula clásica: Φ(|C|·√(n − 3) − z_α). */
export function poderClasico(c: number, n: number, za: number): number {
  if (!(n >= N_MINIMO_CORRELACION)) return Number.NaN;
  return pnorm(Math.abs(c) * Math.sqrt(n - 3) - za);
}

/**
 * `p.body` de `pwr::pwr.r.test`, traducido tal cual (pwr 1.3-0):
 *
 *   ttt <- qt(sig.level/tside', df = n - 2, lower = FALSE)
 *   rc  <- sqrt(ttt^2 / (ttt^2 + n - 2))
 *   zr  <- atanh(r) + r / (2 * (n - 1))
 *   zrc <- atanh(rc)
 *   pnorm((zr - zrc) * sqrt(n - 3))                    [+ pnorm((-zr - zrc) * sqrt(n - 3)) si bilateral]
 *
 * Con `alternative = "two.sided"` pwr toma |r| antes de evaluar el cuerpo y
 * suma la cola opuesta; con «less» le cambia el signo a r dentro del cuerpo.
 */
export function potenciaPwr(n: number, r: number, alfa: number, tside: TsidePwr): number {
  const rr = tside === 2 ? Math.abs(r) : tside === 1 ? -r : r;
  const sig = tside === 2 ? alfa / 2 : alfa;
  const ttt = qt(sig, n - 2, false);
  const rc = Math.sqrt((ttt * ttt) / (ttt * ttt + n - 2));
  const zr = Math.atanh(rr) + rr / (2 * (n - 1));
  const zrc = Math.atanh(rc);
  const raiz = Math.sqrt(n - 3);
  const cola = pnorm((zr - zrc) * raiz);
  return tside === 2 ? cola + pnorm((-zr - zrc) * raiz) : cola;
}

/**
 * `pwr.r.test(r, sig.level, power, alternative)$n`: la raíz de
 * `potencia(n) − poder` en `[4 + 1e-10, 1e9]`, con el `uniroot` de R y su
 * tolerancia por omisión (`.Machine$double.eps^0.25`).
 *
 * Con una correlación muy grande y un poder modesto (por ejemplo r = 0.98
 * unilateral con poder 0.80) los cuatro pares del extremo inferior YA superan el
 * poder pedido: no hay cambio de signo y `pwr.r.test` se detiene con
 * «f() values at end points not of opposite sign». Aquí eso se devuelve como
 * `NaN` («no definido»), que es como el snippet de R lo entrega tras su
 * `tryCatch`; la fórmula clásica sí responde y sigue siendo el resultado
 * principal.
 */
export function nPwrCorrelacion(r: number, alfa: number, poder: number, tside: TsidePwr): number {
  const [a, b] = CORCHETE_PWR;
  const f = (n: number): number => potenciaPwr(n, r, alfa, tside) - poder;
  const fa = f(a);
  const fb = f(b);
  if (Number.isNaN(fa) || Number.isNaN(fb) || (fa > 0 && fb > 0) || (fa < 0 && fb < 0)) return Number.NaN;
  return uniroot(f, a, b, { tol: TOL_UNIROOT });
}

/** Diseño completo, sin redondear. */
export function muestraCorrelacion(d: DisenoCorrelacion): ResultadoCorrelacion {
  validarCorrelacion(d);
  const tside = tsideDe(d.lateralidad, d.r);
  const z_alfa = zAlfa(d.alfa, d.lateralidad);
  const z_beta = zPoder(d.poder);
  const c_fisher = zFisher(d.r);
  const n_clasico = nClasico(c_fisher, z_alfa, z_beta);
  return {
    z_alfa,
    z_beta,
    c_fisher,
    n_clasico,
    n_pwr: nPwrCorrelacion(d.r, d.alfa, d.poder, tside),
    n_ajustado: ajustarPerdidas(n_clasico, d.perdidas),
    poder_dado: d.n_dado >= N_MINIMO_CORRELACION ? poderClasico(c_fisher, d.n_dado, z_alfa) : Number.NaN,
  };
}

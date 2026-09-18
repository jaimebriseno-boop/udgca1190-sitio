/**
 * Supervivencia: estimador de Kaplan-Meier, varianza de Greenwood, intervalos
 * de confianza, mediana con la regla de `quantile.survfit` y prueba de log-rank
 * (calculadora E3 de la especificación; plan del motor §1.6).
 *
 * El oráculo es `survival` 3.8.6 sobre R 4.5.2, y cada regla de R que se
 * reproduce aquí se comprobó antes con `Rscript`:
 *
 * - `sf$time` trae TODOS los tiempos distintos observados, también los que solo
 *   tienen censuras; `n.risk` es el número de sujetos con tiempo ≥ t, de modo
 *   que en un empate los eventos preceden a las censuras y ambos se cuentan en
 *   el mismo tiempo.
 * - `sf$std.err` es el error estándar de log Ŝ (Greenwood en escala
 *   logarítmica), √g con g = Σ dᵢ/(nᵢ(nᵢ − dᵢ)), NO el de Ŝ.
 * - Los límites salen de `survival:::survfit_confint`, que trata tres casos
 *   aparte: con EE = 0 el intervalo es el propio Ŝ (curva todavía en 1); con
 *   Ŝ = 0 (y con Ŝ = 1 en la escala log-log) el límite es `NA`; el límite
 *   superior de la escala log se recorta a 1 y el de la log-log no lo necesita.
 * - La mediana y su intervalo salen de `quantile.survfit`, que no es «el primer
 *   tiempo con Ŝ < 0.5» a secas: interpola con `findq`, que promedia el primer
 *   tiempo en que la curva llega a 0.5 y el primero en que la deja atrás (regla
 *   del punto medio de la meseta) y usa el último tiempo observado cuando la
 *   curva termina justo en 0.5. Esa función se reproduce aquí paso por paso.
 * - El intervalo de la mediana aplica la misma regla a las bandas: el límite
 *   inferior sale de la banda INFERIOR de Ŝ y el superior, de la superior.
 *
 * Nada se redondea y `NaN` significa «no definido», igual que el `NA` de R:
 * mediana no alcanzada, límites indefinidos, log-rank sin dos grupos.
 *
 * Referencias: Kaplan EL, Meier P. J Am Stat Assoc 1958;53:457-81 · Greenwood M.
 * Rep Public Health Med Subj 33, HMSO 1926 · Brookmeyer R, Crowley J.
 * Biometrics 1982;38:29-41 · Kalbfleisch JD, Prentice RL. The Statistical
 * Analysis of Failure Time Data, Wiley 1980 · Mantel N. Cancer Chemother Rep
 * 1966;50:163-70 · Peto R, Peto J. J R Stat Soc A 1972;135:185-207.
 */
import { pchisq, qnorm } from '../primitivas/distribuciones.ts';
import type { Estimacion, MetodoId } from '../nucleo/tipos.ts';

/** Número mínimo de filas: con un solo sujeto no hay curva que comparar. */
export const N_MIN_KM = 2;

/** Grupos admitidos en este hito: una curva o dos. */
export const MAX_GRUPOS_KM = 2;

/** Escalas de intervalo que ofrece `survfit` y que reproduce esta biblioteca. */
export const TIPOS_IC_KM = ['log-log', 'log'] as const;
export type TipoIcKm = (typeof TIPOS_IC_KM)[number];

/** `MetodoId` de cada escala, para las celdas y el comparador. */
export const METODO_IC_KM: Readonly<Record<TipoIcKm, MetodoId>> = {
  'log-log': 'greenwood-log-log',
  log: 'greenwood-log',
};

/** Ids de salida = claves del JSON de R = celdas de la interfaz = claves del fixture. */
export const SALIDAS_KM = [
  'n_1',
  'eventos_1',
  'mediana_1',
  's_t1_1',
  's_t2_1',
  'n_2',
  'eventos_2',
  'mediana_2',
  's_t1_2',
  's_t2_2',
  'chi2_logrank',
  'gl',
  'p_logrank',
] as const;
export type SalidaKm = (typeof SALIDAS_KM)[number];

/** Campos de la tabla de vida que viajan como vectores en `Resultado.extras`. */
export const CAMPOS_TABLA_KM = ['t', 'riesgo', 'ev', 'cens', 's', 'ee', 'lo', 'hi'] as const;
export type CampoTablaKm = (typeof CAMPOS_TABLA_KM)[number];

/** Un escalón de la tabla de vida: los mismos campos que una fila de `survfit`. */
export interface PasoVida {
  /** Tiempo distinto observado (también si solo trae censuras). */
  t: number;
  /** Sujetos con tiempo ≥ t (`n.risk`). */
  enRiesgo: number;
  /** Eventos en t (`n.event`). */
  eventos: number;
  /** Censuras en t (`n.censor`). */
  censuras: number;
  /** Ŝ(t) por el producto límite (`surv`). */
  s: number;
  /** Error estándar de log Ŝ(t): √g de Greenwood (`std.err`). */
  eeLog: number;
  /** Límite inferior del IC (`lower`); `NaN` = no definido. */
  lo: number;
  /** Límite superior del IC (`upper`); `NaN` = no definido. */
  hi: number;
}

/** Curva de un grupo: su tabla de vida y los recuentos que la resumen. */
export interface CurvaVida {
  /** Código numérico del grupo (0 cuando no se capturó columna de grupo). */
  codigo: number;
  n: number;
  eventos: number;
  censuras: number;
  /** Último tiempo observado: más allá, Ŝ(t) no está definida. */
  tMax: number;
  nivel: number;
  tipoIC: TipoIcKm;
  pasos: PasoVida[];
}

export interface OpcionesKm {
  nivel: number;
  tipoIC: TipoIcKm;
}

/** Resultado del log-rank de dos grupos, con los mismos campos que `survdiff`. */
export interface ResultadoLogRank {
  chi2: number;
  gl: number;
  p: number;
  /** Eventos observados en cada grupo, en el orden de los códigos. */
  observados: [number, number];
  /** Eventos esperados bajo la hipótesis de curvas iguales. */
  esperados: [number, number];
  /** Varianza hipergeométrica acumulada del primer grupo. */
  varianza: number;
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

/**
 * Códigos de grupo distintos, en orden numérico ascendente: el grupo 1 es el
 * del código menor. El snippet de R fija los mismos niveles con
 * `factor(grupo, levels = sort(unique(grupo)))`, porque `factor()` a secas
 * ordenaría los niveles como texto y pondría el código 10 antes que el 2.
 */
export function codigosDeGrupo(grupo: readonly number[]): number[] {
  return [...new Set(grupo)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Tabla de vida y curva de Kaplan-Meier
// ---------------------------------------------------------------------------

/**
 * Límites del IC de Ŝ(t) EXACTAMENTE como `survival:::survfit_confint` con
 * `logse = TRUE` y `scale = 1` (el caso de `survfit` sin pesos):
 *
 * - `ee === 0` (la curva sigue en 1) → el intervalo es el propio Ŝ.
 * - escala log: con Ŝ = 0 los dos límites son `NA`; si no,
 *   `[S·e^{−z·ee}, min(1, S·e^{z·ee})]`.
 * - escala log-log: con Ŝ = 0 o Ŝ = 1 los dos límites son `NA`; si no, con
 *   `se₂ = z·ee/ln S` (negativo), `[e^{−e^{ln(−ln S) − se₂}}, e^{−e^{ln(−ln S) + se₂}}]`,
 *   que es `[S^{e^{z·ee/|ln S|}}, S^{e^{−z·ee/|ln S|}}]`.
 */
export function intervaloKm(s: number, eeLog: number, z: number, tipo: TipoIcKm): [number, number] {
  if (eeLog === 0) return [s, s];
  if (tipo === 'log') {
    if (s === 0) return [Number.NaN, Number.NaN];
    const se2 = z * eeLog;
    return [Math.exp(Math.log(s) - se2), Math.min(Math.exp(Math.log(s) + se2), 1)];
  }
  if (s === 0 || s === 1) return [Number.NaN, Number.NaN];
  const se2 = (z * eeLog) / Math.log(s);
  const lnl = Math.log(-Math.log(s));
  return [Math.exp(-Math.exp(lnl - se2)), Math.exp(-Math.exp(lnl + se2))];
}

/**
 * Tabla de vida de Kaplan-Meier de una muestra, con el mismo contenido y el
 * mismo orden que `survfit(Surv(tiempo, evento) ~ 1)`.
 *
 * Reglas de empate: en cada tiempo distinto se cuentan los eventos y las
 * censuras por separado, y el número en riesgo es el de los sujetos con tiempo
 * ≥ t; así los eventos preceden a las censuras sin necesidad de ordenarlos.
 * Un tiempo con solo censuras aparece en la tabla con `eventos = 0` y deja Ŝ
 * intacta, igual que en R.
 */
export function tablaVida(
  tiempo: readonly number[],
  evento: readonly number[],
  op: OpcionesKm,
  codigo = 0,
): CurvaVida {
  const z = qnorm(1 - (1 - op.nivel) / 2);
  const distintos = [...new Set(tiempo)].sort((a, b) => a - b);
  const pasos: PasoVida[] = [];
  let s = 1;
  let g = 0;
  let eventosTotal = 0;
  for (const t of distintos) {
    let enRiesgo = 0;
    let eventos = 0;
    let censuras = 0;
    for (let i = 0; i < tiempo.length; i += 1) {
      if (tiempo[i] >= t) enRiesgo += 1;
      if (tiempo[i] !== t) continue;
      if (evento[i] === 1) eventos += 1;
      else censuras += 1;
    }
    if (eventos > 0) {
      s *= 1 - eventos / enRiesgo;
      // Con nᵢ = dᵢ el sumando es Infinity: Ŝ vale 0 y el intervalo no existe,
      // igual que el `std.err = Inf` y el `lower = NA` de survfit.
      g += eventos / (enRiesgo * (enRiesgo - eventos));
      eventosTotal += eventos;
    }
    const eeLog = Math.sqrt(g);
    const [lo, hi] = intervaloKm(s, eeLog, z, op.tipoIC);
    pasos.push({ t, enRiesgo, eventos, censuras, s, eeLog, lo, hi });
  }
  return {
    codigo,
    n: tiempo.length,
    eventos: eventosTotal,
    censuras: tiempo.length - eventosTotal,
    tMax: distintos.length > 0 ? (distintos[distintos.length - 1] as number) : Number.NaN,
    nivel: op.nivel,
    tipoIC: op.tipoIC,
    pasos,
  };
}

/** Tabla de vida de un solo grupo, filtrando las filas por su código. */
export function curvaDeGrupo(
  tiempo: readonly number[],
  evento: readonly number[],
  grupo: readonly number[],
  codigo: number,
  op: OpcionesKm,
): CurvaVida {
  const t: number[] = [];
  const e: number[] = [];
  for (let i = 0; i < tiempo.length; i += 1) {
    if (grupo[i] !== codigo) continue;
    t.push(tiempo[i] as number);
    e.push(evento[i] as number);
  }
  return tablaVida(t, e, op, codigo);
}

/** Vector de un campo de la tabla de vida, tal como lo imprime el snippet de R. */
export function columnaTablaVida(curva: CurvaVida, campo: CampoTablaKm): number[] {
  switch (campo) {
    case 't':
      return curva.pasos.map((p) => p.t);
    case 'riesgo':
      return curva.pasos.map((p) => p.enRiesgo);
    case 'ev':
      return curva.pasos.map((p) => p.eventos);
    case 'cens':
      return curva.pasos.map((p) => p.censuras);
    case 's':
      return curva.pasos.map((p) => p.s);
    case 'ee':
      return curva.pasos.map((p) => p.eeLog);
    case 'lo':
      return curva.pasos.map((p) => p.lo);
    case 'hi':
      return curva.pasos.map((p) => p.hi);
  }
}

// ---------------------------------------------------------------------------
// S(t*) y número en riesgo
// ---------------------------------------------------------------------------

/**
 * Valor de la curva en `t` sin comprobar el seguimiento: `[Ŝ, lo, hi]` del
 * último escalón con tiempo ≤ t, y `[1, 1, 1]` antes del primero. Es la función
 * escalonada continua por la derecha que evalúa `summary.survfit`.
 */
function valorEn(curva: CurvaVida, t: number): [number, number, number] {
  let fila: [number, number, number] = [1, 1, 1];
  for (const paso of curva.pasos) {
    if (paso.t > t) break;
    fila = [paso.s, paso.lo, paso.hi];
  }
  return fila;
}

/**
 * Ŝ(t*) con su intervalo. Más allá del último tiempo observado del grupo la
 * supervivencia NO está definida (especificación E3, regla 5): `summary(sf,
 * times, extend = TRUE)` prolongaría la curva y aquí se devuelve `NaN`, igual
 * que hace el snippet de R al filtrar `t ≤ max(tiempo del grupo)`.
 */
export function supervivenciaEn(curva: CurvaVida, t: number): Estimacion {
  const metodo = METODO_IC_KM[curva.tipoIC];
  if (!Number.isFinite(t) || t > curva.tMax) {
    return { valor: Number.NaN, ic: [Number.NaN, Number.NaN], nivel: curva.nivel, metodo };
  }
  const [s, lo, hi] = valorEn(curva, t);
  return { valor: s, ic: [lo, hi], nivel: curva.nivel, metodo };
}

/**
 * Sujetos en riesgo en `t`: los que tienen tiempo ≥ t. Es la fila «En riesgo»
 * que se dibuja bajo la gráfica, y se lee de la propia tabla de vida.
 */
export function enRiesgoEn(curva: CurvaVida, t: number): number {
  for (const paso of curva.pasos) {
    if (paso.t >= t) return paso.enRiesgo;
  }
  return 0;
}

/** Escalera de pasos «bonitos» dentro de una potencia de diez. */
const ESCALERA_RIESGO = [1, 2, 2.5, 5, 10] as const;

/**
 * Tiempos de la tabla de pacientes en riesgo: 0 y los múltiplos del menor paso
 * «bonito» (1, 2, 2.5, 5 o 10 por potencia de diez) con el que caben `objetivo`
 * columnas o menos dentro del seguimiento. Con 21 días de seguimiento y cinco
 * columnas el paso es 5: 0, 5, 10, 15 y 20.
 */
export function tiemposEnRiesgo(tMax: number, objetivo = 5): number[] {
  if (!Number.isFinite(tMax) || tMax <= 0) return [0];
  const bruto = tMax / (objetivo - 1);
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const columnas = (paso: number): number => Math.floor(tMax / paso + 1e-9) + 1;
  const candidatos = ESCALERA_RIESGO.map((factor) => factor * magnitud);
  const paso = candidatos.find((c) => columnas(c) <= objetivo) ?? (candidatos[candidatos.length - 1] as number);
  const salida: number[] = [];
  for (let k = 0; k < columnas(paso) && salida.length < objetivo; k += 1) {
    // El paso puede no ser representable en doble (0.1, 2.5e-7): se redondea a
    // la precisión del propio paso para que la columna no salga como 0.30000000000000004.
    salida.push(Number((k * paso).toPrecision(12)));
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Mediana de supervivencia: la regla de `quantile.survfit`
// ---------------------------------------------------------------------------

/** `sqrt(.Machine$double.eps)`, la tolerancia con la que `findq` compara p. */
export const TOL_CUANTIL_KM = Math.sqrt(Number.EPSILON);

/**
 * `approx(x, y, xout, method = "constant", f = 1, rule = 1)` de R para un solo
 * `xout`: devuelve el valor del extremo DERECHO del intervalo que contiene a
 * `v`, el valor exacto si `v` cae en un nodo, y `NaN` fuera del recorrido.
 *
 * ORDENAR LOS NODOS NO ES UNA PRECAUCIÓN, ES PARTE DEL ALGORITMO. `approx()`
 * pasa por `regularize.values`, que ordena por `x` y promedia el `y` de los
 * nodos repetidos (`ties = mean`), y `findq` le entrega 1 − Ŝ o 1 − banda. La
 * banda inferior de Ŝ NO es monótona al principio de la curva en la escala
 * log-log: al primer evento |ln Ŝ| es diminuto, el exponente se dispara y el
 * límite se hunde; al segundo evento |ln Ŝ| crece y el límite vuelve a subir.
 * Con 1..10, eventos en todos menos 3, 7 y 10, nivel 0.999 y log-log, 1 − lower
 * empieza en 0.9412 y BAJA a 0.8994. Una búsqueda binaria sobre esa lista sin
 * ordenar devolvía el límite inferior de la mediana en 1 donde R da 2.
 */
function approxConstante(nodos: readonly number[], valores: readonly number[], v: number): number {
  const pares = nodos
    .map((nodo, i) => ({ nodo, valor: valores[i] as number }))
    .sort((a, b) => a.nodo - b.nodo);
  const x: number[] = [];
  const y: number[] = [];
  const repeticiones: number[] = [];
  for (const par of pares) {
    const ultimo = x.length - 1;
    if (ultimo >= 0 && x[ultimo] === par.nodo) {
      y[ultimo] = (y[ultimo] as number) + par.valor;
      repeticiones[ultimo] = (repeticiones[ultimo] as number) + 1;
    } else {
      x.push(par.nodo);
      y.push(par.valor);
      repeticiones.push(1);
    }
  }
  for (let i = 0; i < y.length; i += 1) y[i] = (y[i] as number) / (repeticiones[i] as number);

  const n = x.length;
  // Ya ordenados, x[0] y x[n − 1] son el mínimo y el máximo del recorrido.
  if (n === 0 || v < (x[0] as number) || v > (x[n - 1] as number)) return Number.NaN;
  let i = 0;
  let j = n - 1;
  while (i < j - 1) {
    const ij = Math.floor((i + j) / 2);
    if (v < (x[ij] as number)) j = ij;
    else i = ij;
  }
  if (v === x[j]) return y[j] as number;
  if (v === x[i]) return y[i] as number;
  return y[j] as number;
}

/**
 * `findq` de `survival` (el motor de `quantile.survfit`), traducido paso por
 * paso sobre `x` = [0, tiempos] e `y` = [0, 1 − Ŝ]:
 *
 * 1. Si la función de fallo nunca llega a `p`, el cuantil es `NA`.
 * 2. Se quitan los valores repetidos de `y` (las mesetas), conservando el
 *    primer tiempo de cada uno; `xmax` es el ÚLTIMO tiempo, de antes de quitarlos.
 * 3. Se busca `p` en `y + tol` y en `y − tol` con interpolación constante por la
 *    derecha; el cuantil es el promedio de los dos tiempos. Con una meseta
 *    exactamente en `p`, el primero es donde la curva llega y el segundo donde
 *    la deja, de modo que el cuantil es el punto medio.
 * 4. Si la curva TERMINA en `p`, el segundo tiempo no existe y su lugar lo toma
 *    `xmax`: con 4 sujetos, eventos en 2 y 4 y censuras después hasta 9, la
 *    mediana es (4 + 9)/2 = 6.5, que es lo que devuelve R.
 */
export function cuantilSurvfit(x: readonly number[], y: readonly number[], p: number): number {
  let maxY = Number.NEGATIVE_INFINITY;
  for (const v of y) if (!Number.isNaN(v) && v > maxY) maxY = v;
  if (maxY === Number.NEGATIVE_INFINITY || maxY < p) return Number.NaN;
  const xmax = x[x.length - 1] as number;

  // `duplicated(y)`: se conserva la primera aparición de cada valor, y los NA
  // se consideran repetidos entre sí.
  const vistos = new Set<string>();
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < y.length; i += 1) {
    const v = y[i] as number;
    const clave = Number.isNaN(v) ? 'NA' : String(v);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    xs.push(x[i] as number);
    ys.push(v);
  }

  // `approx` descarta los pares con NA antes de interpolar; los índices siguen
  // refiriéndose a la lista sin repetidos.
  const nodos: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < ys.length; i += 1) {
    if (Number.isNaN(ys[i] as number)) continue;
    nodos.push(ys[i] as number);
    indices.push(i + 1);
  }
  // `x[2.5]` en R indexa `x[2]`: el índice se trunca, no se redondea. Solo puede
  // no ser entero si `approx` promedió nodos repetidos (`ties = mean`).
  const en = (indice: number): number =>
    Number.isFinite(indice) ? (xs[Math.trunc(indice) - 1] as number) : Number.NaN;
  const i1 = approxConstante(
    nodos.map((v) => v + TOL_CUANTIL_KM),
    indices,
    p,
  );
  const i2 = approxConstante(
    nodos.map((v) => v - TOL_CUANTIL_KM),
    indices,
    p,
  );
  let cuantil = (en(i1) + en(i2)) / 2;
  if (p === 0) cuantil = xs[0] as number;
  const ultimo = ys[ys.length - 1] as number;
  if (!Number.isNaN(ultimo) && Math.abs(p - ultimo) < TOL_CUANTIL_KM) cuantil = (en(i1) + xmax) / 2;
  return cuantil;
}

/**
 * Mediana de supervivencia con su intervalo de confianza (Brookmeyer y Crowley
 * 1982), tal como los devuelve `quantile(sf, 0.5)`: la estimación aplica la
 * regla anterior a Ŝ, el límite inferior a la banda INFERIOR de Ŝ y el superior
 * a la banda superior, porque una curva que baja más deprisa cruza el 0.5 antes.
 * `NaN` = mediana no alcanzada.
 */
export function medianaKm(curva: CurvaVida, p = 0.5): Estimacion {
  const x = [0, ...curva.pasos.map((paso) => paso.t)];
  const falla = (valores: number[]): number[] => [0, ...valores.map((v) => 1 - v)];
  return {
    valor: cuantilSurvfit(x, falla(curva.pasos.map((paso) => paso.s)), p),
    ic: [
      cuantilSurvfit(x, falla(curva.pasos.map((paso) => paso.lo)), p),
      cuantilSurvfit(x, falla(curva.pasos.map((paso) => paso.hi)), p),
    ],
    nivel: curva.nivel,
    metodo: METODO_IC_KM[curva.tipoIC],
  };
}

// ---------------------------------------------------------------------------
// Prueba de log-rank
// ---------------------------------------------------------------------------

/**
 * Prueba de log-rank de dos grupos (ρ = 0, Mantel-Haenszel), con los mismos
 * números que `survdiff(..., rho = 0)`:
 *
 *   E₁ = Σ dᵢ·n₁ᵢ/nᵢ,  V = Σ dᵢ·(n₁ᵢ/nᵢ)(1 − n₁ᵢ/nᵢ)(nᵢ − dᵢ)/(nᵢ − 1),
 *   χ² = (O₁ − E₁)²/V con 1 grado de libertad.
 *
 * Un tiempo con un solo sujeto en riesgo no aporta varianza (el factor
 * (nᵢ − dᵢ)/(nᵢ − 1) sería 0/0). Sin varianza acumulada el χ² no está definido.
 */
export function logRank(
  tiempo: readonly number[],
  evento: readonly number[],
  grupo: readonly number[],
  codigos: readonly number[],
): ResultadoLogRank {
  const primero = codigos[0];
  const tiemposEvento = [...new Set(tiempo.filter((_t, i) => evento[i] === 1))].sort((a, b) => a - b);
  let o1 = 0;
  let e1 = 0;
  let v = 0;
  let eventosTotal = 0;
  for (const t of tiemposEvento) {
    let n = 0;
    let n1 = 0;
    let d = 0;
    let d1 = 0;
    for (let i = 0; i < tiempo.length; i += 1) {
      const enGrupo1 = grupo[i] === primero;
      if ((tiempo[i] as number) >= t) {
        n += 1;
        if (enGrupo1) n1 += 1;
      }
      if (tiempo[i] !== t || evento[i] !== 1) continue;
      d += 1;
      if (enGrupo1) d1 += 1;
    }
    o1 += d1;
    e1 += (d * n1) / n;
    eventosTotal += d;
    if (n > 1) v += d * (n1 / n) * (1 - n1 / n) * ((n - d) / (n - 1));
  }
  // Con varianza 0 no hay prueba: ni estadístico, ni grados de libertad, ni p.
  // `survdiff` se detiene con un sistema singular en unos casos y en otros
  // imprime «on 0 degrees of freedom»; el snippet devuelve NA en los tres.
  const chi2 = v > 0 ? (o1 - e1) ** 2 / v : Number.NaN;
  return {
    chi2,
    gl: v > 0 ? 1 : Number.NaN,
    p: Number.isNaN(chi2) ? Number.NaN : pchisq(chi2, 1, false),
    observados: [o1, eventosTotal - o1],
    esperados: [e1, eventosTotal - e1],
    varianza: v,
  };
}

// ---------------------------------------------------------------------------
// Forma de las curvas
// ---------------------------------------------------------------------------

/**
 * ¿Se cruzan las dos curvas dentro del seguimiento común? Se compara Ŝ₁ − Ŝ₂ en
 * todos los tiempos observados de cualquiera de las dos, desde el primer evento
 * hasta el menor de los dos seguimientos, y se declara cruce cuando esa
 * diferencia cambia de signo. Más allá del seguimiento más corto las dos curvas
 * son mesetas sin información y un «cruce» ahí no diría nada.
 *
 * Es la condición del aviso de la especificación: con curvas que se cruzan el
 * log-rank pierde poder y un solo cociente de riesgos no resume la diferencia.
 */
export function curvasCruzan(a: CurvaVida, b: CurvaVida): boolean {
  const primerEvento = Math.min(
    a.pasos.find((p) => p.eventos > 0)?.t ?? Number.POSITIVE_INFINITY,
    b.pasos.find((p) => p.eventos > 0)?.t ?? Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(primerEvento)) return false;
  const hasta = Math.min(a.tMax, b.tMax);
  const tiempos = [...new Set([...a.pasos.map((p) => p.t), ...b.pasos.map((p) => p.t)])]
    .filter((t) => t >= primerEvento && t <= hasta)
    .sort((x, y) => x - y);
  let signo = 0;
  for (const t of tiempos) {
    const dif = valorEn(a, t)[0] - valorEn(b, t)[0];
    if (dif === 0) continue;
    const actual = dif > 0 ? 1 : -1;
    if (signo !== 0 && actual !== signo) return true;
    signo = actual;
  }
  return false;
}

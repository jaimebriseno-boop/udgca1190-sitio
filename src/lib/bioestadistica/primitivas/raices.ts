/**
 * Búsqueda de raíces: método de Brent y expansión geométrica de intervalos.
 *
 * Referencias:
 *  - Brent RP. «Algorithms for Minimization without Derivatives», Prentice-Hall
 *    1973, cap. 4 (combinación de bisección, secante e interpolación cuadrática
 *    inversa con garantía de convergencia).
 *  - Press WH y cols. «Numerical Recipes» 3.ª ed., §9.3 («zbrent»).
 *
 * Este módulo no importa nada fuera de `primitivas/`.
 */

/** Opciones de `brent`. */
export interface OpcionesBrent {
  /**
   * Parte absoluta de la tolerancia. El criterio efectivo de parada es
   * `|xm| ≤ 2·ε·|x| + tol/2`, es decir, siempre al menos precisión relativa de
   * máquina. Con `tol = 0` la raíz se afina hasta el último bit representable.
   */
  tol?: number;
  /** Tope de iteraciones (por defecto 200, como pide el plan §1.3). */
  maxIter?: number;
}

/** Opciones de `expandirIntervalo`. */
export interface OpcionesExpansion {
  /** Paso inicial; por defecto `max(|x0|, 1)`. */
  paso?: number;
  /** Factor geométrico de crecimiento del paso (por defecto 2). */
  factor?: number;
  /** Tope de expansiones (por defecto 1200: alcanza ±1e308 duplicando). */
  maxIter?: number;
}

const EPS_MAQUINA = Number.EPSILON;

/**
 * Raíz de `f` en `[a, b]` por el método de Brent (1973).
 *
 * Exige cambio de signo en el intervalo: si `f(a)` y `f(b)` tienen el mismo
 * signo lanza `RangeError`. Devuelve el extremo cuando alguno de los dos es raíz
 * exacta, y la mejor aproximación disponible si se agota `maxIter`.
 */
export function brent(
  f: (x: number) => number,
  a: number,
  b: number,
  opciones: OpcionesBrent = {},
): number {
  const tol = opciones.tol ?? 1e-14;
  const maxIter = opciones.maxIter ?? 200;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new RangeError(`brent: el corchete debe ser finito (a = ${a}, b = ${b})`);
  }
  if (tol < 0) throw new RangeError(`brent: tol debe ser ≥ 0 (tol = ${tol})`);

  let xa = a;
  let xb = b;
  let fa = f(xa);
  let fb = f(xb);
  if (Number.isNaN(fa) || Number.isNaN(fb)) {
    throw new RangeError(`brent: f no está definida en los extremos (f(${xa}) = ${fa}, f(${xb}) = ${fb})`);
  }
  if (fa === 0) return xa;
  if (fb === 0) return xb;
  if ((fa > 0 && fb > 0) || (fa < 0 && fb < 0)) {
    throw new RangeError(
      `brent: no hay cambio de signo en [${a}, ${b}] (f(a) = ${fa}, f(b) = ${fb})`,
    );
  }

  let xc = xb;
  let fc = fb;
  let d = xb - xa;
  let e = d;

  for (let iter = 0; iter < maxIter; iter++) {
    if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
      xc = xa;
      fc = fa;
      d = xb - xa;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      xa = xb; xb = xc; xc = xa;
      fa = fb; fb = fc; fc = fa;
    }
    const tol1 = 2 * EPS_MAQUINA * Math.abs(xb) + 0.5 * tol;
    const xm = 0.5 * (xc - xb);
    if (Math.abs(xm) <= tol1 || fb === 0) return xb;

    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      // Interpolación cuadrática inversa (o secante si solo hay dos puntos).
      const s = fb / fa;
      let p: number;
      let q: number;
      if (xa === xc) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (xb - xa) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      const cota1 = 3 * xm * q - Math.abs(tol1 * q);
      const cota2 = Math.abs(e * q);
      if (2 * p < Math.min(cota1, cota2)) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    xa = xb;
    fa = fb;
    if (Math.abs(d) > tol1) xb += d;
    else xb += xm >= 0 ? tol1 : -tol1;
    fb = f(xb);
    if (Number.isNaN(fb)) {
      throw new RangeError(`brent: f devolvió NaN en x = ${xb}`);
    }
  }
  return xb;
}

/**
 * Expande geométricamente desde `x0` en el sentido indicado hasta encontrar un
 * corchete `[a, b]` con cambio de signo de `f`, apto para pasarlo a `brent`.
 *
 * `direccion` debe ser +1 (hacia +∞) o −1 (hacia −∞). El paso inicial es
 * `max(|x0|, 1)` y se duplica en cada intento, de modo que alcanzar el borde del
 * rango de los dobles cuesta alrededor de mil evaluaciones.
 */
export function expandirIntervalo(
  f: (x: number) => number,
  x0: number,
  direccion: 1 | -1,
  opciones: OpcionesExpansion = {},
): [number, number] {
  if (!Number.isFinite(x0)) {
    throw new RangeError(`expandirIntervalo: x0 debe ser finito (x0 = ${x0})`);
  }
  if (direccion !== 1 && direccion !== -1) {
    throw new RangeError(`expandirIntervalo: dirección debe ser 1 o −1 (recibido ${direccion})`);
  }
  const factor = opciones.factor ?? 2;
  const maxIter = opciones.maxIter ?? 1200;
  if (!(factor > 1)) {
    throw new RangeError(`expandirIntervalo: factor debe ser > 1 (factor = ${factor})`);
  }
  let paso = opciones.paso ?? Math.max(Math.abs(x0), 1);
  if (!(paso > 0)) {
    throw new RangeError(`expandirIntervalo: paso debe ser > 0 (paso = ${paso})`);
  }

  let xPrev = x0;
  let fPrev = f(xPrev);
  if (fPrev === 0) return [xPrev, xPrev];
  if (Number.isNaN(fPrev)) {
    throw new RangeError(`expandirIntervalo: f(${xPrev}) = NaN`);
  }

  for (let i = 0; i < maxIter; i++) {
    const xSig = xPrev + direccion * paso;
    if (!Number.isFinite(xSig)) break;
    const fSig = f(xSig);
    if (Number.isNaN(fSig)) {
      throw new RangeError(`expandirIntervalo: f(${xSig}) = NaN`);
    }
    if (fSig === 0 || (fSig > 0) !== (fPrev > 0)) {
      return direccion === 1 ? [xPrev, xSig] : [xSig, xPrev];
    }
    xPrev = xSig;
    fPrev = fSig;
    paso *= factor;
  }
  throw new RangeError(
    `expandirIntervalo: no se encontró cambio de signo desde ${x0} hacia ${direccion > 0 ? '+∞' : '−∞'}`,
  );
}

// ---------------------------------------------------------------------------
// uniroot de R (zeroin de Forsythe, Malcolm y Moler)
// ---------------------------------------------------------------------------

/** Tolerancia por omisión de `uniroot` en R: `.Machine$double.eps^0.25` ≈ 1.22e-4. */
export const TOL_UNIROOT = Math.pow(Number.EPSILON, 0.25);

/** Opciones de `uniroot`. */
export interface OpcionesUniroot {
  /** `tol` de R (por omisión `TOL_UNIROOT`; `power.*.test` se llaman con 1e-10). */
  tol?: number;
  /** `maxiter` de R (por omisión 1000). */
  maxIter?: number;
}

/**
 * `uniroot(f, c(a, b), tol)` de R: traducción literal de `R_zeroin2`
 * (`src/library/stats/src/zeroin.c`), el zeroin de Forsythe, Malcolm y Moler
 * (1977) con la interpolación cuadrática inversa de Brent.
 *
 * Existe además de `brent` (la variante «zbrent» de Numerical Recipes) porque
 * las dos difieren en qué paso previo vigilan para aceptar la interpolación y,
 * con la tolerancia gruesa de `uniroot`, esa diferencia mueve el punto de
 * parada dentro de la banda de ±tol/2: en el OR condicional de `fisher.test`
 * `brent` se apartaba de R hasta 1.3e-3 y esta traducción coincide en ~1e-15.
 * Se usa siempre que el oráculo es una función de R que resuelve con `uniroot`
 * (`fisher.test`, `power.prop.test`, `power.t.test`, `pwr::pwr.r.test`): el
 * objetivo no es la raíz «verdadera», sino el número que imprime R.
 *
 * @throws {RangeError} si `f` no está definida en los extremos, si no cambia de
 *   signo en `[a, b]` o si devuelve NaN por el camino.
 */
export function uniroot(f: (t: number) => number, ax: number, bx: number, opciones: OpcionesUniroot = {}): number {
  const tol = opciones.tol ?? TOL_UNIROOT;
  const maxIter = opciones.maxIter ?? 1000;
  let a = ax;
  let b = bx;
  let c = a;
  let fa = f(a);
  let fb = f(b);
  let fc = fa;
  if (Number.isNaN(fa) || Number.isNaN(fb)) {
    throw new RangeError(`uniroot: f no está definida en los extremos (f(${a}) = ${fa}, f(${b}) = ${fb})`);
  }
  if (fa === 0) return a;
  if (fb === 0) return b;
  if ((fa > 0 && fb > 0) || (fa < 0 && fb < 0)) {
    throw new RangeError(`uniroot: no hay cambio de signo en [${ax}, ${bx}] (f(a) = ${fa}, f(b) = ${fb})`);
  }

  for (let iter = 0; iter <= maxIter; iter += 1) {
    const pasoPrevio = b - a;
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tolAct = 2 * Number.EPSILON * Math.abs(b) + tol / 2;
    let paso = (c - b) / 2;
    if (Math.abs(paso) <= tolAct || fb === 0) return b;

    // Interpolación (lineal con dos puntos, cuadrática inversa con tres) solo
    // si el paso anterior fue suficientemente grande y |f| está bajando.
    if (Math.abs(pasoPrevio) >= tolAct && Math.abs(fa) > Math.abs(fb)) {
      const cb = c - b;
      let p: number;
      let q: number;
      if (a === c) {
        const t1 = fb / fa;
        p = cb * t1;
        q = 1 - t1;
      } else {
        const q0 = fa / fc;
        const t1 = fb / fc;
        const t2 = fb / fa;
        p = t2 * (cb * q0 * (q0 - t1) - (b - a) * (t1 - 1));
        q = (q0 - 1) * (t1 - 1) * (t2 - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (p < 0.75 * cb * q - Math.abs(tolAct * q) / 2 && p < Math.abs((pasoPrevio * q) / 2)) paso = p / q;
    }
    if (Math.abs(paso) < tolAct) paso = paso > 0 ? tolAct : -tolAct;

    a = b;
    fa = fb;
    b += paso;
    fb = f(b);
    if (Number.isNaN(fb)) throw new RangeError(`uniroot: f devolvió NaN en x = ${b}`);
    if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
      c = a;
      fc = fa;
    }
  }
  return b;
}

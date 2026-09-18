/**
 * Contraste de las primitivas numéricas contra R.
 *
 *   node --test tests/bioestadistica/primitivas.test.ts
 *
 * La rejilla de referencia la genera `tests/bioestadistica/r/primitivas.R` y
 * vive en `fixtures/primitivas.json`. Este archivo no necesita R: consume el
 * JSON commiteado. Además del contraste fila a fila se comprueban identidades
 * (inversión de las CDF, simetrías) y valores tabulados de Abramowitz & Stegun.
 *
 * Regla de igualdad (plan del motor §6.3): ambos NaN → iguales; infinitos del
 * mismo signo → iguales; si no, |a − b| ≤ abs + rel·max(|a|, |b|).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  erf, erfc, lbeta, lchoose, lfactorial, lgamma,
} from '../../src/lib/bioestadistica/primitivas/especiales.ts';
import {
  betaInc, gammaP, gammaQ,
} from '../../src/lib/bioestadistica/primitivas/incompletas.ts';
import {
  brent, expandirIntervalo,
} from '../../src/lib/bioestadistica/primitivas/raices.ts';
import {
  dbinom, dhyper, dnorm, pbeta, pbinom, pchisq, pf, pgamma, phyper, pnorm, pnt,
  pt, qbeta, qchisq, qf, qgamma, qnorm, qt,
} from '../../src/lib/bioestadistica/primitivas/distribuciones.ts';

// ---------------------------------------------------------------------------
// Lectura y decodificación del fixture
// ---------------------------------------------------------------------------

interface Bloque {
  familia: string;
  args: string[];
  filas: string[][];
}

interface Fixture {
  meta: Record<string, string | number>;
  bloques: Bloque[];
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/primitivas.json', import.meta.url), 'utf8'),
) as Fixture;

/**
 * Decodifica una celda: nombre especial, patrón IEEE-754 en hexadecimal o
 * notación decimal. El hexadecimal garantiza que el doble de R y el de Node son
 * el mismo bit a bit, sin pasar por el formateador decimal.
 */
function decodificar(s: string): number {
  if (s === 'NaN' || s === 'NA') return NaN;
  if (s === 'Inf') return Infinity;
  if (s === '-Inf') return -Infinity;
  if (s.startsWith('0x')) {
    const vista = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < 8; i++) {
      vista.setUint8(i, Number.parseInt(s.slice(2 + i * 2, 4 + i * 2), 16));
    }
    return vista.getFloat64(0, false);
  }
  return Number(s);
}

type Arg = number | boolean;

function decodificarArg(s: string): Arg {
  if (s === 'T') return true;
  if (s === 'F') return false;
  return decodificar(s);
}

function num(a: readonly Arg[], i: number): number {
  const v = a[i];
  if (typeof v !== 'number') throw new TypeError(`el argumento ${i} no es número`);
  return v;
}

function log(a: readonly Arg[], i: number): boolean {
  const v = a[i];
  if (typeof v !== 'boolean') throw new TypeError(`el argumento ${i} no es lógico`);
  return v;
}

// ---------------------------------------------------------------------------
// Tolerancias (plan del motor §6.3 y plan de métodos §H)
// ---------------------------------------------------------------------------

interface Tolerancia { rel: number; abs: number }

/**
 * Normal: 1e-12 relativa. El suelo absoluto de 1e-315 solo interviene en la
 * zona subnormal (|q| > 37.4), donde un doble ya no tiene 12 cifras: allí un
 * único ulp vale 1.7e-8 en términos relativos. Las colas de verdad se verifican
 * con `log = TRUE`, que sí conserva la precisión completa.
 */
const TOL_NORMAL: Tolerancia = { rel: 1e-12, abs: 1e-315 };
/** Resto de distribuciones: 1e-9 relativa, con suelo absoluto en las colas. */
const TOL_DIST: Tolerancia = { rel: 1e-9, abs: 1e-300 };
/**
 * t no central: 1e-9 relativa, pero con suelo absoluto de 3e-15. AS 243
 * construye la respuesta alrededor de Φ(−δ) y la devuelve complementada, así
 * que en la cola opuesta al parámetro de no centralidad quedan unos pocos ulp
 * de error absoluto; la propia ayuda de R advierte que su `pt` con `ncp` «no es
 * muy exacta, sobre todo en las colas». Discrepancia absoluta máxima medida
 * frente a R sobre la rejilla: 2.14e-15.
 */
const TOL_PNT: Tolerancia = { rel: 1e-9, abs: 3e-15 };
/** El menor doble normalizado: por debajo de él ya no hay 53 bits de mantisa. */
const MENOR_NORMAL = 2.2250738585072014e-308;
/** Logaritmos de funciones especiales: 1e-13 relativa; el suelo absoluto cubre
 *  los ceros exactos de lgamma en 1 y 2. */
const TOL_ESPECIAL: Tolerancia = { rel: 1e-13, abs: 1e-14 };

function iguales(a: number, b: number, tol: Tolerancia): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tol.abs + tol.rel * Math.max(Math.abs(a), Math.abs(b));
}

function errorRelativo(a: number, b: number): number {
  const d = Math.max(Math.abs(a), Math.abs(b));
  if (d === 0 || !Number.isFinite(d)) return 0;
  return Math.abs(a - b) / d;
}

// ---------------------------------------------------------------------------
// Despacho por familia
// ---------------------------------------------------------------------------

interface Especificacion {
  fn: (a: readonly Arg[]) => number;
  tol: Tolerancia;
}

const FAMILIAS: Record<string, Especificacion> = {
  pnorm: { tol: TOL_NORMAL, fn: (a) => pnorm(num(a, 0), num(a, 1), num(a, 2), log(a, 3), log(a, 4)) },
  qnorm: { tol: TOL_NORMAL, fn: (a) => qnorm(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  dnorm: { tol: TOL_NORMAL, fn: (a) => dnorm(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  pt: { tol: TOL_DIST, fn: (a) => pt(num(a, 0), num(a, 1), log(a, 2)) },
  qt: { tol: TOL_DIST, fn: (a) => qt(num(a, 0), num(a, 1), log(a, 2)) },
  pnt: { tol: TOL_PNT, fn: (a) => pnt(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  pchisq: { tol: TOL_DIST, fn: (a) => pchisq(num(a, 0), num(a, 1), log(a, 2)) },
  qchisq: { tol: TOL_DIST, fn: (a) => qchisq(num(a, 0), num(a, 1), log(a, 2)) },
  pgamma: { tol: TOL_DIST, fn: (a) => pgamma(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  qgamma: { tol: TOL_DIST, fn: (a) => qgamma(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  pbeta: { tol: TOL_DIST, fn: (a) => pbeta(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  qbeta: { tol: TOL_DIST, fn: (a) => qbeta(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  pf: { tol: TOL_DIST, fn: (a) => pf(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  qf: { tol: TOL_DIST, fn: (a) => qf(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  dbinom: { tol: TOL_DIST, fn: (a) => dbinom(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  pbinom: { tol: TOL_DIST, fn: (a) => pbinom(num(a, 0), num(a, 1), num(a, 2), log(a, 3)) },
  dhyper: { tol: TOL_DIST, fn: (a) => dhyper(num(a, 0), num(a, 1), num(a, 2), num(a, 3), log(a, 4)) },
  phyper: { tol: TOL_DIST, fn: (a) => phyper(num(a, 0), num(a, 1), num(a, 2), num(a, 3), log(a, 4)) },
  lgamma: { tol: TOL_ESPECIAL, fn: (a) => lgamma(num(a, 0)) },
  lfactorial: { tol: TOL_ESPECIAL, fn: (a) => lfactorial(num(a, 0)) },
  lbeta: { tol: TOL_ESPECIAL, fn: (a) => lbeta(num(a, 0), num(a, 1)) },
  lchoose: { tol: TOL_ESPECIAL, fn: (a) => lchoose(num(a, 0), num(a, 1)) },
  erf: { tol: TOL_NORMAL, fn: (a) => erf(num(a, 0)) },
  erfc: { tol: TOL_NORMAL, fn: (a) => erfc(num(a, 0)) },
};

// ---------------------------------------------------------------------------
// Contraste contra la rejilla de R
// ---------------------------------------------------------------------------

let comparaciones = 0;

test('la rejilla de R está completa y bien formada', () => {
  assert.ok(fixture.bloques.length > 0, 'el fixture no tiene bloques');
  const familias = new Set(fixture.bloques.map((b) => b.familia));
  for (const nombre of Object.keys(FAMILIAS)) {
    assert.ok(familias.has(nombre), `falta el bloque «${nombre}» en el fixture`);
  }
  for (const bloque of fixture.bloques) {
    assert.ok(FAMILIAS[bloque.familia] !== undefined,
      `el fixture trae una familia desconocida: ${bloque.familia}`);
    assert.ok(bloque.filas.length > 0, `el bloque ${bloque.familia} está vacío`);
    for (const fila of bloque.filas) {
      assert.equal(fila.length, bloque.args.length + 1,
        `fila con aridad equivocada en ${bloque.familia}`);
    }
  }
});

test('pnorm y qnorm cubren al menos 60 puntos cada uno', () => {
  for (const nombre of ['pnorm', 'qnorm']) {
    const bloque = fixture.bloques.find((b) => b.familia === nombre);
    assert.ok(bloque !== undefined);
    assert.ok(bloque.filas.length >= 60,
      `${nombre} solo tiene ${bloque.filas.length} filas`);
  }
});

for (const bloque of fixture.bloques) {
  const espec = FAMILIAS[bloque.familia];
  if (espec === undefined) continue;
  test(`${bloque.familia} coincide con R en ${bloque.filas.length} puntos`, () => {
    const fallos: string[] = [];
    let peor = 0;
    for (const fila of bloque.filas) {
      const args = fila.slice(0, -1).map(decodificarArg);
      const esperado = decodificar(fila[fila.length - 1]);
      let obtenido: number;
      try {
        obtenido = espec.fn(args);
      } catch (e) {
        fallos.push(`${bloque.familia}(${fila.slice(0, -1).join(', ')}) lanzó ${
          e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      comparaciones++;
      const rel = errorRelativo(obtenido, esperado);
      if (rel > peor && Number.isFinite(rel)) peor = rel;
      if (!iguales(obtenido, esperado, espec.tol) && fallos.length < 12) {
        fallos.push(
          `${bloque.familia}(${fila.slice(0, -1).join(', ')}): ts = ${obtenido}, `
          + `R = ${esperado}, rel = ${rel.toExponential(3)}`,
        );
      }
    }
    assert.deepEqual(fallos, [], `\n${fallos.join('\n')}\n(peor error relativo del bloque: ${peor.toExponential(2)})`);
  });
}

// ---------------------------------------------------------------------------
// Identidades
// ---------------------------------------------------------------------------

/** Rejilla de probabilidades de 1e-300 a 1−1e-16. */
const P_REJILLA: number[] = (() => {
  const ps: number[] = [];
  for (let e = 300; e >= 1; e -= 1) ps.push(Number(`1e-${e}`));
  ps.push(0.025, 0.05, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.95, 0.975, 0.99,
    0.999, 1 - 1e-4, 1 - 1e-8, 1 - 1e-12, 1 - 1e-16);
  return ps;
})();

test('pnorm(qnorm(p)) = p en toda la rejilla de 1e-300 a 1−1e-16', () => {
  for (const p of P_REJILLA) {
    const z = qnorm(p);
    const vuelta = pnorm(z);
    assert.ok(iguales(vuelta, p, { rel: 1e-12, abs: 0 }),
      `p = ${p}: qnorm = ${z}, pnorm(qnorm) = ${vuelta}, rel = ${errorRelativo(vuelta, p).toExponential(3)}`);
    comparaciones++;
  }
});

test('qnorm(pnorm(z)) = z pasando siempre por la cola pequeña', () => {
  // Con z > 0 la cola inferior vale 1 − ε y su resolución en doble es 1.1e-16,
  // así que la vuelta solo está bien condicionada por la cola superior.
  for (let z = -8; z <= 8; z += 0.125) {
    if (Math.abs(z) < 1e-12) continue;
    const vuelta = z <= 0
      ? qnorm(pnorm(z))
      : qnorm(pnorm(z, 0, 1, false), 0, 1, false);
    assert.ok(iguales(vuelta, z, { rel: 1e-13, abs: 1e-14 }),
      `z = ${z}: vuelta = ${vuelta}`);
    comparaciones++;
  }
});

test('erf cerca del origen sigue su desarrollo 2x/√π', () => {
  const dosSobreRaizPi = 1.1283791670955126;
  // Hasta 1e-8 el término cúbico del desarrollo pesa menos de 1e-16 relativo.
  for (const x of [1e-300, 1e-200, 1e-100, 1e-20, 1e-12, 1e-10, 1e-8]) {
    assert.ok(iguales(erf(x), dosSobreRaizPi * x, { rel: 1e-15, abs: 0 }),
      `erf(${x}) = ${erf(x)}`);
    assert.equal(erf(-x), -erf(x), `erf impar en ${x}`);
    comparaciones += 2;
  }
  assert.equal(erf(0), 0);
  assert.equal(erfc(0), 1);
  assert.equal(erf(Infinity), 1);
  assert.equal(erfc(Infinity), 0);
  assert.equal(erfc(-Infinity), 2);
  comparaciones += 5;
});

test('simetrías de la normal: pnorm(−x) = 1 − pnorm(x) y colas cruzadas', () => {
  for (let x = 0; x <= 37; x += 0.25) {
    // La cola inferior en −x y la superior en x son literalmente el mismo cálculo.
    assert.equal(pnorm(-x), pnorm(x, 0, 1, false), `cola cruzada en x = ${x}`);
    comparaciones++;
    if (x <= 5) {
      assert.ok(iguales(pnorm(-x), 1 - pnorm(x), { rel: 1e-12, abs: 1e-16 }),
        `simetría en x = ${x}`);
      comparaciones++;
    }
    assert.equal(dnorm(-x), dnorm(x), `dnorm simétrica en x = ${x}`);
    comparaciones++;
  }
});

test('pchisq(qchisq(p, k), k) = p', () => {
  const grados = [1, 2, 3, 5, 10, 25, 50, 200];
  const ps = [1e-300, 1e-200, 1e-100, 1e-50, 1e-20, 1e-10, 1e-5, 0.001, 0.01,
    0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975, 0.99, 0.999, 1 - 1e-8];
  for (const k of grados) {
    for (const p of ps) {
      const x = qchisq(p, k);
      // Por debajo del menor normal el cuantil ya no es representable
      // (qchisq(1e-200, 1) valdría 1e-400) y la vuelta no puede cerrar.
      if (x < MENOR_NORMAL || !Number.isFinite(x)) continue;
      const vuelta = pchisq(x, k);
      assert.ok(iguales(vuelta, p, { rel: 1e-10, abs: 1e-300 }),
        `k = ${k}, p = ${p}: x = ${x}, vuelta = ${vuelta}`);
      comparaciones++;
      // Y por la cola superior, que es la rama bien condicionada.
      const xs = qchisq(p, k, false);
      if (Number.isFinite(xs) && xs > 0) {
        assert.ok(iguales(pchisq(xs, k, false), p, { rel: 1e-10, abs: 1e-300 }),
          `cola superior k = ${k}, p = ${p}`);
        comparaciones++;
      }
    }
  }
});

test('pbeta(qbeta(p, a, b), a, b) = p', () => {
  const pares: [number, number][] = [[0.5, 0.5], [1, 1], [2, 3], [68, 13],
    [0.5, 500], [500, 500], [1, 100]];
  const ps = [1e-100, 1e-20, 1e-10, 1e-5, 0.001, 0.025, 0.1, 0.25, 0.5, 0.75,
    0.9, 0.975, 0.999];
  for (const [a, b] of pares) {
    for (const p of ps) {
      const x = qbeta(p, a, b);
      if (x <= 0 || x >= 1) continue;
      assert.ok(iguales(pbeta(x, a, b), p, { rel: 1e-10, abs: 1e-300 }),
        `a = ${a}, b = ${b}, p = ${p}: x = ${x}, vuelta = ${pbeta(x, a, b)}`);
      comparaciones++;
    }
  }
});

test('pt(qt(p, df), df) = p', () => {
  const grados = [1, 2, 5, 10, 30, 100, 1000];
  const ps = [1e-150, 1e-100, 1e-50, 1e-20, 1e-10, 1e-5, 0.001, 0.01, 0.025,
    0.05, 0.1, 0.25, 0.5, 0.75, 0.95, 0.975, 0.999];
  for (const df of grados) {
    for (const p of ps) {
      const x = qt(p, df);
      if (!Number.isFinite(x)) continue;
      assert.ok(iguales(pt(x, df), p, { rel: 1e-10, abs: 1e-300 }),
        `df = ${df}, p = ${p}: x = ${x}, vuelta = ${pt(x, df)}`);
      comparaciones++;
      assert.ok(iguales(qt(p, df, false), -x, { rel: 1e-14, abs: 0 }),
        `simetría de qt en df = ${df}, p = ${p}`);
      comparaciones++;
    }
  }
});

test('pgamma(qgamma(p, a, r), a, r) = p y pf(qf(p, d1, d2), d1, d2) = p', () => {
  for (const shape of [0.5, 1, 2.5, 10, 100]) {
    for (const rate of [0.5, 1, 7]) {
      for (const p of [1e-100, 1e-20, 1e-6, 0.01, 0.25, 0.5, 0.9, 0.999]) {
        const x = qgamma(p, shape, rate);
        if (x === 0 || !Number.isFinite(x)) continue;
        assert.ok(iguales(pgamma(x, shape, rate), p, { rel: 1e-10, abs: 1e-300 }),
          `qgamma shape = ${shape}, rate = ${rate}, p = ${p}`);
        comparaciones++;
      }
    }
  }
  for (const df1 of [1, 2, 5, 20]) {
    for (const df2 of [1, 3, 10, 100]) {
      for (const p of [1e-6, 0.001, 0.05, 0.25, 0.5, 0.9, 0.99]) {
        const x = qf(p, df1, df2);
        if (x === 0 || !Number.isFinite(x)) continue;
        assert.ok(iguales(pf(x, df1, df2), p, { rel: 1e-10, abs: 1e-300 }),
          `qf df1 = ${df1}, df2 = ${df2}, p = ${p}`);
        comparaciones++;
      }
    }
  }
});

test('relaciones entre distribuciones: chi², F, t, beta y binomial', () => {
  // χ²_k = Gamma(k/2, 1/2).
  for (const k of [1, 2, 7, 33]) {
    assert.ok(iguales(pchisq(k * 1.3, k), pgamma(k * 1.3, k / 2, 0.5), { rel: 1e-14, abs: 0 }));
    comparaciones++;
  }
  // t²_ν = F(1, ν).
  for (const df of [1, 3, 12, 60]) {
    const t = 1.7;
    assert.ok(iguales(pf(t * t, 1, df), 1 - 2 * pt(-t, df), { rel: 1e-10, abs: 1e-14 }),
      `t² frente a F con df = ${df}`);
    comparaciones++;
  }
  // F(d1, d2) en términos de la beta.
  for (const [d1, d2] of [[3, 7], [10, 40]] as [number, number][]) {
    const x = 2.5;
    assert.ok(iguales(pf(x, d1, d2), pbeta(d1 * x / (d1 * x + d2), d1 / 2, d2 / 2),
      { rel: 1e-12, abs: 0 }));
    comparaciones++;
  }
  // La binomial acumulada es la suma de sus densidades.
  for (const [n, p] of [[10, 0.3], [40, 0.7]] as [number, number][]) {
    let suma = 0;
    for (let k = 0; k <= n; k++) {
      suma += dbinom(k, n, p);
      assert.ok(iguales(suma, pbinom(k, n, p), { rel: 1e-12, abs: 1e-14 }),
        `pbinom acumulada en n = ${n}, k = ${k}`);
      comparaciones++;
    }
  }
  // Y lo mismo para la hipergeométrica.
  for (const [m, n, k] of [[10, 7, 8], [40, 60, 25]] as [number, number, number][]) {
    let suma = 0;
    for (let x = Math.max(0, k - n); x <= Math.min(k, m); x++) {
      suma += dhyper(x, m, n, k);
      assert.ok(iguales(suma, phyper(x, m, n, k), { rel: 1e-11, abs: 1e-14 }),
        `phyper acumulada en m = ${m}, n = ${n}, k = ${k}, x = ${x}`);
      comparaciones++;
    }
  }
  // La t no central con ncp = 0 es la t central.
  for (const df of [1, 4, 25]) {
    for (const q of [-2.3, 0, 1.1]) {
      assert.ok(iguales(pnt(q, df, 0), pt(q, df), { rel: 1e-14, abs: 0 }),
        `pnt con ncp = 0, df = ${df}, q = ${q}`);
      comparaciones++;
    }
  }
  // gammaP + gammaQ = 1.
  for (const a of [0.5, 2, 30]) {
    for (const x of [0.1, 1, 5, 40]) {
      assert.ok(iguales(gammaP(a, x) + gammaQ(a, x), 1, { rel: 1e-14, abs: 1e-15 }));
      comparaciones++;
    }
  }
  // I_x(a, b) + I_{1−x}(b, a) = 1.
  for (const [a, b] of [[0.5, 0.5], [2, 5], [70, 13]] as [number, number][]) {
    for (const x of [0.01, 0.3, 0.7, 0.99]) {
      assert.ok(iguales(betaInc(a, b, x) + betaInc(b, a, 1 - x), 1, { rel: 1e-12, abs: 1e-14 }));
      comparaciones++;
    }
  }
});

test('valores tabulados de Abramowitz & Stegun y constantes clásicas', () => {
  const tabla: [string, number, number][] = [
    // Φ(1.96) y z(0.975) son los valores tabulados clásicos de A&S 26.2;
    // el resto procede de R 4.5.2 con 17 cifras.
    ['Φ(1.96)', pnorm(1.96), 0.9750021048517795],
    ['Φ(1)', pnorm(1), 0.84134474606854293],
    ['Φ(2)', pnorm(2), 0.97724986805182079],
    ['Φ(3)', pnorm(3), 0.9986501019683699],
    ['Φ(−z(0.95))', pnorm(-1.6448536269514722), 0.050000000000000044],
    ['z(0.975)', qnorm(0.975), 1.959963984540054],
    ['z(0.995)', qnorm(0.995), 2.5758293035488999],
    ['z(0.95)', qnorm(0.95), 1.6448536269514715],
    ['φ(0)', dnorm(0), 0.3989422804014327],
    ['erf(1)', erf(1), 0.84270079294971478],
    ['erfc(1)', erfc(1), 0.15729920705028513],
    ['erf(0.5)', erf(0.5), 0.52049987781304652],
    ['lgamma(0.5) = log√π', lgamma(0.5), 0.57236494292470008],
    ['lgamma(1)', lgamma(1), 0],
    ['lgamma(2)', lgamma(2), 0],
    ['lgamma(6) = log 120', lgamma(6), Math.log(120)],
    ['lchoose(52, 5)', lchoose(52, 5), Math.log(2598960)],
    ['lbeta(1, 1)', lbeta(1, 1), 0],
    ['t(0.975, 10)', qt(0.975, 10), 2.2281388519862735],
    ['χ²(0.95, 1)', qchisq(0.95, 1), 3.8414588206941263],
    ['χ²(0.95, 2)', qchisq(0.95, 2), 5.9914645471079799],
  ];
  for (const [nombre, obtenido, esperado] of tabla) {
    assert.ok(iguales(obtenido, esperado, { rel: 1e-14, abs: 1e-15 }),
      `${nombre}: ts = ${obtenido}, tabla = ${esperado}, rel = ${errorRelativo(obtenido, esperado).toExponential(3)}`);
    comparaciones++;
  }
});

test('casos borde de qbeta que usa Clopper-Pearson', () => {
  // En x = 0 el límite inferior exacto es qbeta(α/2, 0, n+1) = 0.
  assert.equal(qbeta(0.025, 0, 21), 0);
  assert.equal(qbeta(0.5, 0, 3), 0);
  // En x = n el límite superior exacto es qbeta(1−α/2, n+1, 0) = 1.
  assert.equal(qbeta(0.975, 21, 0), 1);
  assert.equal(qbeta(0.5, 3, 0), 1);
  assert.equal(qbeta(0, 2, 3), 0);
  assert.equal(qbeta(1, 2, 3), 1);
  assert.equal(qbeta(0, 2, 3, false), 1);
  assert.equal(qbeta(1, 2, 3, false), 0);
  // Intervalo exacto de Clopper-Pearson para 68 de 80, contrastado con R.
  assert.ok(iguales(qbeta(0.025, 68, 13), 0.7526358884071024, { rel: 1e-12, abs: 0 }));
  assert.ok(iguales(qbeta(0.975, 69, 12), 0.9200184386902861, { rel: 1e-12, abs: 0 }));
  comparaciones += 10;
});

test('límites del soporte cuando p vale 0 o 1', () => {
  assert.equal(qnorm(0), -Infinity);
  assert.equal(qnorm(1), Infinity);
  assert.equal(qnorm(0, 0, 1, false), Infinity);
  assert.equal(qt(0, 5), -Infinity);
  assert.equal(qt(1, 5), Infinity);
  assert.equal(qchisq(0, 3), 0);
  assert.equal(qchisq(1, 3), Infinity);
  assert.equal(qchisq(0, 3, false), Infinity);
  assert.equal(qgamma(0, 2, 3), 0);
  assert.equal(qgamma(1, 2, 3), Infinity);
  assert.equal(qf(0, 2, 3), 0);
  assert.equal(qf(1, 2, 3), Infinity);
  comparaciones += 12;
});

test('las entradas inválidas lanzan RangeError', () => {
  const invalidas: [string, () => number][] = [
    ['pnorm con sd = 0', () => pnorm(1, 0, 0)],
    ['pnorm con sd < 0', () => pnorm(1, 0, -1)],
    ['qnorm con p > 1', () => qnorm(1.5)],
    ['qnorm con p < 0', () => qnorm(-0.1)],
    ['dnorm con sd = 0', () => dnorm(1, 0, 0)],
    ['pt con df = 0', () => pt(1, 0)],
    ['pt con df < 0', () => pt(1, -3)],
    ['qt con p fuera de [0,1]', () => qt(2, 5)],
    ['pnt con df ≤ 0', () => pnt(1, 0, 1)],
    ['pchisq con df ≤ 0', () => pchisq(1, 0)],
    ['qchisq con df < 0', () => qchisq(0.5, -1)],
    ['pgamma con shape ≤ 0', () => pgamma(1, 0)],
    ['pgamma con rate ≤ 0', () => pgamma(1, 2, 0)],
    ['qgamma con p > 1', () => qgamma(1.2, 2)],
    ['pbeta con a < 0', () => pbeta(0.5, -1, 2)],
    ['qbeta con b < 0', () => qbeta(0.5, 2, -1)],
    ['pf con df1 ≤ 0', () => pf(1, 0, 3)],
    ['qf con p < 0', () => qf(-0.5, 2, 3)],
    ['dbinom con n < 0', () => dbinom(1, -5, 0.5)],
    ['dbinom con n no entero', () => dbinom(1, 5.5, 0.5)],
    ['dbinom con p > 1', () => dbinom(1, 10, 1.5)],
    ['pbinom con p < 0', () => pbinom(1, 10, -0.2)],
    ['dhyper con k > m+n', () => dhyper(1, 5, 5, 20)],
    ['phyper con m no entero', () => phyper(1, 5.5, 5, 3)],
    ['lfactorial con n < 0', () => lfactorial(-1)],
    ['lbeta con a < 0', () => lbeta(-1, 2)],
    ['betaInc con x fuera de [0,1]', () => betaInc(1, 1, 2)],
    ['betaInc con a < 0', () => betaInc(-1, 1, 0.5)],
    ['gammaP con a ≤ 0', () => gammaP(0, 1)],
    ['gammaQ con x < 0', () => gammaQ(1, -1)],
    ['brent sin cambio de signo', () => brent((x) => x * x + 1, -1, 1)],
    ['brent con extremos no finitos', () => brent((x) => x, -Infinity, 1)],
  ];
  for (const [nombre, f] of invalidas) {
    assert.throws(f, RangeError, `${nombre} debería lanzar RangeError`);
    comparaciones++;
  }
  assert.throws(() => expandirIntervalo((x) => x, 0, 0 as 1 | -1), RangeError,
    'expandirIntervalo con dirección inválida debería lanzar RangeError');
  comparaciones++;
});

test('brent y expandirIntervalo resuelven casos conocidos', () => {
  // Raíz de x³ − 2x − 5 (el ejemplo clásico de Wallis): 2.0945514815423265.
  const r = brent((x) => x * x * x - 2 * x - 5, 2, 3, { tol: 0 });
  assert.ok(iguales(r, 2.0945514815423265, { rel: 1e-14, abs: 0 }), `raíz = ${r}`);
  // Extremo que ya es raíz.
  assert.equal(brent((x) => x - 2, 2, 5), 2);
  // Expansión geométrica en ambos sentidos.
  const [a1, b1] = expandirIntervalo((x) => x - 1e6, 0, 1);
  assert.ok(a1 <= 1e6 && b1 >= 1e6, `corchete ${a1}..${b1}`);
  const [a2, b2] = expandirIntervalo((x) => x + 1e6, 0, -1);
  assert.ok(a2 <= -1e6 && b2 >= -1e6, `corchete ${a2}..${b2}`);
  assert.ok(iguales(brent((x) => x - 1e6, a1, b1, { tol: 0 }), 1e6, { rel: 1e-15, abs: 0 }));
  comparaciones += 5;
});

test('resumen: número de comparaciones realizadas', () => {
  assert.ok(comparaciones > 10000,
    `se esperaban más de 10 000 comparaciones y se hicieron ${comparaciones}`);
  console.log(`  · ${comparaciones} comparaciones contra ${String(fixture.meta.R)}`);
});

// ---------------------------------------------------------------------------
// qt con grados de libertad grandes (hallazgo de la revisión de H3): invertir
// pt() con Brent se apartaba de R en 3.5e-9 con ν = 1e9 y en 7 % con ν = 1e16.
// Desde 1e5 se usa la expansión de Cornish-Fisher y por encima de 1e20 qnorm,
// como R. Valores de referencia: R 4.5.2, `qt(p, df)` con 17 cifras.
// ---------------------------------------------------------------------------

test('qt coincide con R con grados de libertad de 1e5 a 1e30 (expansión de Cornish-Fisher)', () => {
  const ref: Array<[number, number, number]> = [
    [0.975, 1000000000.0, 1.9599639869123247],
    [0.975, 100000000000.0, 1.959963984563776],
    [0.975, 10000000000000.0, 1.9599639845402905],
    [0.975, 1e+16, 1.9599639845400536],
    [0.995, 316000000.0, 2.5758293191075947],
    [1e-10, 1000000.0, -6.3614068488767428],
    [0.999999, 10000000.0, 4.7534271127497645],
    [0.6, 1e+21, 0.25334710313579978],
    [9.999999999999998e-101, 100000.0, -21.297598389715315],
    [0.975, 99999.0, 1.9599877077718439],
    [0.9, 1e+30, 1.2815515655446006],
  ];
  for (const [p, df, r] of ref) {
    const t = qt(p, df);
    assert.ok(iguales(t, r, { rel: 1e-12, abs: 0 }), `qt(${p}, ${df}) = ${t} frente a R ${r}`);
    assert.ok(iguales(qt(p, df, false), -t, { rel: 1e-14, abs: 0 }), 'cola superior simétrica');
  }
  // Continuidad en el cambio de método (Brent por debajo de 1e5, expansión desde 1e5).
  const a = qt(0.975, 99999);
  const b = qt(0.975, 1e5);
  assert.ok(Math.abs(a - b) < 1e-9, `salto en 1e5: ${a} frente a ${b}`);
  // Por encima de 1e20 es exactamente el cuantil normal.
  assert.equal(qt(0.975, 1e21), qnorm(0.975));
});

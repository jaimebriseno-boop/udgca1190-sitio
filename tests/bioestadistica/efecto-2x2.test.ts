/**
 * Calculadora «Asociación y efecto (tabla 2×2)» contra el oráculo R y sus
 * propiedades.
 *
 *   node --test tests/bioestadistica/efecto-2x2.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo efecto-2x2`. Se comprueba (1) que las
 * ocho salidas de TypeScript coinciden con las de R caso por caso, incluidos
 * los infinitos, los NaN y los intervalos «no definidos» de las celdas con 0;
 * (2) que el snippet ejecutado es, byte a byte, el que ve el usuario; (3) que
 * el SHA-256 de `r.codigo` es el grabado en el fixture; y (4) propiedades
 * algebraicas y de interfaz que valen para cualquier entrada.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { DISENOS, METODOS_RRA, efecto2x2, validarTablaEfecto } from '../../src/lib/bioestadistica/metodos/efecto.ts';
import type { Diseno, ValoresEfecto } from '../../src/lib/bioestadistica/metodos/efecto.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/efecto-2x2.ts';
import type { EntradasEfecto2x2 } from '../../src/lib/bioestadistica/calculadoras/efecto-2x2.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'efecto-2x2';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];

/** z del 95 %, escrito a mano para que la comprobación manual no dependa de la biblioteca. */
const Z95 = 1.959963984540054;

/** Espacio fino U+202F que `formato.ts` inserta antes del signo % en español. */
const PCT = '\u202f%';

const EJEMPLO: EntradasEfecto2x2 = {
  a: 12,
  b: 88,
  c: 30,
  d: 70,
  diseno: 'cohorte',
  metodo_rra: 'newcombe',
  corr: 0,
  nivel: 0.95,
};

function entradasDe(caso: CasoFixture): EntradasEfecto2x2 {
  return conDerivadas(definicion, caso.entradas) as EntradasEfecto2x2;
}

// ---------------------------------------------------------------------------
// Integridad del fixture
// ---------------------------------------------------------------------------

test('el fixture corresponde a la plantilla de R que hay ahora en el YAML', () => {
  const sha = createHash('sha256').update(yamlCalc.r.codigo, 'utf8').digest('hex');
  assert.equal(fixture.meta.plantilla_sha256, sha, `r.codigo cambió sin regenerar: node scripts/bio-fixtures.mjs --solo ${SLUG}`);
});

test('el fixture trae el ejemplo primero y cubre exactamente los casos curados', () => {
  const curados = leerCasos(SLUG);
  assert.equal(fixture.meta.calculadora, SLUG);
  assert.equal(fixture.casos[0]?.id, 'ejemplo');
  assert.deepEqual(fixture.casos[0]?.entradas, yamlCalc.ejemplo);
  assert.deepEqual(
    fixture.casos.map((c) => c.id),
    ['ejemplo', ...curados.casos.map((c) => c.id)],
    `casos/${SLUG}.json cambió sin regenerar`,
  );
  assert.equal(fixture.casos.length, 16);
  for (const curado of curados.casos) {
    assert.deepEqual(fixture.casos.find((c) => c.id === curado.id)?.entradas, curado.entradas);
    assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota`);
  }
  for (const paquete of yamlCalc.r.paquetes) {
    assert.match(fixture.meta.paquetes[paquete] ?? '', /^\d/, `falta la versión de ${paquete}`);
  }
});

test('cada caso del fixture usa un perfil de tolerancia que existe', () => {
  for (const caso of fixture.casos) assert.ok(TOL[caso.tol], `${caso.id}: perfil «${caso.tol}» inexistente`);
});

// ---------------------------------------------------------------------------
// TypeScript contra R, caso por caso
// ---------------------------------------------------------------------------

for (const caso of fixture.casos) {
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const e = entradasDe(caso);
    const esperado = normalizarR(caso.esperado) as Record<string, unknown>;
    const informe = comparar(calcular(e, e.nivel), esperado, TOL[caso.tol] as NonNullable<(typeof TOL)[string]>);
    assert.ok(
      informe.coincide,
      `${caso.id} (${JSON.stringify(caso.entradas)}) · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`,
    );
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    const generado = readFileSync(rutaGenerado(SLUG, caso.id), 'utf8');
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), generado);
  });
}

test('el diseño del estudio no cambia ningún número: solo la lectura', () => {
  const porId = (id: string): Record<string, unknown> => {
    const c = fixture.casos.find((x) => x.id === id);
    assert.ok(c, `falta el caso ${id} en el fixture`);
    return c.esperado;
  };
  assert.deepEqual(porId('casos_controles'), porId('ejemplo'));
  assert.deepEqual(porId('transversal'), porId('ejemplo'));
});

test('las celdas con 0 dejan el RR y la OR en 0, ∞ o NaN y sin intervalo, exactamente como R', () => {
  const caso = (id: string): CasoFixture => {
    const c = fixture.casos.find((x) => x.id === id);
    assert.ok(c, `falta el caso ${id} en el fixture`);
    return c;
  };

  const aCero = caso('a_cero');
  const rACero = normalizarR(aCero.esperado) as Record<string, unknown>;
  assert.deepEqual(rACero.rr, [0, null, null]);
  assert.deepEqual(rACero.or, [0, null, null]);
  assert.deepEqual(rACero.rrr, [1, null, null]);
  const tsACero = calcular(entradasDe(aCero), 0.95);
  assert.equal(tsACero.valores.rr.valor, 0);
  assert.ok(Number.isNaN(tsACero.valores.rr.ic?.[0]) && Number.isNaN(tsACero.valores.rr.ic?.[1]));
  assert.ok(tsACero.avisos.some((av) => av.codigo === 'celda_cero'));

  const p0Cero = caso('p0_cero');
  const rP0 = normalizarR(p0Cero.esperado) as Record<string, unknown>;
  assert.deepEqual(rP0.rr, [Number.POSITIVE_INFINITY, null, null]);
  assert.deepEqual(rP0.rrr, [Number.NEGATIVE_INFINITY, null, null]);
  const tsP0 = calcular(entradasDe(p0Cero), 0.95);
  assert.equal(tsP0.valores.rr.valor, Number.POSITIVE_INFINITY);
  // La RRA y el NNT siguen definidos aunque el RR no lo esté.
  assert.ok(Number.isFinite(tsP0.valores.rra.ic?.[0]) && Number.isFinite(tsP0.valores.nnt.ic?.[1]));
  assert.ok(tsP0.avisos.some((av) => av.codigo === 'p0_cero'));

  // Columna del desenlace vacía: se admite y el RR queda en 0/0.
  const sinDesenlace = caso('sin_desenlace');
  const rSin = normalizarR(sinDesenlace.esperado) as Record<string, unknown>;
  assert.deepEqual(rSin.rr, [Number.NaN, null, null]);
  assert.deepEqual(rSin.or, [Number.NaN, null, null]);
  const tsSin = calcular(entradasDe(sinDesenlace), 0.95);
  assert.ok(Number.isNaN(tsSin.valores.rr.valor) && Number.isNaN(tsSin.valores.or.valor));
  assert.equal(tsSin.valores.rra.valor, 0);
  assert.equal(tsSin.valores.nnt.valor, Number.POSITIVE_INFINITY);
});

// ---------------------------------------------------------------------------
// Propiedades algebraicas
// ---------------------------------------------------------------------------

/** Rejilla de tablas con y sin ceros, grupos pequeños y grandes. */
function* tablas(): Generator<[number, number, number, number]> {
  for (const a of [0, 1, 5, 12, 900]) {
    for (const b of [0, 1, 88, 500]) {
      for (const c of [0, 2, 30, 100]) {
        for (const d of [1, 7, 70, 5000]) {
          if (a + b > 0 && c + d > 0) yield [a, b, c, d];
        }
      }
    }
  }
}

/** Igualdad laxa que trata «no definido» y los infinitos como valores comparables. */
function casiIgual(x: number, y: number, tol = EPS): boolean {
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) && Number.isNaN(y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return x === y;
  return Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));
}

test('las identidades de la tabla se cumplen con cualquier entrada', () => {
  for (const [a, b, c, d] of tablas()) {
    const v: ValoresEfecto = efecto2x2(a, b, c, d);
    const donde = `${a}/${b}/${c}/${d}`;
    assert.equal(v.n.valor, a + b + c + d, donde);
    assert.ok(casiIgual(v.p1.valor, a / (a + b)), `${donde}: p1`);
    assert.ok(casiIgual(v.p0.valor, c / (c + d)), `${donde}: p0`);
    assert.ok(casiIgual(v.rr.valor, v.p1.valor / v.p0.valor), `${donde}: RR = p1/p0`);
    assert.ok(casiIgual(v.or.valor, (a * d) / (b * c)), `${donde}: OR = ad/bc`);
    assert.ok(casiIgual(v.rra.valor, v.p1.valor - v.p0.valor), `${donde}: RRA = p1 − p0`);
    assert.ok(casiIgual(v.rrr.valor, 1 - v.rr.valor), `${donde}: RRR = 1 − RR`);
    assert.ok(casiIgual(v.nnt.valor, 1 / Math.abs(v.rra.valor)), `${donde}: NNT = 1/|RRA|`);

    // Los riesgos y sus límites de Wilson viven en [0, 1] y contienen la estimación.
    for (const k of ['p1', 'p0'] as const) {
      const [lo, hi] = v[k].ic as [number, number];
      assert.ok(lo >= -EPS && hi <= 1 + EPS, `${donde}: ${k} fuera de [0, 1] con Wilson`);
      assert.ok(lo <= v[k].valor + EPS && hi >= v[k].valor - EPS, `${donde}: ${k} no contiene la estimación`);
    }
    // Las razones: intervalo definido solo si el EE y el logaritmo lo son.
    for (const k of ['rr', 'or'] as const) {
      const [lo, hi] = v[k].ic as [number, number];
      if (Number.isFinite(lo)) assert.ok(lo <= v[k].valor && hi >= v[k].valor, `${donde}: ${k}`);
      else assert.ok(Number.isNaN(lo) && Number.isNaN(hi), `${donde}: ${k} debería estar sin intervalo`);
    }
    // La diferencia absoluta siempre tiene intervalo y siempre lo contiene.
    const [rraLo, rraHi] = v.rra.ic as [number, number];
    assert.ok(Number.isFinite(rraLo) && Number.isFinite(rraHi), `${donde}: la RRA debe tener intervalo`);
    assert.ok(rraLo <= v.rra.valor && v.rra.valor <= rraHi, `${donde}: el IC de la RRA no contiene la estimación`);
    // Solo cuando el IC de la RRA excluye el 0 el NNT tiene un intervalo al uso.
    const [nntLo, nntHi] = v.nnt.ic as [number, number];
    assert.ok(nntLo <= nntHi, `${donde}: el IC del NNT no está ordenado`);
    if (!(rraLo <= 0 && 0 <= rraHi)) {
      assert.ok(nntLo <= v.nnt.valor + EPS && v.nnt.valor <= nntHi + EPS, `${donde}: el IC del NNT no contiene al NNT`);
    }
    // El intervalo de la RRR es el del RR invertido.
    const [rrLo, rrHi] = v.rr.ic as [number, number];
    const [rrrLo, rrrHi] = v.rrr.ic as [number, number];
    assert.ok(casiIgual(rrrLo, 1 - rrHi) && casiIgual(rrrHi, 1 - rrLo), `${donde}: el IC de la RRR no invierte el del RR`);
  }
});

test('intercambiar las filas invierte el RR y la OR y cambia el signo de la RRA', () => {
  for (const [a, b, c, d] of tablas()) {
    const v = efecto2x2(a, b, c, d);
    const w = efecto2x2(c, d, a, b);
    const donde = `${a}/${b}/${c}/${d}`;
    assert.ok(casiIgual(w.rra.valor, -v.rra.valor), `${donde}: la RRA no cambió de signo`);
    assert.ok(casiIgual(w.nnt.valor, v.nnt.valor), `${donde}: el NNT debería ser el mismo`);
    for (const k of ['rr', 'or'] as const) {
      if (Number.isFinite(v[k].valor) && v[k].valor > 0) {
        assert.ok(casiIgual(w[k].valor, 1 / v[k].valor, 1e-9), `${donde}: ${k} no se invirtió`);
      }
    }
  }
});

test('la corrección de Haldane-Anscombe solo cambia el RR, la OR y la RRR', () => {
  for (const [a, b, c, d] of tablas()) {
    const sin = efecto2x2(a, b, c, d, { corr: 0 });
    const con = efecto2x2(a, b, c, d, { corr: 0.5 });
    const donde = `${a}/${b}/${c}/${d}`;
    for (const k of ['n', 'p1', 'p0', 'rra', 'nnt'] as const) {
      assert.deepEqual(con[k], sin[k], `${donde}: ${k} no debía cambiar`);
    }
    const sinCeros = a > 0 && b > 0 && c > 0 && d > 0;
    for (const k of ['rr', 'or'] as const) {
      assert.ok(
        Number.isFinite(con[k].valor) && Number.isFinite(con[k].ic?.[0]) && Number.isFinite(con[k].ic?.[1]),
        `${donde}: ${k} corregida debe ser finita y con intervalo`,
      );
      // Sin ceros la corrección sigue siendo visible: no es una operación neutra.
      if (sinCeros) assert.notEqual(con[k].valor, sin[k].valor, `${donde}: ${k} no se movió con Haldane`);
    }
    assert.ok(Number.isFinite(con.rrr.valor), `${donde}: la RRR corregida debe ser finita`);
  }
});

test('el método del IC de la RRA cambia la RRA y el NNT, y nada más', () => {
  for (const [a, b, c, d] of tablas()) {
    const newcombe = efecto2x2(a, b, c, d, { metodoRra: 'newcombe' });
    const wald = efecto2x2(a, b, c, d, { metodoRra: 'wald' });
    const donde = `${a}/${b}/${c}/${d}`;
    for (const k of ['n', 'p1', 'p0', 'rr', 'or', 'rrr'] as const) {
      assert.deepEqual(wald[k], newcombe[k], `${donde}: ${k} no depende del método de la RRA`);
    }
    assert.equal(newcombe.rra.metodo, 'newcombe-hibrido', donde);
    assert.equal(wald.rra.metodo, 'wald', donde);
    assert.ok(casiIgual(wald.rra.valor, newcombe.rra.valor), `${donde}: la estimación de la RRA no cambia`);
  }
});

test('las entradas imposibles lanzan RangeError', () => {
  assert.throws(() => validarTablaEfecto(0, 0, 30, 70), RangeError); // fila de expuestos vacía
  assert.throws(() => validarTablaEfecto(12, 88, 0, 0), RangeError); // fila de no expuestos vacía
  assert.doesNotThrow(() => validarTablaEfecto(0, 100, 0, 100)); // columna vacía: admitida
  assert.throws(() => efecto2x2(-1, 88, 30, 70), RangeError);
  assert.throws(() => efecto2x2(1.5, 88, 30, 70), RangeError);
  assert.throws(() => efecto2x2(12, 88, 30, 70, { metodoRra: 'agresti-min' as never }), RangeError);
  assert.throws(() => efecto2x2(12, 88, 30, 70, { corr: 0.25 as never }), RangeError);
  assert.throws(() => efecto2x2(12, 88, 30, 70, { nivel: 1 }), RangeError);
});

// ---------------------------------------------------------------------------
// Comprobación manual del ejemplo
// ---------------------------------------------------------------------------

/** Límites de Wilson calculados en la prueba, sin llamar a la biblioteca. */
function wilsonAMano(x: number, m: number): [number, number] {
  const p = x / m;
  const w1 = p + (0.5 * Z95 * Z95) / m;
  const w2 = Z95 * Math.sqrt((p * (1 - p) + (0.25 * Z95 * Z95) / m) / m);
  const w3 = 1 + (Z95 * Z95) / m;
  return [(w1 - w2) / w3, (w1 + w2) / w3];
}

test('el ejemplo coincide con la comprobación manual (RR, OR, RRA de Newcombe, RRR y NNT)', () => {
  const v = efecto2x2(12, 88, 30, 70, { nivel: 0.95, metodoRra: 'newcombe', corr: 0 });
  assert.ok(Math.abs(v.p1.valor - 0.12) < 1e-15);
  assert.ok(Math.abs(v.p0.valor - 0.3) < 1e-15);
  assert.ok(Math.abs(v.rr.valor - 0.4) < 1e-15, `RR = ${v.rr.valor}`);
  assert.ok(Math.abs(v.or.valor - (12 * 70) / (88 * 30)) < 1e-15, `OR = ${v.or.valor}`);
  assert.ok(Math.abs(v.rra.valor - -0.18) < 1e-15, `RRA = ${v.rra.valor}`);
  assert.ok(Math.abs(v.rrr.valor - 0.6) < 1e-15, `RRR = ${v.rrr.valor}`);
  assert.ok(Math.abs(v.nnt.valor - 1 / 0.18) < 1e-12, `NNT = ${v.nnt.valor}`);

  // IC de Katz del RR: exp(ln RR ± z·√(1/a − 1/n1 + 1/c − 1/n0)).
  const eeRr = Math.sqrt(1 / 12 - 1 / 100 + 1 / 30 - 1 / 100);
  assert.ok(Math.abs((v.rr.ic as [number, number])[0] - Math.exp(Math.log(0.4) - Z95 * eeRr)) < 1e-12);
  assert.ok(Math.abs((v.rr.ic as [number, number])[1] - Math.exp(Math.log(0.4) + Z95 * eeRr)) < 1e-12);

  // IC de Woolf de la OR.
  const eeOr = Math.sqrt(1 / 12 + 1 / 88 + 1 / 30 + 1 / 70);
  const lnOr = Math.log((12 * 70) / (88 * 30));
  assert.ok(Math.abs((v.or.ic as [number, number])[0] - Math.exp(lnOr - Z95 * eeOr)) < 1e-12);

  // IC híbrido de Newcombe (método 10) a partir de los límites de Wilson de 12/100 y 30/100.
  const [l1, u1] = wilsonAMano(12, 100);
  const [l0, u0] = wilsonAMano(30, 100);
  assert.ok(Math.abs(l1 - 0.0699940643701949) < 1e-12, `l1 = ${l1}`);
  assert.ok(Math.abs(u1 - 0.198120994267114) < 1e-12, `u1 = ${u1}`);
  const lo = -0.18 - Math.sqrt((0.12 - l1) * (0.12 - l1) + (u0 - 0.3) * (u0 - 0.3));
  const hi = -0.18 + Math.sqrt((u1 - 0.12) * (u1 - 0.12) + (0.3 - l0) * (0.3 - l0));
  const rraIc = v.rra.ic as [number, number];
  assert.ok(Math.abs(rraIc[0] - lo) < 1e-12, `RRA lo: ${rraIc[0]} vs ${lo}`);
  assert.ok(Math.abs(rraIc[1] - hi) < 1e-12, `RRA hi: ${rraIc[1]} vs ${hi}`);

  // NNT: recíprocos de los límites de la RRA, ordenados (Altman 1998).
  const nntIc = v.nnt.ic as [number, number];
  assert.ok(Math.abs(nntIc[0] - 1 / Math.abs(lo)) < 1e-12, `NNT lo: ${nntIc[0]}`);
  assert.ok(Math.abs(nntIc[1] - 1 / Math.abs(hi)) < 1e-12, `NNT hi: ${nntIc[1]}`);

  // RRR: intervalo del RR invertido.
  const rrIc = v.rr.ic as [number, number];
  const rrrIc = v.rrr.ic as [number, number];
  assert.ok(Math.abs(rrrIc[0] - (1 - rrIc[1])) < 1e-15 && Math.abs(rrrIc[1] - (1 - rrIc[0])) < 1e-15);
});

// ---------------------------------------------------------------------------
// Contrato de interfaz: validar, bandas, avisos y presentación en ambos idiomas
// ---------------------------------------------------------------------------

test('validar() reclama filas vacías, celdas no enteras, opciones desconocidas y nivel fuera de rango', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.equal(definicion.validar({ ...EJEMPLO, a: 0, c: 0 }), null, 'una columna vacía sí se admite');
  assert.deepEqual(definicion.validar({ ...EJEMPLO, a: 0, b: 0 }), { a: 'err_fila_vacia', b: 'err_fila_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, c: 0, d: 0 }), { c: 'err_fila_vacia', d: 'err_fila_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, a: 2.5 }), { a: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, d: -1 }), { d: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, diseno: 'ecologico' }), { diseno: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, metodo_rra: 'agresti' }), { metodo_rra: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, corr: 1 }), { corr: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
});

test('bandas y avisos del ejemplo y de los casos límite', () => {
  const ej = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ej.bandas, { direccion: 'beneficio', nnt: 'excluye', rr: 'excluye', diseno: 'cohorte' });
  // El riesgo del grupo de referencia (30 %) supera el 10 %: la OR no aproxima al RR.
  assert.deepEqual(ej.avisos.map((av) => av.codigo), ['or_no_aproxima_rr']);

  const haldane = calcular({ ...EJEMPLO, a: 0, b: 100, corr: 0.5 }, 0.95);
  assert.ok(haldane.avisos.some((av) => av.codigo === 'haldane_aplicado'));
  assert.ok(!haldane.avisos.some((av) => av.codigo === 'celda_cero'));

  const cruza = calcular({ ...EJEMPLO, a: 10, b: 90, c: 12, d: 88 }, 0.95);
  assert.equal(cruza.bandas.nnt, 'cruza');
  assert.equal(cruza.bandas.rr, 'cruza');
  assert.equal(cruza.bandas.direccion, 'beneficio');
  assert.ok(cruza.avisos.some((av) => av.codigo === 'rra_cruza_cero'));

  const dano = calcular({ ...EJEMPLO, a: 5, b: 95, c: 1, d: 99 }, 0.95);
  assert.equal(dano.bandas.direccion, 'dano');
  // Desenlace infrecuente en el grupo de referencia: la OR sí aproxima al RR.
  assert.ok(!dano.avisos.some((av) => av.codigo === 'or_no_aproxima_rr'));

  const nulo = calcular({ ...EJEMPLO, a: 0, b: 100, c: 0, d: 100 }, 0.95);
  assert.equal(nulo.bandas.direccion, 'nulo');
  assert.deepEqual(nulo.avisos.map((av) => av.codigo), ['celda_cero', 'p0_cero', 'rra_cruza_cero']);

  const chica = calcular({ ...EJEMPLO, a: 1, b: 1, c: 1, d: 1 }, 0.95);
  const nPequeno = chica.avisos.find((av) => av.codigo === 'n_pequeno');
  assert.deepEqual(nPequeno?.params, { expuestos: 2, no_expuestos: 2 });

  const cc = calcular({ ...EJEMPLO, diseno: 'casos_controles' }, 0.95);
  assert.equal(cc.bandas.diseno, 'casos_controles');
  assert.deepEqual(cc.avisos.map((av) => av.codigo), ['casos_controles']);
});

test('presentar() rellena todas las plantillas en español e inglés para cada diseño, método y corrección', () => {
  const tablasLimite: Array<Partial<EntradasEfecto2x2>> = [
    {},
    { a: 0, b: 100 },
    { c: 0, d: 100 },
    { a: 100, b: 0 },
    { a: 0, b: 100, c: 0, d: 100 },
    { a: 10, b: 90, c: 12, d: 88 },
    { a: 1, b: 1, c: 1, d: 1 },
    { a: 5, b: 95, c: 1, d: 99 },
  ];
  const entradas: EntradasEfecto2x2[] = [];
  for (const diseno of DISENOS) {
    for (const metodoRra of METODOS_RRA) {
      for (const corr of [0, 0.5]) {
        for (const parcial of tablasLimite) {
          entradas.push({ ...EJEMPLO, diseno, metodo_rra: metodoRra, corr, ...parcial });
        }
      }
    }
  }

  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const donde = `${lang} · ${JSON.stringify(e)}`;
      const p = presentar(calcular(e, e.nivel), e, ctx);
      assert.deepEqual(Object.keys(p.celdas).sort(), [...definicion.salidas].sort(), donde);
      const textos = [
        ...p.interpretacion,
        p.metodos,
        ...p.resumen.flat(),
        ...Object.values(p.celdas).flatMap((celda) => [celda.valor, celda.ic ?? '', celda.nota ?? '']),
      ];
      for (const texto of textos) {
        assert.ok(!texto.includes('{'), `${donde}: marcador sin rellenar en «${texto}»`);
      }
      const soloOr = e.diseno === 'casos_controles';
      assert.equal(p.interpretacion.length, soloOr ? 2 : 4, donde);
      for (const k of ['rr', 'rra', 'rrr', 'nnt'] as const) {
        if (soloOr) {
          assert.equal(p.celdas[k].valor, '—', `${donde}: ${k} debería no aplicar`);
          assert.equal(p.celdas[k].ic, undefined, `${donde}: ${k} no debería traer IC`);
          assert.equal(p.celdas[k].nota, ctx.textos.etiquetas.no_aplica, donde);
        } else {
          assert.notEqual(p.celdas[k].valor, '—', `${donde}: ${k} sí aplica`);
        }
      }
      assert.ok(
        p.grafica && p.grafica.tipo === 'ic-forest' && p.grafica.paneles?.length === 2,
        `${donde}: la gráfica debe ser un bosque con dos paneles secundarios`,
      );
    }
  }
});

test('la presentación del ejemplo dice lo que dice la comprobación manual', () => {
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.p1.valor, `12.0${PCT}`);
  assert.equal(es.celdas.p0.valor, `30.0${PCT}`);
  assert.equal(es.celdas.rr.valor, '0.40');
  assert.equal(es.celdas.rr.ic, '0.22 a 0.74');
  assert.equal(es.celdas.or.valor, '0.32');
  assert.equal(es.celdas.rra.valor, '-18.0', 'la RRA va en puntos porcentuales, sin signo %');
  assert.equal(es.celdas.rra.ic, '-28.8 a -6.7');
  assert.equal(es.celdas.rrr.valor, `60.0${PCT}`);
  assert.equal(es.celdas.nnt.valor, '5.56');
  assert.equal(es.celdas.nnt.ic, '3.47 a 14.83');
  // Titular: NNT redondeado hacia arriba (§0 de la especificación); detalle exacto.
  assert.ok(es.interpretacion[3].includes('a 6 personas') && es.interpretacion[3].includes('5.56'), es.interpretacion[3]);
  assert.ok(es.metodos.includes('Katz') && es.metodos.includes('[3]') && es.metodos.includes('[5,6]'), es.metodos);
  assert.ok(es.metodos.includes('Newcombe, método 10 [4]'), es.metodos);

  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.p1.valor, '12.0%');
  assert.equal(en.celdas.nnt.ic, '3.47 to 14.83');
  assert.ok(en.metodos.includes("Newcombe's hybrid score interval, method 10 [4]"), en.metodos);

  // Wald mueve el IC de la RRA y, con él, el del NNT; la estimación no cambia.
  const wald: EntradasEfecto2x2 = { ...EJEMPLO, metodo_rra: 'wald' };
  const w = presentar(calcular(wald, 0.95), wald, contextoDePrueba(SLUG, 'es'));
  assert.equal(w.celdas.rra.valor, '-18.0');
  assert.equal(w.celdas.rra.ic, '-29.0 a -7.0');
  assert.ok(w.metodos.includes('IC de Wald'), w.metodos);

  // Con Haldane el párrafo de Métodos lo declara y cita a Haldane y Anscombe.
  const conCorr: EntradasEfecto2x2 = { ...EJEMPLO, a: 0, b: 100, corr: 0.5 };
  const h = presentar(calcular(conCorr, 0.95), conCorr, contextoDePrueba(SLUG, 'es'));
  assert.ok(h.metodos.includes('Haldane-Anscombe') && h.metodos.includes('[8,9]'), h.metodos);

  // Sin intervalo, la celda de la razón lo dice y no muestra un IC vacío.
  const sinCorr: EntradasEfecto2x2 = { ...EJEMPLO, c: 0, d: 100 };
  const s = presentar(calcular(sinCorr, 0.95), sinCorr, contextoDePrueba(SLUG, 'es'));
  assert.equal(s.celdas.rr.valor, '∞');
  assert.equal(s.celdas.rr.ic, undefined);
  assert.equal(s.celdas.rr.nota, 'IC no definido');
});

test('cuando el IC de la RRA cruza el 0, el NNT se presenta con la notación de Altman', () => {
  const e: EntradasEfecto2x2 = { ...EJEMPLO, a: 10, b: 90, c: 12, d: 88 };
  const es = presentar(calcular(e, 0.95), e, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.nnt.ic, 'NNTB 9.09 a ∞ a NNTH 14.36');
  assert.ok(es.interpretacion[3].includes('NNTB 9.09 a ∞ a NNTH 14.36'), es.interpretacion[3]);
  const en = presentar(calcular(e, 0.95), e, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.nnt.ic, 'NNTB 9.09 to ∞ to NNTH 14.36');
  // Del lado del daño la rama NNTB es la del límite negativo de la RRA.
  const dano: EntradasEfecto2x2 = { ...EJEMPLO, a: 5, b: 95, c: 1, d: 99 };
  const d = presentar(calcular(dano, 0.95), dano, contextoDePrueba(SLUG, 'es'));
  assert.equal(d.celdas.nnt.ic, 'NNTB 78.07 a ∞ a NNTH 9.78');
});

test('el párrafo de Métodos enumera solo las medidas que el diseño permite estimar', () => {
  const frase = (diseno: string, lang: Lang): string => {
    const e: EntradasEfecto2x2 = { ...EJEMPLO, diseno };
    return presentar(calcular(e, 0.95), e, contextoDePrueba(SLUG, lang)).metodos;
  };

  const cohorte = frase('cohorte', 'es');
  assert.ok(cohorte.includes('riesgo relativo') && cohorte.includes('número necesario a tratar'), cohorte);

  // Casos y controles: solo la razón de momios, y lo dice explícitamente.
  const cc = frase('casos_controles', 'es');
  assert.ok(!cc.includes('Se estimaron'), cc);
  assert.ok(cc.includes('no se estimaron riesgos, riesgo relativo, reducción absoluta ni número necesario a tratar'), cc);
  assert.ok(!cc.includes('[3]'), `casos y controles no debe citar a Katz: ${cc}`);
  const ccEn = frase('casos_controles', 'en');
  assert.ok(ccEn.includes('because of the case-control design'), ccEn);

  // Transversal: razón de prevalencias, no riesgo relativo.
  const tr = frase('transversal', 'es');
  assert.ok(tr.includes('razón de prevalencias') && !tr.includes('riesgo relativo'), tr);
  assert.ok(frase('transversal', 'en').includes('prevalence ratio'), frase('transversal', 'en'));

  // La cola común (calculadora, autoría, URL) sobrevive en los tres diseños.
  for (const diseno of DISENOS) {
    assert.ok(frase(diseno, 'es').includes('UDG-CA-1190'), diseno);
  }
});

test('en un diseño transversal la interpretación habla de prevalencias y no de tratar', () => {
  const e: EntradasEfecto2x2 = { ...EJEMPLO, diseno: 'transversal' };
  const es = presentar(calcular(e, 0.95), e, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.interpretacion.length, 4);
  assert.ok(es.interpretacion[1].startsWith('RP ='), es.interpretacion[1]);
  assert.ok(es.interpretacion[1].includes('prevalencia del desenlace'), es.interpretacion[1]);
  assert.ok(!es.interpretacion[3].includes('tratar o exponer'), es.interpretacion[3]);
  assert.ok(es.interpretacion[3].includes('no el efecto de intervenir'), es.interpretacion[3]);
  // La variante que cruza el 1 también existe en transversal.
  const cruza: EntradasEfecto2x2 = { ...e, a: 10, b: 90, c: 12, d: 88 };
  const c = presentar(calcular(cruza, 0.95), cruza, contextoDePrueba(SLUG, 'es'));
  assert.ok(c.interpretacion[1].includes('razón de prevalencias no excluye el 1'), c.interpretacion[1]);
  const en = presentar(calcular(e, 0.95), e, contextoDePrueba(SLUG, 'en'));
  assert.ok(en.interpretacion[1].startsWith('PR ='), en.interpretacion[1]);
});

test('la gráfica reparte riesgos, razones y diferencia en tres paneles', () => {
  const ctx = contextoDePrueba(SLUG, 'es');
  const datos = definicion.grafica?.(calcular(EJEMPLO, 0.95), EJEMPLO, ctx);
  assert.ok(datos && datos.tipo === 'ic-forest');
  assert.deepEqual(datos.filas.map((f) => f.id), ['p1', 'p0']);
  assert.deepEqual(datos.dominio, [0, 1]);
  assert.equal(datos.escala, 'lineal');
  const paneles = datos.paneles ?? [];
  assert.equal(paneles.length, 2);
  assert.deepEqual(paneles[0].filas.map((f) => f.id), ['rr', 'or']);
  assert.equal(paneles[0].escala, 'log');
  assert.equal(paneles[0].referencia, 1);
  assert.deepEqual(paneles[1].filas.map((f) => f.id), ['rra']);
  assert.equal(paneles[1].escala, 'lineal');
  assert.equal(paneles[1].referencia, 0);
  assert.ok(!paneles.some((p) => p.filas.some((f) => f.id === 'nnt')), 'el NNT no va en la gráfica');
});

test('el diseño solo cambia el texto: los valores calculados son idénticos', () => {
  const base = calcular(EJEMPLO, 0.95);
  for (const diseno of DISENOS) {
    const e: EntradasEfecto2x2 = { ...EJEMPLO, diseno };
    assert.deepEqual(calcular(e, 0.95).valores, base.valores, `diseño ${diseno as Diseno}`);
  }
});

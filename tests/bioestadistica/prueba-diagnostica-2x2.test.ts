/**
 * Calculadora «Prueba diagnóstica (tabla 2×2)» contra el oráculo R y sus
 * propiedades.
 *
 *   node --test tests/bioestadistica/prueba-diagnostica-2x2.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo prueba-diagnostica-2x2`. Se comprueba
 * (1) que las once salidas de TypeScript coinciden con las de R caso por caso,
 * incluidos los infinitos y los intervalos «no definidos» de las celdas con 0;
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
import { METODOS_IC_2X2, diagnostico2x2, validarTabla } from '../../src/lib/bioestadistica/metodos/diagnostico.ts';
import { corregir, dorWoolf, icLog, lrNegativo, lrPositivo } from '../../src/lib/bioestadistica/metodos/razones.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/prueba-diagnostica-2x2.ts';
import type { EntradasDx2x2 } from '../../src/lib/bioestadistica/calculadoras/prueba-diagnostica-2x2.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'prueba-diagnostica-2x2';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];

function entradasDe(caso: CasoFixture): EntradasDx2x2 {
  return conDerivadas(definicion, caso.entradas) as EntradasDx2x2;
}

const EJEMPLO: EntradasDx2x2 = { vp: 68, fp: 6, fn: 12, vn: 114, nivel: 0.95, metodo: 'wilson', corr: 0 };

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
  assert.equal(fixture.casos.length, 17);
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

test('las celdas con 0 dejan las razones en 0 o ∞ y sin intervalo, exactamente como R', () => {
  const sinFp = fixture.casos.find((c) => c.id === 'fp0_sin_corr');
  assert.ok(sinFp);
  const r = normalizarR(sinFp.esperado) as Record<string, unknown>;
  assert.deepEqual(r.lr_pos, [Number.POSITIVE_INFINITY, null, null]);
  assert.deepEqual(r.dor, [Number.POSITIVE_INFINITY, null, null]);
  const ts = calcular(entradasDe(sinFp), 0.95);
  assert.equal(ts.valores.lr_pos.valor, Number.POSITIVE_INFINITY);
  assert.ok(Number.isNaN(ts.valores.lr_pos.ic?.[0]) && Number.isNaN(ts.valores.lr_pos.ic?.[1]));
  assert.deepEqual(ts.avisos.map((a) => a.codigo), ['celda_cero']);
});

// ---------------------------------------------------------------------------
// Propiedades algebraicas
// ---------------------------------------------------------------------------

/** Rejilla de tablas con y sin ceros, grupos pequeños y grandes. */
function* tablas(): Generator<[number, number, number, number]> {
  for (const vp of [0, 1, 5, 68, 900]) {
    for (const fp of [0, 1, 6, 40]) {
      for (const fn of [0, 2, 12, 100]) {
        for (const vn of [1, 7, 114, 5000]) {
          if (vp + fn > 0 && fp + vn > 0 && vp + fp > 0 && fn + vn > 0) yield [vp, fp, fn, vn];
        }
      }
    }
  }
}

test('las identidades de la tabla se cumplen con cualquier entrada', () => {
  for (const [vp, fp, fn, vn] of tablas()) {
    const v = diagnostico2x2(vp, fp, fn, vn);
    const donde = `${vp}/${fp}/${fn}/${vn}`;
    assert.equal(v.n.valor, vp + fp + fn + vn, donde);
    assert.ok(Math.abs(v.youden.valor - (v.sn.valor + v.sp.valor - 1)) <= EPS, donde);
    assert.ok(Math.abs(v.exactitud.valor - (vp + vn) / (vp + fp + fn + vn)) <= EPS, donde);
    assert.ok(Math.abs(v.prev.valor - (vp + fn) / (vp + fp + fn + vn)) <= EPS, donde);
    const lrPos = v.sn.valor / (1 - v.sp.valor);
    const lrNeg = (1 - v.sn.valor) / v.sp.valor;
    if (Number.isFinite(lrPos)) assert.ok(Math.abs(v.lr_pos.valor - lrPos) <= EPS * Math.max(1, lrPos), `${donde}: LR+`);
    if (Number.isFinite(lrNeg)) assert.ok(Math.abs(v.lr_neg.valor - lrNeg) <= EPS * Math.max(1, lrNeg), `${donde}: LR−`);
    if (Number.isFinite(v.dor.valor) && v.lr_neg.valor > 0) {
      const dor = v.lr_pos.valor / v.lr_neg.valor;
      assert.ok(Math.abs(v.dor.valor - dor) <= 1e-9 * Math.max(1, dor), `${donde}: DOR = LR+/LR−`);
    }
    // Intervalos definidos: contienen la estimación, en el orden correcto y dentro de [0, 1] para las proporciones.
    for (const k of ['sn', 'sp', 'vpp', 'vpn', 'prev', 'exactitud'] as const) {
      const [lo, hi] = v[k].ic as [number, number];
      assert.ok(lo <= v[k].valor + EPS && hi >= v[k].valor - EPS, `${donde}: ${k}`);
      assert.ok(lo >= -EPS && hi <= 1 + EPS, `${donde}: ${k} fuera de [0, 1] con Wilson`);
    }
    for (const k of ['lr_pos', 'lr_neg', 'dor'] as const) {
      const [lo, hi] = v[k].ic as [number, number];
      if (Number.isFinite(lo)) assert.ok(lo <= v[k].valor && hi >= v[k].valor, `${donde}: ${k}`);
      else assert.ok(Number.isNaN(lo) && Number.isNaN(hi), `${donde}: ${k} debería estar sin intervalo`);
    }
  }
});

test('la corrección de Haldane-Anscombe solo cambia las razones', () => {
  for (const [vp, fp, fn, vn] of tablas()) {
    const sin = diagnostico2x2(vp, fp, fn, vn, { corr: 0 });
    const con = diagnostico2x2(vp, fp, fn, vn, { corr: 0.5 });
    for (const k of ['n', 'sn', 'sp', 'vpp', 'vpn', 'prev', 'exactitud', 'youden'] as const) {
      assert.deepEqual(con[k], sin[k], `${vp}/${fp}/${fn}/${vn}: ${k} no debía cambiar`);
    }
    for (const k of ['lr_pos', 'lr_neg', 'dor'] as const) {
      assert.ok(Number.isFinite(con[k].valor) && Number.isFinite(con[k].ic?.[0]) && Number.isFinite(con[k].ic?.[1]), `${vp}/${fp}/${fn}/${vn}: ${k} corregida debe ser finita con intervalo`);
    }
  }
  const t = corregir({ a: 68, b: 0, c: 12, d: 120 }, 0.5);
  assert.deepEqual(t, { a: 68.5, b: 0.5, c: 12.5, d: 120.5 });
});

test('las razones logarítmicas: exp(ln R ± z·EE) y «no definido» cuando ln R o EE no son finitos', () => {
  const e = icLog(17, 0.4, 0.95, 'simel-log');
  assert.ok(e.ic && Math.abs(e.ic[0] - Math.exp(Math.log(17) - 1.959963984540054 * 0.4)) < 1e-12);
  assert.ok(Number.isNaN(icLog(0, 0.4, 0.95, 'simel-log').ic?.[0]));
  assert.ok(Number.isNaN(icLog(Number.POSITIVE_INFINITY, 0.4, 0.95, 'simel-log').ic?.[1]));
  assert.ok(Number.isNaN(icLog(17, Number.POSITIVE_INFINITY, 0.95, 'simel-log').ic?.[0]));
  const t = { a: 68, b: 6, c: 12, d: 114 };
  assert.ok(Math.abs(lrPositivo(t).valor - 17) < 1e-12);
  assert.ok(Math.abs(lrNegativo(t).valor - 0.15789473684210525) < 1e-15);
  assert.ok(Math.abs(dorWoolf(t).valor - 107.66666666666667) < 1e-12);
});

test('los seis métodos de IC alimentan las seis proporciones y el ejemplo coincide con la comprobación manual', () => {
  for (const metodo of METODOS_IC_2X2) {
    const v = diagnostico2x2(68, 6, 12, 114, { metodo });
    assert.equal(v.sn.metodo, metodo);
    assert.equal(v.exactitud.metodo, metodo);
    assert.ok(Math.abs(v.sn.valor - 0.85) < EPS);
    assert.ok(Math.abs(v.sp.valor - 0.95) < EPS);
    assert.ok(Math.abs(v.vpp.valor - 68 / 74) < EPS);
    assert.ok(Math.abs(v.vpn.valor - 114 / 126) < EPS);
    assert.ok(Math.abs(v.youden.valor - 0.8) < EPS);
  }
});

test('las entradas imposibles lanzan RangeError', () => {
  assert.throws(() => validarTabla(0, 6, 0, 114), RangeError); // sin enfermos
  assert.throws(() => validarTabla(68, 0, 12, 0), RangeError); // sin sanos
  assert.throws(() => validarTabla(0, 0, 12, 114), RangeError); // sin positivos
  assert.throws(() => validarTabla(68, 6, 0, 0), RangeError); // sin negativos
  assert.throws(() => diagnostico2x2(-1, 6, 12, 114), RangeError);
  assert.throws(() => diagnostico2x2(1.5, 6, 12, 114), RangeError);
  assert.throws(() => diagnostico2x2(68, 6, 12, 114, { metodo: 'wilson-cc' as never }), RangeError);
  assert.throws(() => diagnostico2x2(68, 6, 12, 114, { corr: 0.25 as never }), RangeError);
  assert.throws(() => diagnostico2x2(68, 6, 12, 114, { nivel: 1 }), RangeError);
});

// ---------------------------------------------------------------------------
// Contrato de interfaz: validar, bandas, avisos y presentación en ambos idiomas
// ---------------------------------------------------------------------------

test('validar() reclama filas y columnas vacías, opciones desconocidas y nivel fuera de rango', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, vp: 0, fn: 0 }), { vp: 'err_columna_vacia', fn: 'err_columna_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, fp: 0, vn: 0 }), { fp: 'err_columna_vacia', vn: 'err_columna_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, vp: 0, fp: 0 }), { vp: 'err_fila_vacia', fp: 'err_fila_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, fn: 0, vn: 0 }), { fn: 'err_fila_vacia', vn: 'err_fila_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, vp: 2.5 }), { vp: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, metodo: 'bayes' }), { metodo: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, corr: 1 }), { corr: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
});

test('bandas y avisos del ejemplo y de los casos límite', () => {
  const ej = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ej.bandas, { lr_pos: 'grande', lr_neg: 'moderado' });
  assert.deepEqual(ej.avisos, []);
  const haldane = calcular({ ...EJEMPLO, fp: 0, vn: 120, corr: 0.5 }, 0.95);
  assert.ok(haldane.avisos.some((a) => a.codigo === 'haldane_aplicado'));
  assert.ok(!haldane.avisos.some((a) => a.codigo === 'celda_cero'));
  const invertida = calcular({ ...EJEMPLO, vp: 0, fn: 80 }, 0.95);
  assert.ok(invertida.avisos.some((a) => a.codigo === 'tabla_invertida'));
  assert.equal(invertida.bandas.lr_pos, 'nulo');
  const chica = calcular({ ...EJEMPLO, vp: 5, fp: 1, fn: 2, vn: 7 }, 0.95);
  const nPequeno = chica.avisos.find((a) => a.codigo === 'n_pequeno');
  assert.deepEqual(nPequeno?.params, { enfermos: 7, sanos: 8 });
  const wald = calcular({ ...EJEMPLO, vp: 3, fp: 1, fn: 2, vn: 4, metodo: 'wald' }, 0.95);
  assert.ok(wald.avisos.some((a) => a.codigo === 'wald_no_recomendado'));
  const rara = calcular({ ...EJEMPLO, vp: 3, fp: 40, fn: 1, vn: 956 }, 0.95);
  assert.ok(rara.avisos.some((a) => a.codigo === 'prev_extrema'));
});

test('presentar() rellena todas las plantillas en español e inglés para cada método y con celdas en 0', () => {
  const entradas: EntradasDx2x2[] = [
    ...METODOS_IC_2X2.map((metodo) => ({ ...EJEMPLO, metodo })),
    { ...EJEMPLO, fp: 0, vn: 120 },
    { ...EJEMPLO, fp: 0, vn: 120, corr: 0.5 },
    { ...EJEMPLO, vp: 80, fp: 0, fn: 0, vn: 120 },
    { ...EJEMPLO, vp: 0, fn: 80 },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const p = presentar(calcular(e, e.nivel), e, ctx);
      assert.deepEqual(Object.keys(p.celdas).sort(), [...definicion.salidas].sort());
      for (const texto of [...p.interpretacion, p.metodos, ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? ''])]) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, 5);
      assert.ok(p.grafica && p.grafica.tipo === 'ic-forest' && p.grafica.paneles?.length === 1);
    }
  }
});

test('la presentación del ejemplo dice lo que dice la comprobación manual', () => {
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.sn.valor, '85.0 %');
  assert.equal(es.celdas.lr_pos.valor, '17.00');
  assert.equal(es.celdas.dor.valor, '107.67');
  assert.ok(es.interpretacion[0].includes('85.0 %') && es.interpretacion[0].includes('95.0 %'));
  assert.ok(es.metodos.includes('Wilson') && es.metodos.includes('[6,7]'), es.metodos);
  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.sn.valor, '85.0%');
  assert.ok(en.metodos.includes('Wilson (score) method [6,7]'), en.metodos);
  // Con Haldane el párrafo de Métodos lo declara y cita a Haldane y Anscombe.
  const conCorr = { ...EJEMPLO, fp: 0, vn: 120, corr: 0.5 };
  const h = presentar(calcular(conCorr, 0.95), conCorr, contextoDePrueba(SLUG, 'es'));
  assert.ok(h.metodos.includes('Haldane-Anscombe') && h.metodos.includes('[12,13]'), h.metodos);
  // Sin intervalo, la celda de la razón lo dice y no muestra un IC vacío.
  const sinCorr = { ...EJEMPLO, fp: 0, vn: 120 };
  const s = presentar(calcular(sinCorr, 0.95), sinCorr, contextoDePrueba(SLUG, 'es'));
  assert.equal(s.celdas.lr_pos.valor, '∞');
  assert.equal(s.celdas.lr_pos.ic, undefined);
  assert.equal(s.celdas.lr_pos.nota, 'IC no definido');
});

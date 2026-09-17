/**
 * Calculadora «Probabilidad posprueba (Fagan)» contra el oráculo R y sus
 * propiedades.
 *
 *   node --test tests/bioestadistica/probabilidad-posprueba.test.ts
 *
 * Consume los fixtures commiteados (`node scripts/bio-fixtures.mjs --solo
 * probabilidad-posprueba`). Además de la coincidencia con R, se comprueba que
 * la posprueba es coherente con la calculadora de la tabla 2×2: aplicar el LR+
 * de una tabla a su propia prevalencia devuelve exactamente su VPP.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { momios, posprueba, probabilidadDeMomios } from '../../src/lib/bioestadistica/metodos/bayes.ts';
import { diagnostico2x2 } from '../../src/lib/bioestadistica/metodos/diagnostico.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/probabilidad-posprueba.ts';
import type { EntradasPosprueba } from '../../src/lib/bioestadistica/calculadoras/probabilidad-posprueba.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'probabilidad-posprueba';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];
const EJEMPLO: EntradasPosprueba = { pre: 0.3, lr_pos: 17, lr_neg: 0.158 };

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
  assert.deepEqual(fixture.casos.map((c) => c.id), ['ejemplo', ...curados.casos.map((c) => c.id)]);
  assert.equal(fixture.casos.length, 10);
  for (const curado of curados.casos) assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota`);
  assert.match(fixture.meta.paquetes.jsonlite ?? '', /^\d/);
});

// ---------------------------------------------------------------------------
// TypeScript contra R, caso por caso
// ---------------------------------------------------------------------------

for (const caso of fixture.casos) {
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const perfil = TOL[caso.tol];
    assert.ok(perfil, `no hay perfil de tolerancia «${caso.tol}»`);
    const e = caso.entradas as EntradasPosprueba;
    const informe = comparar(calcular(e, 0.95), normalizarR(caso.esperado) as Record<string, unknown>, perfil);
    assert.ok(informe.coincide, `${caso.id} · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`);
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), readFileSync(rutaGenerado(SLUG, caso.id), 'utf8'));
  });
}

test('las certezas viajan desde R como Inf y se leen como Infinity', () => {
  const p1 = fixture.casos.find((c) => c.id === 'p1');
  assert.ok(p1);
  const r = normalizarR(p1.esperado) as Record<string, unknown>;
  assert.equal(r.momios_pre, Number.POSITIVE_INFINITY);
  assert.equal(r.post_pos, 1);
  assert.equal(r.post_neg, 1);
});

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

test('momios y probabilidad son inversos y LR = 1 deja la probabilidad intacta', () => {
  for (const p of [0.001, 0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99, 0.999]) {
    assert.ok(Math.abs(probabilidadDeMomios(momios(p)) - p) <= EPS, String(p));
    assert.ok(Math.abs(posprueba(p, 1) - p) <= EPS, String(p));
  }
  assert.equal(posprueba(0, 17), 0);
  assert.equal(posprueba(1, 0.1), 1);
  assert.equal(posprueba(0.3, 0), 0);
});

test('la posprueba crece con el LR y con la preprueba', () => {
  const lrs = [0.01, 0.1, 0.5, 1, 2, 10, 100, 1000];
  for (const p of [0.05, 0.3, 0.8]) {
    for (let i = 1; i < lrs.length; i += 1) {
      assert.ok(posprueba(p, lrs[i] as number) > posprueba(p, lrs[i - 1] as number), `p=${p} lr=${String(lrs[i])}`);
    }
  }
  const pres = [0.01, 0.1, 0.3, 0.6, 0.9];
  for (let i = 1; i < pres.length; i += 1) {
    assert.ok(posprueba(pres[i] as number, 17) > posprueba(pres[i - 1] as number, 17));
  }
});

test('aplicar el LR de una tabla 2×2 a su propia prevalencia devuelve su VPP y 1 − VPN', () => {
  for (const [vp, fp, fn, vn] of [
    [68, 6, 12, 114],
    [5, 1, 2, 7],
    [900, 40, 100, 5000],
  ] as const) {
    const v = diagnostico2x2(vp, fp, fn, vn);
    const prev = v.prev.valor;
    assert.ok(Math.abs(posprueba(prev, v.lr_pos.valor) - v.vpp.valor) <= 1e-12, `${vp}/${fp}/${fn}/${vn}: VPP`);
    assert.ok(Math.abs(posprueba(prev, v.lr_neg.valor) - (1 - v.vpn.valor)) <= 1e-12, `${vp}/${fp}/${fn}/${vn}: 1 − VPN`);
  }
});

test('las entradas imposibles lanzan RangeError y validar() las reclama', () => {
  assert.throws(() => posprueba(1.2, 17), RangeError);
  assert.throws(() => posprueba(-0.1, 17), RangeError);
  assert.throws(() => posprueba(0.3, -1), RangeError);
  assert.throws(() => posprueba(0.3, Number.NaN), RangeError);
  assert.throws(() => posprueba(0.3, Number.POSITIVE_INFINITY), RangeError);
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, pre: 1.5 }), { pre: 'err_proporcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, lr_pos: -2 }), { lr_pos: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, lr_neg: Number.NaN }), { lr_neg: 'err_min' });
});

test('bandas y avisos', () => {
  const ej = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ej.bandas, { lr_pos: 'grande', lr_neg: 'moderado' });
  assert.deepEqual(ej.avisos, []);
  assert.deepEqual(calcular({ pre: 0, lr_pos: 17, lr_neg: 0.158 }, 0.95).avisos.map((a) => a.codigo), ['certeza']);
  assert.deepEqual(calcular({ pre: 0.005, lr_pos: 17, lr_neg: 0.158 }, 0.95).avisos.map((a) => a.codigo), ['extremo']);
  assert.deepEqual(calcular({ pre: 0.3, lr_pos: 1, lr_neg: 1 }, 0.95).avisos.map((a) => a.codigo), ['lr_nulo']);
  assert.deepEqual(calcular({ pre: 0.5, lr_pos: 0.5, lr_neg: 2 }, 0.95).avisos.map((a) => a.codigo), ['lr_invertido']);
  assert.equal(calcular({ pre: 0.5, lr_pos: 0.5, lr_neg: 2 }, 0.95).bandas.lr_pos, 'nulo');
});

test('presentar() rellena todas las plantillas en ambos idiomas, incluidas las certezas', () => {
  const entradas: EntradasPosprueba[] = [
    EJEMPLO,
    { pre: 0, lr_pos: 17, lr_neg: 0.158 },
    { pre: 1, lr_pos: 17, lr_neg: 0.158 },
    { pre: 0.5, lr_pos: 0.5, lr_neg: 2 },
    { pre: 0.3, lr_pos: 1, lr_neg: 1 },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const p = presentar(calcular(e, 0.95), e, ctx);
      assert.deepEqual(Object.keys(p.celdas).sort(), [...definicion.salidas].sort());
      for (const texto of [...p.interpretacion, p.metodos, ...Object.values(p.celdas).flatMap((c) => [c.valor, c.nota ?? ''])]) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, 4);
      assert.ok(p.grafica && p.grafica.tipo === 'fagan' && p.grafica.lineas.length === 2 && p.grafica.pre === e.pre);
    }
  }
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.post_pos.valor, '87.9 %');
  assert.equal(es.celdas.post_neg.valor, '6.3 %');
  assert.equal(es.celdas.ganancia_pos.valor, '+57.9');
  assert.equal(es.celdas.ganancia_neg.valor, '−23.7');
  // Un cambio que redondea a cero no lleva signo («−0.0» sería engañoso).
  const nulo = { pre: 0.3, lr_pos: 1, lr_neg: 1 };
  const pn = presentar(calcular(nulo, 0.95), nulo, contextoDePrueba(SLUG, 'es'));
  assert.equal(pn.celdas.ganancia_pos.valor, '0.0');
  assert.equal(pn.celdas.ganancia_neg.valor, '0.0');
  const casi = { pre: 0.0001, lr_pos: 17, lr_neg: 0.158 };
  assert.equal(presentar(calcular(casi, 0.95), casi, contextoDePrueba(SLUG, 'es')).celdas.ganancia_neg.valor, '0.0');
  assert.ok(es.interpretacion[0].includes('+57.9 puntos') && es.interpretacion[0].includes('−23.7 puntos'), es.interpretacion[0]);
  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.post_pos.valor, '87.9%');
  assert.ok(en.metodos.includes('[1]') && en.metodos.includes('[2]'));
});

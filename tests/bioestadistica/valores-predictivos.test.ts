/**
 * Calculadora «Valores predictivos» contra el oráculo R y sus propiedades.
 *
 *   node --test tests/bioestadistica/valores-predictivos.test.ts
 *
 * Consume los fixtures commiteados (`node scripts/bio-fixtures.mjs --solo
 * valores-predictivos`). Además de la coincidencia con R (con y sin tamaños
 * del estudio de validación, logit estándar y ajustado, prevalencias 0 y 1),
 * se comprueba la coherencia con la tabla 2×2: con la Sn, la Sp y la
 * prevalencia de una tabla se recuperan exactamente su VPP y su VPN.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { diagnostico2x2 } from '../../src/lib/bioestadistica/metodos/diagnostico.ts';
import {
  expit,
  limitesLogitMercaldo,
  logit,
  requiereAjuste,
  valoresPredictivos,
  vpnDe,
  vppDe,
} from '../../src/lib/bioestadistica/metodos/predictivos.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/valores-predictivos.ts';
import type { EntradasPredictivos } from '../../src/lib/bioestadistica/calculadoras/valores-predictivos.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'valores-predictivos';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];
const EJEMPLO: EntradasPredictivos = { sn: 0.85, sp: 0.95, prev: 0.3, n_d: 80, n_nd: 120, nivel: 0.95 };

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
  assert.equal(fixture.casos.length, 14);
  for (const curado of curados.casos) assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota`);
});

// ---------------------------------------------------------------------------
// TypeScript contra R, caso por caso
// ---------------------------------------------------------------------------

for (const caso of fixture.casos) {
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const perfil = TOL[caso.tol];
    assert.ok(perfil, `no hay perfil de tolerancia «${caso.tol}»`);
    const e = conDerivadas(definicion, caso.entradas) as EntradasPredictivos;
    const informe = comparar(calcular(e, e.nivel), normalizarR(caso.esperado) as Record<string, unknown>, perfil);
    assert.ok(informe.coincide, `${caso.id} · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`);
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), readFileSync(rutaGenerado(SLUG, caso.id), 'utf8'));
  });
}

test('sin tamaños del estudio, R devuelve escalares y TypeScript no trae intervalo', () => {
  const sinN = fixture.casos.find((c) => c.id === 'sin_n');
  assert.ok(sinN);
  assert.equal(typeof sinN.esperado.vpp, 'number');
  const ts = calcular(conDerivadas(definicion, sinN.entradas) as EntradasPredictivos, 0.95);
  assert.equal(ts.valores.vpp.ic, undefined);
  assert.equal(ts.bandas.ic, 'sin');
});

test('con Sn = 1 el fixture usó el logit ajustado y TypeScript también', () => {
  const caso = fixture.casos.find((c) => c.id === 'sn1_ajustado');
  assert.ok(caso);
  const ts = calcular(conDerivadas(definicion, caso.entradas) as EntradasPredictivos, 0.95);
  assert.equal(ts.valores.vpp.metodo, 'logit-mercaldo-ajustado');
  assert.equal(ts.bandas.ic, 'ajustado');
  assert.ok(ts.avisos.some((a) => a.codigo === 'logit_ajustado'));
});

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

test('con la Sn, la Sp y la prevalencia de una tabla 2×2 se recuperan su VPP y su VPN', () => {
  for (const [vp, fp, fn, vn] of [
    [68, 6, 12, 114],
    [5, 1, 2, 7],
    [900, 40, 100, 5000],
  ] as const) {
    const v = diagnostico2x2(vp, fp, fn, vn);
    const p = valoresPredictivos(v.sn.valor, v.sp.valor, v.prev.valor);
    assert.ok(Math.abs(p.vpp.valor - v.vpp.valor) <= 1e-12, `${vp}/${fp}/${fn}/${vn}: VPP`);
    assert.ok(Math.abs(p.vpn.valor - v.vpn.valor) <= 1e-12, `${vp}/${fp}/${fn}/${vn}: VPN`);
    assert.ok(Math.abs(p.lr_pos.valor - v.lr_pos.valor) <= 1e-12 * v.lr_pos.valor, `${vp}/${fp}/${fn}/${vn}: LR+`);
  }
});

test('el VPP crece con la prevalencia y el VPN decrece; las frecuencias suman 1,000', () => {
  const prevs = [0.001, 0.01, 0.1, 0.3, 0.5, 0.8, 0.99];
  for (let i = 1; i < prevs.length; i += 1) {
    assert.ok(vppDe(0.85, 0.95, prevs[i] as number) > vppDe(0.85, 0.95, prevs[i - 1] as number));
    assert.ok(vpnDe(0.85, 0.95, prevs[i] as number) < vpnDe(0.85, 0.95, prevs[i - 1] as number));
  }
  for (const prev of prevs) {
    const v = valoresPredictivos(0.85, 0.95, prev);
    const suma = v.vp_mil.valor + v.fp_mil.valor + v.fn_mil.valor + v.vn_mil.valor;
    assert.ok(Math.abs(suma - 1000) <= 1e-9, `prev ${prev}: ${suma}`);
    assert.ok(Math.abs(v.vp_mil.valor / (v.vp_mil.valor + v.fp_mil.valor) - v.vpp.valor) <= EPS);
  }
});

test('el intervalo logit contiene la estimación, se queda en [0, 1] y se estrecha con n', () => {
  for (const [sn, sp, prev] of [
    [0.85, 0.95, 0.3],
    [0.6, 0.7, 0.05],
    [0.99, 0.5, 0.5],
  ] as const) {
    const anchos: number[] = [];
    for (const n of [10, 100, 1000, 10000]) {
      const v = valoresPredictivos(sn, sp, prev, { nD: n, nND: n });
      for (const k of ['vpp', 'vpn'] as const) {
        const [lo, hi] = v[k].ic as [number, number];
        assert.ok(lo <= v[k].valor + EPS && hi >= v[k].valor - EPS, `${k} n=${n}`);
        assert.ok(lo >= 0 && hi <= 1, `${k} n=${n} fuera de [0, 1]`);
      }
      anchos.push((v.vpp.ic as [number, number])[1] - (v.vpp.ic as [number, number])[0]);
    }
    for (let i = 1; i < anchos.length; i += 1) assert.ok((anchos[i] as number) < (anchos[i - 1] as number));
  }
});

test('logit y expit son inversos; el ajuste se activa solo en 0 y 1', () => {
  for (const p of [0.001, 0.2, 0.5, 0.9, 0.999]) assert.ok(Math.abs(expit(logit(p)) - p) <= EPS);
  assert.equal(requiereAjuste(0.85, 0.95), false);
  assert.equal(requiereAjuste(1, 0.95), true);
  assert.equal(requiereAjuste(0.85, 0), true);
  // El logit estándar con Sn = 1 no tiene error estándar finito; el ajustado sí.
  const estandar = limitesLogitMercaldo(1, 0.95, 0.3, 80, 120, 0.95, false);
  // Con Sn = 1 el EE del logit del VPN es infinito: el límite inferior es NaN (∞ − ∞).
  assert.ok(Number.isNaN(estandar.vpn[0]), String(estandar.vpn));
  assert.ok(Number.isFinite(estandar.vpp[0]) && Number.isFinite(estandar.vpp[1]));
  const ajustado = limitesLogitMercaldo(1, 0.95, 0.3, 80, 120, 0.95, true);
  assert.ok(ajustado.vpp[0] > 0 && ajustado.vpp[1] < 1 && ajustado.vpn[0] > 0 && ajustado.vpn[1] <= 1);
});

test('las entradas imposibles lanzan RangeError y validar() las reclama', () => {
  assert.throws(() => valoresPredictivos(1.2, 0.9, 0.3), RangeError);
  assert.throws(() => valoresPredictivos(0.9, -0.1, 0.3), RangeError);
  assert.throws(() => valoresPredictivos(0.9, 0.9, 2), RangeError);
  assert.throws(() => valoresPredictivos(0.9, 0.9, 0.3, { nD: 2.5, nND: 10 }), RangeError);
  assert.throws(() => valoresPredictivos(0.9, 0.9, 0.3, { nD: -1, nND: 10 }), RangeError);
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sn: 1.5 }), { sn: 'err_proporcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_d: 2.5 }), { n_d: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
});

test('derivar() convierte un tamaño ausente en 0 y el ejemplo no cambia', () => {
  assert.deepEqual(definicion.derivar?.({ sn: 0.85, sp: 0.95, prev: 0.3, nivel: 0.95 } as EntradasPredictivos), { n_d: 0, n_nd: 0 });
  assert.deepEqual(definicion.derivar?.(EJEMPLO), { n_d: 80, n_nd: 120 });
  const parcial = calcular(conDerivadas(definicion, { ...EJEMPLO, n_nd: undefined } as unknown as EntradasPredictivos) as EntradasPredictivos, 0.95);
  assert.deepEqual(parcial.avisos.map((a) => a.codigo), ['sin_n']);
  assert.equal(parcial.valores.vpp.ic, undefined);
});

test('avisos de certezas y de prueba perfecta', () => {
  assert.deepEqual(calcular({ ...EJEMPLO, prev: 0 }, 0.95).avisos.map((a) => a.codigo), ['certeza']);
  assert.deepEqual(calcular({ ...EJEMPLO, prev: 1 }, 0.95).avisos.map((a) => a.codigo), ['certeza']);
  const perfecta = calcular({ ...EJEMPLO, sn: 1, sp: 1 }, 0.95);
  assert.deepEqual(perfecta.avisos.map((a) => a.codigo), ['logit_ajustado', 'prueba_perfecta']);
  assert.equal(perfecta.valores.lr_pos.valor, Number.POSITIVE_INFINITY);
  assert.equal(perfecta.valores.lr_neg.valor, 0);
});

test('presentar() rellena todas las plantillas en ambos idiomas y la gráfica lleva las dos curvas con el marcador exacto', () => {
  const entradas: EntradasPredictivos[] = [
    EJEMPLO,
    { ...EJEMPLO, n_d: 0, n_nd: 0 },
    { ...EJEMPLO, n_d: 80, n_nd: 0 },
    { ...EJEMPLO, sn: 1 },
    { ...EJEMPLO, prev: 0 },
    { ...EJEMPLO, prev: 1 },
    { ...EJEMPLO, sn: 1, sp: 1 },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const p = presentar(calcular(e, e.nivel), e, ctx);
      assert.deepEqual(Object.keys(p.celdas).sort(), [...definicion.salidas].sort());
      for (const texto of [...p.interpretacion, p.metodos, ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? ''])]) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, 4);
      assert.ok(p.grafica && p.grafica.tipo === 'curvas');
      if (p.grafica && p.grafica.tipo === 'curvas') {
        assert.equal(p.grafica.curvas.length, 2);
        assert.equal(p.grafica.curvas[0]?.puntos.length, 101);
        assert.equal(p.grafica.marcador?.x, e.prev);
        assert.equal(p.grafica.marcador?.valores?.vpp, calcular(e, e.nivel).valores.vpp.valor);
      }
    }
  }
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.vpp.valor, '87.9 %');
  assert.equal(es.celdas.vp_mil.valor, '255');
  assert.equal(es.celdas.fp_mil.valor, '35');
  assert.ok(es.metodos.includes('Mercaldo') && es.metodos.includes('80 con la enfermedad'), es.metodos);
  const sinN = { ...EJEMPLO, n_d: 0, n_nd: 0 };
  const s = presentar(calcular(sinN, 0.95), sinN, contextoDePrueba(SLUG, 'es'));
  assert.ok(s.metodos.includes('No se calcularon intervalos'), s.metodos);
  // Sin intervalo la celda no lleva `ic` (ni siquiera vacío): la página oculta
  // la línea y el barrido de presentación no admite cadenas vacías visibles.
  assert.equal(s.celdas.vpp.ic, undefined);
  assert.equal(s.celdas.vpn.ic, undefined);
  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.vpp.valor, '87.9%');
  assert.ok(en.interpretacion[0].includes('255 true positives'), en.interpretacion[0]);
});

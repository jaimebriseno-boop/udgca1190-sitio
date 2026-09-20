/**
 * Lógica pura del módulo «Alcance»: normalización de rutas y armado del
 * resumen a partir de las filas de la API de Web Analytics de Vercel.
 *
 *   node --test tests/alcance/resumen.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { agregarPaises, agregarRutas, construirResumen, normalizarRuta, primerMes, serieDias } from '../../src/lib/alcance/resumen.mjs';

test('normalizarRuta funde idiomas y limpia la ruta', () => {
  assert.equal(normalizarRuta('/en/herramientas/virologia/'), '/herramientas/virologia');
  assert.equal(normalizarRuta('/en'), '/');
  assert.equal(normalizarRuta('/en/'), '/');
  assert.equal(normalizarRuta('/'), '/');
  assert.equal(normalizarRuta('/herramientas?x=1#y'), '/herramientas');
  assert.equal(normalizarRuta('/herramientas/virologia/app/index.html'), '/herramientas/virologia/app');
  assert.equal(normalizarRuta('/english'), '/english'); // «en» solo como segmento
  assert.equal(normalizarRuta('Others'), null);
  assert.equal(normalizarRuta(undefined), null);
});

test('agregarRutas suma es+en y ordena por visitas', () => {
  const filas = [
    { requestPath: '/herramientas/virologia', pageviews: 10, visitors: 4 },
    { requestPath: '/en/herramientas/virologia/', pageviews: 5, visitors: 3 },
    { requestPath: '/', pageviews: 30, visitors: 20 },
    { requestPath: 'Others', pageviews: 99, visitors: 99 },
  ];
  assert.deepEqual(agregarRutas(filas), [
    { ruta: '/', visitas: 20, paginas: 30 },
    { ruta: '/herramientas/virologia', visitas: 7, paginas: 15 },
  ]);
});

test('agregarPaises separa lo que Vercel agrupa en Others', () => {
  const { paises, otros } = agregarPaises([
    { country: 'US', pageviews: 8, visitors: 5 },
    { country: 'mx', pageviews: 50, visitors: 40 },
    { country: 'Others', pageviews: 6, visitors: 4 },
  ]);
  assert.deepEqual(paises, [
    { cc: 'MX', visitas: 40, paginas: 50 },
    { cc: 'US', visitas: 5, paginas: 8 },
  ]);
  assert.deepEqual(otros, { visitas: 4, paginas: 6 });
  assert.equal(agregarPaises([]).otros, null);
});

test('serieDias rellena 30 días con ceros y termina hoy', () => {
  const hoy = new Date('2026-09-20T15:00:00Z');
  const s = serieDias([{ timestamp: '2026-09-19T00:00:00.000Z', pageviews: 7, visitors: 3 }], hoy);
  assert.equal(s.length, 30);
  assert.equal(s[0].d, '2026-08-22');
  assert.equal(s[29].d, '2026-09-20');
  assert.deepEqual(s[28], { d: '2026-09-19', visitas: 3, paginas: 7 });
  assert.deepEqual(s[29], { d: '2026-09-20', visitas: 0, paginas: 0 });
});

test('primerMes ignora meses sin visitas', () => {
  assert.equal(primerMes([
    { timestamp: '2026-07-01T00:00:00.000Z', pageviews: 0, visitors: 0 },
    { timestamp: '2026-09-01T00:00:00.000Z', pageviews: 12, visitors: 9 },
    { timestamp: '2026-08-01T00:00:00.000Z', pageviews: 3, visitors: 2 },
  ]), '2026-08');
  assert.equal(primerMes([]), null);
});

test('construirResumen entrega la forma que consume la página', () => {
  const hoy = new Date('2026-09-20T12:00:00Z');
  const r = construirResumen({
    total: { pageviews: 100, visitors: 60 },
    paises: [{ country: 'MX', pageviews: 70, visitors: 40 }, { country: 'US', pageviews: 10, visitors: 6 }],
    dias: [{ timestamp: '2026-09-20T00:00:00.000Z', pageviews: 4, visitors: 2 }],
    rutas: [{ requestPath: '/', pageviews: 50, visitors: 30 }],
    meses: [{ timestamp: '2026-09-01T00:00:00.000Z', pageviews: 100, visitors: 60 }],
    rangoPaises: { desde: '2025-09-21', hasta: '2026-09-20' },
  }, hoy);
  assert.equal(r.version, 1);
  assert.equal(r.desde, '2026-09');
  assert.deepEqual(r.total, { visitas: 60, paginas: 100 });
  assert.deepEqual(r.ultimos30, { visitas: 2, paginas: 4 });
  assert.equal(r.dias.length, 30);
  assert.equal(r.paises[0].cc, 'MX');
  assert.equal(r.otros, null);
  assert.deepEqual(r.rutas, [{ ruta: '/', visitas: 30, paginas: 50 }]);
  assert.deepEqual(r.rango_paises, { desde: '2025-09-21', hasta: '2026-09-20' });
});

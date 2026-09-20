/**
 * Consulta a la API de Web Analytics de Vercel con un fetch simulado: verifica
 * las peticiones que se hacen (rutas, parámetros, cabecera) y la resolución
 * del equipo cuando no viene por variable de entorno.
 *
 *   node --test tests/alcance/vercel.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { _reiniciarCache, consultarAlcance, resolverTeamId } from '../../src/lib/alcance/vercel.mjs';

const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });

function fetchFalso(respuestas) {
  const llamadas = [];
  const fn = async (url, init) => {
    llamadas.push({ url: new URL(url), auth: init?.headers?.authorization });
    for (const [patron, resp] of respuestas) if (String(url).includes(patron)) return typeof resp === 'function' ? resp(new URL(url)) : resp;
    return json({ error: 'sin ruta' }, false, 404);
  };
  return { fn, llamadas };
}

test('resolverTeamId prueba los equipos del token y luego la cuenta personal', async () => {
  _reiniciarCache();
  const { fn, llamadas } = fetchFalso([
    ['/v2/teams', json({ teams: [{ id: 'team_a' }, { id: 'team_b' }] })],
    ['/v9/projects/prj_1', (u) => (u.searchParams.get('teamId') === 'team_b' ? json({ id: 'prj_1' }) : json({}, false, 404))],
  ]);
  assert.equal(await resolverTeamId({ token: 'tok', projectId: 'prj_1', fetchImpl: fn }), 'team_b');
  assert.equal(llamadas[0].auth, 'Bearer tok');
  // segunda vez: cache, sin nuevas peticiones
  const antes = llamadas.length;
  assert.equal(await resolverTeamId({ token: 'tok', projectId: 'prj_1', fetchImpl: fn }), 'team_b');
  assert.equal(llamadas.length, antes);
});

test('resolverTeamId devuelve null para proyectos personales y falla si no alcanza el proyecto', async () => {
  _reiniciarCache();
  const personal = fetchFalso([
    ['/v2/teams', json({ teams: [] })],
    ['/v9/projects/prj_p', (u) => (u.searchParams.has('teamId') ? json({}, false, 404) : json({ id: 'prj_p' }))],
  ]);
  assert.equal(await resolverTeamId({ token: 'tok', projectId: 'prj_p', fetchImpl: personal.fn }), null);
  _reiniciarCache();
  const nada = fetchFalso([['/v2/teams', json({ teams: [] })]]);
  await assert.rejects(resolverTeamId({ token: 'tok', projectId: 'prj_x', fetchImpl: nada.fn }), /no alcanza el proyecto/);
});

test('consultarAlcance hace las cinco consultas con los parámetros correctos', async () => {
  _reiniciarCache();
  const hoy = new Date('2026-09-20T12:00:00Z');
  const { fn, llamadas } = fetchFalso([
    ['/visits/count', json({ data: { pageviews: 100, visitors: 60 } })],
    ['/visits/aggregate', (u) => {
      const by = u.searchParams.get('by');
      if (by === 'country') return json({ data: [{ country: 'MX', pageviews: 70, visitors: 40 }, { country: 'Others', pageviews: 2, visitors: 1 }] });
      if (by === 'day') return json({ data: [{ timestamp: '2026-09-20T00:00:00.000Z', pageviews: 4, visitors: 2 }] });
      if (by === 'requestPath') return json({ data: [{ requestPath: '/en/', pageviews: 5, visitors: 3 }, { requestPath: '/', pageviews: 9, visitors: 6 }] });
      if (by === 'month') return json({ data: [{ timestamp: '2026-09-01T00:00:00.000Z', pageviews: 100, visitors: 60 }] });
      return json({}, false, 400);
    }],
  ]);
  const r = await consultarAlcance({ token: 'tok', projectId: 'prj_1', teamId: 'team_z', hoy, fetchImpl: fn });
  assert.equal(llamadas.length, 5); // con teamId explícito no se explora el equipo
  for (const l of llamadas) {
    assert.equal(l.auth, 'Bearer tok');
    assert.equal(l.url.searchParams.get('projectId'), 'prj_1');
    assert.equal(l.url.searchParams.get('teamId'), 'team_z');
  }
  const porBy = Object.fromEntries(llamadas.filter((l) => l.url.pathname.endsWith('/aggregate')).map((l) => [l.url.searchParams.get('by'), l.url.searchParams]));
  assert.equal(porBy.country.get('since'), '2025-09-21');
  assert.equal(porBy.country.get('until'), '2026-09-20');
  assert.equal(porBy.country.get('limit'), '100');
  assert.equal(porBy.day.get('since'), '2026-08-22');
  assert.equal(porBy.requestPath.get('limit'), '40');
  assert.equal(porBy.month.get('since'), '2024-09-20');
  assert.deepEqual(r.total, { visitas: 60, paginas: 100 });
  assert.deepEqual(r.paises, [{ cc: 'MX', visitas: 40, paginas: 70 }]);
  assert.deepEqual(r.otros, { visitas: 1, paginas: 2 });
  assert.deepEqual(r.rutas, [{ ruta: '/', visitas: 9, paginas: 14 }]);
  assert.equal(r.desde, '2026-09');
});

test('consultarAlcance propaga los errores HTTP de Vercel', async () => {
  _reiniciarCache();
  const { fn } = fetchFalso([['/visits/count', json({ error: 'forbidden' }, false, 403)], ['/visits/aggregate', json({ data: [] })]]);
  await assert.rejects(consultarAlcance({ token: 'tok', projectId: 'prj_1', teamId: 't', fetchImpl: fn }), /HTTP 403/);
});

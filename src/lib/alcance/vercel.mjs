/**
 * Consulta la API pública de Web Analytics de Vercel (mayo de 2026) y arma el
 * resumen del módulo «Alcance». Se ejecuta solo en el servidor (api/stats.js):
 * el token nunca llega al navegador.
 *
 * Referencia: https://vercel.com/docs/analytics/web-analytics-api
 *   GET /v1/query/web-analytics/visits/count      → total desde que se activó (producción)
 *   GET /v1/query/web-analytics/visits/aggregate  → por país / día / mes / ruta (ventana del plan)
 */
import { construirResumen, fechaISO } from './resumen.mjs';

const API = 'https://api.vercel.com';
const MS_DIA = 86_400_000;
let equipoCache = null; // { projectId, teamId } resuelto una vez por instancia

function cabeceras(token) {
  return { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } };
}

/**
 * Los proyectos de equipo exigen `teamId`; el token no lo trae. Se prueba cada
 * equipo del token (y la cuenta personal) contra /v9/projects/{id} hasta acertar.
 */
export async function resolverTeamId({ token, projectId, fetchImpl = fetch }) {
  if (equipoCache && equipoCache.projectId === projectId) return equipoCache.teamId;
  const candidatos = [];
  try {
    const r = await fetchImpl(`${API}/v2/teams?limit=20`, cabeceras(token));
    if (r.ok) for (const t of (await r.json()).teams || []) candidatos.push(t.id);
  } catch { /* sin equipos: se prueba la cuenta personal */ }
  candidatos.push(null);
  for (const id of candidatos) {
    const p = new URLSearchParams();
    if (id) p.set('teamId', id);
    const r = await fetchImpl(`${API}/v9/projects/${encodeURIComponent(projectId)}?${p}`, cabeceras(token));
    if (r.ok) {
      equipoCache = { projectId, teamId: id };
      return id;
    }
  }
  throw new Error(`el token no alcanza el proyecto ${projectId}`);
}

export async function consultarAlcance({ token, projectId, teamId, hoy = new Date(), fetchImpl = fetch }) {
  const team = teamId || (await resolverTeamId({ token, projectId, fetchImpl }));
  const hasta = fechaISO(hoy);
  const desde30 = fechaISO(Date.parse(hasta) - 29 * MS_DIA);
  const desde365 = fechaISO(Date.parse(hasta) - 364 * MS_DIA);
  const desde24m = fechaISO(Date.parse(hasta) - 730 * MS_DIA);

  const consulta = async (ruta, extra) => {
    const p = new URLSearchParams({ projectId, ...extra });
    if (team) p.set('teamId', team);
    const r = await fetchImpl(`${API}${ruta}?${p}`, cabeceras(token));
    if (!r.ok) throw new Error(`Vercel ${ruta} → HTTP ${r.status}`);
    return (await r.json()).data;
  };
  const agregado = (extra) => consulta('/v1/query/web-analytics/visits/aggregate', { until: hasta, limit: '100', ...extra });

  const [total, paises, dias, rutas, meses] = await Promise.all([
    consulta('/v1/query/web-analytics/visits/count', {}),
    agregado({ by: 'country', since: desde365 }),
    agregado({ by: 'day', since: desde30 }),
    agregado({ by: 'requestPath', since: desde30, limit: '40' }),
    agregado({ by: 'month', since: desde24m }),
  ]);
  return construirResumen({ total, paises, dias, rutas, meses, rangoPaises: { desde: desde365, hasta } }, hoy);
}

/** Solo para pruebas: olvida el equipo resuelto. */
export function _reiniciarCache() {
  equipoCache = null;
}

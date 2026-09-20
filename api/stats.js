/**
 * Función de Vercel: resumen de visitas del sitio para el módulo «Alcance»
 * (portada y barra lateral). Lee la API de Web Analytics con un token que solo
 * vive en las variables de entorno del proyecto y devuelve agregados; nunca
 * datos de personas.
 *
 * Variables: VERCEL_ANALYTICS_TOKEN (obligatoria; token de acceso de Vercel),
 *            VERCEL_PROJECT_ID (la pone Vercel), VERCEL_TEAM_ID (opcional).
 * Sin token o si Vercel falla responde 503 y el módulo no se muestra.
 */
import { consultarAlcance } from '../src/lib/alcance/vercel.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
    return;
  }
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(503).json({ error: 'alcance sin configurar: falta VERCEL_ANALYTICS_TOKEN o VERCEL_PROJECT_ID' });
    return;
  }
  try {
    const resumen = await consultarAlcance({ token, projectId, teamId: process.env.VERCEL_TEAM_ID });
    // 5 min en el CDN de Vercel (la página rota la URL cada 5 min, ver cliente.mjs).
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    res.status(200).json(resumen);
  } catch (e) {
    console.error('alcance:', e?.message || e);
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    res.status(503).json({ error: String(e?.message || e) });
  }
}

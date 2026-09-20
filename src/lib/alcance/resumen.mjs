/**
 * Lógica pura del módulo «Alcance»: convierte las respuestas de la API de
 * Web Analytics de Vercel en el resumen que consumen la portada y la barra
 * lateral. Sin dependencias ni acceso a red, para poder probarla en Node.
 *
 * Forma del resumen:
 *   { version, actualizado, desde (YYYY-MM | null),
 *     total: { visitas, paginas },            // desde que se activó Web Analytics
 *     ultimos30: { visitas, paginas },
 *     dias: [{ d: 'YYYY-MM-DD', visitas, paginas }] (30, con ceros),
 *     paises: [{ cc: 'MX', visitas, paginas }] (ordenados, sin «Others»),
 *     otros: { visitas, paginas } | null,      // lo que Vercel agrupó en «Others»
 *     rango_paises: { desde, hasta },
 *     rutas: [{ ruta, visitas, paginas }] (8, /en/ fusionado con /) }
 */
const MS_DIA = 86_400_000;

export function fechaISO(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Ruta comparable entre idiomas: sin query, sin /en, sin barra final. */
export function normalizarRuta(ruta) {
  if (typeof ruta !== 'string' || !ruta.startsWith('/')) return null;
  let r = ruta.split(/[?#]/)[0];
  r = r.replace(/^\/en(?=\/|$)/, '');
  r = r.replace(/\/index\.html$/, '/').replace(/\/+$/, '');
  return r === '' ? '/' : r;
}

export function agregarRutas(filas) {
  const acc = new Map();
  for (const f of filas || []) {
    const r = normalizarRuta(f.requestPath);
    if (!r) continue; // «Others» o filas sin ruta
    const cur = acc.get(r) || { ruta: r, visitas: 0, paginas: 0 };
    cur.visitas += num(f.visitors);
    cur.paginas += num(f.pageviews);
    acc.set(r, cur);
  }
  return [...acc.values()].sort((a, b) => b.visitas - a.visitas || b.paginas - a.paginas || a.ruta.localeCompare(b.ruta));
}

export function agregarPaises(filas) {
  const paises = [];
  let otros = null;
  for (const f of filas || []) {
    const cc = String(f.country || '').toUpperCase();
    const fila = { visitas: num(f.visitors), paginas: num(f.pageviews) };
    if (/^[A-Z]{2}$/.test(cc)) paises.push({ cc, ...fila });
    else otros = { visitas: (otros?.visitas || 0) + fila.visitas, paginas: (otros?.paginas || 0) + fila.paginas };
  }
  paises.sort((a, b) => b.visitas - a.visitas || b.paginas - a.paginas || a.cc.localeCompare(b.cc));
  return { paises, otros };
}

/** Serie diaria de los últimos `n` días terminando hoy, con ceros donde no hubo datos. */
export function serieDias(filas, hoy, n = 30) {
  const porDia = new Map();
  for (const f of filas || []) {
    if (f.timestamp) porDia.set(fechaISO(f.timestamp), { visitas: num(f.visitors), paginas: num(f.pageviews) });
  }
  const fin = Date.parse(fechaISO(hoy));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = fechaISO(fin - i * MS_DIA);
    const v = porDia.get(d);
    out.push({ d, visitas: v?.visitas || 0, paginas: v?.paginas || 0 });
  }
  return out;
}

/** Primer mes (YYYY-MM) con al menos una visita: «desde» del contador. */
export function primerMes(filas) {
  const meses = (filas || [])
    .filter((f) => f.timestamp && (num(f.visitors) > 0 || num(f.pageviews) > 0))
    .map((f) => fechaISO(f.timestamp).slice(0, 7))
    .sort();
  return meses[0] || null;
}

export function construirResumen({ total, paises, dias, rutas, meses, rangoPaises }, hoy = new Date()) {
  const serie = serieDias(dias, hoy);
  const { paises: lista, otros } = agregarPaises(paises);
  return {
    version: 1,
    actualizado: new Date(hoy).toISOString(),
    desde: primerMes(meses),
    total: { visitas: num(total?.visitors), paginas: num(total?.pageviews) },
    ultimos30: serie.reduce(
      (a, d) => ({ visitas: a.visitas + d.visitas, paginas: a.paginas + d.paginas }),
      { visitas: 0, paginas: 0 },
    ),
    dias: serie,
    paises: lista,
    otros,
    rango_paises: rangoPaises || null,
    rutas: agregarRutas(rutas).slice(0, 8),
  };
}

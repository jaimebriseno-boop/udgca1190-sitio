# Progreso — módulo «Alcance» (contador de visitas por país)

Actualizado: 2026-09-20. Estado: **en producción y conectado** (commits `f08acc3` → `abb6013`).

## Qué es

- Sección «Alcance» al final de la portada (`src/components/Alcance.astro`): visitas
  totales, últimos 30 días con serie diaria, países con bandera y porcentaje, páginas
  más visitadas y nota de privacidad.
- Micro-contador en la barra lateral de las páginas internas
  (`src/components/VisitasSidebar.astro`): total, países, cinco banderas con porcentaje
  y enlace «Ver alcance →» a la portada.
- Ambos salen `hidden` y solo se muestran si `/api/stats` responde 200 con visitas > 0.
- Mockup aprobado por el usuario: <https://claude.ai/artifact/GRHH2EhhrPp6iwHbKwQZJa>
  (copia local en `~/Desktop/propuesta-contador-visitas.html` de la Mac de Judith).

## Fuente de datos

- Vercel Web Analytics, activado el 2026-09-20 en el proyecto `udgca1190-sitio` con la
  opción incluida en el plan Pro (no la Plus). Script: `<Analytics />` de
  `@vercel/analytics/astro` en `Base.astro` y `Home.astro`. Sin cookies.
- API pública de Web Analytics (mayo de 2026): `visits/count` (total desde que se
  activó, producción) y `visits/aggregate` por `country` (12 meses), `day` (30 días),
  `requestPath` (30 días; es/en fusionados) y `month` (12 meses, para «desde»).
- `api/stats.js` (función de Vercel en `api/`, convive con el build estático de Astro)
  → `src/lib/alcance/vercel.mjs` (consultas) → `src/lib/alcance/resumen.mjs`
  (agregación pura, sin red).
- Caché: `Cache-Control: public, s-maxage=300, stale-while-revalidate=300`; la página
  pide `/api/stats?v=<ventana de 5 min>` para que el CDN no retenga copias viejas.

## Configuración en Vercel (hecha el 2026-09-20 desde el navegador del usuario)

- Token de acceso «udgca1190 alcance», alcance solo al proyecto, sin expiración;
  revocable en Account → Settings → Tokens.
- Variable `VERCEL_ANALYTICS_TOKEN` (Production) en Project → Settings → Environment
  Variables. `VERCEL_PROJECT_ID` la pone Vercel (acceso a variables de sistema
  activado). `VERCEL_TEAM_ID` es opcional: con token de proyecto `/v2/teams` responde
  403 y la función resuelve la cuenta sin equipo.
- Proyecto `prj_i0e0hh7M9hMQPUp8b8fBewA8GVme`, cuenta «JAIME BRISENO's projects»
  (`jaime-briseno-s-projects`). Se omitió el aviso de 2FA por decisión del usuario.

## Límites y decisiones

- El plan Pro solo entrega los últimos 366 días: ninguna consulta pide más de 365
  (pedir 24 meses devolvía `bad_request`).
- `until` con la fecha de hoy recorta el día en curso; se pide `until = mañana`.
- «Visitas» = `visitors` de Vercel (únicos por día; hash descartado a las 24 h).
- Precio: USD 0.03 por 1 000 eventos (páginas vistas), sin eventos incluidos en Pro;
  a la escala del sitio lo cubre el crédito mensual del plan.
- Banderas: `flag-icons` (MIT) copiadas a `public/flags/` por
  `scripts/prepare-flags.mjs` en predev/prebuild/precheck (carpeta gitignorada).
- Nombres de país con `Intl.DisplayNames` (es/en) en el navegador; nombres de páginas
  desde las colecciones (herramientas, calculadoras, estudios) más el menú.
- Descartado: contador propio con Upstash Redis (la API de Vercel lo hizo innecesario);
  GoatCounter/Umami (terceros con token y tarea programada); widget Flag Counter.

## Verificación

- `npm run test:alcance`: 10 pruebas (normalización de rutas, agregación, serie
  diaria, consultas y resolución de equipo con fetch simulado).
- Producción, 2026-09-21 ~00:50 UTC: `/api/stats` 200 con 1 visitante (MX) y 8 páginas
  vistas; la portada renderiza la sección (KPIs, países, páginas) y la barra lateral el
  contador. Capturas con Chrome headless.
- Antes de la corrección de caché el CDN sirvió más de una hora la primera copia con
  ceros (`stale-while-revalidate=3600`); resuelto con la rotación de URL (`abb6013`).

## Cómo depurar

- Dato fresco sin caché: `curl 'https://udgca1190.com.mx/api/stats?x=1'` (cualquier
  parámetro nuevo).
- Errores: la función responde 503 con `{"error": "Vercel <ruta> → HTTP <n> (<code>)"}`.
  `web_analytics_not_enabled` = falta el botón Enable en Analytics; `bad_request` =
  fechas fuera de la ventana del plan; «sin configurar» = falta el token.
- Panel de Vercel: proyecto → Analytics (mismos números que el sitio).

## Pendientes

- Nada bloqueante. Opcional: página `/alcance` con más detalle (referrers,
  dispositivos) o «Web Analytics Plus» (USD 10/mes) para 24 meses de historial.

// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Sitio del Cuerpo Académico UDG-CA-1190.
// Salida estática (host-agnóstica): funciona igual en Vercel, Cloudflare Pages, etc.
// https://astro.build/config
export default defineConfig({
  site: 'https://udgca1190.com.mx',
  integrations: [
    // Genera /sitemap-index.xml con alternativas hreflang (es/en); excluye /estilo
    // y /estudios (páginas de proyectos con noindex mientras no abra su participación).
    sitemap({
      filter: (page) => !page.includes('/estilo') && !page.includes('/estudios/'),
      i18n: {
        defaultLocale: 'es',
        locales: { es: 'es-MX', en: 'en-US' },
      },
    }),
  ],
  // Bilingüe: español en la raíz (canónico), inglés bajo /en/.
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  // Sin scripts ni hojas de estilo en línea en el HTML generado. Las páginas de
  // Bioestadística abierta se sirven con una Content-Security-Policy estricta
  // (vercel.json: `script-src 'self' …`, `style-src 'self'`, sin 'unsafe-inline'
  // ni hashes) para acotar «Verificar con R» a los dos orígenes de webR; un
  // script o un <style> incrustado por Astro (por omisión incrusta los menores
  // de 4 KB) quedaría bloqueado en producción. El coste es una petición más por
  // archivo pequeño (p. ej. el script del menú), servido con caché inmutable.
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});

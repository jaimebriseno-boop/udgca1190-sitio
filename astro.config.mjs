// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Sitio del Cuerpo Académico UDG-CA-1190.
// Salida estática (host-agnóstica): funciona igual en Vercel, Cloudflare Pages, etc.
// https://astro.build/config
export default defineConfig({
  site: 'https://udgca1190.com.mx',
  integrations: [
    // Genera /sitemap-index.xml con alternativas hreflang (es/en); excluye /estilo.
    sitemap({
      filter: (page) => !page.includes('/estilo'),
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
});

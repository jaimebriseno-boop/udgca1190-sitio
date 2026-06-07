// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Sitio del Cuerpo Académico UDG-CA-1190.
// Salida estática (host-agnóstica): funciona igual en Vercel, Cloudflare Pages, etc.
// https://astro.build/config
export default defineConfig({
  site: 'https://udgca1190.com.mx',
  integrations: [
    // Genera /sitemap-index.xml (excluye la guía de estilo interna /estilo).
    sitemap({ filter: (page) => !page.includes('/estilo') }),
  ],
  // i18n preparado: español como idioma base; 'en' se añadirá en una fase posterior.
  i18n: {
    defaultLocale: 'es',
    locales: ['es'],
  },
});

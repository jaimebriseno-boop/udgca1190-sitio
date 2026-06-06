// @ts-check
import { defineConfig } from 'astro/config';

// Sitio del Cuerpo Académico UDG-CA-1190.
// Salida estática (host-agnóstica): funciona igual en Vercel, Cloudflare Pages, etc.
// https://astro.build/config
export default defineConfig({
  site: 'https://udgca1190.com.mx',
  // i18n preparado: español como idioma base; 'en' se añadirá en una fase posterior.
  i18n: {
    defaultLocale: 'es',
    locales: ['es'],
  },
});

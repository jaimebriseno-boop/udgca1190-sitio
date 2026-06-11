/**
 * Internacionalización (ES por defecto · EN bajo /en/).
 *
 * - Las cadenas de "chrome" (menús, botones, etiquetas, badges, metadatos SEO)
 *   viven en el diccionario UI de este archivo, en ambos idiomas.
 * - El CONTENIDO (biografías, líneas, herramientas, misión, actividades) vive en
 *   español en data/*.yml y su traducción al inglés en data/i18n/en.yml
 *   (mismas claves de campo). `localize()` fusiona el override inglés cuando
 *   lang === 'en'; en español devuelve el dato tal cual.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { getSitio } from './lib/datos.mjs';

const ROOT = process.cwd();

export const LOCALES = ['es', 'en'];
export const DEFAULT_LOCALE = 'es';

// ---- Overrides de contenido en inglés (data/i18n/en.yml) ----
let _en = null;
export function getEnOverrides() {
  if (_en) return _en;
  try {
    _en = yaml.load(readFileSync(join(ROOT, 'data/i18n/en.yml'), 'utf8')) || {};
  } catch {
    _en = {}; // si aún no existe el archivo, el inglés cae al español
  }
  return _en;
}

/** Fusiona los datos de una entidad con su override en inglés (mismas claves). */
export function localize(entity, id, data, lang) {
  if (lang !== 'en') return data;
  const ov = (getEnOverrides()[entity] || {})[id];
  return ov ? { ...data, ...ov } : data;
}

/** Configuración del sitio localizada (sitio.yml + overrides sitio de en.yml). */
export function getSitioL(lang) {
  const base = getSitio();
  if (lang !== 'en') return base;
  const ov = getEnOverrides().sitio || {};
  const merged = { ...base, ...ov };
  merged.contacto = { ...(base.contacto || {}), ...(ov.contacto || {}) };
  return merged;
}

// ---- Helpers de rutas (ES canónico en raíz, EN bajo /en/) ----
export function stripLocale(pathname) {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  if (p === '/en') return '/';
  if (p.startsWith('/en/')) return p.slice(3) || '/';
  return p;
}
/** Dadas la ruta actual, las rutas equivalentes en cada idioma (para hreflang/switcher). */
export function altPaths(pathname) {
  const es = stripLocale(pathname);
  const en = es === '/' ? '/en/' : '/en' + es;
  return { es, en };
}
/** Convierte una ruta canónica (ES) al prefijo del idioma pedido. */
export function localePath(path, lang) {
  if (lang === 'en') return path === '/' ? '/en/' : '/en' + path;
  return path || '/';
}

// ---- Diccionario de cadenas de interfaz ----
const UI = {
  es: {
    // Navegación (barra lateral)
    'nav.home': 'Inicio',
    'nav.members': 'Integrantes',
    'nav.lines': 'Líneas de investigación',
    'nav.production': 'Producción académica',
    'nav.tools': 'Herramientas',
    'nav.activities': 'Actividades',
    'nav.contact': 'Contacto',
    // Navegación corta (portada)
    'navshort.lines': 'Líneas',
    'navshort.production': 'Producción',
    'navshort.members': 'Integrantes',
    'navshort.tools': 'Herramientas',
    'navshort.contact': 'Contacto',
    // Portada (slideshow)
    'hero.pause': 'Pausar presentación de fondo',
    'hero.play': 'Reanudar presentación de fondo',
    // Comunes / accesibilidad
    'org.name': 'Cuerpo Académico UDG-CA-1190',
    'skip': 'Saltar al contenido',
    'aria.open_menu': 'Abrir menú',
    'aria.main_nav': 'Principal',
    'aria.sections': 'Secciones',
    'aria.home': 'Inicio — UDG-CA-1190',
    'aria.filter_lgac': 'Filtrar por LGAC',
    'aria.lang': 'Cambiar idioma',
    'lang.alt_label': 'English',
    // Integrantes
    'members.kicker': 'Integrantes',
    'members.title': 'Equipo del Cuerpo Académico',
    'members.lead': 'Líder del CA',
    'card.orcid': 'ORCID ↗',
    'card.scholar': 'Scholar ↗',
    'card.email': 'Correo ↗',
    // Líneas
    'lines.kicker': 'Líneas de Generación y Aplicación del Conocimiento',
    'lines.title': 'Líneas de investigación',
    'lines.esp_label': 'Líneas específicas',
    'lines.members_label': 'Integrantes',
    'lines.pubs_unit': 'pubs',
    // Producción
    'prod.kicker': 'Producción académica',
    'prod.title': 'Publicaciones',
    'prod.filter_all': 'Todas',
    'prod.en_prep': 'En preparación',
    'prod.intro_mid': 'de {total} registros — {pub} publicaciones con DOI verificado (ORCID/PubMed) y {prep} manuscrito{s} en preparación. Cada uno indica a qué <em>línea específica</em> y a qué <em>LGAC</em> abona. Filtra por línea general:',
    // Herramientas
    'tools.kicker': 'Herramientas / Métodos',
    'tools.title': 'Herramientas metodológicas',
    'tools.stack_label': 'Stack',
    'tool.tipo.predictiva': 'Predictiva',
    'tool.tipo.estadistica': 'Estadística',
    'tool.tipo.pipeline': 'Pipeline',
    'tool.estado.activa': 'Activa',
    'tool.estado.beta': 'Beta',
    'tool.estado.desarrollo': 'En desarrollo',
    'tool.link_app': 'App ↗',
    'tool.link_repo': 'Repositorio ↗',
    'tool.link_doi': 'DOI ↗',
    // Actividades
    'acts.kicker': 'Actividades',
    'acts.title': 'Docencia, edición y divulgación',
    'acts.more': 'Más información ↗',
    'acts.tipo.docencia': 'Docencia',
    'acts.tipo.edicion': 'Edición',
    'acts.tipo.revision': 'Revisión',
    'acts.tipo.divulgacion': 'Divulgación',
    'acts.tipo.evento': 'Evento',
    // Contacto
    'contact.title': 'Escríbenos',
    'contact.f_name': 'Nombre',
    'contact.f_email': 'Correo electrónico',
    'contact.f_message': 'Mensaje',
    'contact.submit': 'Enviar mensaje',
    'contact.aside_kicker': 'Cuerpo Académico',
    'contact.row_email': 'Correo',
    'contact.row_location': 'Ubicación',
    'contact.subject': 'Mensaje desde el sitio del CA UDG-CA-1190',
    'contact.from_name': 'Sitio UDG-CA-1190',
    'contact.pending': 'Formulario pendiente de configurar. Mientras tanto, escribe directamente a',
    // Metadatos SEO (description por página)
    'meta.members': 'Integrantes del Cuerpo Académico UDG-CA-1190.',
    'meta.lines': 'Las 5 Líneas de Generación y Aplicación del Conocimiento (LGAC) del CA UDG-CA-1190.',
    'meta.production': 'Producción del CA UDG-CA-1190, etiquetada por línea específica y LGAC, con DOI.',
    'meta.tools': 'Herramientas estadístico-epidemiológicas y predictivas del CA UDG-CA-1190.',
    'meta.activities': 'Docencia, edición, revisión y divulgación del CA UDG-CA-1190.',
    'meta.contact': 'Contacto del Cuerpo Académico UDG-CA-1190.',
  },
  en: {
    'nav.home': 'Home',
    'nav.members': 'Members',
    'nav.lines': 'Research lines',
    'nav.production': 'Publications',
    'nav.tools': 'Tools',
    'nav.activities': 'Activities',
    'nav.contact': 'Contact',
    'navshort.lines': 'Lines',
    'navshort.production': 'Output',
    'navshort.members': 'Members',
    'navshort.tools': 'Tools',
    'navshort.contact': 'Contact',
    'hero.pause': 'Pause background slideshow',
    'hero.play': 'Resume background slideshow',
    'org.name': 'UDG-CA-1190 Research Group',
    'skip': 'Skip to content',
    'aria.open_menu': 'Open menu',
    'aria.main_nav': 'Main',
    'aria.sections': 'Sections',
    'aria.home': 'Home — UDG-CA-1190',
    'aria.filter_lgac': 'Filter by LGAC',
    'aria.lang': 'Change language',
    'lang.alt_label': 'Español',
    'members.kicker': 'Members',
    'members.title': 'Research Group Team',
    'members.lead': 'Group Lead',
    'card.orcid': 'ORCID ↗',
    'card.scholar': 'Scholar ↗',
    'card.email': 'Email ↗',
    'lines.kicker': 'Knowledge Generation and Application Lines',
    'lines.title': 'Research lines',
    'lines.esp_label': 'Specific lines',
    'lines.members_label': 'Members',
    'lines.pubs_unit': 'pubs',
    'prod.kicker': 'Academic output',
    'prod.title': 'Publications',
    'prod.filter_all': 'All',
    'prod.en_prep': 'In preparation',
    'prod.intro_mid': 'of {total} records — {pub} publications with verified DOIs (ORCID/PubMed) and {prep} manuscript{s} in preparation. Each entry indicates which <em>specific line</em> and which <em>LGAC</em> it contributes to. Filter by research line:',
    'tools.kicker': 'Tools / Methods',
    'tools.title': 'Methodological tools',
    'tools.stack_label': 'Stack',
    'tool.tipo.predictiva': 'Predictive',
    'tool.tipo.estadistica': 'Statistical',
    'tool.tipo.pipeline': 'Pipeline',
    'tool.estado.activa': 'Active',
    'tool.estado.beta': 'Beta',
    'tool.estado.desarrollo': 'In development',
    'tool.link_app': 'App ↗',
    'tool.link_repo': 'Repository ↗',
    'tool.link_doi': 'DOI ↗',
    'acts.kicker': 'Activities',
    'acts.title': 'Teaching, editorial work & outreach',
    'acts.more': 'More info ↗',
    'acts.tipo.docencia': 'Teaching',
    'acts.tipo.edicion': 'Editorial',
    'acts.tipo.revision': 'Peer review',
    'acts.tipo.divulgacion': 'Outreach',
    'acts.tipo.evento': 'Event',
    'contact.title': 'Get in touch',
    'contact.f_name': 'Name',
    'contact.f_email': 'Email',
    'contact.f_message': 'Message',
    'contact.submit': 'Send message',
    'contact.aside_kicker': 'Research Group',
    'contact.row_email': 'Email',
    'contact.row_location': 'Location',
    'contact.subject': 'Message from the UDG-CA-1190 website',
    'contact.from_name': 'UDG-CA-1190 website',
    'contact.pending': 'Contact form not yet configured. In the meantime, write directly to',
    'meta.members': 'Members of the UDG-CA-1190 Research Group (University of Guadalajara · CUTlajomulco).',
    'meta.lines': 'The five Knowledge Generation and Application Lines (LGAC) of the UDG-CA-1190 Research Group.',
    'meta.production': 'Research output of the UDG-CA-1190 Research Group, tagged by specific line and LGAC, with DOIs.',
    'meta.tools': 'Statistical-epidemiological and predictive tools of the UDG-CA-1190 Research Group.',
    'meta.activities': 'Teaching, editorial work, peer review and outreach of the UDG-CA-1190 Research Group.',
    'meta.contact': 'Contact the UDG-CA-1190 Research Group.',
  },
};

/** Traduce una clave de interfaz; admite interpolación {var}. */
export function t(lang, key, vars) {
  const table = UI[lang] || UI.es;
  let s = table[key];
  if (s == null) s = UI.es[key];
  if (s == null) return key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}

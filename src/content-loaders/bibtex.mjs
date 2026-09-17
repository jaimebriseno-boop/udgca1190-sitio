/**
 * Carga y normaliza archivos BibTeX del sitio:
 *  - `loadPublicaciones()`: data/publicaciones.bib (producción del CA) fusionando
 *    los metadatos web de data/publicaciones.overrides.yml por citation key.
 *  - `loadBib(ruta, overridesRuta?)`: cualquier .bib (p. ej. las referencias
 *    metodológicas de Bioestadística abierta en data/bioestadistica/referencias.bib).
 * Pensado para usarse en build (Astro) y desde scripts/check-bib.mjs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import * as Bib from '@retorquere/bibtex-parser';

const ROOT = process.cwd();
const cache = new Map();

function initials(first) {
  if (!first) return '';
  return first.split(/\s+/).map((w) => (w[0] ? w[0].toUpperCase() : '')).join('');
}

/** Lista de autores → texto Vancouver: "Apellido IN, ... , et al." */
function authorsText(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const out = [];
  for (const a of list) {
    if ((a.lastName || '').toLowerCase() === 'others') { out.push('et al.'); break; }
    out.push(`${a.lastName}${a.firstName ? ' ' + initials(a.firstName) : ''}`);
  }
  return out.join(', ');
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

/**
 * Carga un .bib (ruta relativa a la raíz del proyecto) y devuelve entradas
 * normalizadas ordenadas por año descendente. Resultado en caché por ruta.
 * @param {string} bibPath p. ej. 'data/publicaciones.bib'
 * @param {string} [overridesPath] YAML con metadatos web por citation key (opcional)
 */
export function loadBib(bibPath, overridesPath) {
  const k = `${bibPath}|${overridesPath ?? ''}`;
  if (cache.has(k)) return cache.get(k);

  const bibText = readFileSync(join(ROOT, bibPath), 'utf8');
  const overrides = overridesPath
    ? yaml.load(readFileSync(join(ROOT, overridesPath), 'utf8')) || {}
    : {};

  // sentenceCase:false preserva el casing original del título (biomédico).
  const parsed = Bib.parse(bibText, { sentenceCase: false });

  const entries = parsed.entries.map((e) => {
    const f = e.fields || {};
    const ov = overrides[e.key] || {};
    return {
      key: e.key,
      type: e.type,
      authors: f.author || [],
      authorsText: authorsText(f.author || []),
      title: first(f.title) || '',
      journal: first(f.journal) || '',
      year: f.year ? parseInt(first(f.year), 10) : null,
      doi: first(f.doi) || '',
      url: first(f.url) || '',
      volume: first(f.volume) || '',
      number: first(f.number) || '',
      pages: first(f.pages) || '',
      publisher: first(f.publisher) || '',
      // libros y capítulos:
      address: first(f.address) || '',
      edition: first(f.edition) || '',
      booktitle: first(f.booktitle) || '',
      isbn: first(f.isbn) || '',
      // identificadores no estándar (el parser conserva campos desconocidos):
      pmid: first(f.pmid) || '',
      pmcid: first(f.pmcid) || '',
      // metadatos web (overrides):
      destacado: ov.destacado ?? false,
      estado: ov.estado ?? '',
      temas: ov.temas ?? [],
      lineas: ov.lineas ?? [],
      pdf: ov.pdf ?? '',
      resumen_es: ov.resumen_es ?? '',
    };
  });

  entries.sort((a, b) => (b.year || 0) - (a.year || 0));
  cache.set(k, entries);
  return entries;
}

/** Producción académica del CA (compatibilidad con el resto del sitio). */
export function loadPublicaciones() {
  return loadBib('data/publicaciones.bib', 'data/publicaciones.overrides.yml');
}

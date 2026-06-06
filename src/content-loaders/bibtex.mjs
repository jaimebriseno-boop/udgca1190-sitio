/**
 * Carga y normaliza las publicaciones desde data/publicaciones.bib,
 * fusionando metadatos web de data/publicaciones.overrides.yml por citation key.
 * Pensado para usarse en build (Astro) y desde scripts/check-bib.mjs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import * as Bib from '@retorquere/bibtex-parser';

const ROOT = process.cwd();

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

export function loadPublicaciones() {
  const bibText = readFileSync(join(ROOT, 'data/publicaciones.bib'), 'utf8');
  const overrides =
    yaml.load(readFileSync(join(ROOT, 'data/publicaciones.overrides.yml'), 'utf8')) || {};

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
  return entries;
}

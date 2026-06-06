#!/usr/bin/env node
/**
 * check-bib.mjs — lint suave del .bib + prueba del pipeline BibTeX→texto.
 * Corre con `node scripts/check-bib.mjs` desde la raíz del proyecto.
 * Avisa de campos faltantes o DOI sin verificar (no bloquea el build).
 */
import { loadPublicaciones } from '../src/content-loaders/bibtex.mjs';
import { formatCita } from '../src/lib/formatCita.mjs';

const pubs = loadPublicaciones();
console.log(`Publicaciones cargadas: ${pubs.length}\n`);

let avisos = 0;
for (const p of pubs) {
  const falta = [];
  if (!p.authorsText) falta.push('author');
  if (!p.title) falta.push('title');
  if (!p.year) falta.push('year');
  if (!p.doi || /VERIFICAR/i.test(p.doi)) falta.push('doi(verificar)');
  if (!p.estado) falta.push('estado(override)');

  const texto = formatCita(p).replace(/<[^>]+>/g, '');
  console.log(`• [${p.estado || 'sin-estado'}] ${texto}`);
  if (falta.length) { avisos++; console.log(`  ⚠ revisar: ${falta.join(', ')}`); }
}

console.log(`\n${avisos ? `⚠ ${avisos} entrada(s) con avisos (no bloquea el build)` : '✓ sin avisos'}`);

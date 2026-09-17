#!/usr/bin/env node
/**
 * check-bib.mjs — lint suave de un .bib + prueba del pipeline BibTeX→texto.
 * Uso desde la raíz del proyecto:
 *   node scripts/check-bib.mjs                                   # data/publicaciones.bib (+ overrides)
 *   node scripts/check-bib.mjs data/bioestadistica/referencias.bib   # cualquier otro .bib
 * Avisa de campos faltantes o DOI sin verificar (no bloquea el build).
 */
import { loadBib, loadPublicaciones } from '../src/content-loaders/bibtex.mjs';
import { formatCita } from '../src/lib/formatCita.mjs';

const ruta = process.argv[2];
const pubs = ruta ? loadBib(ruta) : loadPublicaciones();
console.log(`Entradas cargadas (${ruta || 'data/publicaciones.bib'}): ${pubs.length}\n`);

let avisos = 0;
for (const p of pubs) {
  const falta = [];
  const esLibro = p.type === 'book' || p.type === 'incollection' || p.type === 'inbook';
  if (!p.authorsText) falta.push('author');
  if (!p.title) falta.push('title');
  if (!p.year) falta.push('year');
  if (!esLibro && (!p.doi || /VERIFICAR/i.test(p.doi))) falta.push('doi(verificar)');
  if (esLibro && !p.publisher) falta.push('publisher');
  if (!ruta && !p.estado) falta.push('estado(override)');

  const texto = formatCita(p).replace(/<[^>]+>/g, '');
  console.log(`• [${p.estado || p.type}] ${p.key}: ${texto}`);
  if (falta.length) { avisos++; console.log(`  ⚠ revisar: ${falta.join(', ')}`); }
}

console.log(`\n${avisos ? `⚠ ${avisos} entrada(s) con avisos (no bloquea el build)` : '✓ sin avisos'}`);

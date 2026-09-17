/**
 * formatCita.mjs con las extensiones de Bioestadística abierta: libros y
 * capítulos en el idioma de la página, enlace a PMID y escape de comillas.
 * La salida de los artículos (la que usa el resto del sitio) no cambia.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
// Módulo JavaScript sin tipos: se acota aquí la firma que se usa.
import * as citaMod from '../../src/lib/formatCita.mjs';

type Publicacion = Record<string, string | number | undefined>;
const formatCita = (citaMod as { formatCita: (p: Publicacion, lang?: 'es' | 'en') => string }).formatCita;
const texto = (html: string): string => html.replace(/<[^>]+>/g, '');

const libro: Publicacion = {
  type: 'book', authorsText: 'Altman DG, Machin D', title: 'Statistics with Confidence', edition: '2',
  address: 'London', publisher: 'BMJ Books', year: 2000,
};
const capitulo: Publicacion = {
  type: 'incollection', authorsText: 'Newcombe RG', title: 'Proportions', booktitle: 'Statistics with Confidence',
  edition: '2', address: 'London', publisher: 'BMJ Books', year: 2000, pages: '45--56',
};
const articulo: Publicacion = {
  type: 'article', authorsText: 'Newcombe RG', title: 'Two-sided confidence intervals', journal: 'Statistics in Medicine',
  year: 1998, volume: '17', number: '8', pages: '857--872', doi: '10.1002/x', pmid: '9595616',
};

test('un libro lleva la edición y las partículas en el idioma de la página', () => {
  assert.equal(texto(formatCita(libro)), 'Altman DG, Machin D. Statistics with Confidence. 2.ª ed. London: BMJ Books; 2000.');
  assert.equal(texto(formatCita(libro, 'en')), 'Altman DG, Machin D. Statistics with Confidence. 2nd ed. London: BMJ Books; 2000.');
  assert.equal(texto(formatCita({ ...libro, edition: '3' }, 'en')).includes('3rd ed.'), true);
  assert.equal(texto(formatCita({ ...libro, edition: '11' }, 'en')).includes('11th ed.'), true);
});

test('un capítulo usa «En:» / «In:» según el idioma', () => {
  assert.equal(texto(formatCita(capitulo)).includes('En: Statistics with Confidence.'), true);
  assert.equal(texto(formatCita(capitulo, 'en')).includes('In: Statistics with Confidence.'), true);
});

test('un artículo conserva la salida original y añade el enlace a PubMed cuando hay PMID', () => {
  const html = formatCita(articulo);
  assert.equal(html, formatCita(articulo, 'en'));
  assert.equal(texto(html).startsWith('Newcombe RG. Two-sided confidence intervals. Statistics in Medicine. 1998;17(8):857--872.'), true);
  assert.equal(html.includes('href="https://pubmed.ncbi.nlm.nih.gov/9595616/"'), true);
  assert.equal(html.includes('href="https://doi.org/10.1002/x"'), true);
});

test('las comillas dobles se escapan dentro de los atributos', () => {
  const html = formatCita({ ...articulo, doi: '10.1/a"b' });
  assert.equal(html.includes('"b'), false);
  assert.equal(html.includes('&quot;b'), true);
});

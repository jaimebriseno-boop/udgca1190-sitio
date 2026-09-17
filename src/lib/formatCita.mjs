/** Formatea una publicación normalizada a HTML estilo Vancouver (numérico, biomédico). */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ordinal inglés: 1st, 2nd, 3rd, 4th… */
function ordinalEn(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

/** Edición: 2 → "2.ª ed." (es) / "2nd ed." (en) */
function edicion(e, lang) {
  const n = String(e).trim();
  if (!/^\d+$/.test(n)) return `${esc(n)} ed.`;
  return lang === 'en' ? `${ordinalEn(Number(n))} ed.` : `${n}.ª ed.`;
}

/**
 * @param {object} p publicación normalizada (ver content-loaders/bibtex.mjs)
 * @param {'es'|'en'} [lang] idioma de las partículas de libros y capítulos («2.ª ed.»/«2nd ed.», «En:»/«In:»); los artículos no cambian
 * @returns {string} HTML de una sola línea (sin tags de bloque)
 */
export function formatCita(p, lang = 'es') {
  const autores = esc(p.authorsText).replace(/\.$/, ''); // evita punto doble (p.ej. "et al.")
  const titulo = esc(p.title);
  const tipo = String(p.type || 'article').toLowerCase();

  let fuente = '';
  if (tipo === 'book') {
    // Libro: Edición. Ciudad: Editorial; año.
    const partes = [];
    if (p.edition) partes.push(edicion(p.edition, lang));
    let lugar = '';
    if (p.address) lugar += esc(p.address);
    if (p.publisher) lugar += `${lugar ? ': ' : ''}${esc(p.publisher)}`;
    if (p.year) lugar += `${lugar ? '; ' : ''}${esc(p.year)}`;
    if (lugar) partes.push(lugar);
    fuente = partes.join(' ');
    if (fuente) fuente += '.';
  } else if (tipo === 'incollection' || tipo === 'inbook') {
    // Capítulo: En: Libro. Edición. Ciudad: Editorial; año. p. páginas.
    const partes = [];
    if (p.booktitle) partes.push(`${lang === 'en' ? 'In' : 'En'}: ${esc(p.booktitle)}.`);
    if (p.edition) partes.push(edicion(p.edition, lang));
    let lugar = '';
    if (p.address) lugar += esc(p.address);
    if (p.publisher) lugar += `${lugar ? ': ' : ''}${esc(p.publisher)}`;
    if (p.year) lugar += `${lugar ? '; ' : ''}${esc(p.year)}`;
    if (lugar) partes.push(`${lugar}.`);
    if (p.pages) partes.push(`p. ${esc(p.pages)}.`);
    fuente = partes.join(' ');
  } else {
    // Artículo (salida original, sin cambios): Revista. año;vol(num):páginas.
    if (p.journal) fuente += `<em>${esc(p.journal)}</em>`;
    if (p.year) fuente += `${fuente ? '. ' : ''}${esc(p.year)}`;
    if (p.volume) fuente += `;${esc(p.volume)}`;
    if (p.number) fuente += `(${esc(p.number)})`;
    if (p.pages) fuente += `:${esc(p.pages)}`;
    if (fuente) fuente += '.';
  }

  const doi = p.doi
    ? ` <a class="cita__doi" href="https://doi.org/${esc(p.doi)}" rel="noopener" target="_blank">doi:${esc(p.doi)}</a>`
    : '';
  const pmid = p.pmid
    ? ` <a class="cita__pmid" href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" rel="noopener" target="_blank">PMID: ${esc(p.pmid)}</a>`
    : '';

  return [
    autores && `<span class="cita__autores">${autores}.</span>`,
    titulo && `<span class="cita__titulo">${titulo}.</span>`,
    fuente && `<span class="cita__fuente">${fuente}</span>`,
  ]
    .filter(Boolean)
    .join(' ') + doi + pmid;
}

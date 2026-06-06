/** Formatea una publicación normalizada a HTML estilo Vancouver (numérico, biomédico). */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {object} p publicación normalizada (ver content-loaders/bibtex.mjs)
 * @returns {string} HTML de una sola línea (sin tags de bloque)
 */
export function formatCita(p) {
  const autores = esc(p.authorsText).replace(/\.$/, ''); // evita punto doble (p.ej. "et al.")
  const titulo = esc(p.title);

  let fuente = '';
  if (p.journal) fuente += `<em>${esc(p.journal)}</em>`;
  if (p.year) fuente += `${fuente ? '. ' : ''}${esc(p.year)}`;
  if (p.volume) fuente += `;${esc(p.volume)}`;
  if (p.number) fuente += `(${esc(p.number)})`;
  if (p.pages) fuente += `:${esc(p.pages)}`;
  if (fuente) fuente += '.';

  const doi = p.doi
    ? ` <a class="cita__doi" href="https://doi.org/${esc(p.doi)}" rel="noopener" target="_blank">doi:${esc(p.doi)}</a>`
    : '';

  return [
    autores && `<span class="cita__autores">${autores}.</span>`,
    titulo && `<span class="cita__titulo">${titulo}.</span>`,
    fuente && `<span class="cita__fuente">${fuente}</span>`,
  ]
    .filter(Boolean)
    .join(' ') + doi;
}

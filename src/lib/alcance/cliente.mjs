/** Ayudas del navegador para el módulo «Alcance» (portada y barra lateral). */
let promesa = null;

/** Una sola petición a /api/stats por página; null si no hay datos. */
export function cargarAlcance() {
  if (!promesa) {
    promesa = fetch('/api/stats', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return promesa;
}

const locale = (lang) => (lang === 'en' ? 'en-US' : 'es-MX');

export function nombrePais(cc, lang) {
  try {
    return new Intl.DisplayNames([lang === 'en' ? 'en' : 'es'], { type: 'region' }).of(cc) || cc;
  } catch {
    return cc;
  }
}

export function numero(n, lang) {
  return new Intl.NumberFormat(locale(lang)).format(n);
}

/** «71.4 %» (es) · «71.4%» (en); `dec` decimales. */
export function porcentaje(parte, total, lang, dec = 1) {
  if (!total) return '';
  const v = new Intl.NumberFormat(locale(lang), { minimumFractionDigits: dec, maximumFractionDigits: dec }).format((100 * parte) / total);
  return lang === 'en' ? `${v}%` : `${v}\u00a0%`; // espacio duro: no se parte en dos líneas
}

export function bandera(cc) {
  return `/flags/${cc.toLowerCase()}.svg`;
}

function fechaMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** «septiembre de 2026» · «September 2026» */
export function mesLargo(ym, lang) {
  return new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(fechaMes(ym));
}

/** «sep 2026» · «Sep 2026» */
export function mesCorto(ym, lang) {
  return new Intl.DateTimeFormat(locale(lang), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(fechaMes(ym)).replace('.', '');
}

/** Puntos de una polilínea para la serie diaria (viewBox 300×34). */
export function puntosSerie(dias) {
  const max = Math.max(1, ...dias.map((d) => d.visitas));
  const n = dias.length;
  return dias.map((d, i) => {
    const x = n > 1 ? (300 * i) / (n - 1) : 0;
    const y = 31 - (28 * d.visitas) / max;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
}

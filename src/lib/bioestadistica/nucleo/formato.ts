/**
 * Formato de números por idioma (Intl es-MX / en-US). Es el ÚNICO lugar donde
 * se redondea: la biblioteca numérica devuelve dobles sin redondear.
 *
 * Nota: es-MX usa punto decimal y coma de miles, igual que en-US; la diferencia
 * visible está en el porcentaje («95 %» con espacio fino U+202F en español,
 * «95%» en inglés) y en el texto de los intervalos («a» / «to»).
 */
import type { Formateador, Lang, Pista } from './tipos.ts';

const LOCALE: Record<Lang, string> = { es: 'es-MX', en: 'en-US' };
const NO_DEFINIDO: Record<Lang, string> = { es: 'no definido', en: 'not defined' };
const CONECTOR_IC: Record<Lang, string> = { es: ' a ', en: ' to ' };
const SIGNO_PCT: Record<Lang, string> = { es: ' %', en: '%' };

function opciones(pista: Pista): Intl.NumberFormatOptions {
  switch (pista) {
    case 'int':
      return { maximumFractionDigits: 0 };
    case 'dec1':
      return { minimumFractionDigits: 1, maximumFractionDigits: 1 };
    case 'dec2':
      return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    case 'dec3':
    case 'p':
      return { minimumFractionDigits: 3, maximumFractionDigits: 3 };
    case 'dec4':
      return { minimumFractionDigits: 4, maximumFractionDigits: 4 };
    case 'sig2':
      return { maximumSignificantDigits: 2 };
    case 'sig3':
    case 'lr':
    case 'x':
      return { maximumSignificantDigits: 3 };
    case 'sig4':
      return { maximumSignificantDigits: 4 };
    case 'pct0':
      return { minimumFractionDigits: 0, maximumFractionDigits: 0 };
    case 'pct1':
      return { minimumFractionDigits: 1, maximumFractionDigits: 1 };
    case 'pct2':
      return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  }
}

/** Evita «-0», «-0.00»… en valores negativos que se redondean a cero. */
function sinCeroNegativo(s: string): string {
  return /^[-−]0(?:[.,]0+)?$/.test(s) ? s.slice(1) : s;
}

/** Crea el formateador de un idioma. Determinista: no depende de la zona horaria ni del sistema. */
export function crearFormateador(lang: Lang): Formateador {
  const locale = LOCALE[lang];
  const cache = new Map<Pista, Intl.NumberFormat>();
  const nf = (pista: Pista): Intl.NumberFormat => {
    let f = cache.get(pista);
    if (!f) {
      f = new Intl.NumberFormat(locale, opciones(pista));
      cache.set(pista, f);
    }
    return f;
  };
  const enteroNf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const nivelNf = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 });

  const num = (x: number, pista: Pista = 'dec3'): string => {
    if (Number.isNaN(x)) return NO_DEFINIDO[lang];
    if (x === Infinity) return '∞';
    if (x === -Infinity) return '−∞';
    if (pista === 'pct0' || pista === 'pct1' || pista === 'pct2') {
      const f = nf(pista);
      const s = sinCeroNegativo(f.format(x * 100));
      // Un límite que no llega a 1 (o no baja a 0) no debe leerse como si lo
      // hiciera: 0.9999 se muestra «> 99.9 %», no «100.0 %».
      const paso = pista === 'pct0' ? 1 : pista === 'pct1' ? 0.1 : 0.01;
      if (x < 1 && x > 0) {
        if (s === f.format(100)) return '> ' + f.format(100 - paso) + SIGNO_PCT[lang];
        if (s === f.format(0)) return '< ' + f.format(paso) + SIGNO_PCT[lang];
      }
      return s + SIGNO_PCT[lang];
    }
    if (pista === 'p') return x < 0.001 ? '< 0.001' : nf('p').format(x);
    // Razones (LR, RR, OR, DOR, HR): dos decimales; tres cifras significativas si |x| < 0.1.
    if (pista === 'lr' || pista === 'x') {
      const s = Math.abs(x) < 0.1 ? nf('sig3').format(x) : nf('dec2').format(x);
      return pista === 'x' ? s + '×' : s;
    }
    return sinCeroNegativo(nf(pista).format(x));
  };

  return {
    lang,
    num,
    ic(ic, pista = 'dec3') {
      if (!ic) return '';
      return num(ic[0], pista) + CONECTOR_IC[lang] + num(ic[1], pista);
    },
    nivel(nivel) {
      return nivelNf.format(nivel * 100) + SIGNO_PCT[lang];
    },
    entero(x) {
      if (!Number.isFinite(x)) return num(x, 'int');
      return sinCeroNegativo(enteroNf.format(x));
    },
  };
}

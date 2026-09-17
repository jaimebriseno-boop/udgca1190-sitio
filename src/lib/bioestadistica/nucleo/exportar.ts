/**
 * Estado en la URL y formatos de salida (CSV y Markdown), sin DOM.
 *
 * La URL es el único «documento» de una calculadora: quien la comparte comparte
 * los datos capturados, y quien la abre ve exactamente el mismo resultado. Por
 * eso el estado se codifica con los mismos identificadores que declara el YAML
 * y se vuelve a leer con el mismo analizador que usa la captura.
 */
import { parsearNumero } from './entrada.ts';
import type { EntradaDef, Entradas, ValorEntrada } from './tipos.ts';

/**
 * Tope de longitud del estado en la URL. Por encima, las columnas pegadas se
 * omiten: hay navegadores y sistemas de correo que truncan enlaces largos y un
 * enlace roto es peor que un enlace sin datos.
 */
export const TOPE_URL = 1500;

/** Separador de las columnas de datos dentro de un parámetro. */
export const SEP_COLUMNA = ';';

/** Un valor de entrada → su forma en la URL. */
function aTexto(v: ValorEntrada): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(SEP_COLUMNA);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);
}

/**
 * Entradas → cadena de consulta (sin el `?` inicial), con los identificadores
 * del YAML como nombres de parámetro. Se omiten las entradas derivadas, que se
 * recalculan al leer. `nivel` viaja como proporción (0.95), no como porcentaje.
 *
 * Si el resultado excede `TOPE_URL`, se reintenta sin las columnas de datos.
 */
function construirEstado(entradas: Entradas, defs: EntradaDef[], conColumnas: boolean): string {
  const p = new URLSearchParams();
  for (const def of defs) {
    if (def.derivado) continue;
    const v = entradas[def.id];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (!conColumnas || v.length === 0) continue;
      p.set(def.id, aTexto(v));
      continue;
    }
    if (typeof v === 'string' && v.trim() === '') continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    p.set(def.id, aTexto(v));
  }
  return p.toString();
}

export function codificarEstado(entradas: Entradas, defs: EntradaDef[]): string {
  return columnasOmitidas(entradas, defs) ? construirEstado(entradas, defs, false) : construirEstado(entradas, defs, true);
}

/**
 * ¿El enlace con estado tiene que soltar la columna pegada por superar
 * `TOPE_URL`? Es exactamente la condición con la que `codificarEstado`
 * reintenta sin columnas; la interfaz la consulta para avisar en el botón
 * «Compartir enlace», porque quien lo pulsa debe saber que comparte la
 * calculadora, no sus datos.
 */
export function columnasOmitidas(entradas: Entradas, defs: EntradaDef[]): boolean {
  const hayColumna = defs.some((def) => {
    const v = entradas[def.id];
    return !def.derivado && Array.isArray(v) && v.length > 0;
  });
  return hayColumna && construirEstado(entradas, defs, true).length > TOPE_URL;
}

/**
 * Cadena de consulta → entradas. Los parámetros desconocidos, vacíos o mal
 * formados se ignoran en silencio: una URL manipulada nunca debe romper la
 * página, solo perder el valor que no se entiende.
 */
export function decodificarEstado(search: string, defs: EntradaDef[]): Partial<Entradas> {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const salida: Partial<Entradas> = {};
  for (const def of defs) {
    if (def.derivado) continue;
    const bruto = p.get(def.id);
    if (bruto === null) continue;
    if (def.tipo === 'opcion') {
      const v = bruto.trim();
      if (v !== '' && (!def.opciones || def.opciones.includes(v))) salida[def.id] = v;
      continue;
    }
    if (def.tipo === 'columna' || def.tipo === 'tabla') {
      const piezas = bruto.split(SEP_COLUMNA).filter((s) => s.trim() !== '');
      const numeros: number[] = [];
      for (const pieza of piezas) {
        const n = parsearNumero(pieza, def);
        if (n === null) continue;
        numeros.push(n);
      }
      if (numeros.length > 0) salida[def.id] = numeros;
      continue;
    }
    // Un selector numérico (p. ej. `corr` con opciones «0» y «0.5») solo admite
    // sus opciones: un valor ajeno se ignora, no se añade al desplegable.
    if (def.opciones && !def.opciones.includes(bruto.trim())) continue;
    const n = parsearNumero(bruto, def);
    if (n !== null) salida[def.id] = n;
  }
  return salida;
}

/** ¿La URL trae al menos una entrada de esta calculadora? */
export function hayEstado(search: string, defs: EntradaDef[]): boolean {
  return Object.keys(decodificarEstado(search, defs)).length > 0;
}

/** Campo de CSV: se entrecomilla solo cuando hace falta y las comillas se duplican. */
/**
 * Un valor formateado por la propia calculadora: número con signo opcional,
 * separadores, `%` y, si es un intervalo, «a»/«to» y otro número. Es lo único
 * que puede empezar por `-` o `+` sin ser una fórmula.
 */
const VALOR_FORMATEADO = /^[-+−]?\d[\d.,]*\s?%?(\s(a|to)\s[-+−]?\d[\d.,]*\s?%?)?$/;

/**
 * Excel y LibreOffice ejecutan como fórmula una celda que empiece por `=`, `+`,
 * `-`, `@`, tabulador o retorno de carro (inyección CSV). Hoy el CSV solo lleva
 * rótulos del YAML y números formateados; el día que lleve texto capturado, la
 * defensa ya está: se antepone un apóstrofo, que las hojas de cálculo tratan
 * como marca de texto.
 */
function neutralizarFormula(s: string): string {
  if (!/^[=+\-@\t\r]/.test(s)) return s;
  if (/^[-+]/.test(s) && VALOR_FORMATEADO.test(s)) return s;
  return `'${s}`;
}

function campoCsv(v: string): string {
  const s = neutralizarFormula(String(v ?? ''));
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Filas → CSV con BOM de UTF-8, coma como separador y CRLF como fin de línea:
 * la combinación que Excel abre sin pasar por el asistente de importación y sin
 * romper los acentos.
 */
export function aCSV(filas: string[][]): string {
  return '﻿' + filas.map((f) => f.map(campoCsv).join(',')).join('\r\n');
}

/** Celda de tabla de Markdown: la barra vertical se escapa para no partir la fila. */
function celdaMd(v: string): string {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export interface DatosMarkdown {
  titulo: string;
  /** URL canónica con el estado capturado. */
  url: string;
  /** Pares [rótulo, valor] de lo capturado. */
  entradas: Array<[string, string]>;
  /** Filas [medida, estimación, intervalo] de los resultados. */
  resumen: Array<[string, string, string]>;
  interpretacion: string[];
  metodos: string;
  codigoR: string;
  /** Cadenas `bio.ui.*` del idioma (encabezados de las tablas y títulos). */
  ui: Record<string, string>;
  cita: string;
}

/**
 * Resultado completo en Markdown, listo para pegar en un manuscrito, en una
 * libreta o en un mensaje: entradas, resultados con intervalo, interpretación,
 * párrafo de Métodos, código R reproducible, cita y enlace con los datos.
 */
export function aMarkdown(d: DatosMarkdown): string {
  const u = (k: string): string => d.ui[k] ?? k;
  const bloques: string[] = [`# ${d.titulo}`];

  // Las entradas van como lista y no como tabla: el diccionario de interfaz no
  // tiene rótulos de encabezado para ellas y una tabla de dos columnas sin
  // títulos se lee peor que un par «rótulo: valor».
  if (d.entradas.length > 0) {
    const filas = d.entradas.map(([k, v]) => `- **${celdaMd(k)}:** ${celdaMd(v)}`);
    bloques.push([`## ${u('entradas')}`, '', ...filas].join('\n'));
  }

  if (d.resumen.length > 0) {
    const filas = d.resumen.map(([m, e, ic]) => `| ${celdaMd(m)} | ${celdaMd(e)} | ${celdaMd(ic)} |`);
    bloques.push(
      [
        `## ${u('resultados')}`,
        '',
        `| ${celdaMd(u('medida'))} | ${celdaMd(u('estimacion'))} | ${celdaMd(u('ic'))} |`,
        '| --- | --- | --- |',
        ...filas,
      ].join('\n'),
    );
  }

  if (d.interpretacion.length > 0) {
    bloques.push([`## ${u('interpretacion')}`, '', ...d.interpretacion].join('\n\n'));
  }
  if (d.metodos) bloques.push([`## ${u('metodos')}`, '', d.metodos].join('\n\n'));
  if (d.codigoR) bloques.push([`## ${u('codigo_r')}`, '', '```r', d.codigoR.replace(/\s+$/, ''), '```'].join('\n'));
  bloques.push([`## ${u('url_estado')}`, '', `<${d.url}>`].join('\n\n'));
  const pie = ['---', d.cita, u('generado_por')].filter((s) => s !== '');
  bloques.push(pie.join('\n\n'));

  return bloques.join('\n\n') + '\n';
}

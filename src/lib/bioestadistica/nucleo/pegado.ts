/**
 * Columna pegada: el texto que alguien copia de Excel, de Google Sheets, de un
 * `.csv` o de una tabla de un artículo → la lista de números que lee la
 * calculadora, sin DOM y sin `Intl`.
 *
 * La regla de fondo es la misma que en `entrada.ts`: la persona no tiene que
 * limpiar sus datos para poder usarlos. Se aceptan el salto de línea, el
 * tabulador, el punto y coma y la coma como separadores; la coma decimal
 * («1,5»); las comillas que una hoja de cálculo añade a una celda; el
 * encabezado de la columna; y los huecos («NA», vacío, «.», «#N/A»). Lo que no
 * se entiende no se adivina: se cuenta y se dice en el resumen, para que quien
 * pega vea de inmediato cuántos valores se leyeron y qué se quedó fuera.
 *
 * Lo que este módulo NO hace: analizar CSV completo (comillas con separadores
 * dentro, escapes), reordenar columnas ni imputar faltantes. Un pegado con
 * varias columnas se resuelve tomando la primera y avisando.
 */
import { parsearNumero } from './entrada.ts';
import type { EntradaDef } from './tipos.ts';

/**
 * Cada celda se lee con el mismo analizador que un campo suelto de tipo
 * `decimal`: así la coma decimal, los espacios de miles (incluidos el fino y el
 * duro), el menos tipográfico y el signo `%` se resuelven en un solo lugar.
 */
const DEF_CELDA: EntradaDef = { id: 'x', tipo: 'decimal', requerido: false, derivado: false };

/**
 * Marcadores de dato faltante, comparados sin distinguir mayúsculas. A los de
 * la especificación se añaden `#N/D` (el «no disponible» del Excel en español),
 * el guion corto `–` y el menos tipográfico `−`: son el mismo hueco escrito con
 * otro carácter, y sin ellos acabarían contados como texto omitido.
 */
const FALTANTES = new Set(['', 'NA', 'NAN', 'N/A', '#N/A', '#¡N/A', '#N/D', 'NULL', '.', '-', '–', '—', '−']);

/**
 * Una línea cuya única coma es decimal: `1,5`, `-0,25`. Mientras TODAS las
 * líneas con coma cumplan este patrón, la coma es el separador decimal y no el
 * de columnas. Se admiten también el más y el menos tipográfico porque
 * `parsearNumero` los entiende.
 */
const COMA_DECIMAL = /^[+\-−]?\d+,\d+$/;

/** Comillas con las que una hoja de cálculo envuelve una celda. */
const COMILLAS: Array<[string, string]> = [
  ['"', '"'],
  ['“', '”'],
];

/** Textos omitidos que muestra el resumen, y longitud máxima de cada uno. */
const MAX_LISTA = 3;
const MAX_TEXTO = 12;

export interface ResultadoPegado {
  /** Números reconocidos, en el orden en que aparecen. */
  valores: number[];
  /** Celdas vacías o marcadas como faltantes (`NA`, `N/A`, `#N/A`, `null`, `.`, `-`, `—`…). */
  faltantes: number;
  /** Tokens no numéricos que no son faltantes ni encabezado (se omiten). */
  ignorados: string[];
  /** Primera celda cuando es texto no numérico (encabezado de la columna), si la hubo. */
  encabezado?: string;
  /** true si el texto traía varias columnas (tab o «;» o coma como separador) y se usó la primera. */
  variasColumnas: boolean;
}

/**
 * Texto → líneas con contenido en los extremos recortadas: un pegado siempre
 * termina en salto de línea y ese hueco final no es un dato faltante. Las
 * líneas vacías de EN MEDIO sí se conservan: son celdas vacías de la columna y
 * deben contarse como faltantes.
 */
function enLineas(texto: string): string[] {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  let inicio = 0;
  let fin = lineas.length;
  while (inicio < fin && lineas[inicio].trim() === '') inicio += 1;
  while (fin > inicio && lineas[fin - 1].trim() === '') fin -= 1;
  return lineas.slice(inicio, fin);
}

/** Recorta espacios y quita las comillas envolventes, con `""` → `"` dentro. */
function limpiarCelda(celda: string): string {
  const s = celda.trim();
  for (const [abre, cierra] of COMILLAS) {
    if (s.length >= 2 && s.startsWith(abre) && s.endsWith(cierra)) {
      return s.slice(1, -1).replace(/""/g, '"').trim();
    }
  }
  return s;
}

function esFaltante(celda: string): boolean {
  return FALTANTES.has(celda.toUpperCase());
}

/**
 * Separador de columnas por prioridad: tabulador > `;` > coma. La coma es la
 * dudosa, porque en español es el separador decimal: solo cuenta como
 * separador si alguna línea con coma no es un número con coma decimal
 * (`1, 2, 3` y `1,2,3` sí lo son; `1,5` y `2,5` no).
 */
function detectarSeparador(lineas: string[]): string | null {
  const conContenido = lineas.filter((l) => l.trim() !== '');
  if (conContenido.some((l) => l.includes('\t'))) return '\t';
  if (conContenido.some((l) => l.includes(';'))) return ';';
  const conComa = conContenido.filter((l) => l.includes(','));
  if (conComa.length === 0) return null;
  return conComa.every((l) => COMA_DECIMAL.test(limpiarCelda(l))) ? null : ',';
}

/** Quita las celdas vacías del final de un pegado horizontal (`1;2;3;`). */
function sinColaVacia(celdas: string[]): string[] {
  let fin = celdas.length;
  while (fin > 0 && celdas[fin - 1] === '') fin -= 1;
  return celdas.slice(0, fin);
}

/**
 * Texto pegado → números, faltantes, texto omitido, encabezado y aviso de
 * varias columnas. Nunca lanza: un pegado incomprensible devuelve una lista
 * vacía, que es lo que el controlador convierte en un error de captura.
 */
export function parsearPegado(texto: string): ResultadoPegado {
  const resultado: ResultadoPegado = { valores: [], faltantes: 0, ignorados: [], variasColumnas: false };
  const lineas = enLineas(texto);
  if (lineas.length === 0) return resultado;

  const sep = detectarSeparador(lineas);
  let celdas: string[];
  if (sep === null) {
    // Una celda por línea: el caso corriente de una columna copiada.
    celdas = lineas.map(limpiarCelda);
  } else if (lineas.length === 1) {
    // Pegado horizontal («1, 2, 3»): cada celda es un valor de la serie, no
    // una columna distinta, así que no se avisa de varias columnas.
    celdas = sinColaVacia(lineas[0].split(sep).map(limpiarCelda));
  } else {
    // Varias líneas con separador: es una tabla y se usa su primera columna.
    celdas = [];
    for (const linea of lineas) {
      const partes = linea.split(sep).map(limpiarCelda);
      celdas.push(partes[0] ?? '');
      // Un tabulador suelto al final de la línea no es una segunda columna.
      if (partes.slice(1).some((p) => p !== '')) resultado.variasColumnas = true;
    }
  }

  for (let i = 0; i < celdas.length; i += 1) {
    const celda = celdas[i];
    if (esFaltante(celda)) {
      resultado.faltantes += 1;
      continue;
    }
    const n = parsearNumero(celda, DEF_CELDA);
    if (n !== null) {
      resultado.valores.push(n);
      continue;
    }
    // La primera celda con texto es el nombre de la variable, no un error de
    // quien pega: se retira del recuento y se nombra en el resumen.
    if (i === 0) {
      resultado.encabezado = celda;
      continue;
    }
    resultado.ignorados.push(celda);
  }

  return resultado;
}

/** Sustituye `{clave}` por su valor; deja intacto lo que no se nombra. */
function interpolar(plantilla: string, params: Record<string, string>): string {
  let s = plantilla;
  for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v);
  return s;
}

/** Texto omitido, acortado para que el resumen quepa en una línea. */
function recortar(texto: string): string {
  return texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO - 1)}…` : texto;
}

/**
 * Lista de textos omitidos entre comillas rectas, hasta tres. Las comillas son
 * las mismas en los dos idiomas: el texto va dentro de una cadena que ya lleva
 * las suyas y anidar «…» con “…” se lee peor que repetir "…".
 */
function listaDeTextos(textos: string[]): string {
  const piezas = textos.slice(0, MAX_LISTA).map((t) => `"${recortar(t)}"`);
  if (textos.length > MAX_LISTA) piezas.push('…');
  return piezas.join(', ');
}

/**
 * Resumen de una línea de lo que se leyó: «40 valores leídos · 2 faltantes
 * omitidos · 1 no numéricos omitidos ("edad") · encabezado «plaquetas» omitido
 * · varias columnas: se usó la primera».
 *
 * El número de valores va siempre, aunque sea 0: quien pega necesita ver que la
 * calculadora leyó algo tanto como qué se quedó fuera. `ui` son las cadenas
 * `bio.ui.*` del idioma de la página y `fmt`, su formateador de enteros.
 */
export function resumenPegado(
  r: ResultadoPegado,
  ui: Record<string, string>,
  fmt: { entero(x: number): string },
): string {
  const texto = (clave: string, params: Record<string, string> = {}): string =>
    interpolar(ui[clave] ?? clave, params);

  const piezas: string[] = [texto('pegado_n', { n: fmt.entero(r.valores.length) })];
  if (r.faltantes > 0) piezas.push(texto('pegado_faltantes', { k: fmt.entero(r.faltantes) }));
  if (r.ignorados.length > 0) {
    piezas.push(texto('pegado_ignorados', { k: fmt.entero(r.ignorados.length), lista: listaDeTextos(r.ignorados) }));
  }
  if (r.encabezado !== undefined) piezas.push(texto('pegado_encabezado', { h: recortar(r.encabezado) }));
  if (r.variasColumnas) piezas.push(texto('pegado_varias_columnas'));
  return piezas.join(' · ');
}

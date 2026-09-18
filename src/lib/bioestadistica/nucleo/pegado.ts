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
 * dentro, escapes), reordenar columnas ni imputar faltantes. En una columna, un
 * pegado con varias columnas se resuelve tomando la primera y avisando; una
 * tabla de conteos entera se lee con `parsearTablaPegada`, al final del archivo.
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

/**
 * Un número con la coma de miles y, si acaso, punto decimal (`1,234`,
 * `12,345.6`) o con el punto de miles y coma decimal (`1.234,5`): en ninguno
 * de los dos la coma separa columnas.
 */
const MILES_COMA = /^[+\-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$|^[+\-−]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/;

/**
 * Un número con UN espacio de miles (`1 234`, `12 345,6`), incluido el fino y
 * el duro: la única forma en que un espacio dentro de una celda no separa
 * valores. `parsearNumero` lo quita al leer. Con dos o más huecos («150 160
 * 170», «1 234 567») el espacio se lee como separador: en una columna pegada es
 * mucho más probable una serie de valores que un millón escrito con espacios.
 */
const MILES_ESPACIO = /^[+\-−]?\d{1,3}\s\d{3}(?:[.,]\d+)?$/;

/** Separador de columnas: un carácter o, para el espacio, una expresión regular. */
type Separador = string | RegExp;

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
 * Separador de columnas por prioridad: tabulador > `;` > coma seguida de
 * espacio (`1, 2, 3`) > espacios > coma a secas.
 *
 * Los dos dudosos son el espacio y la coma. El espacio separa valores
 * («150 160 170», una tabla de un PDF) salvo que TODAS las líneas con espacio
 * interno sean números con espacios de miles («1 234»): sin esta regla,
 * `parsearNumero` los quitaba y «1 2 3» se leía como 123 sin ningún aviso. La
 * coma es en español el separador decimal: solo cuenta como separador si
 * alguna línea con coma no es un número con coma decimal («1,5») ni con coma
 * de miles («1,234.5»).
 */
function detectarSeparador(lineas: string[]): Separador | null {
  const conContenido = lineas.filter((l) => l.trim() !== '');
  if (conContenido.some((l) => l.includes('\t'))) return '\t';
  if (conContenido.some((l) => l.includes(';'))) return ';';
  if (conContenido.some((l) => /,\s/.test(l.trim()))) return ',';
  const conEspacio = conContenido.filter((l) => /\S\s+\S/.test(l.trim()));
  if (conEspacio.length > 0 && !conEspacio.every((l) => MILES_ESPACIO.test(limpiarCelda(l)))) return /\s+/;
  const conComa = conContenido.filter((l) => l.includes(','));
  if (conComa.length === 0) return null;
  // Aquí toda línea con espacio interno es ya un número con espacio de miles
  // (si no, el paso anterior habría elegido el espacio): se retira antes de
  // mirar la coma, para que «12 345,6» siga siendo un solo valor.
  const esNumero = (l: string): boolean => {
    const celda = limpiarCelda(l).replace(/\s+/g, '');
    return COMA_DECIMAL.test(celda) || MILES_COMA.test(celda);
  };
  return conComa.every(esNumero) ? null : ',';
}

/** Parte una línea por el separador; con espacios, sin contar los de los extremos. */
function partir(linea: string, sep: Separador): string[] {
  return (sep instanceof RegExp ? linea.trim() : linea).split(sep);
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
    celdas = sinColaVacia(partir(lineas[0], sep).map(limpiarCelda));
  } else {
    // Varias líneas con separador: es una tabla y se usa su primera columna.
    celdas = [];
    for (const linea of lineas) {
      const partes = partir(linea, sep).map(limpiarCelda);
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

// ---------------------------------------------------------------------------
// Tabla k×k pegada
// ---------------------------------------------------------------------------

/**
 * Una tabla de conteos copiada de una hoja de cálculo: varias columnas por
 * línea, a diferencia de `parsearPegado`, que se queda con la primera. Lo usa
 * una calculadora de concordancia (kappa), donde la tabla es cuadrada y las
 * categorías van en el mismo orden en filas y columnas.
 *
 * Aquí una fila es la unidad: si una celda está vacía, marcada como faltante o
 * no es un número, la fila entera se descarta y se cuenta. En una columna suelta
 * un hueco se puede omitir sin más; en una tabla de conteos, una fila a la que
 * le falta una celda ya no dice de cuántos casos habla, y rellenarla con un 0
 * sería inventar datos.
 *
 * La cuadratura NO se comprueba aquí: este módulo lee lo que hay y la
 * calculadora decide si le sirve (`err_tabla_cuadrada`). Nunca lanza.
 */
export interface ResultadoTabla {
  /** Filas de números leídas (cada fila una lista); una celda faltante o no numérica descarta la fila entera. */
  filas: number[][];
  /** Número de filas descartadas por traer una celda vacía, faltante o no numérica. */
  filasDescartadas: number;
  /** Rótulos retirados: la fila de encabezado si la hubo; si no, los de la primera columna. */
  encabezado?: string[];
  /** true si las filas leídas no tienen todas el mismo número de columnas. */
  irregular: boolean;
}

/** ¿La celda es un rótulo? (texto que no es un número ni una marca de hueco). */
function esRotulo(celda: string): boolean {
  return !esFaltante(celda) && parsearNumero(celda, DEF_CELDA) === null;
}

/**
 * ¿La fila es de encabezados? Ninguna de sus celdas es un número y al menos una
 * es texto de verdad. La segunda condición evita que una primera fila de huecos
 * («NA NA NA») pase por encabezado en vez de contarse como fila descartada.
 */
function esFilaDeRotulos(fila: string[]): boolean {
  return fila.every((c) => parsearNumero(c, DEF_CELDA) === null) && fila.some(esRotulo);
}

/**
 * Quita las columnas vacías del final que tienen TODAS las filas: un tabulador
 * o un «;» de más al final de cada línea es un resto del copiado, no una
 * columna. Si la celda vacía está solo en algunas filas se conserva, porque
 * entonces sí es un dato que falta.
 */
function sinColaVaciaComun(matriz: string[][]): string[][] {
  let m = matriz;
  while (m.length > 0 && m.every((f) => f.length > 1 && f[f.length - 1] === '')) {
    m = m.map((f) => f.slice(0, -1));
  }
  return m;
}

/**
 * Texto pegado → filas de números, filas descartadas, rótulos e indicación de
 * filas de distinta longitud. Un texto vacío devuelve la tabla vacía.
 *
 * El separador se decide con la misma regla que en una columna (tabulador >
 * «;» > coma seguida de espacio > espacios > coma), de modo que el pegado de
 * Excel, el de un `.csv` y el de una tabla de un PDF se leen igual. Las líneas
 * en blanco se saltan: en una tabla son separación, no una fila sin datos.
 */
export function parsearTablaPegada(texto: string): ResultadoTabla {
  const resultado: ResultadoTabla = { filas: [], filasDescartadas: 0, irregular: false };
  const lineas = enLineas(texto).filter((l) => l.trim() !== '');
  if (lineas.length === 0) return resultado;

  let sep = detectarSeparador(lineas);
  // En una tabla de CONTEOS «10,2» no es el decimal 10.2 sino dos casillas: si
  // nada más separa y toda coma parte enteros no negativos, la coma separa. En
  // una columna rige la regla contraria (coma decimal) y sigue en `parsearPegado`.
  if (sep === null && lineas.some((l) => l.includes(','))) {
    const enteras = lineas.every((l) => l.split(',').every((c) => /^\d+$/.test(limpiarCelda(c).trim())));
    if (enteras) sep = ',';
  }
  let matriz = sinColaVaciaComun(
    lineas.map((l) => (sep === null ? [limpiarCelda(l)] : partir(l, sep).map(limpiarCelda))),
  );

  // Fila de encabezado: solo si debajo queda algo que leer.
  let encabezado: string[] | undefined;
  if (matriz.length > 1 && esFilaDeRotulos(matriz[0])) {
    encabezado = matriz[0];
    matriz = matriz.slice(1);
  }

  // Columna de rótulos: la primera celda de TODAS las filas es texto. Basta que
  // una traiga un número para no retirar nada, que es lo prudente.
  const anchoConRotulos = matriz[0]?.length ?? 0;
  if (matriz.length > 0 && matriz.every((f) => f.length > 1 && esRotulo(f[0]))) {
    const rotulos = matriz.map((f) => f[0]);
    matriz = matriz.map((f) => f.slice(1));
    // Con encabezado y rótulos a la vez, la primera celda del encabezado es la
    // esquina de la tabla (casi siempre vacía) y sobra; si el encabezado ya
    // venía sin ella, se deja como está.
    if (encabezado === undefined) encabezado = rotulos;
    else if (encabezado.length === anchoConRotulos) encabezado = encabezado.slice(1);
  }
  if (encabezado !== undefined) resultado.encabezado = encabezado;

  for (const fila of matriz) {
    const numeros: number[] = [];
    let completa = fila.length > 0;
    for (const celda of fila) {
      const n = esFaltante(celda) ? null : parsearNumero(celda, DEF_CELDA);
      if (n === null) {
        completa = false;
        break;
      }
      numeros.push(n);
    }
    if (completa) resultado.filas.push(numeros);
    else resultado.filasDescartadas += 1;
  }

  const ancho = resultado.filas[0]?.length ?? 0;
  resultado.irregular = resultado.filas.some((f) => f.length !== ancho);
  return resultado;
}

/**
 * Resumen de una línea de la tabla leída: «Tabla de 3 × 3 leída · 1 filas
 * descartadas · encabezado omitido · filas de distinta longitud».
 *
 * Como en una columna, el tamaño va siempre, aunque sea 0 × 0: quien pega
 * necesita ver de inmediato qué entendió la calculadora. Con filas de distinta
 * longitud, el número de columnas es el de la fila más ancha.
 */
/**
 * ¿Las filas leídas forman una tabla cuadrada (k filas de k celdas)? El
 * controlador lo comprueba ANTES de aplanar: una fila de cuatro celdas (1 × 4)
 * o una tabla de 2 × 8 tienen un número cuadrado de celdas y, aplanadas,
 * pasarían por 2 × 2 o 4 × 4 sin que nadie lo note.
 */
export function esCuadrada(filas: readonly (readonly number[])[]): boolean {
  return filas.length > 0 && filas.every((f) => f.length === filas.length);
}

export function resumenTabla(
  r: ResultadoTabla,
  ui: Record<string, string>,
  fmt: { entero(x: number): string },
): string {
  const texto = (clave: string, params: Record<string, string> = {}): string =>
    interpolar(ui[clave] ?? clave, params);

  const columnas = r.filas.reduce((max, f) => Math.max(max, f.length), 0);
  const piezas: string[] = [texto('tabla_leida', { f: fmt.entero(r.filas.length), c: fmt.entero(columnas) })];
  if (r.filasDescartadas > 0) piezas.push(texto('tabla_descartadas', { k: fmt.entero(r.filasDescartadas) }));
  if (r.encabezado !== undefined) piezas.push(texto('tabla_encabezado'));
  if (r.irregular) piezas.push(texto('tabla_irregular'));
  return piezas.join(' · ');
}

/**
 * Lista plana de una tabla → texto del campo, para escribir el ejemplo o lo que
 * trae la URL: k filas de k celdas separadas por tabulador si la lista es
 * cuadrada; si no, una celda por línea, que al volver a leerse devuelve los
 * mismos números en el mismo orden.
 */
export function textoDeTabla(valores: readonly number[]): string {
  const k = Math.round(Math.sqrt(valores.length));
  if (k >= 2 && k * k === valores.length) {
    const filas: string[] = [];
    for (let i = 0; i < k; i += 1) filas.push(valores.slice(i * k, (i + 1) * k).join('\t'));
    return filas.join('\n');
  }
  return valores.join('\n');
}

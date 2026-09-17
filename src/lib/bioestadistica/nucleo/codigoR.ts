/**
 * Plantillas de código R: relleno de marcadores y lectura del JSON que imprime
 * el snippet.
 *
 * Principio del motor: el texto de R que se prueba es, byte a byte, el que ve
 * el usuario. Este módulo es el único punto donde una plantilla se convierte en
 * código ejecutable, y lo usan por igual la página (bloque copiable), webR y el
 * generador de fixtures (`scripts/bio-fixtures.mjs`). No hay «modos» ni
 * transformaciones según el destino.
 *
 * Puro: sin DOM, sin `Intl`, sin acceso al sistema de archivos. El hash SHA-256
 * de una plantilla NO se calcula aquí (el navegador no lo necesita): lo produce
 * el script de Node con `node:crypto`.
 */
import type { Entradas, ValorEntrada } from './tipos.ts';

/**
 * Marcador de plantilla: identificador en minúsculas entre llaves, sin espacios
 * (`{x}`, `{nivel}`, `{corr}`). Las llaves propias de R (`function(x, n) {` con
 * espacio o salto de línea después) nunca casan con este patrón.
 */
export const MARCADOR = /\{([a-z][a-z0-9_]*)\}/g;

/**
 * Número a literal de R. `String(x)` en JavaScript es la representación decimal
 * más corta que reconstruye el mismo doble, y el analizador de R la lee de
 * vuelta al mismo valor: la plantilla rellenada no pierde precisión.
 *
 * @throws {RangeError} si `x` no es finito (NaN, ±Infinity no tienen literal).
 */
export function num(x: number): string {
  if (!Number.isFinite(x)) throw new RangeError(`entrada no finita: ${String(x)}`);
  return String(x);
}

/** Literal de R para un valor de entrada. Los vectores exigen `rScript`. */
function literal(clave: string, v: ValorEntrada): string {
  if (typeof v === 'number') return num(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return JSON.stringify(v);
  throw new TypeError(
    `la entrada {${clave}} es un vector; una plantilla de texto no puede interpolarlo: usa rScript(entradas)`,
  );
}

/**
 * Contrato del snippet: debe construir `res` como lista e imprimirlo en JSON,
 * porque de eso viven el comparador, los fixtures y el motor webR.
 *
 * @throws {Error} si falta cualquiera de las dos marcas.
 */
function verificarContrato(codigo: string): void {
  if (!/^res <- list\(/m.test(codigo) || !codigo.includes('cat(toJSON(res')) {
    throw new Error('el snippet rompe el contrato: falta `res <- list(` al inicio de línea o `cat(toJSON(res`');
  }
}

/**
 * Sustituye cada `{marcador}` de la plantilla por el literal de R de la entrada
 * del mismo nombre y verifica el contrato del snippet.
 *
 * Un `{ident}` sin entrada correspondiente detiene el relleno en vez de dejar
 * texto a medias; así también se detecta un `{x}` accidental del código R.
 *
 * @throws {Error} si queda un marcador sin entrada o si se rompe el contrato.
 * @throws {RangeError} si una entrada numérica no es finita.
 */
export function rellenarR(codigo: string, entradas: Entradas): string {
  const s = codigo.replace(MARCADOR, (_m, clave: string) => {
    if (!Object.prototype.hasOwnProperty.call(entradas, clave)) {
      throw new Error(`marcador {${clave}} sin entrada`);
    }
    return literal(clave, entradas[clave] as ValorEntrada);
  });
  verificarContrato(s);
  return s;
}

/** Plantilla de R de una calculadora: texto con marcadores o generador programático. */
export interface PlantillaR {
  /** Slug de la calculadora (igual al del YAML). */
  id?: string;
  /** Paquetes que el snippet carga con `library()`; se instalan en webR. */
  paquetes?: readonly string[];
  /** Plantilla de texto del YAML, con `{marcadores}`. */
  codigo?: string;
  /** Alternativa programática (vectores pegados, modelos, KM); anula `codigo`. */
  rScript?: (e: Entradas) => string;
  /** Claves de `res` en el JSON de salida. */
  campos?: readonly string[];
}

/**
 * Código R definitivo de una calculadora para unas entradas concretas.
 * `rScript` tiene prioridad sobre `codigo`; ambas rutas pasan por el contrato.
 */
export function codigoR(plantilla: PlantillaR, entradas: Entradas): string {
  if (plantilla.rScript) {
    const s = plantilla.rScript(entradas);
    verificarContrato(s);
    return s;
  }
  if (plantilla.codigo === undefined) {
    throw new Error('la plantilla no tiene `codigo` ni `rScript`');
  }
  return rellenarR(plantilla.codigo, entradas);
}

/**
 * Valores especiales tal como los serializa jsonlite 2.0.0 con `digits = NA`
 * (verificado en R 4.5.2): `Inf`, `-Inf` y `NaN` viajan como cadena; `NA`
 * lógico viaja como `null` y `NA_real_` como la cadena `"NA"`.
 */
const ESPECIALES: Readonly<Record<string, number | null>> = {
  Inf: Number.POSITIVE_INFINITY,
  '-Inf': Number.NEGATIVE_INFINITY,
  NaN: Number.NaN,
  NA: null,
};

/**
 * Convierte, en todo el árbol, los centinelas de jsonlite en los valores de
 * JavaScript equivalentes. `NA` se representa como `null`, que el comparador
 * trata igual que `NaN` («no definido»).
 */
export function normalizarR(valor: unknown): unknown {
  if (typeof valor === 'string') {
    return Object.prototype.hasOwnProperty.call(ESPECIALES, valor) ? ESPECIALES[valor] : valor;
  }
  if (Array.isArray(valor)) return valor.map(normalizarR);
  if (valor !== null && typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) salida[k] = normalizarR(v);
    return salida;
  }
  return valor;
}

/** JSON impreso por un snippet de R → estructura con `Infinity`, `NaN` y `null` ya resueltos. */
export function parsearJsonR(texto: string): unknown {
  return normalizarR(JSON.parse(texto) as unknown);
}

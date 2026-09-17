/**
 * Lectura y validación de un campo de captura, sin DOM: el controlador le pasa
 * el texto tal cual lo escribió la persona y recibe un número o un código de
 * error (`bio.ui.err_*`), nunca un mensaje ya traducido.
 *
 * Tolerancia deliberada en la captura (la misma que aplica Laboratorio): coma
 * decimal, espacios de miles —incluidos el fino U+202F y el duro U+00A0—, signo
 * menos tipográfico U+2212 y signo de porcentaje. Un nivel de confianza escrito
 * como «95» se entiende como 0.95; escrito como «0.95», también.
 */
import type { EntradaDef } from './tipos.ts';

/** Números admitidos tras normalizar: entero, decimal o notación científica. */
const NUMERO = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Espacios que una hoja de cálculo o un teclado pueden colar entre los miles. */
const ESPACIOS = /[\s   ]/g;

/**
 * Normaliza el texto a la forma que entiende `Number`: quita espacios y el
 * signo `%`, convierte el menos tipográfico y resuelve la coma decimal.
 *
 * Con coma y punto a la vez manda el signo que esté más a la derecha: en
 * «1,234.5» el punto es decimal y la coma agrupa miles; en «1.234,5» (el
 * convenio de buena parte del público hispanohablante) la coma es decimal y el
 * punto agrupa miles. Con un solo tipo de signo: si aparece una sola vez es el
 * decimal («0,95», «1.5»); si se repite («1.234.567», «1,234,567») agrupa miles.
 */
function normalizar(texto: string): string {
  const s = texto.replace(ESPACIOS, '').replace(/[−‒–—]/g, '-').replace(/%$/, '');
  const comas = (s.match(/,/g) ?? []).length;
  const puntos = (s.match(/\./g) ?? []).length;
  if (comas > 0 && puntos > 0) {
    // El signo de más a la derecha es el decimal; el otro debe agrupar de tres
    // en tres, o el texto no es un número («1,23.4» se rechaza).
    if (/^[+-]?\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) return s.replace(/,/g, '');
    if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) return s.replace(/\./g, '').replace(',', '.');
    return s;
  }
  if (comas === 1) return s.replace(',', '.');
  if (comas > 1) return /^[+-]?\d{1,3}(?:,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s;
  if (puntos > 1) return /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  return s;
}

/**
 * Porcentaje → proporción sin el ruido de la coma flotante: `99.9 / 100` da
 * 0.9990000000000001 en binario y un nivel de confianza así se saldría del
 * máximo declarado en el YAML (0.999). Quince cifras significativas son las que
 * un doble representa sin ambigüedad.
 */
function dividirEntreCien(n: number): number {
  return Number((n / 100).toPrecision(15));
}

/**
 * Texto capturado → número, o `null` si no es un número.
 *
 * Reglas por tipo de entrada:
 * - `proporcion`: «95 %» y «95» valen 0.95 (cualquier valor > 1 se lee como
 *   porcentaje); «0.95» se respeta.
 * - `porcentaje`: se conserva la escala 0–100 y solo se retira el signo `%`.
 * - `entero`: estricto, sin conversión alguna. «3.5» se devuelve como 3.5 para
 *   que `validarEntrada` lo rechace con `err_entero` y no con `err_numero`.
 */
export function parsearNumero(texto: string, def: EntradaDef): number | null {
  const bruto = texto.trim();
  if (bruto === '') return null;
  const s = normalizar(bruto);
  if (!NUMERO.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (def.tipo === 'proporcion') {
    const porcentaje = bruto.includes('%') || n > 1;
    return porcentaje ? dividirEntreCien(n) : n;
  }
  return n;
}

/**
 * Valida el texto capturado de un campo y devuelve el código del error
 * (`err_requerido`, `err_numero`, `err_entero`, `err_min`, `err_max`,
 * `err_proporcion`) o `null` si es válido. Los rangos declarados en el YAML
 * (`min`/`max`) se comprueban sobre el valor ya convertido.
 */
export function validarEntrada(valor: string, def: EntradaDef): string | null {
  const bruto = valor.trim();
  if (bruto === '') return def.requerido ? 'err_requerido' : null;
  const n = parsearNumero(bruto, def);
  if (n === null) return 'err_numero';
  if (def.tipo === 'entero' && !Number.isInteger(n)) return 'err_entero';
  if (def.tipo === 'proporcion' && (n < 0 || n > 1)) return 'err_proporcion';
  if (def.min !== undefined && n < def.min) return 'err_min';
  if (def.max !== undefined && n > def.max) return 'err_max';
  return null;
}

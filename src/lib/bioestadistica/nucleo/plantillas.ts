/**
 * Plantillas de texto del contenido bilingüe: `{var}` se rellena con valores YA
 * formateados por `presentar()` (así el YAML no lleva especificadores de
 * formato) y `{ref:key}` con el número de la lista de referencias, de modo que
 * el párrafo de Métodos cita con los mismos números que la lista.
 *
 * Un marcador sin valor es un error de contenido y se lanza (lo detectan las
 * pruebas de paridad, nunca el usuario).
 */

const MARCADOR = /\{([a-z][a-z0-9_]*)\}/g;
const REF = /\{ref:([A-Za-z0-9_:-]+)\}/g;

/** Marcadores `{var}` (sin los `{ref:key}`) que contiene una plantilla, sin repetir y en orden de aparición. */
export function marcadores(plantilla: string): string[] {
  const vistos = new Set<string>();
  for (const m of plantilla.matchAll(MARCADOR)) vistos.add(m[1]);
  return [...vistos];
}

/** Claves `{ref:key}` que contiene una plantilla. */
export function referencias(plantilla: string): string[] {
  const vistos = new Set<string>();
  for (const m of plantilla.matchAll(REF)) vistos.add(m[1]);
  return [...vistos];
}

/**
 * Rellena `{ref:key}` con `refs[key]` y `{var}` con `vars[var]`.
 * @throws Error si falta una variable o una referencia.
 */
export function rellenar(
  plantilla: string,
  vars: Record<string, string | number>,
  refs: Record<string, number> = {},
): string {
  const conRefs = plantilla.replace(REF, (_m, key: string) => {
    const n = refs[key];
    if (n === undefined) throw new Error(`plantilla: referencia {ref:${key}} sin número en la lista`);
    return String(n);
  });
  return conRefs.replace(MARCADOR, (_m, k: string) => {
    if (!(k in vars)) throw new Error(`plantilla: marcador {${k}} sin valor`);
    return String(vars[k]);
  });
}

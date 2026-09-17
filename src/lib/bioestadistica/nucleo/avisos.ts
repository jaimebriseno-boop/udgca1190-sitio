/**
 * Texto de los avisos: la plantilla bilingüe del YAML con sus parámetros
 * puestos.
 *
 * Vive aquí, en la capa pura, porque el mismo aviso se escribe DOS veces: la
 * página lo resuelve en build para el ejemplo (SSR) y el controlador lo repinta
 * en el navegador con cada cambio. Si cada lado interpolara por su cuenta, uno
 * podría publicar «{n_atipicos} valores quedan fuera…» mientras el otro muestra
 * «3 valores quedan fuera…»; con una sola implementación los dos textos
 * coinciden byte a byte.
 */
import type { Aviso } from './tipos.ts';

/** Parámetros de un aviso: números o cadenas, tal como los declara la calculadora. */
export type ParamsAviso = Record<string, number | string>;

/**
 * Sustituye `{clave}` por el parámetro del mismo nombre y deja intacto lo que no
 * tenga valor.
 *
 * A diferencia de `rellenar()` de `plantillas.ts`, aquí un marcador sin valor no
 * detiene nada: los avisos y los mensajes de error se interpolan con lo que haya
 * (un campo sin `min` declarado no tiene `{min}` que poner) y la paridad del
 * contenido la vigilan las pruebas, no el usuario.
 */
export function interpolar(texto: string, params?: ParamsAviso): string {
  if (!params) return texto;
  let s = texto;
  for (const [clave, valor] of Object.entries(params)) s = s.split(`{${clave}}`).join(String(valor));
  return s;
}

/**
 * Avisos de un resultado → `código → parámetros`, que es lo que la página
 * necesita para resolver en build el aviso activo del ejemplo.
 */
export function paramsDeAvisos(avisos: readonly Aviso[]): Record<string, ParamsAviso> {
  const salida: Record<string, ParamsAviso> = {};
  for (const aviso of avisos) {
    if (aviso.params) salida[aviso.codigo] = aviso.params;
  }
  return salida;
}

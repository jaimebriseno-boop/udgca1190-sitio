/**
 * Prueba de humo: todos los módulos de `src/lib/bioestadistica/` se importan en
 * Node sin transpilar.
 *
 *   node --test tests/bioestadistica/sintaxis.test.ts
 *
 * Node 22 ejecuta TypeScript borrando los tipos, no compilándolos: `enum`,
 * `namespace` y las propiedades de parámetro en constructores abortan con
 * `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, y una importación relativa sin extensión
 * `.ts` aborta con `ERR_MODULE_NOT_FOUND`. Los dos fallos son invisibles para
 * Vite, que sí transpila, así que solo aparecerían en las pruebas o en el
 * generador de fixtures.
 *
 * El recorrido es dinámico a propósito: el árbol crece con cada calculadora y
 * la prueba debe cubrir los módulos nuevos sin que nadie la edite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** `webr.ts` queda fuera: es el único módulo con efectos externos (red, worker). */
const EXCLUIDOS = new Set(['webr.ts']);

const RAIZ = fileURLToPath(new URL('../../src/lib/bioestadistica/', import.meta.url));

function recorrer(directorio: string, acumulado: string[]): string[] {
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      recorrer(ruta, acumulado);
    } else if (entrada.name.endsWith('.ts') && !entrada.name.endsWith('.d.ts')
      && !EXCLUIDOS.has(entrada.name)) {
      acumulado.push(ruta);
    }
  }
  return acumulado;
}

const modulos = recorrer(RAIZ, []).sort();

test('el árbol de bioestadística tiene módulos que importar', () => {
  assert.ok(modulos.length > 0, `no se encontró ningún .ts bajo ${RAIZ}`);
  console.log(`  · ${modulos.length} módulos descubiertos bajo src/lib/bioestadistica/`);
});

for (const modulo of modulos) {
  const nombre = relative(RAIZ, modulo);
  test(`Node ejecuta ${nombre} sin transpilar`, async () => {
    try {
      const cargado = await import(pathToFileURL(modulo).href);
      assert.equal(typeof cargado, 'object', `${nombre} no exportó un módulo`);
    } catch (e) {
      const motivo = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      assert.fail(`no se pudo importar ${nombre} — ${motivo}`);
    }
  });
}

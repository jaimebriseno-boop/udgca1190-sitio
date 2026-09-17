/**
 * Interpolación de los avisos. Es el módulo que garantiza que el texto del
 * servidor (el ejemplo resuelto en build) y el del navegador (cada recálculo)
 * salgan idénticos.
 *
 *   node --test tests/bioestadistica/avisos.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { interpolar, paramsDeAvisos } from '../../src/lib/bioestadistica/nucleo/avisos.ts';
import type { Aviso } from '../../src/lib/bioestadistica/nucleo/tipos.ts';

// El aviso `atipicos` de `descriptivos`: el que destapó que el HTML publicado
// servía los marcadores en crudo.
const ATIPICOS =
  '{n_atipicos} valores quedan fuera de las cercas de Tukey (a más de {k} veces el IQR por debajo de Q1 o por encima de Q3).';

test('pone cada parámetro en su marcador', () => {
  assert.equal(
    interpolar(ATIPICOS, { n_atipicos: 3, k: 1.5 }),
    '3 valores quedan fuera de las cercas de Tukey (a más de 1.5 veces el IQR por debajo de Q1 o por encima de Q3).',
  );
});

test('un aviso sin parámetros se devuelve tal cual', () => {
  const sinMarcadores = 'Con n < 40 conviene usar Wilson o Jeffreys.';
  assert.equal(interpolar(sinMarcadores), sinMarcadores);
  assert.equal(interpolar(sinMarcadores, {}), sinMarcadores);
});

test('repite el valor cuando el marcador aparece varias veces', () => {
  assert.equal(interpolar('entre {k} y {k}', { k: 2 }), 'entre 2 y 2');
});

test('un marcador sin valor se deja intacto en vez de detener la página', () => {
  assert.equal(interpolar('mínimo {min}, máximo {max}', { min: 0 }), 'mínimo 0, máximo {max}');
});

test('no toca lo que no sea un marcador', () => {
  assert.equal(interpolar('función(x) { return x }', { x: 1 }), 'función(x) { return x }');
});

test('acepta cadenas además de números', () => {
  assert.equal(interpolar('método: {metodo}', { metodo: 'Wilson' }), 'método: Wilson');
});

test('paramsDeAvisos indexa por código y omite los avisos sin parámetros', () => {
  const avisos: Aviso[] = [
    { codigo: 'atipicos', severidad: 'info', params: { n_atipicos: 3, k: 1.5 } },
    { codigo: 'n_pequeno', severidad: 'aviso' },
    { codigo: 'sw_n_grande', severidad: 'info', params: { n: 5000 } },
  ];
  assert.deepEqual(paramsDeAvisos(avisos), {
    atipicos: { n_atipicos: 3, k: 1.5 },
    sw_n_grande: { n: 5000 },
  });
  assert.deepEqual(paramsDeAvisos([]), {});
});

test('el texto del servidor y el del navegador se construyen igual', () => {
  const avisos: Aviso[] = [{ codigo: 'atipicos', severidad: 'info', params: { n_atipicos: 3, k: 1.5 } }];
  // Servidor: la página toma los parámetros del resultado.
  const enBuild = interpolar(ATIPICOS, paramsDeAvisos(avisos).atipicos);
  // Navegador: el controlador los toma del mismo `Aviso`.
  const enNavegador = interpolar(ATIPICOS, avisos[0].params);
  assert.equal(enBuild, enNavegador);
  assert.ok(!enBuild.includes('{'), 'no debe quedar ningún marcador sin resolver');
});

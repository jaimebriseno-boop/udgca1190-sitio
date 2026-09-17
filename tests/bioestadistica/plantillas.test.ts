/**
 * Plantillas de texto del contenido bilingüe (`nucleo/plantillas.ts`): `{var}`
 * con valores ya formateados y `{ref:key}` con el número de la lista de
 * referencias. Un marcador sin valor es un error de contenido, no un hueco.
 *
 *   node --test tests/bioestadistica/plantillas.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { marcadores, referencias, rellenar } from '../../src/lib/bioestadistica/nucleo/plantillas.ts';

// ---------------------------------------------------------------------------
// marcadores
// ---------------------------------------------------------------------------

test('marcadores devuelve los identificadores en orden de aparición y sin repetir', () => {
  assert.deepEqual(marcadores('{x} de {n} observaciones: {p}. Con {nivel}, entre {x} y {n}.'), [
    'x',
    'n',
    'p',
    'nivel',
  ]);
});

test('marcadores ignora lo que no es un identificador en minúsculas', () => {
  assert.deepEqual(marcadores('{X}, {2x}, {mi var}, {}, { x }, {x_1}, {a2}'), ['x_1', 'a2']);
});

test('marcadores no confunde las referencias con variables', () => {
  assert.deepEqual(marcadores('Wilson [{ref:wilson1927}] con {nivel} de confianza'), ['nivel']);
});

test('marcadores de una plantilla sin marcadores es una lista vacía', () => {
  assert.deepEqual(marcadores('Texto llano, sin nada que rellenar.'), []);
});

// ---------------------------------------------------------------------------
// referencias
// ---------------------------------------------------------------------------

test('referencias devuelve las claves bib citadas, sin repetir', () => {
  assert.deepEqual(
    referencias('Wilson [{ref:wilson1927},{ref:newcombe1998}] y de nuevo [{ref:wilson1927}]'),
    ['wilson1927', 'newcombe1998'],
  );
});

test('referencias admite claves con guiones y dos puntos', () => {
  assert.deepEqual(referencias('[{ref:landis-koch_1977},{ref:who:2019}]'), ['landis-koch_1977', 'who:2019']);
});

test('referencias de una plantilla sin citas es una lista vacía', () => {
  assert.deepEqual(referencias('{x} de {n}'), []);
});

// ---------------------------------------------------------------------------
// rellenar
// ---------------------------------------------------------------------------

test('rellenar sustituye variables y referencias en la misma pasada', () => {
  const plantilla =
    'El IC al {nivel} de {x}/{n} = {p} se calculó con Wilson [{ref:wilson1927},{ref:newcombe1998}].';
  const salida = rellenar(
    plantilla,
    { nivel: '95 %', x: '68', n: '80', p: '85.0 %' },
    { wilson1927: 1, newcombe1998: 4 },
  );
  assert.equal(salida, 'El IC al 95 % de 68/80 = 85.0 % se calculó con Wilson [1,4].');
});

test('rellenar repite el valor en cada aparición del mismo marcador', () => {
  assert.equal(rellenar('{a}-{a}-{a}', { a: 'z' }), 'z-z-z');
});

test('rellenar convierte los números a texto con String()', () => {
  assert.equal(rellenar('n = {n}, p = {p}', { n: 80, p: 0.85 }), 'n = 80, p = 0.85');
});

test('rellenar admite una cadena vacía como valor', () => {
  assert.equal(rellenar('IC: [{ic}]', { ic: '' }), 'IC: []');
});

test('rellenar devuelve intacta una plantilla sin marcadores', () => {
  const plantilla = 'Los datos no salen del navegador; las llaves { y } sueltas no son marcadores.';
  assert.equal(rellenar(plantilla, {}), plantilla);
  assert.equal(rellenar(plantilla, { x: '1' }, { wilson1927: 1 }), plantilla);
});

test('rellenar lanza cuando falta el valor de un marcador', () => {
  assert.throws(
    () => rellenar('{x} de {n}', { x: '68' }),
    /marcador \{n\} sin valor/,
  );
});

test('rellenar lanza cuando una referencia no está en la lista', () => {
  assert.throws(
    () => rellenar('Wilson [{ref:wilson1927}]', {}, { newcombe1998: 1 }),
    /referencia \{ref:wilson1927\} sin número/,
  );
});

test('rellenar sin lista de referencias lanza ante cualquier cita', () => {
  assert.throws(() => rellenar('[{ref:brown2001}]', {}), /referencia \{ref:brown2001\} sin número/);
});

test('rellenar no reinterpreta el texto ya sustituido', () => {
  // Si un valor trae llaves, salen tal cual: no hay segunda pasada.
  assert.equal(rellenar('{a}', { a: '{b}' }), '{b}');
});

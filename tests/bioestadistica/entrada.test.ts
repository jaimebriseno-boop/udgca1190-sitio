/**
 * Captura: texto escrito por una persona → número, y códigos de error.
 *
 *   node --test tests/bioestadistica/entrada.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parsearNumero, validarEntrada } from '../../src/lib/bioestadistica/nucleo/entrada.ts';
import type { EntradaDef } from '../../src/lib/bioestadistica/nucleo/tipos.ts';

const entero: EntradaDef = { id: 'x', tipo: 'entero', min: 0, requerido: true, derivado: false };
const decimal: EntradaDef = { id: 'media', tipo: 'decimal', requerido: true, derivado: false };
const nivel: EntradaDef = { id: 'nivel', tipo: 'proporcion', min: 0.8, max: 0.999, requerido: false, derivado: false };
const porcentaje: EntradaDef = { id: 'prev', tipo: 'porcentaje', min: 0, max: 100, requerido: true, derivado: false };

// ---------------------------------------------------------------------------
// parsearNumero
// ---------------------------------------------------------------------------

test('lee enteros y decimales con punto', () => {
  assert.equal(parsearNumero('68', entero), 68);
  assert.equal(parsearNumero('  80  ', entero), 80);
  assert.equal(parsearNumero('12.75', decimal), 12.75);
  assert.equal(parsearNumero('-3.5', decimal), -3.5);
  assert.equal(parsearNumero('1e3', decimal), 1000);
  assert.equal(parsearNumero('.5', decimal), 0.5);
});

test('acepta la coma decimal y el menos tipográfico', () => {
  assert.equal(parsearNumero('0,95', decimal), 0.95);
  assert.equal(parsearNumero('12,75', decimal), 12.75);
  assert.equal(parsearNumero('−4', decimal), -4);
});

test('con coma y punto a la vez, la coma son los miles', () => {
  assert.equal(parsearNumero('1,234.5', decimal), 1234.5);
  assert.equal(parsearNumero('1 234', decimal), 1234);
  assert.equal(parsearNumero('1 234', decimal), 1234);
  assert.equal(parsearNumero('1 234', decimal), 1234);
});

test('una proporción admite el porcentaje: «95», «95 %» y «0.95» valen 0.95', () => {
  assert.equal(parsearNumero('0.95', nivel), 0.95);
  assert.equal(parsearNumero('95', nivel), 0.95);
  assert.equal(parsearNumero('95 %', nivel), 0.95);
  assert.equal(parsearNumero('99.9', nivel), 0.999);
  // Por debajo de 1 no se reescala: 0.5 es medio, no medio por ciento.
  assert.equal(parsearNumero('0.5', nivel), 0.5);
  // Con el signo explícito sí, aunque sea menor que 1.
  assert.equal(parsearNumero('0.5 %', nivel), 0.005);
});

test('un porcentaje conserva su escala 0-100', () => {
  assert.equal(parsearNumero('12', porcentaje), 12);
  assert.equal(parsearNumero('12 %', porcentaje), 12);
});

test('el texto que no es un número devuelve null', () => {
  for (const s of ['', '   ', 'abc', '1.2.3', '5+', '--3', 'NA', '1,2,3.4.5']) {
    assert.equal(parsearNumero(s, decimal), null, `debería rechazar «${s}»`);
  }
});

test('un entero es estricto: no se reescala ni se redondea', () => {
  assert.equal(parsearNumero('3.5', entero), 3.5);
  assert.equal(parsearNumero('95', entero), 95);
});

// ---------------------------------------------------------------------------
// validarEntrada
// ---------------------------------------------------------------------------

test('el campo vacío solo es error cuando es obligatorio', () => {
  assert.equal(validarEntrada('', entero), 'err_requerido');
  assert.equal(validarEntrada('   ', entero), 'err_requerido');
  assert.equal(validarEntrada('', nivel), null);
});

test('distingue «no es un número» de «no es entero»', () => {
  assert.equal(validarEntrada('abc', entero), 'err_numero');
  assert.equal(validarEntrada('3.5', entero), 'err_entero');
  assert.equal(validarEntrada('3', entero), null);
});

test('aplica min y max del YAML sobre el valor ya convertido', () => {
  assert.equal(validarEntrada('-1', entero), 'err_min');
  assert.equal(validarEntrada('70', nivel), 'err_min');
  assert.equal(validarEntrada('99.95', nivel), 'err_max');
  assert.equal(validarEntrada('95', nivel), null);
  assert.equal(validarEntrada('101', porcentaje), 'err_max');
});

test('una proporción fuera de [0, 1] se señala como tal antes que por rango', () => {
  const p: EntradaDef = { id: 'p', tipo: 'proporcion', requerido: true, derivado: false };
  assert.equal(validarEntrada('-0.2', p), 'err_proporcion');
  assert.equal(validarEntrada('150 %', p), 'err_proporcion');
  assert.equal(validarEntrada('0.2', p), null);
});

test('el signo % solo se admite al final: «9%5» no es un número', () => {
  assert.equal(parsearNumero('9%5', entero), null);
  assert.equal(parsearNumero('95%', nivel), 0.95);
  assert.equal(parsearNumero('95 %', nivel), 0.95);
});

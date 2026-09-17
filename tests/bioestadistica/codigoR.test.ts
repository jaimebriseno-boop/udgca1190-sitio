/**
 * Relleno de plantillas de R y lectura del JSON del oráculo.
 *
 *   node --test tests/bioestadistica/codigoR.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MARCADOR,
  codigoR,
  normalizarR,
  num,
  parsearJsonR,
  rellenarR,
} from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import type { Entradas } from '../../src/lib/bioestadistica/nucleo/tipos.ts';

/** Cola mínima que cualquier snippet debe tener para cumplir el contrato. */
const CONTRATO = 'res <- list(p = p)\ncat(toJSON(res, auto_unbox = TRUE, digits = NA))\n';

// ---------------------------------------------------------------------------
// num
// ---------------------------------------------------------------------------

test('num escribe el literal más corto que reconstruye el mismo doble', () => {
  assert.equal(num(0), '0');
  assert.equal(num(-0), '0');
  assert.equal(num(0.95), '0.95');
  assert.equal(num(1 / 3), '0.3333333333333333');
  assert.equal(num(1e-7), '1e-7');
  assert.equal(num(1000000), '1000000');
  assert.equal(num(-2.5), '-2.5');
  assert.equal(Number(num(Math.SQRT2)), Math.SQRT2);
});

test('num rechaza los valores sin literal en R', () => {
  for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => num(v), RangeError);
  }
});

// ---------------------------------------------------------------------------
// MARCADOR
// ---------------------------------------------------------------------------

test('MARCADOR reconoce identificadores en minúsculas y no las llaves de R', () => {
  const casan = (s: string): string[] => [...s.matchAll(MARCADOR)].map((m) => m[1] as string);
  assert.deepEqual(casan('x <- {x}; nivel <- {nivel}; c <- {corr_2}'), ['x', 'nivel', 'corr_2']);
  assert.deepEqual(casan('f <- function(x, n) { x / n }'), []);
  assert.deepEqual(casan('if (a) { 1 } else { 2 }'), []);
  assert.deepEqual(casan('{X}, {2x}, {mi var}, {}, { x }'), []);
  // No hay secuencia de escape: un marcador entre llaves extra sigue siendo un marcador.
  assert.deepEqual(casan('{{x}}'), ['x']);
});

// ---------------------------------------------------------------------------
// rellenarR
// ---------------------------------------------------------------------------

test('rellenarR sustituye números, booleanos y cadenas por literales de R', () => {
  const plantilla = `x <- {x}; nivel <- {nivel}; usar <- {usar}; metodo <- {metodo}\n${CONTRATO}`;
  const salida = rellenarR(plantilla, { x: 68, nivel: 0.95, usar: true, metodo: 'wilson' });
  assert.match(salida, /^x <- 68; nivel <- 0\.95; usar <- TRUE; metodo <- "wilson"$/m);
});

test('rellenarR sustituye todas las apariciones del mismo marcador', () => {
  const salida = rellenarR(`a <- {x}; b <- {x}; d <- {x}\n${CONTRATO}`, { x: 3 });
  assert.match(salida, /^a <- 3; b <- 3; d <- 3$/m);
});

test('rellenarR deja intactas las llaves de R que no son marcadores', () => {
  const plantilla = `f <- function(a, b) { a / b }\nx <- {x}\n${CONTRATO}`;
  assert.match(rellenarR(plantilla, { x: 1 }), /function\(a, b\) \{ a \/ b \}/);
});

test('rellenarR falla si un marcador no tiene entrada', () => {
  assert.throws(
    () => rellenarR(`x <- {x}; n <- {n}\n${CONTRATO}`, { x: 1 }),
    (e: unknown) => e instanceof Error && e.message === 'marcador {n} sin entrada',
  );
});

test('rellenarR no acepta una entrada heredada del prototipo', () => {
  const entradas = Object.create({ x: 9 }) as Entradas;
  assert.throws(() => rellenarR(`x <- {x}\n${CONTRATO}`, entradas), /marcador \{x\} sin entrada/);
});

test('rellenarR propaga el RangeError de una entrada no finita', () => {
  assert.throws(() => rellenarR(`x <- {x}\n${CONTRATO}`, { x: Number.NaN }), RangeError);
  assert.throws(() => rellenarR(`x <- {x}\n${CONTRATO}`, { x: Number.POSITIVE_INFINITY }), RangeError);
});

test('rellenarR exige rScript para los vectores', () => {
  assert.throws(() => rellenarR(`v <- {v}\n${CONTRATO}`, { v: [1, 2, 3] }), TypeError);
  assert.throws(() => rellenarR(`v <- {v}\n${CONTRATO}`, { v: [1, 2, 3] }), /rScript/);
});

test('rellenarR rechaza un snippet que no cumple el contrato', () => {
  const roto = /el snippet rompe el contrato/;
  assert.throws(() => rellenarR('x <- {x}\ncat(toJSON(res))\n', { x: 1 }), roto);
  assert.throws(() => rellenarR('x <- {x}\nres <- list(p = p)\nprint(res)\n', { x: 1 }), roto);
  // `res <- list(` debe abrir línea: una asignación anidada no cuenta.
  assert.throws(() => rellenarR('x <- {x}\nf <- function() res <- list(p = 1)\ncat(toJSON(res))\n', { x: 1 }), roto);
});

// ---------------------------------------------------------------------------
// codigoR
// ---------------------------------------------------------------------------

test('codigoR usa la plantilla de texto cuando no hay rScript', () => {
  const salida = codigoR({ codigo: `x <- {x}\n${CONTRATO}` }, { x: 7 });
  assert.match(salida, /^x <- 7$/m);
});

test('codigoR da prioridad a rScript y también le aplica el contrato', () => {
  const plantilla = {
    codigo: `x <- {x}\n${CONTRATO}`,
    rScript: (e: Entradas) => `v <- c(${(e.v as number[]).join(', ')})\n${CONTRATO}`,
  };
  assert.match(codigoR(plantilla, { x: 1, v: [1, 2] }), /^v <- c\(1, 2\)$/m);
  assert.throws(() => codigoR({ rScript: () => 'cat("hola")' }, {}), /rompe el contrato/);
});

test('codigoR falla si la plantilla no trae ni codigo ni rScript', () => {
  assert.throws(() => codigoR({}, {}), /no tiene `codigo` ni `rScript`/);
});

// ---------------------------------------------------------------------------
// normalizarR y parsearJsonR
// ---------------------------------------------------------------------------

test('parsearJsonR convierte los centinelas de jsonlite', () => {
  const v = parsearJsonR('{"a":"Inf","b":"-Inf","c":"NaN","d":"NA","e":null}') as Record<string, unknown>;
  assert.equal(v.a, Number.POSITIVE_INFINITY);
  assert.equal(v.b, Number.NEGATIVE_INFINITY);
  assert.ok(Number.isNaN(v.c as number));
  assert.equal(v.d, null);
  assert.equal(v.e, null);
});

test('parsearJsonR recorre vectores y objetos anidados', () => {
  const v = parsearJsonR('{"lr":[1,"Inf","NaN"],"m":{"d":{"x":["-Inf","NA",2.5]}}}') as {
    lr: unknown[];
    m: { d: { x: unknown[] } };
  };
  assert.equal(v.lr[0], 1);
  assert.equal(v.lr[1], Number.POSITIVE_INFINITY);
  assert.ok(Number.isNaN(v.lr[2] as number));
  assert.deepEqual(v.m.d.x, [Number.NEGATIVE_INFINITY, null, 2.5]);
});

test('normalizarR deja intactos los demás valores', () => {
  assert.deepEqual(normalizarR({ metodo: 'wilson', n: 80, ok: true, nada: null }), {
    metodo: 'wilson',
    n: 80,
    ok: true,
    nada: null,
  });
  assert.equal(normalizarR('Infinity'), 'Infinity');
  assert.equal(normalizarR('nan'), 'nan');
  assert.deepEqual(normalizarR([]), []);
});

test('parsearJsonR conserva la precisión de 15 cifras que imprime jsonlite', () => {
  const v = parsearJsonR('{"p":0.755867714386767}') as { p: number };
  assert.equal(v.p, 0.755867714386767);
  assert.equal(String(v.p), '0.755867714386767');
});

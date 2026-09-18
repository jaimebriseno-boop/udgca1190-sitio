/**
 * Regla de igualdad y informe de comparación contra el oráculo R.
 *
 *   node --test tests/bioestadistica/comparar.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { comparar, describir, difRelativa, iguales } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import type { PerfilTolerancia, Tolerancia } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { normalizarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import type { Estimacion, Resultado } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { cerrado, cuantil } from './tolerancias.ts';

const ESTRICTA: Tolerancia = { rel: 0, abs: 0 };
const LAXA: Tolerancia = { rel: 1e-6, abs: 1e-12 };

// ---------------------------------------------------------------------------
// iguales
// ---------------------------------------------------------------------------

test('iguales trata NaN y NA como el mismo estado «no definido»', () => {
  assert.ok(iguales(Number.NaN, Number.NaN, ESTRICTA));
  assert.ok(iguales(Number.NaN, null, ESTRICTA));
  assert.ok(iguales(null, null, ESTRICTA));
  assert.ok(!iguales(Number.NaN, 0, ESTRICTA));
  assert.ok(!iguales(null, 0, LAXA));
  assert.ok(!iguales(0, Number.NaN, LAXA));
});

test('iguales acepta infinitos del mismo signo y rechaza los de signo opuesto', () => {
  const inf = Number.POSITIVE_INFINITY;
  assert.ok(iguales(inf, inf, ESTRICTA));
  assert.ok(iguales(-inf, -inf, ESTRICTA));
  assert.ok(!iguales(inf, -inf, LAXA));
  assert.ok(!iguales(inf, 1e308, LAXA));
  assert.ok(!iguales(1e308, -inf, LAXA));
});

test('iguales aplica |a − b| ≤ abs + rel · max(|a|, |b|)', () => {
  assert.ok(iguales(1, 1 + 1e-13, cerrado));
  assert.ok(!iguales(1, 1 + 1e-11, cerrado));
  // El suelo absoluto es lo que salva los ceros ruidosos, como el Wilson de x = 0.
  assert.ok(iguales(0, -1.16e-17, cerrado));
  assert.ok(!iguales(0, 1e-13, cerrado));
  // Escala: la tolerancia relativa se mide contra el mayor de los dos.
  assert.ok(iguales(1e6, 1e6 + 1e-7, cerrado));
  assert.ok(!iguales(1e6, 1e6 + 1e-5, cerrado));
  assert.ok(iguales(1e-9, 1.0000000001e-9, cuantil));
});

test('iguales es simétrico y reflexivo en los valores ordinarios', () => {
  const pares: Array<[number, number]> = [
    [0.85, 0.850000000001],
    [-3, -3],
    [1e-300, 2e-300],
  ];
  for (const [a, b] of pares) assert.equal(iguales(a, b, cuantil), iguales(b, a, cuantil));
  for (const v of [0, 1, -1, 1e308, 1e-308]) assert.ok(iguales(v, v, ESTRICTA));
});

// ---------------------------------------------------------------------------
// difRelativa
// ---------------------------------------------------------------------------

test('difRelativa vale 0 cuando los valores son idénticos o ambos indefinidos', () => {
  assert.equal(difRelativa(0, 0), 0);
  assert.equal(difRelativa(2.5, 2.5), 0);
  assert.equal(difRelativa(Number.NaN, Number.NaN), 0);
  assert.equal(difRelativa(null, null), 0);
  assert.equal(difRelativa(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY), 0);
});

test('difRelativa se mide contra el mayor en valor absoluto', () => {
  assert.equal(difRelativa(1, 1.5), 1 / 3);
  assert.equal(difRelativa(1.5, 1), 1 / 3);
  assert.equal(difRelativa(0, 4), 1);
  assert.ok(Number.isNaN(difRelativa(null, 3)));
  assert.ok(Number.isNaN(difRelativa(Number.POSITIVE_INFINITY, 1)));
});

// ---------------------------------------------------------------------------
// comparar
// ---------------------------------------------------------------------------

const ic = (valor: number, lo: number, hi: number): Estimacion => ({
  valor,
  ic: [lo, hi],
  nivel: 0.95,
  metodo: 'wilson',
});

function resultado(valores: Record<string, Estimacion>): Resultado {
  return { calculadora: 'prueba', version: 1, entradas: {}, valores, bandas: {}, avisos: [] };
}

const PERFIL: PerfilTolerancia = { defecto: cuantil, campos: { p: cerrado } };

test('comparar acepta un resultado que coincide campo por campo', () => {
  const r = resultado({ p: { valor: 0.85, metodo: 'puntual' }, wilson: ic(0.85, 0.7558, 0.9121) });
  const informe = comparar(r, { p: 0.85, wilson: [0.85, 0.7558, 0.9121] }, PERFIL);
  assert.ok(informe.coincide);
  assert.equal(informe.discrepancias.length, 0);
  assert.equal(informe.filas.length, 4);
  assert.equal(informe.resumen, 'Coincide en 2/2 campos');
});

test('comparar separa valor, lo y hi de cada estimación con intervalo', () => {
  const r = resultado({ wilson: ic(0.85, 0.7558, 0.92) });
  const informe = comparar(r, { wilson: [0.85, 0.7558, 0.9121] }, PERFIL);
  assert.ok(!informe.coincide);
  assert.equal(informe.discrepancias.length, 1);
  const fallo = informe.discrepancias[0]!;
  assert.equal(fallo.campo, 'wilson');
  assert.equal(fallo.componente, 'hi');
  assert.equal(fallo.ts, 0.92);
  assert.equal(fallo.r, 0.9121);
  assert.ok(fallo.difRel > 8e-3 && fallo.difRel < 9e-3);
  assert.equal(informe.resumen, 'Coincide en 0/1 campos');
  assert.match(describir(fallo), /^wilson\.hi: TS 0\.92 vs R 0\.9121/);
});

test('comparar usa la tolerancia por campo y no la de por defecto', () => {
  // 1e-11 de diferencia relativa: pasa con `cuantil` (1e-9) y falla con `cerrado` (1e-12).
  const r = resultado({ p: { valor: 0.5 + 5e-12, metodo: 'puntual' }, q: { valor: 0.5 + 5e-12, metodo: 'puntual' } });
  const informe = comparar(r, { p: 0.5, q: 0.5 }, PERFIL);
  assert.equal(informe.discrepancias.length, 1);
  assert.equal(informe.discrepancias[0]!.campo, 'p');
});

test('comparar reporta NaN de TypeScript frente a NA de R como coincidencia', () => {
  const r = resultado({ lr_pos: ic(Number.POSITIVE_INFINITY, Number.NaN, Number.NaN) });
  const esperado = normalizarR({ lr_pos: ['Inf', 'NA', 'NaN'] }) as Record<string, unknown>;
  const informe = comparar(r, esperado, PERFIL);
  assert.ok(informe.coincide, informe.discrepancias.map(describir).join('\n'));
});

test('comparar marca un campo ausente en la salida de R', () => {
  const r = resultado({ wilson: ic(0.85, 0.75, 0.91), p: { valor: 0.85, metodo: 'puntual' } });
  const informe = comparar(r, { p: 0.85 }, PERFIL);
  assert.ok(!informe.coincide);
  assert.equal(informe.discrepancias.length, 3);
  for (const d of informe.discrepancias) assert.equal(d.nota, 'ausente en la salida de R');
  assert.equal(informe.resumen, 'Coincide en 1/2 campos');
});

test('comparar marca un campo que R devolvió y TypeScript no calcula', () => {
  const r = resultado({ p: { valor: 0.85, metodo: 'puntual' } });
  const informe = comparar(r, { p: 0.85, jeffreys: [0.85, 0.76, 0.92] }, PERFIL);
  assert.ok(!informe.coincide);
  assert.equal(informe.discrepancias.length, 1);
  assert.equal(informe.discrepancias[0]!.campo, 'jeffreys');
  assert.match(informe.discrepancias[0]!.nota ?? '', /ausente en el resultado de TypeScript/);
});

test('comparar detecta un escalar donde se esperaba un vector [est, lo, hi]', () => {
  const r = resultado({ wilson: ic(0.85, 0.75, 0.91) });
  const informe = comparar(r, { wilson: 0.85 }, PERFIL);
  assert.equal(informe.discrepancias.length, 3);
  assert.match(informe.discrepancias[0]!.nota ?? '', /se esperaba un vector \[est, lo, hi\]/);
});

test('comparar detecta un vector donde se esperaba un escalar', () => {
  const r = resultado({ p: { valor: 0.85, metodo: 'puntual' } });
  const informe = comparar(r, { p: [0.85, 0.75, 0.91] }, PERFIL);
  assert.equal(informe.discrepancias.length, 1);
  assert.match(informe.discrepancias[0]!.nota ?? '', /no es un número/);
});

test('comparar cuenta los campos, no las componentes, en el resumen', () => {
  const r = resultado({ a: ic(1, 0, 2), b: ic(1, 0, 2), c: { valor: 1, metodo: 'puntual' } });
  const informe = comparar(r, { a: [1, 0, 2], b: [1, 0, 3], c: 1 }, PERFIL);
  assert.equal(informe.filas.length, 7);
  assert.equal(informe.resumen, 'Coincide en 2/3 campos');
});

test('comparar sobre un resultado sin valores no encuentra discrepancias', () => {
  const informe = comparar(resultado({}), {}, PERFIL);
  assert.ok(informe.coincide);
  assert.equal(informe.resumen, 'Coincide en 0/0 campos');
});

// ---------------------------------------------------------------------------
// Vectores de longitud variable (`Resultado.extras`): tabla de vida, curvas
// ---------------------------------------------------------------------------

test('los extras se comparan elemento a elemento con la tolerancia del campo', () => {
  const base = { calculadora: 'x', version: 1 as const, entradas: {}, bandas: {}, avisos: [] };
  const tol = { defecto: { rel: 1e-12, abs: 1e-14 } };
  const ok = comparar(
    { ...base, valores: { n: { valor: 3, metodo: 'puntual' } }, extras: { s: [1, 0.5, 0.25], t: [0, 2, 5] } },
    { n: 3, s: [1, 0.5, 0.25], t: [0, 2, 5] },
    tol,
  );
  assert.equal(ok.coincide, true, ok.discrepancias.map(describir).join('\n'));
  // Un elemento fuera de tolerancia señala su índice.
  const mal = comparar(
    { ...base, valores: {}, extras: { s: [1, 0.5, 0.25] } },
    { s: [1, 0.5, 0.2501] },
    tol,
  );
  assert.equal(mal.coincide, false);
  assert.match(mal.discrepancias.map(describir).join('\n'), /elemento 2/);
  // Longitud distinta, vector ausente o escalar en R: discrepancia explícita.
  assert.equal(comparar({ ...base, valores: {}, extras: { s: [1, 0.5] } }, { s: [1, 0.5, 0.25] }, tol).coincide, false);
  assert.equal(comparar({ ...base, valores: {}, extras: { s: [1] } }, {}, tol).coincide, false);
  assert.equal(comparar({ ...base, valores: {}, extras: { s: [1] } }, { s: 1 }, tol).coincide, false);
  // NA/NaN también casan dentro de un vector (mediana no alcanzada, IC indefinido).
  const nan = comparar({ ...base, valores: {}, extras: { lo: [0.9, Number.NaN] } }, { lo: [0.9, null] }, tol);
  assert.equal(nan.coincide, true);
});


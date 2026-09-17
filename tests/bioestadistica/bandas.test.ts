/**
 * Bandas categóricas de interpretación (`nucleo/bandas.ts`). Los cortes son
 * convenciones publicadas; aquí se fija en qué lado de cada corte cae el valor
 * exacto, que es donde una calculadora elegiría la plantilla equivocada.
 *
 *   node --test tests/bioestadistica/bandas.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BANDAS_COHEN,
  BANDAS_ICC,
  BANDAS_KAPPA,
  BANDAS_LR,
  bandaCohen,
  bandaIcc,
  bandaKappa,
  bandaLrNeg,
  bandaLrPos,
  decisionP,
  direccionNnt,
  icCruzaNulo,
} from '../../src/lib/bioestadistica/nucleo/bandas.ts';

// ---------------------------------------------------------------------------
// Razones de verosimilitud (Jaeschke, Guyatt y Sackett 1994)
// ---------------------------------------------------------------------------

test('bandaLrPos: los cortes 10, 5, 2 y 1 caen en la banda inferior', () => {
  assert.equal(bandaLrPos(10.0001), 'grande');
  assert.equal(bandaLrPos(10), 'moderado');
  assert.equal(bandaLrPos(5), 'moderado');
  assert.equal(bandaLrPos(4.9999), 'pequeno');
  assert.equal(bandaLrPos(2), 'pequeno');
  assert.equal(bandaLrPos(1.9999), 'minimo');
  assert.equal(bandaLrPos(1.0001), 'minimo');
  assert.equal(bandaLrPos(1), 'nulo');
  assert.equal(bandaLrPos(0.5), 'nulo');
  assert.equal(bandaLrPos(0), 'nulo');
});

test('bandaLrPos: ∞ es grande y NaN es nulo', () => {
  assert.equal(bandaLrPos(Number.POSITIVE_INFINITY), 'grande');
  assert.equal(bandaLrPos(Number.NaN), 'nulo');
});

test('bandaLrNeg: los cortes 0.1, 0.2, 0.5 y 1 se reparten por el lado documentado', () => {
  assert.equal(bandaLrNeg(0), 'grande');
  assert.equal(bandaLrNeg(0.0999), 'grande');
  assert.equal(bandaLrNeg(0.1), 'moderado');
  assert.equal(bandaLrNeg(0.2), 'moderado');
  assert.equal(bandaLrNeg(0.2001), 'pequeno');
  assert.equal(bandaLrNeg(0.5), 'pequeno');
  assert.equal(bandaLrNeg(0.5001), 'minimo');
  assert.equal(bandaLrNeg(0.9999), 'minimo');
  assert.equal(bandaLrNeg(1), 'nulo');
  assert.equal(bandaLrNeg(2), 'nulo');
});

test('bandaLrNeg: ∞ es nulo y NaN es nulo', () => {
  assert.equal(bandaLrNeg(Number.POSITIVE_INFINITY), 'nulo');
  assert.equal(bandaLrNeg(Number.NaN), 'nulo');
});

test('las dos bandas de LR solo devuelven valores de BANDAS_LR', () => {
  const valores: readonly number[] = [-1, 0, 0.05, 0.1, 0.2, 0.5, 0.9, 1, 1.5, 2, 5, 10, 25, Infinity, Number.NaN];
  for (const v of valores) {
    assert.ok(BANDAS_LR.includes(bandaLrPos(v)), `bandaLrPos(${v})`);
    assert.ok(BANDAS_LR.includes(bandaLrNeg(v)), `bandaLrNeg(${v})`);
  }
});

// ---------------------------------------------------------------------------
// Kappa (Landis y Koch 1977)
// ---------------------------------------------------------------------------

test('bandaKappa reparte los cortes de Landis-Koch por su extremo superior', () => {
  assert.equal(bandaKappa(-0.3), 'pobre');
  assert.equal(bandaKappa(0), 'leve');
  assert.equal(bandaKappa(0.2), 'leve');
  assert.equal(bandaKappa(0.2001), 'aceptable');
  assert.equal(bandaKappa(0.4), 'aceptable');
  assert.equal(bandaKappa(0.4001), 'moderado');
  assert.equal(bandaKappa(0.6), 'moderado');
  assert.equal(bandaKappa(0.6001), 'sustancial');
  assert.equal(bandaKappa(0.8), 'sustancial');
  assert.equal(bandaKappa(0.8001), 'casi_perfecto');
  assert.equal(bandaKappa(1), 'casi_perfecto');
});

test('bandaKappa: NaN es pobre y todo valor cae en BANDAS_KAPPA', () => {
  assert.equal(bandaKappa(Number.NaN), 'pobre');
  for (const v of [-1, 0, 0.35, 0.55, 0.75, 0.95, 1, Number.NaN]) {
    assert.ok(BANDAS_KAPPA.includes(bandaKappa(v)), `bandaKappa(${v})`);
  }
});

// ---------------------------------------------------------------------------
// ICC sobre el límite inferior del intervalo (Koo y Li 2016)
// ---------------------------------------------------------------------------

test('bandaIcc usa cortes abiertos en 0.5, 0.75 y 0.9', () => {
  assert.equal(bandaIcc(0.4999), 'pobre');
  assert.equal(bandaIcc(0.5), 'moderado');
  assert.equal(bandaIcc(0.7499), 'moderado');
  assert.equal(bandaIcc(0.75), 'bueno');
  assert.equal(bandaIcc(0.8999), 'bueno');
  assert.equal(bandaIcc(0.9), 'excelente');
  assert.equal(bandaIcc(1), 'excelente');
});

test('bandaIcc: NaN y los negativos son pobres; todo valor cae en BANDAS_ICC', () => {
  assert.equal(bandaIcc(Number.NaN), 'pobre');
  assert.equal(bandaIcc(-0.2), 'pobre');
  for (const v of [-1, 0, 0.5, 0.75, 0.9, 1, Number.NaN]) {
    assert.ok(BANDAS_ICC.includes(bandaIcc(v)), `bandaIcc(${v})`);
  }
});

// ---------------------------------------------------------------------------
// Tamaño de efecto de Cohen (1988)
// ---------------------------------------------------------------------------

test('bandaCohen usa el valor absoluto y cortes abiertos en 0.1, 0.3 y 0.5', () => {
  assert.equal(bandaCohen(0.0999), 'trivial');
  assert.equal(bandaCohen(0.1), 'pequeno');
  assert.equal(bandaCohen(0.2999), 'pequeno');
  assert.equal(bandaCohen(0.3), 'mediano');
  assert.equal(bandaCohen(0.4999), 'mediano');
  assert.equal(bandaCohen(0.5), 'grande');
  assert.equal(bandaCohen(1), 'grande');
  // El signo no cambia la banda.
  assert.equal(bandaCohen(-0.35), 'mediano');
  assert.equal(bandaCohen(-0.8), 'grande');
});

test('bandaCohen: NaN es trivial; todo valor cae en BANDAS_COHEN', () => {
  assert.equal(bandaCohen(Number.NaN), 'trivial');
  for (const v of [-1, -0.2, 0, 0.1, 0.3, 0.5, 1, Number.NaN]) {
    assert.ok(BANDAS_COHEN.includes(bandaCohen(v)), `bandaCohen(${v})`);
  }
});

// ---------------------------------------------------------------------------
// Dirección del NNT
// ---------------------------------------------------------------------------

test('direccionNnt lee el signo de la reducción absoluta del riesgo', () => {
  assert.equal(direccionNnt(-0.12), 'beneficio');
  assert.equal(direccionNnt(0.12), 'dano');
  assert.equal(direccionNnt(0), 'nulo');
  assert.equal(direccionNnt(-0), 'nulo');
  assert.equal(direccionNnt(Number.NaN), 'nulo');
  assert.equal(direccionNnt(-1e-12), 'beneficio');
});

// ---------------------------------------------------------------------------
// ¿El intervalo cruza el valor nulo?
// ---------------------------------------------------------------------------

test('icCruzaNulo compara con 0 para diferencias y con 1 para razones', () => {
  assert.equal(icCruzaNulo([-0.05, 0.12], 0), true);
  assert.equal(icCruzaNulo([0.01, 0.12], 0), false);
  assert.equal(icCruzaNulo([-0.2, -0.01], 0), false);
  assert.equal(icCruzaNulo([0.8, 2.4], 1), true);
  assert.equal(icCruzaNulo([1.2, 2.4], 1), false);
  assert.equal(icCruzaNulo([0.2, 0.9], 1), false);
});

test('icCruzaNulo incluye los límites y trata lo desconocido como cruce', () => {
  assert.equal(icCruzaNulo([0, 0.3], 0), true);
  assert.equal(icCruzaNulo([-0.3, 0], 0), true);
  assert.equal(icCruzaNulo([1, 3], 1), true);
  assert.equal(icCruzaNulo(undefined, 1), true);
  assert.equal(icCruzaNulo([Number.NaN, 3], 1), true);
  assert.equal(icCruzaNulo([0.5, Number.NaN], 1), true);
});

test('icCruzaNulo admite un límite infinito', () => {
  assert.equal(icCruzaNulo([1.5, Number.POSITIVE_INFINITY], 1), false);
  assert.equal(icCruzaNulo([0.5, Number.POSITIVE_INFINITY], 1), true);
});

// ---------------------------------------------------------------------------
// Decisión sobre el valor p
// ---------------------------------------------------------------------------

test('decisionP compara con alfa de forma estricta', () => {
  assert.equal(decisionP(0.049), 'rechaza');
  assert.equal(decisionP(0.05), 'no_rechaza');
  assert.equal(decisionP(0.051), 'no_rechaza');
  assert.equal(decisionP(0), 'rechaza');
  assert.equal(decisionP(1), 'no_rechaza');
});

test('decisionP admite otro alfa y trata NaN como «no rechaza»', () => {
  assert.equal(decisionP(0.008, 0.01), 'rechaza');
  assert.equal(decisionP(0.01, 0.01), 'no_rechaza');
  assert.equal(decisionP(0.02, 0.1), 'rechaza');
  assert.equal(decisionP(Number.NaN), 'no_rechaza');
  assert.equal(decisionP(Number.NaN, 0.5), 'no_rechaza');
});

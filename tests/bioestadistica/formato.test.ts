/**
 * Formato de números por idioma (`nucleo/formato.ts`): es-MX y en-US comparten
 * punto decimal y coma de miles, así que lo que de verdad cambia —y lo que aquí
 * se fija— es el porcentaje (espacio fino U+202F en español), el conector del
 * intervalo y el texto de «no definido».
 *
 *   node --test tests/bioestadistica/formato.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { crearFormateador } from '../../src/lib/bioestadistica/nucleo/formato.ts';

/** Espacio fino inseparable (U+202F): separa el número del signo % en español. */
const FINO = ' ';

const es = crearFormateador('es');
const en = crearFormateador('en');

test('el formateador declara su idioma', () => {
  assert.equal(es.lang, 'es');
  assert.equal(en.lang, 'en');
});

// ---------------------------------------------------------------------------
// Porcentajes: pct0, pct1, pct2
// ---------------------------------------------------------------------------

test('pct1 multiplica por cien y añade el signo con espacio fino solo en español', () => {
  assert.equal(es.num(0.85, 'pct1'), `85.0${FINO}%`);
  assert.equal(en.num(0.85, 'pct1'), '85.0%');
  // El separador español es U+202F, no un espacio normal.
  assert.ok(!es.num(0.85, 'pct1').includes(' '));
});

test('pct0 y pct2 respetan el número de decimales pedido', () => {
  assert.equal(es.num(0.856, 'pct0'), `86${FINO}%`);
  assert.equal(en.num(0.856, 'pct0'), '86%');
  assert.equal(es.num(0.8567, 'pct2'), `85.67${FINO}%`);
  assert.equal(en.num(0.8567, 'pct2'), '85.67%');
});

// ---------------------------------------------------------------------------
// Nivel de confianza
// ---------------------------------------------------------------------------

test('nivel escribe el porcentaje sin decimales superfluos', () => {
  assert.equal(es.nivel(0.95), `95${FINO}%`);
  assert.equal(en.nivel(0.95), '95%');
  assert.equal(es.nivel(0.9), `90${FINO}%`);
  assert.equal(en.nivel(0.9), '90%');
  assert.equal(es.nivel(0.999), `99.9${FINO}%`);
  assert.equal(en.nivel(0.999), '99.9%');
  assert.equal(es.nivel(0.99), `99${FINO}%`);
});

// ---------------------------------------------------------------------------
// Intervalos
// ---------------------------------------------------------------------------

test('ic une los dos límites con «a» en español y «to» en inglés', () => {
  assert.equal(es.ic([0.756, 0.912], 'pct1'), `75.6${FINO}% a 91.2${FINO}%`);
  assert.equal(en.ic([0.756, 0.912], 'pct1'), '75.6% to 91.2%');
  assert.equal(es.ic([1.2, 3.456], 'dec2'), '1.20 a 3.46');
  assert.equal(en.ic([1.2, 3.456], 'dec2'), '1.20 to 3.46');
});

test('ic sin intervalo devuelve cadena vacía', () => {
  assert.equal(es.ic(undefined), '');
  assert.equal(en.ic(undefined, 'pct1'), '');
});

test('ic hereda el tratamiento de los valores no finitos', () => {
  assert.equal(es.ic([1.5, Infinity], 'lr'), '1.50 a ∞');
  assert.equal(en.ic([1.5, Infinity], 'lr'), '1.50 to ∞');
});

// ---------------------------------------------------------------------------
// Valores p
// ---------------------------------------------------------------------------

test('p usa tres decimales y el umbral «< 0.001»', () => {
  assert.equal(es.num(0.0004, 'p'), '< 0.001');
  assert.equal(en.num(0.0004, 'p'), '< 0.001');
  assert.equal(es.num(0.0234, 'p'), '0.023');
  assert.equal(en.num(0.0234, 'p'), '0.023');
  // 0.001 exacto no cruza el umbral (la comparación es estricta).
  assert.equal(es.num(0.001, 'p'), '0.001');
  assert.equal(es.num(0.5, 'p'), '0.500');
});

// ---------------------------------------------------------------------------
// Razones: lr y x
// ---------------------------------------------------------------------------

test('lr da dos decimales y tres cifras significativas por debajo de 0.1', () => {
  assert.equal(es.num(17.03, 'lr'), '17.03');
  assert.equal(en.num(17.03, 'lr'), '17.03');
  assert.equal(es.num(0.0581717, 'lr'), '0.0582');
  assert.equal(en.num(0.0581717, 'lr'), '0.0582');
  assert.equal(es.num(2, 'lr'), '2.00');
});

test('lr escribe el infinito con el símbolo y NaN con el texto del idioma', () => {
  assert.equal(es.num(Infinity, 'lr'), '∞');
  assert.equal(en.num(Infinity, 'lr'), '∞');
  assert.equal(es.num(-Infinity, 'lr'), '−∞');
  assert.equal(es.num(Number.NaN, 'lr'), 'no definido');
  assert.equal(en.num(Number.NaN, 'lr'), 'undefined');
});

test('x añade el signo de multiplicación', () => {
  assert.equal(es.num(2.5, 'x'), '2.50×');
  assert.equal(en.num(2.5, 'x'), '2.50×');
  assert.equal(es.num(0.05, 'x'), '0.05×');
});

// ---------------------------------------------------------------------------
// Enteros
// ---------------------------------------------------------------------------

test('entero pone separador de miles en los dos idiomas', () => {
  assert.equal(es.entero(1000000), '1,000,000');
  assert.equal(en.entero(1000000), '1,000,000');
  assert.equal(es.entero(80), '80');
  assert.equal(es.entero(1234), '1,234');
});

test('entero delega los valores no finitos en num', () => {
  assert.equal(es.entero(Infinity), '∞');
  assert.equal(es.entero(Number.NaN), 'no definido');
  assert.equal(en.entero(Number.NaN), 'undefined');
});

// ---------------------------------------------------------------------------
// Cero negativo
// ---------------------------------------------------------------------------

test('un negativo que se redondea a cero nunca se escribe «-0»', () => {
  assert.equal(es.num(-1e-20, 'dec2'), '0.00');
  assert.equal(en.num(-1e-20, 'dec2'), '0.00');
  assert.equal(es.num(-1e-9, 'pct1'), `0.0${FINO}%`);
  assert.equal(en.num(-1e-9, 'pct1'), '0.0%');
  assert.equal(es.num(-0.4, 'int'), '0');
  assert.equal(es.num(-1e-9, 'dec4'), '0.0000');
  // Un negativo que NO se redondea a cero conserva su signo.
  assert.equal(es.num(-1.5, 'dec2'), '-1.50');
});

// ---------------------------------------------------------------------------
// Resto de pistas
// ---------------------------------------------------------------------------

test('sig2, sig3 y sig4 cuentan cifras significativas', () => {
  assert.equal(es.num(1234.5678, 'sig3'), '1,230');
  assert.equal(en.num(1234.5678, 'sig3'), '1,230');
  assert.equal(es.num(0.00123456, 'sig3'), '0.00123');
  assert.equal(es.num(0.0456, 'sig2'), '0.046');
  assert.equal(es.num(1.23456, 'sig4'), '1.235');
});

test('decN fija el número de decimales, con relleno de ceros', () => {
  assert.equal(es.num(1 / 3, 'dec4'), '0.3333');
  assert.equal(en.num(1 / 3, 'dec4'), '0.3333');
  assert.equal(es.num(0.85, 'dec1'), '0.9');
  assert.equal(es.num(2, 'dec3'), '2.000');
  assert.equal(es.num(2.5, 'int'), '3');
});

test('sin pista, num usa tres decimales', () => {
  assert.equal(es.num(1 / 3), '0.333');
  assert.equal(en.num(1 / 3), '0.333');
});

test('un límite que no llega a 1 ni baja a 0 no se muestra como 100 % ni como 0 %', () => {
  assert.equal(es.num(0.9999, 'pct1'), `> 99.9${FINO}%`);
  assert.equal(es.num(0.00004, 'pct1'), `< 0.1${FINO}%`);
  assert.equal(en.num(0.99996, 'pct2'), '> 99.99%');
  assert.equal(es.num(1, 'pct1'), `100.0${FINO}%`);
  assert.equal(es.num(0, 'pct1'), `0.0${FINO}%`);
  assert.equal(es.num(0.99949, 'pct1'), `99.9${FINO}%`);
});

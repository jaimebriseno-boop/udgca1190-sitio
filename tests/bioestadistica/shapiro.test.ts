/**
 * Port de AS R94 (Royston 1995) contra `shapiro.test` de R.
 *
 *   node --test tests/bioestadistica/shapiro.test.ts
 *
 * No necesita R instalado ni fixtures: los valores de referencia se generaron
 * con R 4.5.2 (aarch64-apple-darwin20) y están escritos aquí con 17 cifras, las
 * que reconstruyen el doble exacto. Las columnas de más de veinte valores no se
 * escriben a mano: se definen con una fórmula (cuantiles exponenciales,
 * normales o uniformes) que R y TypeScript evalúan sobre los mismos dobles.
 *
 * Se comprueba (1) que W y p coinciden con R a 1e-8 en las tres ramas del valor
 * p (n = 3 exacta, 4 ≤ n ≤ 11 y n ≥ 12) y en todo el rango admitido, 3 ≤ n ≤
 * 5000; (2) que los coeficientes salen normalizados; (3) la invariancia de W
 * frente a cambios de escala y de origen; y (4) que las entradas fuera de rango
 * lanzan `RangeError`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { qnorm } from '../../src/lib/bioestadistica/primitivas/distribuciones.ts';
import { coeficientesShapiro, shapiroWilk } from '../../src/lib/bioestadistica/metodos/shapiro.ts';
import { shapiro as TOL_SHAPIRO } from './tolerancias.ts';

/** `|a − b| ≤ abs + rel·max(|a|, |b|)`, la misma regla que `comparar.ts`. */
function cerca(a: number, b: number, tol = TOL_SHAPIRO): boolean {
  return Math.abs(a - b) <= tol.abs + tol.rel * Math.max(Math.abs(a), Math.abs(b));
}

/** Cuantiles de una exponencial estándar: columna con cola derecha marcada. */
const exponencial = (n: number): number[] => Array.from({ length: n }, (_, i) => -Math.log(1 - (i + 0.5) / n));

/** Cuantiles normales de Blom: la columna «más normal» posible, con W casi 1. */
const normal = (n: number): number[] => Array.from({ length: n }, (_, i) => qnorm((i + 1 - 0.375) / (n + 0.25)));

/** Cuantiles uniformes: columna plana (curtosis negativa). */
const uniforme = (n: number): number[] => Array.from({ length: n }, (_, i) => (i + 0.5) / n);

/** Columna, W y p de R 4.5.2 para cada caso de referencia. */
const REFERENCIA: Array<{ id: string; x: number[]; w: number; p: number }> = [
  // Columnas explícitas
  {
    id: 'ejemplo_40',
    x: [
      47, 165, 97, 138, 202, 156, 166, 141, 96, 132, 177, 51, 150, 117, 210, 178, 208, 138, 171, 50, 162, 139, 134,
      126, 160, 147, 196, 75, 166, 204, 226, 148, 99, 123, 160, 147, 153, 148, 79, 122,
    ],
    w: 0.96200633593579488,
    p: 0.19605295425782898,
  },
  { id: 'n3_perfecta', x: [1, 2, 3], w: 1, p: 0.99999999999999334 },
  { id: 'n3_sesgada', x: [1, 2, 10], w: 0.8321917808219178, p: 0.19391752148144781 },
  { id: 'n4', x: [1, 2, 4, 8], w: 0.92020267879193995, p: 0.53808377727496992 },
  { id: 'n5_duplicados', x: [1, 2, 2, 3, 10], w: 0.72795375543252083, p: 0.018361475255858125 },
  { id: 'n10', x: [2, 3, 4, 4, 5, 6, 6, 7, 9, 21], w: 0.72141624843474883, p: 0.0016024488775362466 },
  {
    id: 'n11',
    x: [148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236],
    w: 0.78881469483538758,
    p: 0.0067038140565029688,
  },
  {
    id: 'n12',
    x: [148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236, 120],
    w: 0.89352008613306355,
    p: 0.13082843479524034,
  },
  // Casi constantes: la rama en que log(1 − W) se acerca a γ(n) y p se desploma.
  { id: 'n10_casi_constante', x: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1000], w: 0.3657206274142637, p: 1.0036928138890777e-7 },
  {
    id: 'n20_casi_constante',
    x: [...Array<number>(19).fill(1), 1000],
    w: 0.23587389706410122,
    p: 2.6930778880634708e-9,
  },
  // Cuantiles exponenciales: n = 4 y 5 usan la normalización corta (n ≤ 5),
  // n = 11 y 12 cruzan el cambio de rama del valor p, 5000 es el máximo admitido.
  { id: 'exp_4', x: exponencial(4), w: 0.93270307793572726, p: 0.61037593563688797 },
  { id: 'exp_5', x: exponencial(5), w: 0.91663710424811051, p: 0.50848195492923876 },
  { id: 'exp_6', x: exponencial(6), w: 0.90521713946567506, p: 0.40568533025320408 },
  { id: 'exp_11', x: exponencial(11), w: 0.87588976633851678, p: 0.09223251629106155 },
  { id: 'exp_12', x: exponencial(12), w: 0.87256248816163029, p: 0.070434830210159588 },
  { id: 'exp_13', x: exponencial(13), w: 0.86966258596820922, p: 0.051764248468633367 },
  { id: 'exp_20', x: exponencial(20), w: 0.85635745672567087, p: 0.0068248092524668715 },
  { id: 'exp_50', x: exponencial(50), w: 0.83758652155261837, p: 7.2554120934992198e-6 },
  { id: 'exp_200', x: exponencial(200), w: 0.82375256067387181, p: 2.692416832862741e-14 },
  { id: 'exp_1000', x: exponencial(1000), w: 0.81803039392987453, p: 3.7284602035919192e-32 },
  { id: 'exp_5000', x: exponencial(5000), w: 0.81636067744478813, p: 5.4840379256157941e-60 },
  // Cuantiles normales: W a menos de 1e-4 de 1, donde 1 − W se calcula aparte.
  { id: 'nor_12', x: normal(12), w: 0.9965868282782987, p: 0.99999998802775503 },
  { id: 'nor_50', x: normal(50), w: 0.99847406982804154, p: 0.99999999034977904 },
  { id: 'nor_200', x: normal(200), w: 0.99954633663779346, p: 0.99999999971062059 },
  { id: 'nor_1000', x: normal(1000), w: 0.99990313368731099, p: 0.99999999999778122 },
  // Cuantiles uniformes: curtosis negativa, el extremo opuesto al exponencial.
  { id: 'uni_4', x: uniforme(4), w: 0.99291200680061953, p: 0.9718770576208986 },
  { id: 'uni_7', x: uniforme(7), w: 0.97800162941210089, p: 0.94928856235361725 },
  { id: 'uni_12', x: uniforme(12), w: 0.96689636329140483, p: 0.87573144336587661 },
  { id: 'uni_30', x: uniforme(30), w: 0.95745055904372423, p: 0.26623267912969251 },
  { id: 'uni_100', x: uniforme(100), w: 0.95472474499171933, p: 0.0017217222029889336 },
];

// ---------------------------------------------------------------------------
// W y p contra R
// ---------------------------------------------------------------------------

test('W y p coinciden con shapiro.test de R en las tres ramas del valor p', () => {
  let peorW = 0;
  let peorP = 0;
  for (const caso of REFERENCIA) {
    const r = shapiroWilk(caso.x);
    assert.ok(cerca(r.w, caso.w), `${caso.id}: W = ${r.w}, R da ${caso.w}`);
    assert.ok(cerca(r.p, caso.p), `${caso.id}: p = ${r.p}, R da ${caso.p}`);
    peorW = Math.max(peorW, Math.abs(r.w - caso.w) / Math.abs(caso.w));
    if (caso.p > 1e-300) peorP = Math.max(peorP, Math.abs(r.p - caso.p) / caso.p);
  }
  console.log(`  · ${REFERENCIA.length} columnas · dif. rel. máxima W ${peorW.toExponential(2)} · p ${peorP.toExponential(2)}`);
  assert.ok(peorW < 1e-8 && peorP < 1e-8);
});

test('los tamaños de referencia cubren los límites y los dos cambios de rama', () => {
  const tamanos = new Set(REFERENCIA.map((c) => c.x.length));
  for (const n of [3, 4, 5, 6, 11, 12, 13, 50, 200, 1000, 5000]) {
    assert.ok(tamanos.has(n), `falta un caso de referencia con n = ${n}`);
  }
});

// ---------------------------------------------------------------------------
// Coeficientes
// ---------------------------------------------------------------------------

test('los coeficientes están normalizados, son positivos y decrecen', () => {
  for (const n of [3, 4, 5, 6, 7, 11, 12, 40, 200, 1001]) {
    const a = coeficientesShapiro(n);
    const n2 = Math.floor(n / 2);
    assert.equal(a.length, n2 + 1, `n = ${n}: longitud inesperada`);
    // El vector completo es (a₁…a_{n2}, [0], −a_{n2}…−a₁) y tiene norma 1.
    let suma = 0;
    for (let i = 1; i <= n2; i += 1) suma += (a[i] as number) ** 2;
    assert.ok(Math.abs(2 * suma - 1) < 1e-12, `n = ${n}: la norma del vector de pesos es ${Math.sqrt(2 * suma)}`);
    for (let i = 1; i <= n2; i += 1) assert.ok((a[i] as number) > 0, `n = ${n}: a[${i}] no es positivo`);
    for (let i = 2; i <= n2; i += 1) {
      assert.ok((a[i] as number) < (a[i - 1] as number), `n = ${n}: a[${i}] no es menor que a[${i - 1}]`);
    }
  }
});

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

test('W está en (0, 1] y el valor p en [0, 1]', () => {
  for (const caso of REFERENCIA) {
    const r = shapiroWilk(caso.x);
    assert.ok(r.w > 0 && r.w <= 1 + 1e-12, `${caso.id}: W = ${r.w} fuera de (0, 1]`);
    assert.ok(r.p >= 0 && r.p <= 1, `${caso.id}: p = ${r.p} fuera de [0, 1]`);
  }
});

test('W no cambia al reescalar ni al trasladar la columna, ni al desordenarla', () => {
  const columnas = [
    [2, 3, 4, 4, 5, 6, 6, 7, 9, 21],
    [148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236],
    exponencial(50),
  ];
  for (const x of columnas) {
    const base = shapiroWilk(x).w;
    for (const factor of [1e-3, 0.5, 2, 1000]) {
      const escalada = shapiroWilk(x.map((v) => v * factor)).w;
      assert.ok(Math.abs(escalada - base) <= 1e-12, `escala ×${factor}: W ${escalada} frente a ${base}`);
    }
    for (const desplazamiento of [-50, 7, 100]) {
      const movida = shapiroWilk(x.map((v) => v + desplazamiento)).w;
      assert.ok(Math.abs(movida - base) <= 1e-12, `traslación +${desplazamiento}: W ${movida} frente a ${base}`);
    }
    // El algoritmo divide entre el rango sin restar el mínimo (como el listado
    // y como R): con un origen enorme la invariancia se queda en ~1e-10.
    const lejos = shapiroWilk(x.map((v) => v + 1e6)).w;
    assert.ok(Math.abs(lejos - base) <= 1e-10, `traslación +1e6: W ${lejos} frente a ${base}`);
    const revuelta = shapiroWilk([...x].reverse()).w;
    assert.equal(revuelta, base, 'el orden de la columna no debería importar');
  }
});

test('la columna original no se modifica', () => {
  const x = [21, 2, 9, 4, 3];
  const copia = [...x];
  shapiroWilk(x);
  assert.deepEqual(x, copia);
});

test('una columna de una sola constante repetida no llega al algoritmo, pero una casi constante sí', () => {
  assert.throws(() => shapiroWilk([4, 4, 4, 4]), RangeError);
  // Rango diminuto: R reescala y el algoritmo devuelve un W válido.
  const r = shapiroWilk([1, 1 + 1e-14, 1 + 2e-14, 1 + 3e-14]);
  assert.ok(r.w > 0 && r.w <= 1 && Number.isFinite(r.p));
});

test('las entradas fuera de rango lanzan RangeError', () => {
  assert.throws(() => shapiroWilk([1, 2]), RangeError); // n < 3
  assert.throws(() => shapiroWilk([]), RangeError);
  assert.throws(() => shapiroWilk(Array.from({ length: 5001 }, (_, i) => i)), RangeError); // n > 5000
  assert.throws(() => shapiroWilk([5, 5, 5]), RangeError); // rango 0
  assert.throws(() => shapiroWilk([1, 2, Number.NaN]), RangeError);
  assert.throws(() => shapiroWilk([1, 2, Number.POSITIVE_INFINITY]), RangeError);
  // 5000 exactos sí entran.
  assert.ok(Number.isFinite(shapiroWilk(exponencial(5000)).w));
});

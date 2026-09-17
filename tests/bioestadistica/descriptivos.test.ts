/**
 * Calculadora «Descriptivos de una variable» contra el oráculo R y sus
 * propiedades.
 *
 *   node --test tests/bioestadistica/descriptivos.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo descriptivos`. Se comprueba (1) que las
 * dieciocho salidas de TypeScript coinciden con las de R caso por caso,
 * incluidos los `NA` de G1, G2, la media geométrica y Shapiro-Wilk; (2) que el
 * snippet ejecutado es, byte a byte, el que ve el usuario, con la columna
 * escrita como un `c(...)` de varias líneas; (3) que el SHA-256 de `r.codigo`
 * es el grabado en el fixture; y (4) propiedades algebraicas y de interfaz que
 * valen para cualquier columna.
 *
 * La prueba del port de AS R94 contra `shapiro.test` vive aparte, en
 * `shapiro.test.ts`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import {
  asimetriaG1,
  binsSturges,
  cajaTukey,
  cercasTukey,
  clasesSturges,
  cuantilTipo7,
  cuartilesTipo7,
  curtosisG2,
  descriptivos,
  desviacion,
  media,
  mediaGeometrica,
} from '../../src/lib/bioestadistica/metodos/descriptivos.ts';
import { parsearPegado } from '../../src/lib/bioestadistica/nucleo/pegado.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/descriptivos.ts';
import type { EntradasDescriptivos } from '../../src/lib/bioestadistica/calculadoras/descriptivos.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'descriptivos';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];

function entradasDe(caso: CasoFixture): EntradasDescriptivos {
  return conDerivadas(definicion, caso.entradas) as EntradasDescriptivos;
}

/** Columna del ejemplo del YAML: 40 plaquetas simuladas con set.seed(1190). */
const COLUMNA_EJEMPLO = yamlCalc.ejemplo.x as number[];
const EJEMPLO: EntradasDescriptivos = { x: COLUMNA_EJEMPLO, nivel: 0.95 };

// ---------------------------------------------------------------------------
// Integridad del fixture
// ---------------------------------------------------------------------------

test('el fixture corresponde a la plantilla de R que hay ahora en el YAML', () => {
  const sha = createHash('sha256').update(yamlCalc.r.codigo, 'utf8').digest('hex');
  assert.equal(fixture.meta.plantilla_sha256, sha, `r.codigo cambió sin regenerar: node scripts/bio-fixtures.mjs --solo ${SLUG}`);
});

test('el fixture trae el ejemplo primero y cubre exactamente los casos curados', () => {
  const curados = leerCasos(SLUG);
  assert.equal(fixture.meta.calculadora, SLUG);
  assert.equal(fixture.casos[0]?.id, 'ejemplo');
  assert.deepEqual(fixture.casos[0]?.entradas, yamlCalc.ejemplo);
  assert.deepEqual(
    fixture.casos.map((c) => c.id),
    ['ejemplo', ...curados.casos.map((c) => c.id)],
    `casos/${SLUG}.json cambió sin regenerar`,
  );
  assert.equal(fixture.casos.length, 17);
  for (const curado of curados.casos) {
    assert.deepEqual(fixture.casos.find((c) => c.id === curado.id)?.entradas, curado.entradas);
    assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota`);
  }
  for (const paquete of yamlCalc.r.paquetes) {
    assert.match(fixture.meta.paquetes[paquete] ?? '', /^\d/, `falta la versión de ${paquete}`);
  }
});

test('cada caso del fixture usa un perfil de tolerancia que existe', () => {
  for (const caso of fixture.casos) assert.ok(TOL[caso.tol], `${caso.id}: perfil «${caso.tol}» inexistente`);
});

test('los casos cubren los tamaños en que aparecen y desaparecen las salidas', () => {
  const tamanos = fixture.casos.map((c) => (c.entradas.x as number[]).length);
  for (const n of [2, 3, 4, 5, 11, 12, 30, 40, 200]) {
    assert.ok(tamanos.includes(n), `falta un caso con n = ${n}`);
  }
});

// ---------------------------------------------------------------------------
// TypeScript contra R, caso por caso
// ---------------------------------------------------------------------------

for (const caso of fixture.casos) {
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const e = entradasDe(caso);
    const esperado = normalizarR(caso.esperado) as Record<string, unknown>;
    const informe = comparar(calcular(e, e.nivel), esperado, TOL[caso.tol] as NonNullable<(typeof TOL)[string]>);
    assert.ok(
      informe.coincide,
      `${caso.id} (n = ${(caso.entradas.x as number[]).length}) · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`,
    );
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    const generado = readFileSync(rutaGenerado(SLUG, caso.id), 'utf8');
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), generado);
  });
}

test('la columna se interpola como un c(...) de varias líneas, legible al pegarlo en RStudio', () => {
  const texto = rellenarR(yamlCalc.r.codigo, yamlCalc.ejemplo);
  assert.match(texto, /^x <- c\(47, 165, 97,/m, 'la columna no empieza por sus propios valores');
  const bloque = texto.slice(texto.indexOf('x <- c('), texto.indexOf('nivel <-'));
  assert.ok(bloque.includes('\n  '), 'el vector debería partirse en varias líneas con sangría de dos espacios');
  for (const linea of bloque.split('\n')) assert.ok(linea.length <= 80, `línea demasiado larga: ${linea}`);
  assert.ok(bloque.includes('122)'), 'falta el último valor de la columna');
});

test('los NA de R llegan como «no definido» y TypeScript los reproduce', () => {
  const constante = fixture.casos.find((c) => c.id === 'constante');
  assert.ok(constante);
  const r = normalizarR(constante.esperado) as Record<string, unknown>;
  for (const campo of ['g1', 'g2', 'sw_w', 'sw_p']) {
    assert.equal(r[campo], null, `R debería devolver NA en ${campo} con una columna constante`);
  }
  const ts = calcular(entradasDe(constante), 0.95);
  for (const campo of ['g1', 'g2', 'sw_w', 'sw_p'] as const) {
    assert.ok(Number.isNaN(ts.valores[campo].valor), `TypeScript debería dar NaN en ${campo}`);
  }
  assert.equal(ts.valores.de.valor, 0);
  assert.deepEqual(ts.valores.media.ic, [5, 5]);

  const sinPositivos = fixture.casos.find((c) => c.id === 'con_no_positivos');
  assert.ok(sinPositivos);
  assert.equal((normalizarR(sinPositivos.esperado) as Record<string, unknown>).media_geom, null);
  assert.ok(Number.isNaN(calcular(entradasDe(sinPositivos), 0.95).valores.media_geom.valor));
});

// ---------------------------------------------------------------------------
// Propiedades de los momentos y los cuantiles
// ---------------------------------------------------------------------------

/** Columnas de prueba: cortas, largas, con repetidos, negativas y decimales. */
function* columnas(): Generator<[string, number[]]> {
  yield ['n2', [7, 9]];
  yield ['n3', [1, 2, 3]];
  yield ['n4', [1, 2, 4, 8]];
  yield ['repetidos', [1, 2, 2, 3, 10]];
  yield ['negativa', [-12.5, -3.2, -0.5, -8.1, -20, -1.1]];
  yield ['decimal', [0.1, 0.25, 0.33, 0.4, 0.51, 0.62, 0.7, 0.88]];
  yield ['ejemplo', COLUMNA_EJEMPLO];
  yield ['lineal', Array.from({ length: 101 }, (_, i) => i / 4)];
  yield ['exponencial', Array.from({ length: 60 }, (_, i) => Math.exp(i / 10))];
}

test('la media y la DE coinciden con las fórmulas ingenuas', () => {
  for (const [id, x] of columnas()) {
    const n = x.length;
    const mediaIngenua = x.reduce((s: number, v: number) => s + v, 0) / n;
    const m = media(x);
    assert.ok(Math.abs(m - mediaIngenua) <= 1e-12 * Math.max(1, Math.abs(m)), `${id}: media ${m} vs ${mediaIngenua}`);
    const deIngenua = Math.sqrt(x.reduce((s: number, v: number) => s + (v - mediaIngenua) ** 2, 0) / (n - 1));
    const de = desviacion(x);
    assert.ok(Math.abs(de - deIngenua) <= 1e-12 * Math.max(1, de), `${id}: DE ${de} vs ${deIngenua}`);
  }
});

test('la media reproduce a `mean()` de R, incluida su primera pasada sin compensar', () => {
  // Valores de R 4.5.2 en arm64, donde `LDOUBLE` es el mismo doble de 64 bits.
  // Una suma compensada daría otro número en los dos casos: la segunda pasada
  // de R recupera precisión, pero no toda, y el oráculo es R.
  const mezclado = [1e16, 1, 1, 1, -1e16, 2, 3, -2];
  assert.equal(media(mezclado), 0.609375, 'Rscript -e "mean(c(1e16,1,1,1,-1e16,2,3,-2))" da 0.609375');
  assert.notEqual(
    media(mezclado),
    mezclado.reduce((s: number, v: number) => s + v, 0) / mezclado.length,
    'la media de una sola pasada daría 0.375',
  );
  const otro = [1e10, 1, -1e10, 2, 3];
  assert.equal(media(otro), 1.1999995422363281, 'R da 1.1999995422363281, no 1.2');
  assert.equal(desviacion(otro), 7071067811.8654757, 'R da sd = 7071067811.8654757');
  // Con datos corrientes la segunda pasada deja la media exacta al último bit.
  assert.equal(media([1, 2, 3, 4]), 2.5);
  assert.equal(media(COLUMNA_EJEMPLO), 142.6);
});

test('el cuantil del tipo 7 reproduce la interpolación de R', () => {
  // n = 4 sobre [1, 2, 4, 8]: h = 1 + 3p, así que Q1 cae entre x(1) y x(2).
  assert.deepEqual(cuartilesTipo7([1, 2, 4, 8]), [1.75, 3, 5]);
  assert.equal(cuantilTipo7([1, 2, 4, 8], 0), 1);
  assert.equal(cuantilTipo7([1, 2, 4, 8], 1), 8);
  // Con vecinos repetidos no se interpola (la regla `x[hi] != qs` de R).
  assert.equal(cuantilTipo7([1, 2, 2, 3, 10], 0.25), 2);
  // La mediana de una columna impar es el valor central exacto.
  assert.equal(cuantilTipo7([1, 2, 3, 4, 5], 0.5), 3);
  // Y el cuantil siempre queda entre el mínimo y el máximo, y es monótono en p.
  for (const [id, x] of columnas()) {
    const ordenado = [...x].sort((a: number, b: number) => a - b);
    let previo = Number.NEGATIVE_INFINITY;
    for (let i = 0; i <= 20; i += 1) {
      const q = cuantilTipo7(ordenado, i / 20);
      assert.ok(q >= (ordenado[0] as number) - EPS && q <= (ordenado[ordenado.length - 1] as number) + EPS, `${id}`);
      assert.ok(q >= previo - EPS, `${id}: el cuantil no es monótono en p`);
      previo = q;
    }
  }
});

test('los cuartiles del fixture salen de la misma regla', () => {
  for (const caso of fixture.casos) {
    const x = caso.entradas.x as number[];
    const r = normalizarR(caso.esperado) as Record<string, number>;
    const [q1, mediana, q3] = cuartilesTipo7([...x].sort((a: number, b: number) => a - b));
    for (const [nombre, ts, oraculo] of [
      ['q1', q1, r.q1],
      ['mediana', mediana, r.mediana],
      ['q3', q3, r.q3],
    ] as Array<[string, number, number]>) {
      assert.ok(Math.abs(ts - oraculo) <= 1e-12 * Math.max(1, Math.abs(oraculo)), `${caso.id}.${nombre}`);
    }
  }
});

test('G1 cambia de signo al negar la columna y G2 no cambia', () => {
  for (const [id, x] of columnas()) {
    if (x.length < 4) continue;
    const opuesta = x.map((v: number) => -v);
    const g1 = asimetriaG1(x);
    const g1Opuesta = asimetriaG1(opuesta);
    assert.ok(Math.abs(g1 + g1Opuesta) <= 1e-10 * Math.max(1, Math.abs(g1)), `${id}: G1 ${g1} y ${g1Opuesta}`);
    const g2 = curtosisG2(x);
    assert.ok(Math.abs(g2 - curtosisG2(opuesta)) <= 1e-10 * Math.max(1, Math.abs(g2)), `${id}: G2 no debería cambiar`);
    // Y ninguno depende del origen ni de la escala positiva.
    assert.ok(Math.abs(asimetriaG1(x.map((v: number) => 3 * v + 100)) - g1) <= 1e-9 * Math.max(1, Math.abs(g1)), `${id}: G1 no es invariante`);
  }
  // Una columna simétrica tiene G1 = 0 exactamente.
  assert.equal(asimetriaG1([1, 2, 3]), 0);
  // Y los umbrales publicados: n < 3 sin G1, n < 4 sin G2, columna constante sin ninguno.
  assert.ok(Number.isNaN(asimetriaG1([7, 9])));
  assert.ok(Number.isNaN(curtosisG2([1, 2, 3])));
  assert.ok(Number.isNaN(asimetriaG1([5, 5, 5, 5])) && Number.isNaN(curtosisG2([5, 5, 5, 5])));
});

test('la media geométrica nunca supera a la aritmética y solo existe con valores positivos', () => {
  for (const [id, x] of columnas()) {
    const g = mediaGeometrica(x);
    if (x.every((v: number) => v > 0)) {
      assert.ok(g <= media(x) + 1e-9 * Math.max(1, Math.abs(g)), `${id}: media geométrica ${g} > media ${media(x)}`);
      assert.ok(g >= Math.min(...x) - EPS && g <= Math.max(...x) + EPS, `${id}: fuera del rango`);
    } else {
      assert.ok(Number.isNaN(g), `${id}: debería ser «no definido»`);
    }
  }
  assert.ok(Number.isNaN(mediaGeometrica([1, 0, 3])));
  assert.ok(Number.isNaN(mediaGeometrica([1, -2, 3])));
  assert.equal(mediaGeometrica([2, 8]), 4); // √(2·8)
});

// ---------------------------------------------------------------------------
// Tukey y Sturges
// ---------------------------------------------------------------------------

test('las cercas de Tukey marcan los mismos atípicos que R', () => {
  const caso = fixture.casos.find((c) => c.id === 'atipicos');
  assert.ok(caso);
  const x = caso.entradas.x as number[];
  const r = normalizarR(caso.esperado) as Record<string, number>;
  const { inferior, superior } = cercasTukey(r.q1 as number, r.q3 as number);
  const fuera = x.filter((v: number) => v < inferior || v > superior);
  assert.equal(fuera.length, r.n_atipicos, 'el conteo de atípicos no coincide con el de R');
  assert.ok(fuera.includes(500) && fuera.includes(5), 'los dos valores añadidos deberían quedar fuera de las cercas');
  // El diagrama de caja pone esos valores como puntos y estira los bigotes al
  // dato más extremo que sí queda dentro.
  const caja = cajaTukey(x);
  assert.deepEqual(caja.atipicos, [...fuera].sort((a: number, b: number) => a - b));
  assert.ok(caja.bigoteInf >= inferior && caja.bigoteSup <= superior);
  assert.ok(caja.min <= caja.q1 && caja.q1 <= caja.mediana && caja.mediana <= caja.q3 && caja.q3 <= caja.max);
  // Sin atípicos los bigotes llegan al mínimo y al máximo.
  const limpia = cajaTukey([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(limpia.atipicos, []);
  assert.equal(limpia.bigoteInf, 1);
  assert.equal(limpia.bigoteSup, 8);
});

test('las clases de Sturges cubren la columna y reparten todos los valores', () => {
  for (const [id, x] of columnas()) {
    const k = clasesSturges(x.length);
    const bins = binsSturges(x);
    const primero = bins[0] as { desde: number; hasta: number; n: number };
    const ultimo = bins[bins.length - 1] as { desde: number; hasta: number; n: number };
    assert.ok(bins.length >= 1 && bins.length <= 3 * k, `${id}: ${bins.length} clases para k = ${k}`);
    assert.ok(primero.desde <= Math.min(...x) + EPS, `${id}: el primer corte no cubre el mínimo`);
    assert.ok(ultimo.hasta >= Math.max(...x) - EPS, `${id}: el último corte no cubre el máximo`);
    assert.equal(bins.reduce((s: number, b: { n: number }) => s + b.n, 0), x.length, `${id}: se perdió algún valor`);
    for (let i = 1; i < bins.length; i += 1) {
      const previo = bins[i - 1] as { hasta: number };
      const actual = bins[i] as { desde: number; hasta: number };
      assert.ok(Math.abs(actual.desde - previo.hasta) < 1e-9, `${id}: hay un hueco entre clases`);
      assert.ok(actual.hasta > actual.desde, `${id}: clase de ancho no positivo`);
    }
  }
  assert.equal(clasesSturges(40), 7); // ceil(log2(40) + 1)
  assert.equal(clasesSturges(8), 4);
  // Una columna constante se dibuja como una sola clase centrada en el valor.
  const constante = binsSturges([5, 5, 5, 5, 5]);
  assert.equal(constante.length, 1);
  assert.deepEqual([constante[0]?.desde, constante[0]?.hasta, constante[0]?.n], [4.5, 5.5, 5]);
});

// ---------------------------------------------------------------------------
// Contrato de interfaz: validar, bandas, avisos y presentación en ambos idiomas
// ---------------------------------------------------------------------------

test('validar() rechaza columnas cortas, valores no finitos y niveles fuera de rango', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, x: [] }), { x: 'err_n_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, x: [1] }), { x: 'err_n_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, x: [1, Number.NaN] }), { x: 'err_numero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, x: [1, Number.POSITIVE_INFINITY] }), { x: 'err_numero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 1 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ x: [1], nivel: 2 } as EntradasDescriptivos), { x: 'err_n_min', nivel: 'err_rango' });
  // Dos valores bastan.
  assert.equal(definicion.validar({ x: [7, 9], nivel: 0.95 }), null);
  // Y la capa numérica también se defiende sola.
  assert.throws(() => descriptivos([1]), RangeError);
  assert.throws(() => descriptivos([1, Number.NaN]), RangeError);
  assert.throws(() => descriptivos([1, 2], { nivel: 1 }), RangeError);
});

test('bandas y avisos del ejemplo y de los casos límite', () => {
  const ej = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ej.bandas, { cv: 'aplica', asimetria: 'simetrica', normalidad: 'sin_evidencia', n: 'normal' });
  assert.deepEqual(ej.avisos.map((a) => a.codigo), ['atipicos']);
  assert.deepEqual(ej.avisos[0]?.params, { n_atipicos: 3, k: 1.5 });

  const corta = calcular({ x: [7, 9], nivel: 0.95 }, 0.95);
  assert.equal(corta.bandas.normalidad, 'no_aplica');
  assert.deepEqual(corta.avisos.map((a) => a.codigo), ['n_pequeno']);
  assert.deepEqual(corta.avisos[0]?.params, { n: 2 });

  const plana = calcular({ x: [5, 5, 5, 5, 5], nivel: 0.95 }, 0.95);
  assert.deepEqual(plana.avisos.map((a) => a.codigo), ['constante']);
  assert.equal(plana.bandas.normalidad, 'no_aplica');
  assert.equal(plana.bandas.asimetria, 'simetrica');

  const conCero = calcular({ x: [-3, 0, 2, 5, 8], nivel: 0.95 }, 0.95);
  // Media 2.4 > 0: la media geométrica no existe, pero el CV sí se puede leer.
  assert.deepEqual(conCero.avisos.map((a) => a.codigo), ['no_positivos']);
  assert.equal(conCero.bandas.cv, 'aplica');

  // Cola derecha marcada: banda de asimetría y evidencia contra la normalidad.
  const sesgada = fixture.casos.find((c) => c.id === 'sesgada');
  assert.ok(sesgada);
  const s = calcular(entradasDe(sesgada), 0.95);
  assert.equal(s.bandas.asimetria, 'derecha');
  assert.equal(s.bandas.normalidad, 'evidencia');
  // Y su reflejo, cola izquierda.
  const reflejada = calcular({ x: (sesgada.entradas.x as number[]).map((v: number) => -v), nivel: 0.95 }, 0.95);
  assert.equal(reflejada.bandas.asimetria, 'izquierda');

  // n ≥ 1,000: aviso y banda de n grande (la prueba detecta lo irrelevante).
  const larga = calcular({ x: Array.from({ length: 1200 }, (_, i) => Math.sin(i) + i / 1200), nivel: 0.95 }, 0.95);
  assert.equal(larga.bandas.n, 'grande');
  assert.ok(larga.avisos.some((a) => a.codigo === 'n_grande'));

  // n > 5,000: sin Shapiro-Wilk, con su propio aviso y SIN el de n grande, que
  // habla de cómo leer un valor p que aquí no existe.
  const enorme = calcular({ x: Array.from({ length: 5001 }, (_, i) => (i * 37) % 911), nivel: 0.95 }, 0.95);
  assert.ok(Number.isNaN(enorme.valores.sw_w.valor) && Number.isNaN(enorme.valores.sw_p.valor));
  assert.equal(enorme.bandas.normalidad, 'no_aplica');
  assert.equal(enorme.bandas.n, 'grande');
  assert.ok(enorme.avisos.some((a) => a.codigo === 'sw_n_grande'));
  assert.ok(!enorme.avisos.some((a) => a.codigo === 'n_grande'), 'sw_n_grande y n_grande se contradicen');
  // Justo en el límite sí conviven el valor p y el aviso de n grande.
  const limite = calcular({ x: Array.from({ length: 5000 }, (_, i) => (i * 37) % 911), nivel: 0.95 }, 0.95);
  assert.ok(Number.isFinite(limite.valores.sw_p.valor));
  assert.ok(limite.avisos.some((a) => a.codigo === 'n_grande'));
  assert.ok(!limite.avisos.some((a) => a.codigo === 'sw_n_grande'));
});

test('con media no positiva el CV se retira de la celda y de la interpretación, pero el número no cambia', () => {
  // Media negativa: el CV saldría como «−52.7 %», que se lee al revés.
  // Media 0: el CV es infinito. En ninguno de los dos casos es interpretable.
  const columnas: Array<[string, number[]]> = [
    ['media_negativa', [-10, -8, -6, -4, -2]],
    ['media_cero', [-3, -1, 0, 1, 3]],
  ];
  for (const [id, x] of columnas) {
    const e: EntradasDescriptivos = { x, nivel: 0.95 };
    const s = calcular(e, 0.95);
    assert.ok(s.valores.media.valor <= 0, `${id}: la media debería ser ≤ 0`);
    assert.equal(s.bandas.cv, 'no_aplica', id);
    assert.ok(s.avisos.some((a) => a.codigo === 'cv_no_aplica'), `${id}: falta el aviso cv_no_aplica`);
    // El valor crudo sigue siendo el de R: lo que cambia es cómo se publica.
    assert.equal(s.valores.cv.valor, s.valores.de.valor / s.valores.media.valor, id);
    for (const lang of IDIOMAS) {
      const p = presentar(s, e, contextoDePrueba(SLUG, lang));
      assert.equal(p.celdas.cv.valor, '—', `${lang}/${id}: la celda del CV debería ser una raya`);
      assert.ok((p.celdas.cv.nota ?? '').length > 0, `${lang}/${id}: falta la nota «no aplica»`);
      assert.equal(p.celdas.cv.ic, undefined);
      const texto = p.interpretacion.join(' ');
      assert.ok(!texto.includes('∞'), `${lang}/${id}: el infinito no debería llegar a la interpretación`);
      assert.ok(!texto.includes('52.7'), `${lang}/${id}: el CV no debería imprimirse`);
      assert.ok(!texto.includes('{'), `${lang}/${id}: marcador sin rellenar`);
      // La fila de exportación tampoco publica el número.
      assert.deepEqual(p.resumen.find((f) => f[0] === contextoDePrueba(SLUG, lang).textos.etiquetas.cv)?.[1], '—');
    }
  }
  // Con media positiva no cambia nada: el CV se sigue publicando como antes.
  const ej = calcular(EJEMPLO, 0.95);
  assert.equal(ej.bandas.cv, 'aplica');
  assert.ok(!ej.avisos.some((a) => a.codigo === 'cv_no_aplica'));
  const es = presentar(ej, EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.ok(es.celdas.cv.valor.startsWith('30.8'));
  assert.ok(es.interpretacion[0]?.includes('30.8'));
});

test('el caso `negativos` del fixture conserva el CV crudo de R pese a la nueva presentación', () => {
  const caso = fixture.casos.find((c) => c.id === 'negativos');
  assert.ok(caso);
  const esperado = normalizarR(caso.esperado) as Record<string, number>;
  const s = calcular(entradasDe(caso), 0.95);
  assert.ok(esperado.cv < 0, 'el oráculo debería traer un CV negativo');
  assert.ok(Math.abs(s.valores.cv.valor - (esperado.cv as number)) <= 1e-12 * Math.abs(esperado.cv as number));
  assert.equal(s.bandas.cv, 'no_aplica');
  assert.equal(presentar(s, entradasDe(caso), contextoDePrueba(SLUG, 'es')).celdas.cv.valor, '—');
});

test('una columna pegada tal cual sale del parser alimenta la calculadora', () => {
  // Encabezado, coma decimal, faltante y texto: el parser los resuelve y lo que
  // entrega es exactamente lo que `validar()` y `calcular()` esperan.
  const r = parsearPegado('plaquetas\n150\n1,5\nNA\nabc\n160');
  assert.deepEqual(r.valores, [150, 1.5, 160]);
  assert.equal(r.encabezado, 'plaquetas');
  assert.equal(r.faltantes, 1);
  assert.deepEqual(r.ignorados, ['abc']);
  const entradas: EntradasDescriptivos = { x: r.valores, nivel: 0.95 };
  assert.equal(definicion.validar(entradas), null);
  assert.equal(calcular(entradas, 0.95).valores.n.valor, 3);
  // Y un pegado con un solo número no llega a calcularse.
  assert.deepEqual(definicion.validar({ x: parsearPegado('0.1').valores, nivel: 0.95 }), { x: 'err_n_min' });
});

test('presentar() rellena todas las plantillas en español e inglés, también en los casos límite', () => {
  const entradas: EntradasDescriptivos[] = [
    EJEMPLO,
    { x: [7, 9], nivel: 0.95 },
    { x: [5, 5, 5, 5, 5], nivel: 0.95 },
    { x: [-3, 0, 2, 5, 8], nivel: 0.95 },
    { x: [-12.5, -3.2, -0.5, -8.1, -20, -1.1], nivel: 0.99 },
    { x: [1, 2, 3], nivel: 0.9 },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const p = presentar(calcular(e, e.nivel), e, ctx);
      // En orden, no solo el mismo juego de claves: la tabla, el CSV y el
      // Markdown recorren `celdas` tal como `presentar()` las construyó.
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas]);
      assert.deepEqual(p.resumen.map((f) => f[0]), definicion.salidas.map((k) => ctx.textos.etiquetas[k]));
      const textos = [
        ...p.interpretacion,
        p.metodos,
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
      ];
      for (const texto of textos) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, 5);
      assert.equal(p.resumen.length, definicion.salidas.length);
      assert.ok(p.grafica && p.grafica.tipo === 'histograma-boxplot');
      assert.ok(p.grafica.bins && p.grafica.bins.length > 0, `${lang}: la gráfica no trae clases`);
      assert.equal(p.grafica.ejeX.dominio[0], p.grafica.bins[0]?.desde);
      assert.equal(p.grafica.ejeX.dominio[1], p.grafica.bins[p.grafica.bins.length - 1]?.hasta);
      assert.equal(p.grafica.marcadores?.length, 1);
      assert.equal(p.grafica.marcadores?.[0]?.x, calcular(e, e.nivel).valores.media.valor);
      // Sin dispersión no se dibuja la campana.
      const constante = e.x.every((v: number) => v === e.x[0]);
      assert.equal(p.grafica.normal === undefined, constante, `${lang}: la curva normal no corresponde`);
      for (const texto of [p.grafica.titulo, p.grafica.resumen, p.grafica.ejeX.etiqueta, p.grafica.etiquetaFrecuencia ?? '']) {
        assert.ok(texto.trim().length > 0, `${lang}: texto vacío en la gráfica`);
      }
    }
  }
});

test('la presentación del ejemplo dice lo que dice la comprobación manual', () => {
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.n.valor, '40');
  assert.equal(es.celdas.media.valor, '142.6');
  assert.equal(es.celdas.media.ic, '128.6 a 156.6');
  assert.equal(es.celdas.de.valor, '43.87');
  assert.equal(es.celdas.eem.valor, '6.936');
  assert.equal(es.celdas.mediana.valor, '147.5');
  assert.equal(es.celdas.q1.valor, '122.8');
  assert.equal(es.celdas.q3.valor, '166');
  assert.equal(es.celdas.iqr.valor, '43.25');
  assert.equal(es.celdas.min.valor, '47');
  assert.equal(es.celdas.max.valor, '226');
  assert.equal(es.celdas.rango.valor, '179');
  assert.ok(es.celdas.cv.valor.startsWith('30.8'), es.celdas.cv.valor);
  assert.equal(es.celdas.g1.valor, '-0.45');
  assert.equal(es.celdas.g2.valor, '0.03');
  assert.equal(es.celdas.media_geom.valor, '134.3');
  assert.equal(es.celdas.sw_w.valor, '0.962');
  assert.equal(es.celdas.sw_p.valor, '0.196');
  assert.equal(es.celdas.n_atipicos.valor, '3');
  assert.ok(es.interpretacion[0]?.includes('40 valores') && es.interpretacion[0]?.includes('147.5'));
  assert.ok(es.interpretacion[2]?.includes('W = 0.962') && es.interpretacion[2]?.includes('p = 0.196'));
  assert.ok(es.interpretacion[4]?.startsWith('3 valores'), es.interpretacion[4]);
  assert.ok(es.metodos.includes('Shapiro-Wilk [2,3]') && es.metodos.includes('[5]'), es.metodos);

  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.media.ic, '128.6 to 156.6');
  assert.equal(en.celdas.cv.valor, '30.8%');
  assert.ok(en.metodos.includes('Shapiro-Wilk test [2,3]'), en.metodos);

  // Los valores crudos son los del oráculo, sin redondear.
  const v = calcular(EJEMPLO, 0.95).valores;
  assert.equal(v.n.valor, 40);
  assert.equal(v.media.valor, 142.6);
  assert.equal(v.mediana.valor, 147.5);
  assert.equal(v.q1.valor, 122.75);
  assert.equal(v.q3.valor, 166);
  assert.equal(v.iqr.valor, 43.25);
  assert.equal(v.rango.valor, 179);
  assert.equal(v.n_atipicos.valor, 3);
  assert.ok(Math.abs(v.de.valor - 43.8650611505739) < 1e-12);
  assert.ok(Math.abs(v.sw_w.valor - 0.962006335935795) < 1e-12);
  assert.ok(Math.abs(v.sw_p.valor - 0.196052954257829) < 1e-12);
  // El intervalo contiene a la media y es simétrico alrededor de ella.
  const [lo, hi] = v.media.ic as [number, number];
  assert.ok(lo < v.media.valor && v.media.valor < hi);
  assert.ok(Math.abs(v.media.valor - lo - (hi - v.media.valor)) < 1e-12);
});

test('el nivel de confianza solo mueve el intervalo de la media', () => {
  const noventa = calcular({ ...EJEMPLO, nivel: 0.9 }, 0.9).valores;
  const noventaynueve = calcular({ ...EJEMPLO, nivel: 0.99 }, 0.99).valores;
  const base = calcular(EJEMPLO, 0.95).valores;
  for (const campo of ['n', 'media', 'de', 'eem', 'mediana', 'q1', 'q3', 'iqr', 'min', 'max', 'rango', 'cv', 'g1', 'g2', 'media_geom', 'sw_w', 'sw_p', 'n_atipicos'] as const) {
    assert.equal(noventa[campo].valor, base[campo].valor, `${campo} no debería depender del nivel`);
  }
  const ancho = (ic: [number, number] | undefined): number => (ic as [number, number])[1] - (ic as [number, number])[0];
  assert.ok(ancho(noventa.media.ic) < ancho(base.media.ic));
  assert.ok(ancho(base.media.ic) < ancho(noventaynueve.media.ic));
  assert.equal(noventa.media.nivel, 0.9);
});

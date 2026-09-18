/**
 * Calculadora «Kappa de Cohen» contra el oráculo R y sus propiedades.
 *
 *   node --test tests/bioestadistica/kappa.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo kappa`. Se comprueba (1) que las once
 * salidas de TypeScript coinciden con las de R caso por caso, incluidos los
 * `NA` de PABAK y los índices de Byrt cuando hay más de dos categorías; (2) que
 * el snippet ejecutado es, byte a byte, el que ve el usuario, con la tabla
 * escrita como un `c(...)` de varias líneas y el `nrow` que produce `derivar()`;
 * (3) que el SHA-256 de `r.codigo` es el grabado en el fixture; y (4)
 * propiedades algebraicas y de interfaz que valen para cualquier tabla.
 *
 * El detalle que obliga a numerar las categorías desde 11 en el snippet tiene
 * su propio caso (`k10_lineal`): `irr::kappa2` reconstruye sus niveles con
 * `factor()` y los ordena como texto, así que con las etiquetas 1 a 10 leería
 * «1», «10», «2» y desplazaría los pesos de una tabla de diez categorías.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { bandaKappa } from '../../src/lib/bioestadistica/nucleo/bandas.ts';
import {
  K_MAX,
  K_MIN,
  categoriasVacias,
  comoMatriz,
  esquinaNoroeste,
  kappaCohen,
  ladoTabla,
  pesos,
} from '../../src/lib/bioestadistica/metodos/kappa.ts';
import type { Ponderacion } from '../../src/lib/bioestadistica/metodos/kappa.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/kappa.ts';
import type { EntradasKappa } from '../../src/lib/bioestadistica/calculadoras/kappa.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import {
  RAIZ,
  conDerivadas,
  contextoDePrueba,
  leerCasos,
  leerFixture,
  leerYaml,
  leerYamlCompleto,
  rutaGenerado,
} from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'kappa';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];
const PERFIL = TOL[SLUG] as NonNullable<(typeof TOL)[string]>;

/** Tabla del ejemplo del YAML: dos clínicos y 100 casos de dengue en tres categorías. */
const TABLA_EJEMPLO = yamlCalc.ejemplo.x as number[];
const EJEMPLO: EntradasKappa = { x: TABLA_EJEMPLO, k: 3, ponderacion: 'ninguna', nivel: 0.95 };

function entradasDe(caso: CasoFixture): EntradasKappa {
  return conDerivadas(definicion, caso.entradas) as EntradasKappa;
}

/** Tabla k×k como lista por filas → la misma tabla traspuesta. */
function trasponer(x: readonly number[]): number[] {
  const k = ladoTabla(x);
  const salida: number[] = [];
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) salida.push(x[j * k + i] as number);
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Integridad del fixture
// ---------------------------------------------------------------------------

test('el fixture corresponde a la plantilla de R que hay ahora en el YAML', () => {
  const sha = createHash('sha256').update(yamlCalc.r.codigo, 'utf8').digest('hex');
  assert.equal(
    fixture.meta.plantilla_sha256,
    sha,
    `r.codigo cambió sin regenerar: node scripts/bio-fixtures.mjs --solo ${SLUG}`,
  );
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
  assert.equal(fixture.casos.length, 19);
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

test('los casos cubren los tres esquemas de pesos y los extremos de k', () => {
  const ponderaciones = new Set(fixture.casos.map((c) => c.entradas.ponderacion as string));
  assert.deepEqual([...ponderaciones].sort(), ['cuadratica', 'lineal', 'ninguna']);
  const lados = fixture.casos.map((c) => ladoTabla(c.entradas.x as number[]));
  for (const k of [K_MIN, 3, 4, K_MAX]) assert.ok(lados.includes(k), `falta un caso con k = ${k}`);
  const niveles = new Set(fixture.casos.map((c) => c.entradas.nivel as number));
  assert.deepEqual([...niveles].sort((a, b) => a - b), [0.9, 0.95, 0.99]);
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
      `${caso.id} (k = ${ladoTabla(caso.entradas.x as number[])}, ${String(caso.entradas.ponderacion)}) · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`,
    );
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    const generado = readFileSync(rutaGenerado(SLUG, caso.id), 'utf8');
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), generado);
  });
}

test('la tabla se interpola como un c(...) de varias líneas y el nrow lo pone derivar()', () => {
  const texto = rellenarR(yamlCalc.r.codigo, yamlCalc.ejemplo);
  assert.match(texto, /^x <- matrix\(c\(40, 8, 2, 6, 25, 4, 1, 3, 11\), nrow = 3, byrow = TRUE\)$/m);
  assert.match(texto, /^ponderacion <- "ninguna"/m);

  // Diez categorías: cien conteos que no caben en una línea.
  const k10 = fixture.casos.find((c) => c.id === 'k10_lineal');
  assert.ok(k10);
  const largo = rellenarR(yamlCalc.r.codigo, k10.entradas);
  const bloque = largo.slice(largo.indexOf('x <- matrix('), largo.indexOf('ponderacion <-'));
  assert.ok(bloque.includes('\n  '), 'el vector debería partirse con sangría de dos espacios');
  assert.ok(bloque.includes('nrow = 10, byrow = TRUE'), 'el nrow derivado debería ser 10');
  for (const linea of bloque.split('\n')) assert.ok(linea.length <= 90, `línea demasiado larga: ${linea}`);
});

test('los NA de R llegan como «no definido» y TypeScript los reproduce', () => {
  // Con más de dos categorías, PABAK y los índices de Byrt son NA_real_ en R.
  const tresCategorias = fixture.casos.find((c) => c.id === 'ejemplo');
  assert.ok(tresCategorias);
  const r = normalizarR(tresCategorias.esperado) as Record<string, unknown>;
  for (const campo of ['pabak', 'indice_prevalencia', 'indice_sesgo']) {
    assert.equal(r[campo], null, `R debería devolver NA en ${campo} con tres categorías`);
  }
  const ts = calcular(entradasDe(tresCategorias), 0.95);
  for (const campo of ['pabak', 'indice_prevalencia', 'indice_sesgo'] as const) {
    assert.ok(Number.isNaN(ts.valores[campo].valor), `TypeScript debería dar NaN en ${campo}`);
  }
  // Y con dos, los tres son números.
  const dos = fixture.casos.find((c) => c.id === 'k2');
  assert.ok(dos);
  const rDos = normalizarR(dos.esperado) as Record<string, number>;
  assert.equal(rDos.pabak, 0.7);
  assert.equal(rDos.indice_prevalencia, 0.05);
  assert.equal(rDos.indice_sesgo, 0.05);
});

test('los valores publicados en la especificación salen tal cual', () => {
  const esperados: Array<[Ponderacion, number, number]> = [
    ['ninguna', 0.6088, 0.069],
    ['lineal', 0.6489, 0.0663],
    ['cuadratica', 0.6944, 0.0715],
  ];
  for (const [ponderacion, kappa, ee] of esperados) {
    const v = kappaCohen(TABLA_EJEMPLO, { ponderacion, nivel: 0.95 }).valores;
    assert.ok(Math.abs(v.kappa.valor - kappa) < 5e-5, `${ponderacion}: κ ${v.kappa.valor} ≠ ${kappa}`);
    assert.ok(Math.abs(v.ee.valor - ee) < 5e-5, `${ponderacion}: EE ${v.ee.valor} ≠ ${ee}`);
  }
});

// ---------------------------------------------------------------------------
// Propiedades de kappa
// ---------------------------------------------------------------------------

/** Tablas de prueba: cuadradas, con conteos enteros y al menos dos categorías útiles. */
function* tablas(): Generator<[string, number[], Ponderacion]> {
  const ejemplo = TABLA_EJEMPLO;
  const k4 = [12, 3, 1, 0, 4, 20, 5, 1, 1, 6, 15, 4, 0, 1, 5, 12];
  for (const ponderacion of ['ninguna', 'lineal', 'cuadratica'] as const) {
    yield [`ejemplo-${ponderacion}`, ejemplo, ponderacion];
    yield [`k4-${ponderacion}`, k4, ponderacion];
    yield [`k2-${ponderacion}`, [40, 10, 5, 45], ponderacion];
    yield [`desequilibrada-${ponderacion}`, [90, 5, 5, 0], ponderacion];
    yield [`perfecta-${ponderacion}`, [30, 0, 0, 0, 40, 0, 0, 0, 30], ponderacion];
    yield [`k5-${ponderacion}`, [9, 2, 1, 0, 0, 3, 11, 2, 1, 0, 0, 4, 14, 3, 1, 0, 1, 2, 10, 3, 0, 0, 1, 2, 8], ponderacion];
  }
}

test('κ y su intervalo se quedan dentro de [−1, 1]', () => {
  for (const [id, x, ponderacion] of tablas()) {
    const v = kappaCohen(x, { ponderacion, nivel: 0.95 }).valores;
    const kappa = v.kappa.valor;
    assert.ok(kappa >= -1 - EPS && kappa <= 1 + EPS, `${id}: κ = ${kappa} fuera de [−1, 1]`);
    const ic = v.kappa.ic as [number, number];
    assert.ok(ic[0] >= -1 && ic[1] <= 1, `${id}: el IC ${ic.join(', ')} no está truncado`);
    assert.ok(ic[0] <= kappa + EPS && kappa <= ic[1] + EPS, `${id}: κ fuera de su propio intervalo`);
    assert.ok(v.ee.valor >= 0, `${id}: EE negativo`);
    // Y el máximo alcanzable con esos marginales nunca queda por debajo de κ.
    assert.ok(
      v.kappa_max.valor >= kappa - 1e-9,
      `${id}: κ_max ${v.kappa_max.valor} por debajo de κ ${kappa}`,
    );
    assert.ok(v.kappa_max.valor <= 1 + EPS, `${id}: κ_max mayor que 1`);
  }
});

test('trasponer la tabla no cambia κ, ni su EE, ni la prueba frente a κ = 0', () => {
  for (const [id, x, ponderacion] of tablas()) {
    const a = kappaCohen(x, { ponderacion, nivel: 0.95 }).valores;
    const b = kappaCohen(trasponer(x), { ponderacion, nivel: 0.95 }).valores;
    for (const campo of ['po', 'pe', 'kappa', 'ee', 'z_h0', 'p_h0', 'kappa_max'] as const) {
      const x1 = a[campo].valor;
      const x2 = b[campo].valor;
      assert.ok(
        Math.abs(x1 - x2) <= 1e-12 * Math.max(1, Math.abs(x1)),
        `${id}.${campo}: ${x1} al trasponer pasa a ${x2}`,
      );
    }
  }
});

test('multiplicar la tabla por 3 conserva κ y divide el EE por √3', () => {
  for (const [id, x, ponderacion] of tablas()) {
    const a = kappaCohen(x, { ponderacion, nivel: 0.95 }).valores;
    const b = kappaCohen(
      x.map((celda: number) => 3 * celda),
      { ponderacion, nivel: 0.95 },
    ).valores;
    assert.equal(b.n.valor, 3 * a.n.valor, `${id}: n no se triplicó`);
    for (const campo of ['po', 'pe', 'kappa', 'kappa_max'] as const) {
      assert.ok(
        Math.abs(a[campo].valor - b[campo].valor) <= 1e-12 * Math.max(1, Math.abs(a[campo].valor)),
        `${id}.${campo} cambió al triplicar los conteos`,
      );
    }
    const esperado = a.ee.valor / Math.sqrt(3);
    assert.ok(
      Math.abs(b.ee.valor - esperado) <= 1e-12 * Math.max(1, esperado),
      `${id}: EE ${b.ee.valor} en vez de ${esperado}`,
    );
    // z sí crece con √3, porque el EE bajo H0 baja igual que el asintótico.
    const zEsperado = a.z_h0.valor * Math.sqrt(3);
    assert.ok(
      Math.abs(b.z_h0.valor - zEsperado) <= 1e-9 * Math.max(1, Math.abs(zEsperado)),
      `${id}: z ${b.z_h0.valor} en vez de ${zEsperado}`,
    );
  }
});

test('con dos categorías PABAK es 2p₀ − 1 y la ponderación no cambia nada', () => {
  const tablas2x2: number[][] = [
    [40, 10, 5, 45],
    [90, 5, 5, 0],
    [5, 1, 2, 4],
    [0, 10, 10, 0],
    [25, 0, 0, 25],
  ];
  for (const x of tablas2x2) {
    const base = kappaCohen(x, { ponderacion: 'ninguna', nivel: 0.95 }).valores;
    const n = base.n.valor;
    assert.ok(
      Math.abs(base.pabak.valor - (2 * base.po.valor - 1)) <= EPS,
      `[${x.join(', ')}]: PABAK ${base.pabak.valor} ≠ 2p₀ − 1`,
    );
    assert.equal(base.indice_prevalencia.valor, Math.abs((x[0] as number) - (x[3] as number)) / n);
    assert.equal(base.indice_sesgo.valor, Math.abs((x[1] as number) - (x[2] as number)) / n);
    // Con k = 2 los tres esquemas de pesos son la identidad.
    for (const ponderacion of ['lineal', 'cuadratica'] as const) {
      const otra = kappaCohen(x, { ponderacion, nivel: 0.95 }).valores;
      for (const campo of ['po', 'pe', 'kappa', 'ee', 'z_h0', 'pabak'] as const) {
        assert.equal(otra[campo].valor, base[campo].valor, `[${x.join(', ')}].${campo} cambió al ponderar con k = 2`);
      }
    }
  }
  // Y con más de dos categorías los tres índices de Byrt son «no definido».
  const tres = kappaCohen(TABLA_EJEMPLO, { ponderacion: 'ninguna', nivel: 0.95 }).valores;
  for (const campo of ['pabak', 'indice_prevalencia', 'indice_sesgo'] as const) {
    assert.ok(Number.isNaN(tres[campo].valor), `${campo} debería ser NaN con tres categorías`);
  }
});

test('los pesos son simétricos, valen 1 en la diagonal y ordenan los esquemas', () => {
  for (let k = K_MIN; k <= K_MAX; k += 1) {
    for (const ponderacion of ['ninguna', 'lineal', 'cuadratica'] as const) {
      const w = pesos(k, ponderacion);
      for (let i = 0; i < k; i += 1) {
        assert.equal((w[i] as number[])[i], 1, `k=${k} ${ponderacion}: la diagonal no vale 1`);
        for (let j = 0; j < k; j += 1) {
          const wij = (w[i] as number[])[j] as number;
          assert.equal(wij, (w[j] as number[])[i], `k=${k} ${ponderacion}: pesos asimétricos`);
          assert.ok(wij >= 0 && wij <= 1, `k=${k} ${ponderacion}: peso fuera de [0, 1]`);
        }
      }
      if (k === 2) assert.deepEqual(w, pesos(2, 'ninguna'), 'con k = 2 los tres esquemas son la identidad');
    }
    if (k > 2) {
      // Fuera de la diagonal: cuadrática ≥ lineal ≥ sin ponderar.
      const sin = pesos(k, 'ninguna');
      const lin = pesos(k, 'lineal');
      const cua = pesos(k, 'cuadratica');
      for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k; j += 1) {
          if (i === j) continue;
          assert.ok((cua[i] as number[])[j]! >= (lin[i] as number[])[j]! - EPS, `k=${k}: cuadrática < lineal en (${i}, ${j})`);
          assert.ok((lin[i] as number[])[j]! >= (sin[i] as number[])[j]!, `k=${k}: lineal < identidad en (${i}, ${j})`);
        }
      }
      // Y el extremo opuesto de la diagonal siempre vale 0.
      assert.equal((lin[0] as number[])[k - 1], 0);
      assert.equal((cua[0] as number[])[k - 1], 0);
    }
  }
});

test('la esquina noroeste reparte toda la masa y respeta los marginales', () => {
  const marginales: Array<[number[], number[]]> = [
    [[0.5, 0.5], [0.5, 0.5]],
    [[0.2, 0.8], [0.8, 0.2]],
    [[0.4, 0.2, 0.4], [0.2, 0.4, 0.4]],
    [[0.1, 0.8, 0.1], [0.8, 0.1, 0.1]],
    [[0.25, 0, 0.75], [0.5, 0.25, 0.25]],
  ];
  for (const [filas, columnas] of marginales) {
    const m = esquinaNoroeste(filas, columnas);
    for (let i = 0; i < filas.length; i += 1) {
      const suma = (m[i] as number[]).reduce((s: number, v: number) => s + v, 0);
      assert.ok(Math.abs(suma - (filas[i] as number)) <= 1e-12, `fila ${i}: ${suma} ≠ ${filas[i]}`);
    }
    for (let j = 0; j < columnas.length; j += 1) {
      let suma = 0;
      for (let i = 0; i < filas.length; i += 1) suma += (m[i] as number[])[j] as number;
      assert.ok(Math.abs(suma - (columnas[j] as number)) <= 1e-12, `columna ${j}: ${suma} ≠ ${columnas[j]}`);
    }
  }
});

test('las categorías vacías se eliminan y la tabla reducida manda', () => {
  const conVacia = [30, 0, 6, 0, 0, 0, 4, 0, 20];
  const reducida = [30, 6, 4, 20];
  const r = kappaCohen(conVacia, { ponderacion: 'ninguna', nivel: 0.95 });
  assert.deepEqual(r.vacias, [1]);
  assert.equal(r.k, 2);
  assert.deepEqual(r.tabla, [
    [30, 6],
    [4, 20],
  ]);
  const directa = kappaCohen(reducida, { ponderacion: 'ninguna', nivel: 0.95 }).valores;
  for (const campo of ['n', 'po', 'pe', 'kappa', 'ee', 'z_h0', 'pabak'] as const) {
    assert.equal(r.valores[campo].valor, directa[campo].valor, `${campo} difiere de la tabla ya reducida`);
  }
  // Una fila vacía cuya columna NO lo está no se elimina.
  assert.deepEqual(categoriasVacias(comoMatriz([0, 0, 30, 20], 2)), []);
  assert.deepEqual(categoriasVacias(comoMatriz([30, 0, 0, 0], 2)), [1]);
});

test('la banda de Landis y Koch sigue los cortes publicados', () => {
  assert.equal(bandaKappa(-0.3), 'pobre');
  assert.equal(bandaKappa(0.2), 'leve');
  assert.equal(bandaKappa(0.4), 'aceptable');
  assert.equal(bandaKappa(0.6), 'moderado');
  assert.equal(bandaKappa(0.8), 'sustancial');
  assert.equal(bandaKappa(0.81), 'casi_perfecto');
  // Y la que publica la calculadora es la misma.
  for (const [id, x, ponderacion] of tablas()) {
    const s = calcular({ x, k: ladoTabla(x), ponderacion, nivel: 0.95 }, 0.95);
    assert.equal(s.bandas.landis, bandaKappa(s.valores.kappa.valor), `${id}: banda incoherente`);
  }
});

// ---------------------------------------------------------------------------
// Contrato de interfaz: derivar, validar, bandas, avisos y presentación
// ---------------------------------------------------------------------------

test('derivar() saca k del número de celdas pegadas', () => {
  assert.deepEqual(definicion.derivar?.({ ...EJEMPLO, k: Number.NaN }), { k: 3 });
  assert.deepEqual(definicion.derivar?.({ ...EJEMPLO, x: [1, 2, 3, 4], k: 9 }), { k: 2 });
  assert.deepEqual(definicion.derivar?.({ ...EJEMPLO, x: new Array(100).fill(1) as number[], k: 0 }), { k: 10 });
  // Una lista que no es un cuadrado perfecto deja k sin definir, y validar() lo explica.
  assert.ok(Number.isNaN((definicion.derivar?.({ ...EJEMPLO, x: [1, 2, 3], k: 0 }) as { k: number }).k));
  assert.ok(Number.isNaN(ladoTabla([])));
  assert.ok(Number.isNaN(ladoTabla([1, 2, 3, 4, 5])));
});

test('validar() rechaza tablas no cuadradas, fuera de rango o sin conteos', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  const con = (x: number[]): EntradasKappa => conDerivadas(definicion, { ...EJEMPLO, x }) as EntradasKappa;
  assert.deepEqual(definicion.validar(con([1, 2, 3])), { x: 'err_tabla_cuadrada' });
  assert.deepEqual(definicion.validar(con([])), { x: 'err_tabla_cuadrada' });
  assert.deepEqual(definicion.validar(con([7])), { x: 'err_tabla_cuadrada' }, 'k = 1 no es una tabla de acuerdo');
  assert.deepEqual(
    definicion.validar(con(new Array(121).fill(1) as number[])),
    { x: 'err_tabla_cuadrada' },
    'k = 11 supera el máximo',
  );
  assert.deepEqual(definicion.validar(con([1, -2, 3, 4])), { x: 'err_entero' });
  assert.deepEqual(definicion.validar(con([1.5, 2, 3, 4])), { x: 'err_entero' });
  assert.deepEqual(definicion.validar(con([1, Number.NaN, 3, 4])), { x: 'err_entero' });
  assert.deepEqual(definicion.validar(con([0, 0, 0, 0])), { x: 'err_rango' }, 'sin observaciones');
  // Una sola categoría con observaciones: tras eliminar las vacías queda k = 1.
  assert.deepEqual(definicion.validar(con([50, 0, 0, 0])), { x: 'err_rango' });
  assert.deepEqual(definicion.validar(con([0, 0, 0, 0, 30, 0, 0, 0, 0])), { x: 'err_rango' });
  // Selector y nivel.
  assert.deepEqual(definicion.validar({ ...EJEMPLO, ponderacion: 'ordinal' as Ponderacion }), {
    ponderacion: 'err_opcion',
  });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 1 }), { nivel: 'err_rango' });
  // Y la capa numérica también se defiende sola.
  assert.throws(() => kappaCohen([1, 2, 3]), RangeError);
  assert.throws(() => kappaCohen([1, -1, 1, 1]), RangeError);
  assert.throws(() => kappaCohen([0, 0, 0, 0]), RangeError);
  assert.throws(() => kappaCohen(TABLA_EJEMPLO, { nivel: 1 }), RangeError);
  assert.throws(() => comoMatriz([1, 2, 3], 2), RangeError);
});

test('bandas y avisos del ejemplo y de los casos límite', () => {
  const ej = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ej.bandas, { landis: 'sustancial', paradoja: 'no', k2: 'no' });
  assert.deepEqual(ej.avisos.map((a) => a.codigo), ['cortes']);

  // Paradoja de kappa: acuerdo 0.90 y κ negativa.
  const paradoja = calcular({ x: [90, 5, 5, 0], k: 2, ponderacion: 'ninguna', nivel: 0.95 }, 0.95);
  assert.equal(paradoja.bandas.paradoja, 'si');
  assert.equal(paradoja.bandas.k2, 'si');
  assert.deepEqual(paradoja.avisos.map((a) => a.codigo), ['paradoja', 'cortes']);
  // Sin parámetros: las cifras las escribe la interpretación, que sí pasa por
  // el formateador. Un número crudo aquí saldría «0.9» donde la celda dice «90.0 %».
  assert.equal(paradoja.avisos[0]?.params, undefined);

  // La misma paradoja con tres categorías: PABAK no está definido y viaja como guion.
  const paradoja3 = calcular(
    { x: [90, 3, 2, 3, 1, 0, 1, 0, 0], k: 3, ponderacion: 'ninguna', nivel: 0.95 },
    0.95,
  );
  assert.equal(paradoja3.bandas.paradoja, 'si');
  assert.equal(paradoja3.bandas.k2, 'no');
  assert.equal(paradoja3.avisos.find((a) => a.codigo === 'paradoja')?.params, undefined);

  // Categoría vacía y muestra pequeña, con la ponderación puesta.
  const vacia = calcular({ x: [5, 0, 1, 0, 0, 0, 1, 0, 5], k: 3, ponderacion: 'lineal', nivel: 0.95 }, 0.95);
  assert.deepEqual(
    vacia.avisos.map((a) => a.codigo),
    ['categoria_vacia', 'ponderada_ordinal', 'n_pequeno', 'cortes'],
  );
  assert.deepEqual(vacia.avisos[0]?.params, { k: 2 });
  assert.deepEqual(vacia.avisos[2]?.params, { n: 12 });
  for (const aviso of vacia.avisos) {
    for (const valor of Object.values(aviso.params ?? {})) {
      assert.ok(Number.isInteger(valor), `${aviso.codigo}: solo los enteros se escriben igual con y sin formateador`);
    }
  }

  // Acuerdo perfecto: κ = 1, EE = 0 e intervalo degenerado.
  const perfecto = calcular({ x: [30, 0, 0, 0, 40, 0, 0, 0, 30], k: 3, ponderacion: 'ninguna', nivel: 0.95 }, 0.95);
  assert.equal(perfecto.valores.kappa.valor, 1);
  assert.equal(perfecto.valores.ee.valor, 0);
  assert.deepEqual(perfecto.valores.kappa.ic, [1, 1]);
  assert.equal(perfecto.bandas.landis, 'casi_perfecto');

  // Desacuerdo total: κ = −1 y el intervalo se trunca.
  const negativo = calcular({ x: [0, 10, 10, 0], k: 2, ponderacion: 'ninguna', nivel: 0.95 }, 0.95);
  assert.equal(negativo.valores.kappa.valor, -1);
  assert.deepEqual(negativo.valores.kappa.ic, [-1, -1]);
  assert.equal(negativo.bandas.landis, 'pobre');
  assert.equal(negativo.valores.pabak.valor, -1);
});

test('presentar() escribe la tabla, la interpretación y la gráfica en los dos idiomas', () => {
  const escenarios: Array<[string, EntradasKappa]> = [
    ['ejemplo', EJEMPLO],
    ['k2', { x: [40, 10, 5, 45], k: 2, ponderacion: 'ninguna', nivel: 0.95 }],
    ['lineal', { x: TABLA_EJEMPLO, k: 3, ponderacion: 'lineal', nivel: 0.9 }],
    ['cuadratica', { x: TABLA_EJEMPLO, k: 3, ponderacion: 'cuadratica', nivel: 0.99 }],
    ['paradoja', { x: [90, 5, 5, 0], k: 2, ponderacion: 'ninguna', nivel: 0.95 }],
    ['categoria_vacia', { x: [30, 0, 6, 0, 0, 0, 4, 0, 20], k: 3, ponderacion: 'lineal', nivel: 0.95 }],
    ['perfecto', { x: [30, 0, 0, 0, 40, 0, 0, 0, 30], k: 3, ponderacion: 'cuadratica', nivel: 0.95 }],
    ['negativo', { x: [0, 10, 10, 0], k: 2, ponderacion: 'ninguna', nivel: 0.95 }],
  ];
  for (const [id, entradas] of escenarios) {
    const s = calcular(entradas, entradas.nivel);
    for (const lang of IDIOMAS) {
      const ctx = contextoDePrueba(SLUG, lang, entradas.nivel);
      const p = presentar(s, entradas, ctx);
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas], `${id}/${lang}: orden de celdas`);
      assert.equal(p.interpretacion.length, 7, `${id}/${lang}: faltan párrafos de interpretación`);
      const cadenas = [
        ...p.interpretacion,
        p.metodos,
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
        ...p.resumen.flat(),
      ];
      for (const cadena of cadenas) {
        assert.ok(!cadena.includes('{'), `${id}/${lang}: marcador sin rellenar en «${cadena}»`);
      }
      assert.ok(p.metodos.length > 0 && !p.metodos.includes('[ref'), `${id}/${lang}: referencias sin numerar`);

      // Con dos categorías se publican PABAK y los índices; sin ellas, un guion.
      const dosCategorias = s.bandas.k2 === 'si';
      for (const campo of ['pabak', 'indice_prevalencia', 'indice_sesgo'] as const) {
        const celda = p.celdas[campo] as { valor: string };
        assert.equal(celda.valor === '—', !dosCategorias, `${id}/${lang}: ${campo} mal publicado`);
      }

      const g = p.grafica;
      assert.ok(g && g.tipo === 'ic-forest', `${id}/${lang}: la gráfica no es un bosque`);
      assert.equal(g.escala, 'lineal');
      assert.equal(g.referencia, 0);
      assert.equal(g.pista, 'dec2');
      assert.equal(g.filas.length, dosCategorias ? 2 : 1, `${id}/${lang}: filas de la gráfica`);
      assert.equal(g.filas[0]?.id, 'kappa');
      assert.ok(g.filas[0]?.destacada, `${id}/${lang}: κ debería ir destacada`);
      const dominio = g.dominio as [number, number];
      assert.equal(dominio[1], 1);
      assert.ok(dominio[0] === -1 || dominio[0] === -0.2, `${id}/${lang}: dominio ${dominio.join(', ')}`);
      for (const texto of [g.titulo, g.resumen, ...g.filas.map((f) => f.etiqueta)]) {
        assert.ok(texto.trim().length > 0, `${id}/${lang}: texto vacío en la gráfica`);
      }
    }
  }
});

test('el dominio de la gráfica se abre a −1 solo cuando algo baja de cero', () => {
  const positiva = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es', 0.95));
  assert.deepEqual((positiva.grafica as { dominio: [number, number] }).dominio, [-0.2, 1]);

  const negativa: EntradasKappa = { x: [0, 10, 10, 0], k: 2, ponderacion: 'ninguna', nivel: 0.95 };
  const p = presentar(calcular(negativa, 0.95), negativa, contextoDePrueba(SLUG, 'es', 0.95));
  assert.deepEqual((p.grafica as { dominio: [number, number] }).dominio, [-1, 1]);
});

// ---------------------------------------------------------------------------
// Regresiones de la revisión independiente de H3
// ---------------------------------------------------------------------------

test('el resumen no afirma que coincidieron en el acuerdo PONDERADO (C1)', () => {
  // Con pesos, p₀ sube por el crédito parcial de las categorías vecinas: en el
  // ejemplo 86.5 % (lineal) y 91.8 % (cuadrática) frente a 76 de 100 exactos.
  // Decir «coincidieron en 86.5 % de los casos» sería falso.
  const frase: Record<Lang, string> = { es: 'coincidieron exactamente en ', en: 'agreed exactly on ' };
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang, 0.95);
    // El acuerdo exacto, escrito por el mismo formateador que la celda (con su
    // espacio fino en español): 76 de 100.
    const exacto = (presentar(calcular(EJEMPLO, 0.95), EJEMPLO, ctx).celdas.po as { valor: string }).valor;
    for (const ponderacion of ['lineal', 'cuadratica'] as const) {
      const e: EntradasKappa = { x: TABLA_EJEMPLO, k: 3, ponderacion, nivel: 0.95 };
      const p = presentar(calcular(e, 0.95), e, ctx);
      const resumen = p.interpretacion[0] as string;
      const ponderado = (p.celdas.po as { valor: string }).valor;
      assert.notEqual(ponderado, exacto, `${lang}/${ponderacion}: el caso no distingue p₀ ponderado del exacto`);
      assert.ok(
        resumen.includes(frase[lang] + exacto),
        `${lang}/${ponderacion}: el resumen debería dar el acuerdo exacto ${exacto} → ${resumen}`,
      );
      assert.ok(
        !resumen.includes(frase[lang] + ponderado),
        `${lang}/${ponderacion}: el resumen atribuye a las coincidencias el acuerdo ponderado ${ponderado}`,
      );
      assert.ok(resumen.includes(ponderado), `${lang}/${ponderacion}: falta el acuerdo ponderado ${ponderado}`);
    }
    // Sin ponderar, p₀ ES la diagonal: se usa la variante simple, sin «exactamente».
    const simple = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, ctx).interpretacion[0] as string;
    assert.ok(simple.includes(exacto), `${lang}: el resumen simple debería traer ${exacto}`);
    assert.ok(!simple.includes(frase[lang]), `${lang}: sin pesos no hay que distinguir el acuerdo exacto`);
  }
});

test('la paradoja tampoco atribuye el acuerdo ponderado a las coincidencias (C1)', () => {
  // Tabla 3×3 desequilibrada y ponderada: p₀ ponderado alto, κ baja.
  const e: EntradasKappa = { x: [88, 4, 1, 3, 1, 0, 2, 1, 0], k: 3, ponderacion: 'lineal', nivel: 0.95 };
  const s = calcular(e, 0.95);
  assert.equal(s.bandas.paradoja, 'si');
  for (const lang of IDIOMAS) {
    const texto = presentar(s, e, contextoDePrueba(SLUG, lang, 0.95)).interpretacion[6] as string;
    assert.ok(
      !/coincidieron en|raters agreed on/u.test(texto),
      `${lang}: paradoja.si sigue diciendo «coincidieron en {po}» → ${texto}`,
    );
  }
});

test('la ecuación de κ máxima publica también la rama ponderada (A1)', () => {
  const yml = leerYamlCompleto(SLUG);
  for (const lang of IDIOMAS) {
    const ec = yml[lang].ecuaciones.find((q) => q.id === 'maximo');
    assert.ok(ec, `${lang}: falta la ecuación «maximo»`);
    assert.ok(ec.tex.includes('w_{ij}\\,m_{ij}'), `${lang}: el tex no trae la forma ponderada`);
    assert.ok(
      ec.simbolos.some((q) => q.s === 'm_{ij}'),
      `${lang}: falta explicar m_{ij}, el reparto de la esquina noroeste`,
    );
  }
  // Y la celda no se puede reproducir con la fórmula sin ponderar: ese era el
  // defecto (lineal 0.9350 publicado frente a 0.9220 con Σ mín).
  const r = kappaCohen(TABLA_EJEMPLO, { ponderacion: 'lineal', nivel: 0.95 });
  const pi = r.marginales.filas;
  const pj = r.marginales.columnas;
  let sumaMin = 0;
  for (let i = 0; i < r.k; i += 1) sumaMin += Math.min(pi[i] as number, pj[i] as number);
  const pe = r.valores.pe.valor;
  const conFormulaSimple = (sumaMin - pe) / (1 - pe);
  assert.ok(
    Math.abs(r.valores.kappa_max.valor - conFormulaSimple) > 0.01,
    'el caso ya no distingue las dos fórmulas',
  );
  assert.ok(r.valores.kappa_max.valor > conFormulaSimple, 'la rama ponderada debe dar un máximo mayor');
});

test('Métodos cita a Cohen 1968 solo cuando se pondera (A5)', () => {
  const yml = leerYamlCompleto(SLUG);
  for (const lang of IDIOMAS) {
    const n1968 = yml.referencias.findIndex((q) => q.key === 'cohen1968') + 1;
    assert.ok(n1968 > 0, 'cohen1968 debería estar en la lista de referencias');
    const ctx = contextoDePrueba(SLUG, lang, 0.95);
    const sinPeso = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, ctx).metodos;
    assert.ok(
      !sinPeso.includes(`[${n1968}]`),
      `${lang}: sin ponderar no debe citarse la kappa ponderada → ${sinPeso}`,
    );
    for (const ponderacion of ['lineal', 'cuadratica'] as const) {
      const e: EntradasKappa = { ...EJEMPLO, ponderacion };
      const conPeso = presentar(calcular(e, 0.95), e, ctx).metodos;
      assert.ok(conPeso.includes(`[${n1968}]`), `${lang}/${ponderacion}: falta la cita de Cohen 1968`);
    }
  }
});

test('Métodos menciona la κ máxima también con dos categorías (B4)', () => {
  const dos: EntradasKappa = { x: [40, 10, 5, 45], k: 2, ponderacion: 'ninguna', nivel: 0.95 };
  for (const [lang, aguja] of [
    ['es', 'κ máxima'],
    ['en', 'largest κ'],
  ] as Array<[Lang, string]>) {
    for (const e of [EJEMPLO, dos]) {
      const metodos = presentar(calcular(e, 0.95), e, contextoDePrueba(SLUG, lang, 0.95)).metodos;
      assert.ok(metodos.includes(aguja), `${lang}/k=${e.k}: la celda publica κ máxima y Métodos la calla`);
    }
  }
});

test('la entrada de tabla no declara un `min` que el controlador no aplica (B1)', () => {
  const yml = leerYamlCompleto(SLUG);
  const x = yml.entradas.find((q) => q.id === 'x');
  assert.ok(x && x.tipo === 'tabla');
  assert.equal((x as { min?: number }).min, undefined, '`min` solo lo aplica el controlador a una columna');
  // Y la ayuda describe lo que el analizador acepta de verdad.
  for (const [lang, agujas] of [
    // Incluye la regla de los miles (S6): en una tabla separada por espacios el
    // espacio separa casillas SIEMPRE, también cuando todas las filas parecen
    // miles, a diferencia de la columna suelta, donde «1 234» se lee 1234.
    ['es', ['espacios', 'primera fila', 'miles sin separador']],
    ['en', ['spaces', 'first row', 'thousands with no separator']],
  ] as Array<[Lang, string[]]>) {
    const ayuda = leerYamlCompleto(SLUG)[lang].ayudas.x as string;
    for (const aguja of agujas) assert.ok(ayuda.includes(aguja), `${lang}: la ayuda no menciona «${aguja}»`);
  }
});

test('el perfil de tolerancia por omisión es el cerrado', () => {
  assert.deepEqual(PERFIL.defecto, { rel: 1e-12, abs: 1e-14 });
  // Si alguien afloja un campo, que sea solo la prueba frente a κ = 0, que es
  // la única mal condicionada, y nunca κ, su EE ni las proporciones.
  for (const campo of Object.keys(PERFIL.campos ?? {})) {
    assert.ok(['z_h0', 'p_h0'].includes(campo), `${campo} no debería tener tolerancia propia`);
  }
});

test('z y p frente a κ = 0 copian la agrupación de kappa2, no la del snippet', () => {
  // `kappa2` trabaja con conteos y divide entre n al final; el snippet parte de
  // p = x/n. Con pe cercano a 1, κ divide entre (1 − pe) y ese ulp se amplifica:
  // con la agrupación del snippet la diferencia contra R llegaba a 1.5e-8, muy
  // por encima del perfil `cerrado`. Aquí se exige `cerrado` a mano, para que la
  // regresión salte aunque alguien afloje la tolerancia del campo.
  const cerrado = { rel: 1e-12, abs: 1e-14 };
  for (const id of ['pe_casi_uno_k2', 'pe_casi_uno']) {
    const caso = fixture.casos.find((c) => c.id === id);
    assert.ok(caso, `falta el caso ${id}`);
    const r = normalizarR(caso.esperado) as Record<string, number>;
    const v = calcular(entradasDe(caso), 0.95).valores;
    // El régimen es el que se quería probar: 1 − pe diminuto.
    assert.ok(1 - v.pe.valor < 1e-2, `${id}: pe = ${v.pe.valor} no está cerca de 1`);
    for (const [campo, ts] of [
      ['z_h0', v.z_h0.valor],
      ['p_h0', v.p_h0.valor],
    ] as Array<[string, number]>) {
      const oraculo = r[campo] as number;
      assert.ok(
        Math.abs(ts - oraculo) <= cerrado.abs + cerrado.rel * Math.max(Math.abs(ts), Math.abs(oraculo)),
        `${id}.${campo}: TS ${ts} vs R ${oraculo}`,
      );
    }
  }
});

test('con pe cercano a 1 la paradoja se explica sin marcadores sueltos', () => {
  const caso = fixture.casos.find((c) => c.id === 'pe_casi_uno_k2');
  assert.ok(caso);
  const e = entradasDe(caso);
  const s = calcular(e, 0.95);
  assert.equal(s.bandas.paradoja, 'si', 'acuerdo 99.98 % con κ negativa es la paradoja de libro');
  assert.ok(s.avisos.some((a) => a.codigo === 'paradoja'));
  // El de la categoría vacía convive con el de la paradoja en el caso 3×3.
  const conVacia = fixture.casos.find((c) => c.id === 'pe_casi_uno');
  assert.ok(conVacia);
  const sVacia = calcular(entradasDe(conVacia), 0.95);
  assert.deepEqual(
    sVacia.avisos.map((a) => a.codigo),
    ['categoria_vacia', 'paradoja', 'cortes'],
  );
  for (const caso2 of [caso, conVacia]) {
    for (const lang of IDIOMAS) {
      const entradas = entradasDe(caso2);
      const p = presentar(calcular(entradas, 0.95), entradas, contextoDePrueba(SLUG, lang, 0.95));
      const cadenas = [...p.interpretacion, p.metodos, ...p.resumen.flat()];
      for (const cadena of cadenas) {
        assert.ok(!cadena.includes('{'), `${caso2.id}/${lang}: marcador sin rellenar en «${cadena}»`);
      }
      // κ ≈ 0 no debe publicarse como «-0.00»: el formateador quita el cero negativo.
      const kappaCelda = (p.celdas.kappa as { valor: string }).valor;
      assert.ok(!kappaCelda.startsWith('-0.00') && !kappaCelda.startsWith('−0.00'), `${lang}: κ = ${kappaCelda}`);
    }
  }
});

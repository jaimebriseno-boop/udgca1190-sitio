/**
 * Calculadora «IC de una proporción» contra el oráculo R.
 *
 *   node --test tests/bioestadistica/ic-proporcion.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo ic-proporcion`. Tres comprobaciones
 * independientes cierran el círculo:
 *
 *   1. Los seis intervalos de TypeScript coinciden con los de R, campo por campo
 *      y componente por componente, dentro de las tolerancias de `tolerancias.ts`.
 *   2. El snippet que produciría la página es, byte a byte, el que se ejecutó.
 *   3. El SHA-256 de `r.codigo` del YAML es el que quedó grabado en el fixture,
 *      de modo que editar la plantilla sin regenerar rompe la prueba.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import {
  amplitud,
  icProporcion,
  icProporcionTodos,
  icWilson,
} from '../../src/lib/bioestadistica/metodos/proporciones.ts';
import type { Estimacion, Resultado } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

const SLUG = 'ic-proporcion';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);

/** Margen para el ruido de coma flotante en las propiedades cualitativas. */
const EPS = 1e-12;

function numero(caso: CasoFixture, clave: string): number {
  const v = caso.entradas[clave];
  if (typeof v !== 'number') throw new Error(`${SLUG}/${caso.id}: la entrada ${clave} no es un número`);
  return v;
}

/**
 * Resultado en la forma del contrato: las claves son las mismas que imprime el
 * snippet de R, con guion bajo (`wilson_cc`), no las del `MetodoId` (`wilson-cc`).
 */
function calcular(x: number, n: number, nivel: number): Resultado<'ic-proporcion'> {
  const r = icProporcionTodos(x, n, nivel);
  return {
    calculadora: SLUG,
    version: 1,
    entradas: { x, n, nivel },
    valores: {
      p: { valor: x / n, metodo: 'puntual' },
      wilson: r.wilson,
      wilson_cc: r['wilson-cc'],
      clopper_pearson: r['clopper-pearson'],
      agresti_coull: r['agresti-coull'],
      jeffreys: r.jeffreys,
      wald: r.wald,
    },
    bandas: {},
    avisos: [],
  };
}

// ---------------------------------------------------------------------------
// Integridad del fixture
// ---------------------------------------------------------------------------

test('el fixture corresponde a la plantilla de R que hay ahora en el YAML', () => {
  const sha = createHash('sha256').update(yamlCalc.r.codigo, 'utf8').digest('hex');
  assert.equal(
    fixture.meta.plantilla_sha256,
    sha,
    'r.codigo cambió sin regenerar: node scripts/bio-fixtures.mjs --solo ic-proporcion',
  );
});

test('el fixture trae el ejemplo de la interfaz primero y todos los casos curados', () => {
  assert.equal(fixture.meta.calculadora, SLUG);
  assert.equal(fixture.casos.length, 13);
  assert.equal(fixture.casos[0]?.id, 'ejemplo');
  assert.deepEqual(fixture.casos[0]?.entradas, yamlCalc.ejemplo);
  assert.equal(new Set(fixture.casos.map((c) => c.id)).size, fixture.casos.length);
});

test('el fixture cubre exactamente los casos curados, sin sobras ni faltantes', () => {
  const curados = leerCasos(SLUG);
  assert.equal(curados.calculadora, SLUG);
  assert.deepEqual(
    fixture.casos.map((c) => c.id),
    ['ejemplo', ...curados.casos.map((c) => c.id)],
    'casos/ic-proporcion.json cambió sin regenerar: node scripts/bio-fixtures.mjs --solo ic-proporcion',
  );
  for (const curado of curados.casos) {
    const enFixture = fixture.casos.find((c) => c.id === curado.id);
    assert.deepEqual(enFixture?.entradas, curado.entradas, `${curado.id}: las entradas del fixture no son las curadas`);
    assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota que explica por qué se prueba este caso`);
  }
});

test('el fixture documenta la versión de R y de cada paquete del snippet', () => {
  assert.match(fixture.meta.R, /^R version \d+\.\d+\.\d+/);
  assert.ok(fixture.meta.plataforma.length > 0);
  for (const paquete of yamlCalc.r.paquetes) {
    assert.match(fixture.meta.paquetes[paquete] ?? '', /^\d/, `falta la versión de ${paquete}`);
  }
});

// ---------------------------------------------------------------------------
// TypeScript contra R, caso por caso
// ---------------------------------------------------------------------------

for (const caso of fixture.casos) {
  const perfil = TOL[caso.tol];
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    assert.ok(perfil, `no hay perfil de tolerancia «${caso.tol}» en tolerancias.ts`);
    const x = numero(caso, 'x');
    const n = numero(caso, 'n');
    const nivel = numero(caso, 'nivel');
    const esperado = normalizarR(caso.esperado) as Record<string, unknown>;
    const informe = comparar(calcular(x, n, nivel), esperado, perfil);
    assert.ok(
      informe.coincide,
      `${caso.id} (x = ${x}, n = ${n}, nivel = ${nivel}) · ${informe.resumen}\n${informe.discrepancias
        .map(describir)
        .join('\n')}`,
    );
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    const generado = readFileSync(rutaGenerado(SLUG, caso.id), 'utf8');
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), generado);
  });
}

// ---------------------------------------------------------------------------
// Propiedades que deben cumplirse con cualquier entrada
// ---------------------------------------------------------------------------

/** Rejilla de (x, n, nivel) que cubre los extremos y el interior. */
function* rejilla(): Generator<[number, number, number]> {
  for (const nivel of [0.9, 0.95, 0.99, 0.999]) {
    for (const n of [1, 2, 3, 7, 20, 97, 1000]) {
      for (const x of [0, 1, Math.floor(n / 2), n - 1, n]) {
        if (x >= 0 && x <= n) yield [x, n, nivel];
      }
    }
  }
}

/** Métodos acotados por construcción: nunca deben salirse de [0, 1]. */
const ACOTADOS = ['wilson', 'wilson-cc', 'clopper-pearson', 'jeffreys'] as const;

test('todo intervalo contiene su estimación puntual', () => {
  for (const [x, n, nivel] of rejilla()) {
    const todos = icProporcionTodos(x, n, nivel);
    for (const [metodo, est] of Object.entries(todos) as Array<[string, Estimacion]>) {
      const [lo, hi] = est.ic as [number, number];
      const donde = `${metodo} x=${x} n=${n} nivel=${nivel}`;
      // Wald degenera en [0, 0] con x = 0 y en [1, 1] con x = n: sigue conteniendo p̂.
      assert.ok(lo <= est.valor + EPS, `${donde}: lo = ${lo} > p̂ = ${est.valor}`);
      assert.ok(hi >= est.valor - EPS, `${donde}: hi = ${hi} < p̂ = ${est.valor}`);
    }
  }
});

test('Wilson, Wilson con corrección, Clopper-Pearson y Jeffreys se quedan en [0, 1]', () => {
  for (const [x, n, nivel] of rejilla()) {
    for (const metodo of ACOTADOS) {
      const [lo, hi] = icProporcion(x, n, { nivel, metodo }).ic as [number, number];
      const donde = `${metodo} x=${x} n=${n} nivel=${nivel}`;
      assert.ok(lo >= -EPS && lo <= 1 + EPS, `${donde}: lo = ${lo}`);
      assert.ok(hi >= -EPS && hi <= 1 + EPS, `${donde}: hi = ${hi}`);
      assert.ok(lo <= hi + EPS, `${donde}: intervalo invertido [${lo}, ${hi}]`);
    }
  }
});

test('Wald y Agresti-Coull sí pueden salirse de [0, 1], como en binom', () => {
  // Es una propiedad del método, no un defecto: la interfaz debe poder mostrarla.
  assert.ok((icProporcion(1, 2, { metodo: 'wald' }).ic as [number, number])[0] < 0);
  assert.ok((icProporcion(0, 20, { metodo: 'agresti-coull' }).ic as [number, number])[0] < 0);
  assert.ok((icProporcion(20, 20, { metodo: 'agresti-coull' }).ic as [number, number])[1] > 1);
});

test('la amplitud de Wilson decrece al crecer n con la proporción fija', () => {
  for (const nivel of [0.9, 0.95, 0.99]) {
    const anchos = [10, 100, 1000, 10000, 100000].map((n) => amplitud(icWilson(n / 2, n, nivel)));
    for (let i = 1; i < anchos.length; i += 1) {
      assert.ok(
        (anchos[i] as number) < (anchos[i - 1] as number),
        `nivel ${nivel}: la amplitud no decreció (${String(anchos[i - 1])} → ${String(anchos[i])})`,
      );
    }
  }
});

test('la amplitud crece con el nivel de confianza', () => {
  const anchos = [0.9, 0.95, 0.99, 0.999].map((nivel) => amplitud(icWilson(68, 80, nivel)));
  for (let i = 1; i < anchos.length; i += 1) {
    assert.ok((anchos[i] as number) > (anchos[i - 1] as number));
  }
});

test('las entradas imposibles lanzan RangeError', () => {
  assert.throws(() => icProporcionTodos(21, 20, 0.95), RangeError);
  assert.throws(() => icProporcionTodos(0, 0, 0.95), RangeError);
  assert.throws(() => icProporcionTodos(-1, 20, 0.95), RangeError);
  assert.throws(() => icProporcionTodos(1.5, 20, 0.95), RangeError);
  assert.throws(() => icProporcionTodos(1, 20.5, 0.95), RangeError);
  assert.throws(() => icProporcionTodos(1, 20, 1), RangeError);
  assert.throws(() => icProporcionTodos(1, 20, 1.5), RangeError);
  assert.throws(() => icProporcionTodos(1, 20, 0), RangeError);
  assert.throws(() => icProporcionTodos(1, 20, -0.5), RangeError);
});

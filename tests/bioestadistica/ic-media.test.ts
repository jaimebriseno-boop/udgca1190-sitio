/**
 * Calculadora «IC de una media» contra el oráculo R y sus propiedades.
 *
 *   node --test tests/bioestadistica/ic-media.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo ic-media`. Tres comprobaciones
 * independientes cierran el círculo, como en las calculadoras de H0 y H1:
 *
 *   1. El intervalo de la media (qt), el de la desviación estándar (qchisq), el
 *      error estándar y el multiplicador t coinciden con R dentro de las
 *      tolerancias de `tolerancias.ts`.
 *   2. El snippet que produciría la página es, byte a byte, el que se ejecutó.
 *   3. El SHA-256 de `r.codigo` del YAML es el que quedó grabado en el fixture.
 *
 * Además se comprueban las propiedades que deben cumplirse con cualquier
 * entrada (simetría del intervalo de la media, monotonía de la amplitud,
 * asimetría del intervalo de la DE, convergencia de t hacia z) y el ciclo
 * completo de presentación en los dos idiomas.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { qnorm } from '../../src/lib/bioestadistica/primitivas/distribuciones.ts';
import {
  eemDe,
  icDesviacion,
  icMediaResumen,
  limitesDe,
  tCritico,
} from '../../src/lib/bioestadistica/metodos/medias.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/ic-media.ts';
import type { EntradasIcMedia } from '../../src/lib/bioestadistica/calculadoras/ic-media.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'ic-media';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);

/** Margen para el ruido de coma flotante en las propiedades cualitativas. */
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];
const EJEMPLO: EntradasIcMedia = { media: 95, de: 40, n: 50, nivel: 0.95 };

/** Un intervalo que el contrato garantiza presente (la media y la DE siempre lo traen). */
function intervalo(ic: [number, number] | undefined, donde: string): [number, number] {
  assert.ok(ic, `${donde}: se esperaba un intervalo`);
  return ic;
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
  assert.equal(curados.calculadora, SLUG);
  assert.equal(fixture.casos[0]?.id, 'ejemplo');
  assert.deepEqual(fixture.casos[0]?.entradas, yamlCalc.ejemplo);
  assert.deepEqual(
    fixture.casos.map((c) => c.id),
    ['ejemplo', ...curados.casos.map((c) => c.id)],
    `casos/${SLUG}.json cambió sin regenerar: node scripts/bio-fixtures.mjs --solo ${SLUG}`,
  );
  assert.equal(fixture.casos.length, 11);
  assert.equal(new Set(fixture.casos.map((c) => c.id)).size, fixture.casos.length);
  for (const curado of curados.casos) assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota`);
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
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const perfil = TOL[caso.tol];
    assert.ok(perfil, `no hay perfil de tolerancia «${caso.tol}» en tolerancias.ts`);
    const e = conDerivadas(definicion, caso.entradas) as EntradasIcMedia;
    const informe = comparar(calcular(e, e.nivel), normalizarR(caso.esperado) as Record<string, unknown>, perfil);
    assert.ok(
      informe.coincide,
      `${caso.id} · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`,
    );
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), readFileSync(rutaGenerado(SLUG, caso.id), 'utf8'));
  });
}

// ---------------------------------------------------------------------------
// Propiedades que deben cumplirse con cualquier entrada
// ---------------------------------------------------------------------------

/** Rejilla de (media, DE, n, nivel) que cubre los extremos y el interior. */
function* rejilla(): Generator<[number, number, number, number]> {
  for (const nivel of [0.9, 0.95, 0.99, 0.999]) {
    for (const n of [2, 3, 5, 12, 30, 97, 1000]) {
      for (const [media, de] of [
        [95, 40],
        [-2.5, 1.2],
        [0.123456, 0.0789],
        [0, 1],
      ] as const) {
        yield [media, de, n, nivel];
      }
    }
  }
}

test('el intervalo de la media contiene la media y es simétrico a su alrededor', () => {
  for (const [media, de, n, nivel] of rejilla()) {
    const est = icMediaResumen(media, de, n, nivel);
    const [lo, hi] = intervalo(est.ic, `media=${media} de=${de} n=${n}`);
    const donde = `media=${media} de=${de} n=${n} nivel=${nivel}`;
    assert.ok(lo <= media + EPS && hi >= media - EPS, `${donde}: [${lo}, ${hi}] no contiene ${media}`);
    // Simetría: los dos brazos miden lo mismo salvo el ruido de la resta.
    const escala = Math.max(1, Math.abs(media), hi - lo);
    assert.ok(Math.abs(media - lo - (hi - media)) <= 1e-12 * escala, `${donde}: brazos desiguales [${lo}, ${hi}]`);
    assert.equal(est.metodo, 't');
    assert.equal(est.nivel, nivel);
  }
});

test('la amplitud del intervalo de la media decrece al crecer n y crece con el nivel', () => {
  for (const nivel of [0.9, 0.95, 0.99]) {
    const anchos = [2, 5, 10, 100, 1000, 10000].map((n) => {
      const [lo, hi] = intervalo(icMediaResumen(95, 40, n, nivel).ic, `n=${n}`);
      return hi - lo;
    });
    for (let i = 1; i < anchos.length; i += 1) {
      assert.ok(
        (anchos[i] as number) < (anchos[i - 1] as number),
        `nivel ${nivel}: la amplitud no decreció (${String(anchos[i - 1])} → ${String(anchos[i])})`,
      );
    }
  }
  const porNivel = [0.9, 0.95, 0.99, 0.999].map((nivel) => {
    const [lo, hi] = intervalo(icMediaResumen(95, 40, 50, nivel).ic, `nivel=${nivel}`);
    return hi - lo;
  });
  for (let i = 1; i < porNivel.length; i += 1) {
    assert.ok((porNivel[i] as number) > (porNivel[i - 1] as number));
  }
});

test('el intervalo de la desviación estándar la contiene, es positivo y asimétrico', () => {
  for (const [, de, n, nivel] of rejilla()) {
    const est = icDesviacion(de, n, nivel);
    const [lo, hi] = intervalo(est.ic, `de=${de} n=${n}`);
    const donde = `de=${de} n=${n} nivel=${nivel}`;
    assert.equal(est.valor, de);
    assert.equal(est.metodo, 'chi2-varianza');
    assert.ok(lo > 0 && lo < de, `${donde}: límite inferior ${lo} fuera de (0, ${de})`);
    assert.ok(hi > de, `${donde}: límite superior ${hi} no supera ${de}`);
    // Colas iguales sobre la varianza: el brazo superior siempre es el largo.
    assert.ok(hi - de > de - lo, `${donde}: el intervalo de la DE no es asimétrico [${lo}, ${hi}]`);
  }
});

test('con DE = 0 los dos intervalos colapsan a un punto', () => {
  const media = icMediaResumen(95, 0, 50, 0.95);
  assert.deepEqual(media.ic, [95, 95]);
  const de = icDesviacion(0, 50, 0.95);
  assert.deepEqual(de.ic, [0, 0]);
  assert.equal(eemDe(0, 50), 0);
});

test('el multiplicador t es mayor que z y converge hacia z al crecer n', () => {
  for (const nivel of [0.9, 0.95, 0.99, 0.999]) {
    const z = qnorm(1 - (1 - nivel) / 2);
    const ns = [2, 5, 30, 100, 1000, 100000];
    const diferencias = ns.map((n) => tCritico(n, nivel) - z);
    for (const [i, d] of diferencias.entries()) {
      assert.ok(d > 0, `nivel ${nivel}, n = ${String(ns[i])}: t no supera a z (${String(d)})`);
    }
    for (let i = 1; i < diferencias.length; i += 1) {
      assert.ok(
        (diferencias[i] as number) < (diferencias[i - 1] as number),
        `nivel ${nivel}: t no se acerca a z al pasar de n = ${String(ns[i - 1])} a n = ${String(ns[i])}`,
      );
    }
    assert.ok((diferencias[diferencias.length - 1] as number) < 1e-4, `nivel ${nivel}: t no converge a z`);
  }
});

test('el error estándar es DE/√n y media ± 2 DE no depende de n', () => {
  assert.ok(Math.abs(eemDe(40, 50) - 40 / Math.sqrt(50)) <= EPS);
  assert.ok(Math.abs(eemDe(40, 100) - eemDe(40, 25) / 2) <= EPS);
  assert.deepEqual(limitesDe(95, 40, 2), [15, 175]);
  assert.deepEqual(limitesDe(95, 40, 1), [55, 135]);
});

test('las entradas imposibles lanzan RangeError y validar() las reclama', () => {
  assert.throws(() => icMediaResumen(Number.NaN, 40, 50), RangeError);
  assert.throws(() => icMediaResumen(Number.POSITIVE_INFINITY, 40, 50), RangeError);
  assert.throws(() => icMediaResumen(95, -1, 50), RangeError);
  assert.throws(() => icMediaResumen(95, 40, 1), RangeError);
  assert.throws(() => icMediaResumen(95, 40, 2.5), RangeError);
  assert.throws(() => icMediaResumen(95, 40, 50, 1), RangeError);
  assert.throws(() => icMediaResumen(95, 40, 50, 0), RangeError);
  assert.throws(() => icDesviacion(-0.5, 50), RangeError);
  assert.throws(() => tCritico(1), RangeError);

  assert.equal(definicion.validar(EJEMPLO), null);
  assert.equal(definicion.validar({ ...EJEMPLO, de: 0 }), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, media: Number.NaN }), { media: 'err_numero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, de: -1 }), { de: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n: 1 }), { n: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n: 2.5 }), { n: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
});

test('los avisos y las bandas siguen los cortes documentados', () => {
  assert.deepEqual(calcular(EJEMPLO, 0.95).avisos.map((a) => a.codigo), []);
  assert.equal(calcular(EJEMPLO, 0.95).bandas.n, 'adecuado');
  assert.equal(calcular(EJEMPLO, 0.95).bandas.de, 'positiva');
  assert.deepEqual(calcular({ ...EJEMPLO, n: 30 }, 0.95).avisos.map((a) => a.codigo), []);
  assert.deepEqual(calcular({ ...EJEMPLO, n: 29 }, 0.95).avisos.map((a) => a.codigo), ['n_pequeno']);
  assert.equal(calcular({ ...EJEMPLO, n: 29 }, 0.95).bandas.n, 'pequeno');
  assert.deepEqual(calcular({ ...EJEMPLO, n: 5 }, 0.95).avisos.map((a) => a.codigo), ['n_pequeno']);
  assert.deepEqual(calcular({ ...EJEMPLO, n: 4 }, 0.95).avisos.map((a) => a.codigo), ['n_pequeno', 'n_muy_pequeno']);
  const sinDispersion = calcular({ ...EJEMPLO, de: 0 }, 0.95);
  assert.deepEqual(sinDispersion.avisos.map((a) => a.codigo), ['de_cero']);
  assert.equal(sinDispersion.bandas.de, 'cero');
});

// ---------------------------------------------------------------------------
// Presentación en los dos idiomas
// ---------------------------------------------------------------------------

test('presentar() rellena todas las plantillas en ambos idiomas y la gráfica lleva las tres filas', () => {
  const entradas: EntradasIcMedia[] = [
    EJEMPLO,
    { ...EJEMPLO, n: 2 },
    { ...EJEMPLO, n: 4 },
    { ...EJEMPLO, de: 0 },
    { media: -2.5, de: 1.2, n: 12, nivel: 0.9 },
    { media: 0.123456, de: 0.0789, n: 17, nivel: 0.99 },
  ];
  for (const lang of IDIOMAS) {
    for (const e of entradas) {
      const ctx = contextoDePrueba(SLUG, lang, e.nivel);
      const p = presentar(calcular(e, e.nivel), e, ctx);
      // Sin ordenar: la página pinta las celdas en el orden del objeto.
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas]);
      const textos = [
        ...p.interpretacion,
        p.metodos,
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
        ...p.resumen.flat(),
      ];
      for (const texto of textos) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, 5);
      assert.ok(p.grafica && p.grafica.tipo === 'ic-forest');
      if (p.grafica && p.grafica.tipo === 'ic-forest') {
        assert.deepEqual(p.grafica.filas.map((f) => f.id), ['media', 'de1', 'de2']);
        assert.equal(p.grafica.filas[0]?.destacada, true);
        assert.equal(p.grafica.escala, 'lineal');
        assert.equal(p.grafica.referencia, undefined);
        // La banda de ±2 DE es el doble de ancha que la de ±1 DE y ambas están
        // centradas en la media capturada.
        const de1 = p.grafica.filas[1];
        const de2 = p.grafica.filas[2];
        assert.equal(de1?.valor, e.media);
        assert.ok(Math.abs((de1?.hi ?? 0) - (de1?.lo ?? 0) - 2 * e.de) <= EPS);
        assert.ok(Math.abs((de2?.hi ?? 0) - (de2?.lo ?? 0) - 4 * e.de) <= EPS);
        for (const fila of p.grafica.filas) {
          assert.ok(fila.etiqueta.trim().length > 0, `${lang}: fila «${fila.id}» sin rótulo`);
        }
      }
    }
  }
});

test('el ejemplo se presenta con las cifras comprobadas a mano en los dos idiomas', () => {
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  // t_{49, 0.975} = 2.00957…, EEM = 40/√50 = 5.6569, IC = 95 ± 2.00957·5.6569.
  assert.equal(es.celdas.media.valor, '95.00');
  assert.equal(es.celdas.media.ic, '83.63 a 106.37');
  assert.equal(es.celdas.eem.valor, '5.66');
  assert.equal(es.celdas.t_crit.valor, '2.010');
  assert.equal(es.celdas.de.ic, '33.41 a 49.85');
  assert.ok(es.interpretacion[2]?.includes('valores de 33.41 a 49.85'), es.interpretacion[2]);
  // El intervalo de la DE se describe por su pivote, sin atribuirlo a una fuente que no lo presenta.
  assert.ok(es.metodos.includes('χ² de (n − 1)s²/σ²') && !es.metodos.includes('[3]'), es.metodos);
  assert.ok(es.celdas.t_crit.nota?.endsWith('49'), es.celdas.t_crit.nota);
  assert.ok(es.interpretacion[1]?.includes('15.00') && es.interpretacion[1]?.includes('175.00'), es.interpretacion[1]);
  assert.ok(es.metodos.includes('t de Student') && es.metodos.includes('83.63 a 106.37'), es.metodos);

  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.media.ic, '83.63 to 106.37');
  assert.ok(en.interpretacion[0]?.includes('95% confidence interval'), en.interpretacion[0]);
  assert.ok(en.metodos.includes("Student's t distribution"), en.metodos);
});

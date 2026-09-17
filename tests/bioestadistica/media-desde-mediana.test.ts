/**
 * Calculadora «Media y DE desde la mediana» contra el oráculo R y sus propiedades.
 *
 *   node --test tests/bioestadistica/media-desde-mediana.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo media-desde-mediana`. Tres
 * comprobaciones independientes cierran el círculo, como en H0 y H1:
 *
 *   1. Las siete salidas (tres medias, dos desviaciones estándar y los dos
 *      cocientes de asimetría) coinciden con R, incluidos los `NA` de los
 *      métodos que el escenario no admite.
 *   2. El snippet que produciría la página es, byte a byte, el que se ejecutó.
 *   3. El SHA-256 de `r.codigo` del YAML es el que quedó grabado en el fixture.
 *
 * Los casos del fixture llevan SIEMPRE los cinco números, porque
 * `casos/*.json` es JSON estricto y no admite `NaN`. La ruta real de la
 * interfaz (un cuartil vacío que viaja a R como `NA`) se comprueba aparte:
 * `derivar()` rellena con `NaN` y el snippet relleno dice `q1 <- NA`, y el
 * resultado no cambia respecto al caso con cuartiles capturados, que es lo que
 * el fixture ya validó contra R.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import {
  asimetriaIqr,
  asimetriaRango,
  deHozo,
  deWan,
  estimarDesdeResumen,
  etaWan,
  mediaHozo,
  mediaLuo,
  mediaWan,
  w1Luo,
  w2Luo,
  w3Luo,
  w4Luo,
  xiWan,
} from '../../src/lib/bioestadistica/metodos/resumenes.ts';
import type { EscenarioResumen, ResumenReportado } from '../../src/lib/bioestadistica/metodos/resumenes.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/media-desde-mediana.ts';
import type { EntradasMediaDesdeMediana } from '../../src/lib/bioestadistica/calculadoras/media-desde-mediana.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'media-desde-mediana';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);

const IDIOMAS: readonly Lang[] = ['es', 'en'];
const ESCENARIOS: readonly EscenarioResumen[] = ['s1', 's2', 's3'];

/** Ejemplo de la interfaz: días de fiebre en 45 pacientes (datos ficticios). */
const EJEMPLO: EntradasMediaDesdeMediana = {
  escenario: 's3',
  n: 45,
  min: 2,
  q1: 4,
  mediana: 6,
  q3: 9,
  max: 21,
};

const RESUMEN: ResumenReportado = { min: 2, q1: 4, mediana: 6, q3: 9, max: 21 };

/** Igualdad relativa para las propiedades algebraicas (homogeneidad, simetría). */
function casiIgual(a: number, b: number, donde: string, rel = 1e-12): void {
  const escala = Math.max(1, Math.abs(a), Math.abs(b));
  assert.ok(Math.abs(a - b) <= rel * escala, `${donde}: ${a} ≠ ${b}`);
}

/** Entradas de la calculadora a partir de un resumen y un escenario. */
function entradasDe(escenario: EscenarioResumen, n: number, r: ResumenReportado): EntradasMediaDesdeMediana {
  return { escenario, n, min: r.min, q1: r.q1, mediana: r.mediana, q3: r.q3, max: r.max };
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
  assert.equal(fixture.casos.length, 16);
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
    const e = conDerivadas(definicion, caso.entradas) as EntradasMediaDesdeMediana;
    const informe = comparar(calcular(e), normalizarR(caso.esperado) as Record<string, unknown>, perfil);
    assert.ok(
      informe.coincide,
      `${caso.id} · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`,
    );
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), readFileSync(rutaGenerado(SLUG, caso.id), 'utf8'));
  });
}

test('el fixture trae NA justo donde el escenario no produce el valor', () => {
  const s2 = fixture.casos.find((c) => c.id === 's2_n200');
  assert.ok(s2);
  for (const campo of ['media_hozo', 'de_hozo', 'asim_rango']) {
    assert.equal(s2.esperado[campo], 'NA', `s2_n200.${campo} debería ser NA en R`);
  }
  assert.equal(typeof s2.esperado.de_wan, 'number');
  const s1 = fixture.casos.find((c) => c.id === 's1_n10');
  assert.ok(s1);
  assert.equal(s1.esperado.asim_iqr, 'NA');
  assert.equal(typeof s1.esperado.media_hozo, 'number');
  // Un resumen constante da 0/0, que R imprime como NaN (no como NA).
  const cero = fixture.casos.find((c) => c.id === 'rango_cero');
  assert.ok(cero);
  assert.equal(cero.esperado.asim_rango, 'NaN');
  assert.equal(cero.esperado.de_wan, 0);
});

// ---------------------------------------------------------------------------
// La ruta real de la interfaz: un campo vacío viaja a R como NA
// ---------------------------------------------------------------------------

test('derivar() rellena con NaN los campos vacíos y el snippet los escribe como NA', () => {
  const capturado = { escenario: 's1', n: 10, mediana: 6, min: 2, max: 21 } as unknown as EntradasMediaDesdeMediana;
  const derivadas = definicion.derivar?.(capturado);
  assert.ok(derivadas);
  assert.ok(Number.isNaN(derivadas.q1 as number), 'q1 debería quedar en NaN');
  assert.ok(Number.isNaN(derivadas.q3 as number), 'q3 debería quedar en NaN');
  assert.equal(derivadas.min, 2);
  assert.equal(derivadas.max, 21);

  const completas = conDerivadas(definicion, capturado) as EntradasMediaDesdeMediana;
  const codigo = rellenarR(yamlCalc.r.codigo, completas);
  assert.match(codigo, /a <- 2; q1 <- NA; m <- 6; q3 <- NA; b <- 21/);

  // Y el resultado es el mismo que el del caso s1_n10 del fixture, que sí llevaba
  // cuartiles: en S1 ninguna fórmula los usa.
  const conCuartiles = entradasDe('s1', 10, RESUMEN);
  const sinCuartiles = calcular(completas);
  const conTodos = calcular(conCuartiles);
  for (const clave of definicion.salidas) {
    const a = sinCuartiles.valores[clave].valor;
    const b = conTodos.valores[clave].valor;
    if (Number.isNaN(a) || Number.isNaN(b)) {
      assert.ok(Number.isNaN(a) && Number.isNaN(b), `${clave}: uno es NaN y el otro no (${a}, ${b})`);
    } else {
      assert.equal(a, b, `${clave}: el valor cambió al capturar los cuartiles en S1`);
    }
  }
  assert.equal(definicion.derivar?.(EJEMPLO).q1, 4, 'derivar() no debe tocar un cuartil capturado');
});

// ---------------------------------------------------------------------------
// Propiedades de los métodos
// ---------------------------------------------------------------------------

test('la media de Wan es el promedio ponderado publicado en cada escenario', () => {
  const { min: a, q1, mediana: m, q3, max: b } = RESUMEN;
  casiIgual(mediaWan(RESUMEN, 10, 's1'), (a + 2 * m + b) / 4, 'Wan S1');
  casiIgual(mediaWan(RESUMEN, 10, 's2'), (q1 + m + q3) / 3, 'Wan S2');
  casiIgual(mediaWan(RESUMEN, 10, 's3'), (a + 2 * q1 + 2 * m + 2 * q3 + b) / 8, 'Wan S3');
  // No depende de n.
  for (const n of [4, 25, 1000]) casiIgual(mediaWan(RESUMEN, n, 's3'), mediaWan(RESUMEN, 4, 's3'), `Wan S3 n=${n}`);
});

test('la DE de Wan divide el rango observado entre el rango esperado de una normal', () => {
  const { min: a, q1, q3, max: b } = RESUMEN;
  for (const n of [4, 10, 45, 200]) {
    casiIgual(deWan(RESUMEN, n, 's1'), (b - a) / xiWan(n), `Wan DE S1 n=${n}`);
    casiIgual(deWan(RESUMEN, n, 's2'), (q3 - q1) / etaWan(n), `Wan DE S2 n=${n}`);
    casiIgual(deWan(RESUMEN, n, 's3'), (deWan(RESUMEN, n, 's1') + deWan(RESUMEN, n, 's2')) / 2, `Wan DE S3 n=${n}`);
    // ξ y η crecen con n: cuanto mayor la muestra, más se separan los extremos.
    assert.ok(xiWan(n) > etaWan(n), `n=${n}: el rango esperado debe superar al intercuartílico esperado`);
  }
  for (const [menor, mayor] of [[4, 10], [10, 45], [45, 200], [200, 5000]] as const) {
    assert.ok(xiWan(mayor) > xiWan(menor), `ξ no crece de n=${menor} a n=${mayor}`);
    assert.ok(etaWan(mayor) > etaWan(menor), `η no crece de n=${menor} a n=${mayor}`);
  }
});

test('Hozo salta en n = 25/26 (media) y en n = 15/16 y 70/71 (DE)', () => {
  const { min: a, mediana: m, max: b } = RESUMEN;
  assert.equal(mediaHozo(a, m, b, 25), (a + 2 * m + b) / 4);
  assert.equal(mediaHozo(a, m, b, 26), m);
  assert.notEqual(mediaHozo(a, m, b, 25), mediaHozo(a, m, b, 26));

  assert.equal(deHozo(a, m, b, 15), Math.sqrt((Math.pow(a - 2 * m + b, 2) / 4 + Math.pow(b - a, 2)) / 12));
  assert.equal(deHozo(a, m, b, 16), (b - a) / 4);
  assert.notEqual(deHozo(a, m, b, 15), deHozo(a, m, b, 16));
  assert.equal(deHozo(a, m, b, 70), (b - a) / 4);
  assert.equal(deHozo(a, m, b, 71), (b - a) / 6);
  assert.notEqual(deHozo(a, m, b, 70), deHozo(a, m, b, 71));
});

test('los pesos de Luo tienden a sus límites y la media de S1 converge a la mediana', () => {
  // w1 y w3 → 0: la media estimada se acerca a la mediana.
  assert.ok(w1Luo(10) > w1Luo(1000) && w1Luo(1000) > w1Luo(100000));
  assert.ok(w1Luo(100000000) < 1e-5, String(w1Luo(100000000)));
  assert.ok(w3Luo(100000000) < 1e-5, String(w3Luo(100000000)));
  casiIgual(mediaLuo(RESUMEN, 100000000, 's1'), RESUMEN.mediana, 'Luo S1 con n enorme', 1e-4);
  // w2 → 0.70 por arriba; w4 → 0.70 por abajo.
  assert.ok(w2Luo(10) > 0.7 && w2Luo(1000000) > 0.7);
  casiIgual(w2Luo(1000000000), 0.7, 'w2 con n enorme', 1e-8);
  assert.ok(w4Luo(10) < 0.7);
  casiIgual(w4Luo(1e30), 0.7, 'w4 con n enorme', 1e-8);
});

test('un resumen simétrico devuelve exactamente la mediana en los tres métodos', () => {
  const simetrico: ResumenReportado = { min: 10, q1: 20, mediana: 30, q3: 40, max: 50 };
  for (const n of [4, 12, 25, 26, 100, 1000]) {
    for (const escenario of ESCENARIOS) {
      casiIgual(mediaLuo(simetrico, n, escenario), 30, `Luo ${escenario} n=${n}`);
      casiIgual(mediaWan(simetrico, n, escenario), 30, `Wan ${escenario} n=${n}`);
    }
    casiIgual(mediaHozo(simetrico.min, simetrico.mediana, simetrico.max, n), 30, `Hozo n=${n}`);
  }
  assert.equal(asimetriaRango(simetrico), 1);
  assert.equal(asimetriaIqr(simetrico), 1);
});

test('escalar los cinco números por k escala las medias y las DE por k y deja iguales los cocientes', () => {
  for (const k of [0.5, 2, 1000]) {
    const escalado: ResumenReportado = {
      min: RESUMEN.min * k,
      q1: RESUMEN.q1 * k,
      mediana: RESUMEN.mediana * k,
      q3: RESUMEN.q3 * k,
      max: RESUMEN.max * k,
    };
    for (const n of [10, 45, 100]) {
      for (const escenario of ESCENARIOS) {
        const base = estimarDesdeResumen(RESUMEN, n, escenario);
        const otro = estimarDesdeResumen(escalado, n, escenario);
        for (const clave of ['media_luo', 'media_wan', 'media_hozo', 'de_wan', 'de_hozo'] as const) {
          if (Number.isNaN(base[clave])) {
            assert.ok(Number.isNaN(otro[clave]), `${escenario} n=${n} ${clave}: NaN solo en uno`);
            continue;
          }
          casiIgual(otro[clave], base[clave] * k, `${escenario} n=${n} ${clave} k=${k}`);
        }
        for (const clave of ['asim_rango', 'asim_iqr'] as const) {
          if (Number.isNaN(base[clave])) continue;
          casiIgual(otro[clave], base[clave], `${escenario} n=${n} ${clave} k=${k}`);
        }
      }
    }
  }
});

test('cada escenario deja en NaN exactamente los métodos que no puede calcular', () => {
  const s1 = estimarDesdeResumen(RESUMEN, 10, 's1');
  assert.ok(Number.isNaN(s1.asim_iqr));
  for (const clave of ['media_luo', 'media_wan', 'media_hozo', 'de_wan', 'de_hozo', 'asim_rango'] as const) {
    assert.ok(Number.isFinite(s1[clave]), `s1.${clave} debería ser finito`);
  }
  const s2 = estimarDesdeResumen(RESUMEN, 10, 's2');
  for (const clave of ['media_hozo', 'de_hozo', 'asim_rango'] as const) {
    assert.ok(Number.isNaN(s2[clave]), `s2.${clave} debería ser NaN`);
  }
  const s3 = estimarDesdeResumen(RESUMEN, 10, 's3');
  for (const clave of ['media_luo', 'media_wan', 'media_hozo', 'de_wan', 'de_hozo', 'asim_rango', 'asim_iqr'] as const) {
    assert.ok(Number.isFinite(s3[clave]), `s3.${clave} debería ser finito`);
  }
});

test('las entradas imposibles lanzan RangeError', () => {
  assert.throws(() => mediaLuo(RESUMEN, 1, 's1'), RangeError);
  assert.throws(() => mediaLuo(RESUMEN, 3, 's2'), RangeError);
  assert.throws(() => mediaLuo(RESUMEN, 3, 's3'), RangeError);
  assert.throws(() => mediaLuo(RESUMEN, 10.5, 's1'), RangeError);
  assert.throws(() => mediaLuo({ ...RESUMEN, min: Number.NaN }, 10, 's1'), RangeError);
  assert.throws(() => deWan({ ...RESUMEN, q1: Number.NaN }, 10, 's2'), RangeError);
  assert.throws(() => mediaWan({ ...RESUMEN, max: 1 }, 10, 's1'), RangeError);
  assert.throws(() => mediaLuo(RESUMEN, 10, 'sx' as EscenarioResumen), RangeError);
});

// ---------------------------------------------------------------------------
// Validación, bandas y avisos
// ---------------------------------------------------------------------------

test('validar() exige los campos y el orden de cada escenario', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.equal(definicion.validar(conDerivadas(definicion, { escenario: 's1', n: 10, min: 2, mediana: 6, max: 21 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana), null);
  assert.equal(definicion.validar(conDerivadas(definicion, { escenario: 's2', n: 200, q1: 4, mediana: 6, q3: 9 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana), null);

  assert.deepEqual(definicion.validar({ ...EJEMPLO, escenario: 's4' }), { escenario: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n: 3 }), { n: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, escenario: 's1', n: 3 }), null, 'S1 admite n = 3');
  assert.deepEqual(definicion.validar({ ...EJEMPLO, escenario: 's1', n: 1 }), { n: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n: 4.5 }), { n: 'err_entero' });
  // Un campo que el escenario necesita y no llegó.
  assert.deepEqual(
    definicion.validar(conDerivadas(definicion, { escenario: 's2', n: 20, mediana: 6, q3: 9 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana),
    { q1: 'err_requerido' },
  );
  // El orden se reclama sobre el campo que lo rompe.
  assert.deepEqual(definicion.validar({ ...EJEMPLO, q3: 5 }), { q3: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, max: 1 }), { max: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, min: 7 }), { q1: 'err_rango' });
  // Un campo que el escenario no usa puede ir en cualquier orden (o faltar).
  assert.equal(definicion.validar({ ...EJEMPLO, escenario: 's1', q1: 99 }), null);
});

test('las bandas y los avisos siguen los cortes documentados', () => {
  const ejemplo = calcular(EJEMPLO);
  assert.deepEqual(ejemplo.bandas, { escenario: 's3', asimetria: 'marcada', hozo: 'aplica' });
  assert.deepEqual(ejemplo.avisos.map((a) => a.codigo), ['asimetria_marcada']);

  const simetrico = calcular(entradasDe('s3', 100, { min: 10, q1: 20, mediana: 30, q3: 40, max: 50 }));
  assert.equal(simetrico.bandas.asimetria, 'compatible');
  assert.deepEqual(simetrico.avisos.map((a) => a.codigo), []);

  const s2 = calcular(entradasDe('s2', 200, { min: Number.NaN, q1: 20, mediana: 30, q3: 40, max: Number.NaN }));
  assert.equal(s2.bandas.hozo, 'no_aplica');
  assert.ok(s2.avisos.some((a) => a.codigo === 'hozo_no_aplica'));
  assert.ok(Number.isNaN(s2.valores.media_hozo.valor));

  const pocos = calcular(entradasDe('s3', 9, { min: 10, q1: 20, mediana: 30, q3: 40, max: 50 }));
  assert.deepEqual(pocos.avisos.map((a) => a.codigo), ['n_pequeno']);
  assert.deepEqual(calcular(entradasDe('s3', 10, { min: 10, q1: 20, mediana: 30, q3: 40, max: 50 })).avisos.map((a) => a.codigo), []);

  // Resumen constante: la banda lo lee como simétrico y el aviso lo explica.
  const constante = calcular(entradasDe('s1', 12, { min: 5, q1: Number.NaN, mediana: 5, q3: Number.NaN, max: 5 }));
  assert.equal(constante.bandas.asimetria, 'compatible');
  assert.deepEqual(constante.avisos.map((a) => a.codigo), ['rango_cero']);
  assert.ok(Number.isNaN(constante.valores.asim_rango.valor), 'el cociente publicado sigue siendo NaN');
  assert.equal(constante.valores.de_wan.valor, 0);

  // En S3 manda el cociente más extremo de los dos: aquí el rango es simétrico
  // (1) pero el intercuartílico está muy torcido (9), y la banda debe verlo.
  const iqrTorcido = calcular(entradasDe('s3', 50, { min: 0, q1: 9, mediana: 10, q3: 19, max: 20 }));
  assert.equal(iqrTorcido.valores.asim_rango.valor, 1);
  assert.equal(iqrTorcido.valores.asim_iqr.valor, 9);
  assert.equal(iqrTorcido.bandas.asimetria, 'marcada');

  // La mediana puede coincidir con un cuartil (q₁ ≤ m ≤ q₃ lo admite): el
  // cociente se va a ±∞ o a 0, que son resultados, no «no aplica».
  const enQ1 = entradasDe('s3', 30, { min: 2, q1: 6, mediana: 6, q3: 12, max: 20 });
  const medianaEnQ1 = calcular(enQ1);
  assert.equal(medianaEnQ1.valores.asim_iqr.valor, Number.POSITIVE_INFINITY);
  assert.equal(medianaEnQ1.valores.asim_rango.valor, 3.5);
  assert.equal(medianaEnQ1.bandas.asimetria, 'marcada');
  assert.equal(presentar(medianaEnQ1, enQ1, contextoDePrueba(SLUG, 'es')).celdas.asim_iqr.valor, '∞');

  const enQ3 = conDerivadas(definicion, { escenario: 's2', n: 30, q1: 2, mediana: 6, q3: 6 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana;
  const medianaEnQ3 = calcular(enQ3);
  assert.equal(medianaEnQ3.valores.asim_iqr.valor, 0);
  assert.ok(Number.isNaN(medianaEnQ3.valores.asim_rango.valor));
  assert.equal(medianaEnQ3.bandas.asimetria, 'marcada');
  const presentadoQ3 = presentar(medianaEnQ3, enQ3, contextoDePrueba(SLUG, 'es'));
  assert.equal(presentadoQ3.celdas.asim_iqr.valor, '0');
  assert.equal(presentadoQ3.celdas.asim_rango.valor, 'no aplica');
});

// ---------------------------------------------------------------------------
// Presentación en los dos idiomas
// ---------------------------------------------------------------------------

test('presentar() rellena todas las plantillas en los tres escenarios y en ambos idiomas', () => {
  const entradas: EntradasMediaDesdeMediana[] = [
    EJEMPLO,
    conDerivadas(definicion, { escenario: 's1', n: 10, min: 2, mediana: 6, max: 21 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana,
    conDerivadas(definicion, { escenario: 's2', n: 200, q1: 4, mediana: 6, q3: 9 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana,
    entradasDe('s3', 100, { min: 10, q1: 20, mediana: 30, q3: 40, max: 50 }),
    conDerivadas(definicion, { escenario: 's1', n: 12, min: 5, mediana: 5, max: 5 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana,
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const p = presentar(calcular(e), e, ctx);
      assert.deepEqual(Object.keys(p.celdas).sort(), [...definicion.salidas].sort());
      const textos = [
        ...p.interpretacion,
        p.metodos,
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
        ...p.resumen.flat(),
      ];
      for (const texto of textos) {
        assert.ok(!texto.includes('{'), `${lang}/${e.escenario}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, 4);
      assert.ok(p.grafica && p.grafica.tipo === 'histograma-boxplot');
      if (p.grafica && p.grafica.tipo === 'histograma-boxplot') {
        const caja = p.grafica.caja;
        for (const v of [caja.min, caja.q1, caja.mediana, caja.q3, caja.max, caja.bigoteInf, caja.bigoteSup]) {
          assert.ok(Number.isFinite(v), `${lang}/${e.escenario}: la caja tiene un valor no finito`);
        }
        assert.ok(caja.min <= caja.q1 && caja.q1 <= caja.mediana && caja.mediana <= caja.q3 && caja.q3 <= caja.max);
        assert.equal(p.grafica.bins, undefined, 'sin datos crudos no hay histograma');
        assert.equal(p.grafica.ejeX.dominio[0], caja.min);
        assert.equal(p.grafica.ejeX.dominio[1], caja.max);
        for (const m of p.grafica.marcadores ?? []) {
          assert.ok(Number.isFinite(m.x), `${lang}/${e.escenario}: marcador «${m.id}» no finito`);
          assert.ok(m.etiqueta.trim().length > 0);
        }
        const esperados = e.escenario === 's2' ? ['media_luo', 'media_wan'] : ['media_luo', 'media_wan', 'media_hozo'];
        assert.deepEqual((p.grafica.marcadores ?? []).map((m) => m.id), esperados);
      }
    }
  }
});

test('la caja se adapta al escenario y la curva normal desaparece si la DE estimada es 0', () => {
  const ctx = contextoDePrueba(SLUG, 'es');
  const s1 = conDerivadas(definicion, { escenario: 's1', n: 10, min: 2, mediana: 6, max: 21 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana;
  const gS1 = presentar(calcular(s1), s1, ctx).grafica;
  assert.ok(gS1 && gS1.tipo === 'histograma-boxplot');
  if (gS1 && gS1.tipo === 'histograma-boxplot') {
    // Sin cuartiles, la caja es una línea en la mediana y los bigotes llegan a los extremos.
    assert.deepEqual([gS1.caja.q1, gS1.caja.mediana, gS1.caja.q3], [6, 6, 6]);
    assert.deepEqual([gS1.caja.bigoteInf, gS1.caja.bigoteSup], [2, 21]);
    assert.ok(gS1.normal);
  }

  const s2 = conDerivadas(definicion, { escenario: 's2', n: 200, q1: 4, mediana: 6, q3: 9 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana;
  const gS2 = presentar(calcular(s2), s2, ctx).grafica;
  assert.ok(gS2 && gS2.tipo === 'histograma-boxplot');
  if (gS2 && gS2.tipo === 'histograma-boxplot') {
    // Sin extremos, los propios cuartiles hacen de extremos y de bigotes.
    assert.deepEqual([gS2.caja.min, gS2.caja.max], [4, 9]);
    assert.deepEqual([gS2.caja.bigoteInf, gS2.caja.bigoteSup], [4, 9]);
  }

  const cero = conDerivadas(definicion, { escenario: 's1', n: 12, min: 5, mediana: 5, max: 5 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana;
  const gCero = presentar(calcular(cero), cero, ctx).grafica;
  assert.ok(gCero && gCero.tipo === 'histograma-boxplot');
  if (gCero && gCero.tipo === 'histograma-boxplot') assert.equal(gCero.normal, undefined);
});

test('el ejemplo se presenta con las cifras comprobadas a mano en los dos idiomas', () => {
  // S3, n = 45, 2 / 4 / 6 / 9 / 21. Wan: (2 + 8 + 12 + 18 + 21)/8 = 7.625.
  // Hozo con n > 25: la mediana (6); su DE con 15 < n ≤ 70: (21 − 2)/4 = 4.75.
  const es = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.media_luo.valor, '6.924');
  assert.equal(es.celdas.media_wan.valor, '7.625');
  assert.equal(es.celdas.media_hozo.valor, '6');
  assert.equal(es.celdas.de_wan.valor, '4.071');
  assert.equal(es.celdas.de_hozo.valor, '4.75');
  assert.equal(es.celdas.asim_rango.valor, '3.75');
  assert.equal(es.celdas.asim_iqr.valor, '1.5');
  // Los enteros del resumen se leen como enteros: «mediana de 6», no «de 6.00».
  assert.ok(es.interpretacion[0]?.includes('mediana de 6,') && es.interpretacion[0]?.includes('de 2 a 21'), es.interpretacion[0]);
  assert.ok(es.metodos.includes('la mediana, el rango intercuartílico y el rango'), es.metodos);
  assert.ok(es.metodos.includes('6.924') && es.metodos.includes('4.071'), es.metodos);
  // El Cochrane Handbook se cita por lo que dice de cada escenario, no como aval de los tres métodos.
  assert.ok(es.metodos.includes('§6.5.2.5') && es.metodos.includes('§6.5.2.6'), es.metodos);
  assert.ok(!es.metodos.includes('según recomienda'), es.metodos);

  // En S2 los métodos de Hozo se leen «no aplica», no «no definido».
  const s2 = conDerivadas(definicion, { escenario: 's2', n: 200, q1: 4, mediana: 6, q3: 9 } as unknown as EntradasMediaDesdeMediana) as EntradasMediaDesdeMediana;
  const esS2 = presentar(calcular(s2), s2, contextoDePrueba(SLUG, 'es'));
  assert.equal(esS2.celdas.media_hozo.valor, 'no aplica');
  assert.equal(esS2.celdas.de_hozo.valor, 'no aplica');
  assert.equal(esS2.celdas.asim_rango.valor, 'no aplica');
  assert.ok(esS2.interpretacion[1]?.includes('no aplica'), esS2.interpretacion[1]);
  assert.ok(esS2.metodos.includes('la mediana y el rango intercuartílico'), esS2.metodos);

  const en = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.media_luo.valor, '6.924');
  assert.ok(en.interpretacion[0]?.includes('45 participants'), en.interpretacion[0]);
  assert.ok(en.metodos.includes('the median, the interquartile range and the range'), en.metodos);
  const enS2 = presentar(calcular(s2), s2, contextoDePrueba(SLUG, 'en'));
  assert.equal(enS2.celdas.media_hozo.valor, 'not applicable');
});

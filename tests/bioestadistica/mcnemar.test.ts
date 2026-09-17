/**
 * Calculadora «Prueba de McNemar (proporciones pareadas)» contra el oráculo R y
 * sus propiedades.
 *
 *   node --test tests/bioestadistica/mcnemar.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo mcnemar`. Se comprueba (1) que las once
 * salidas de TypeScript coinciden con las de R caso por caso, incluidos los
 * `NaN` de la tabla sin pares discordantes y los infinitos del OR pareado; (2)
 * que el snippet ejecutado es, byte a byte, el que ve el usuario; (3) que el
 * SHA-256 de `r.codigo` es el grabado en el fixture; y (4) propiedades
 * algebraicas y de interfaz que valen para cualquier entrada.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import {
  METODOS_DELTA,
  agrestiMinRecortado,
  chi2Edwards,
  chi2McNemar,
  deltaPareada,
  mcnemar,
  orPareado,
  pBinomialBilateral,
  pExactaMcNemar,
  validarPareada,
} from '../../src/lib/bioestadistica/metodos/pareadas.ts';
import { MIN_DISCORDANTES, calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/mcnemar.ts';
import type { EntradasMcNemar } from '../../src/lib/bioestadistica/calculadoras/mcnemar.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'mcnemar';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];

function entradasDe(caso: CasoFixture): EntradasMcNemar {
  return conDerivadas(definicion, caso.entradas) as EntradasMcNemar;
}

const EJEMPLO: EntradasMcNemar = { a: 40, b: 15, c: 5, d: 90, metodo_delta: 'wald', nivel: 0.95 };

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
  assert.equal(fixture.casos.length, 14);
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
      `${caso.id} (${JSON.stringify(caso.entradas)}) · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`,
    );
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    const generado = readFileSync(rutaGenerado(SLUG, caso.id), 'utf8');
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), generado);
  });
}

test('sin pares discordantes R y TypeScript dejan la prueba «no definida», no en 0 ni en 1', () => {
  const caso = fixture.casos.find((c) => c.id === 'sin_discordantes');
  assert.ok(caso);
  const r = normalizarR(caso.esperado) as Record<string, unknown>;
  // jsonlite escribe NaN como «NaN» y NA_real_ como «NA»; ambos llegan como «no definido».
  assert.ok(Number.isNaN(r.chi2 as number) && Number.isNaN(r.chi2_edwards as number));
  assert.equal(r.p_exacta, null);
  assert.deepEqual(r.or_pareado, [null, null, null]);
  assert.deepEqual(r.delta, [0, 0, 0]);
  const ts = calcular(entradasDe(caso), 0.95);
  for (const k of ['chi2', 'p_chi2', 'chi2_edwards', 'p_edwards', 'p_exacta', 'or_pareado'] as const) {
    assert.ok(Number.isNaN(ts.valores[k].valor), `${k} debería quedar sin definir`);
  }
  assert.equal(ts.bandas.decision, 'sin_discordantes');
  assert.deepEqual(ts.avisos.map((av) => av.codigo), ['sin_discordantes']);
});

// ---------------------------------------------------------------------------
// Propiedades algebraicas
// ---------------------------------------------------------------------------

/** Rejilla de tablas pareadas: concordantes y discordantes, con y sin ceros. */
function* tablas(): Generator<[number, number, number, number]> {
  for (const a of [0, 1, 40, 300]) {
    for (const b of [0, 1, 5, 15, 60]) {
      for (const c of [0, 2, 5, 12, 40]) {
        for (const d of [0, 7, 90, 900]) {
          if (a + b + c + d > 0) yield [a, b, c, d];
        }
      }
    }
  }
}

const cerca = (x: number, y: number, rel = 1e-9): boolean =>
  Math.abs(x - y) <= 1e-12 + rel * Math.max(Math.abs(x), Math.abs(y));

test('intercambiar b y c cambia el signo de δ, invierte el OR pareado y deja igual la prueba', () => {
  for (const [a, b, c, d] of tablas()) {
    const donde = `${a}/${b}/${c}/${d}`;
    const v = mcnemar(a, b, c, d);
    const w = mcnemar(a, c, b, d); // la tabla traspuesta: b y c cambian de papel
    // Los estadísticos dependen de |b − c| y de b + c: no cambian.
    for (const k of ['n', 'n_disc', 'chi2', 'p_chi2', 'chi2_edwards', 'p_edwards'] as const) {
      assert.ok(
        (Number.isNaN(v[k].valor) && Number.isNaN(w[k].valor)) || v[k].valor === w[k].valor,
        `${donde}: ${k} cambió al intercambiar b y c (${v[k].valor} vs ${w[k].valor})`,
      );
    }
    if (b + c > 0) {
      assert.ok(cerca(v.p_exacta.valor, w.p_exacta.valor, 1e-12), `${donde}: p exacto no es simétrico`);
    }
    // La diferencia cambia de signo exactamente (el «+ 0» normaliza −0 frente a 0).
    assert.equal(v.delta.valor + 0, -w.delta.valor + 0, `${donde}: δ`);
    // El OR pareado y su intervalo se invierten (b/c ↔ c/b).
    const or = v.or_pareado.valor;
    const orT = w.or_pareado.valor;
    if (Number.isNaN(or)) {
      assert.ok(Number.isNaN(orT), donde);
    } else if (or === 0) {
      assert.equal(orT, Number.POSITIVE_INFINITY, donde);
    } else if (or === Number.POSITIVE_INFINITY) {
      assert.equal(orT, 0, donde);
    } else {
      assert.ok(cerca(orT, 1 / or), `${donde}: OR invertido (${orT} vs ${1 / or})`);
      const [lo, hi] = v.or_pareado.ic as [number, number];
      const [loT, hiT] = w.or_pareado.ic as [number, number];
      if (Number.isFinite(hi) && hi > 0) assert.ok(cerca(loT, 1 / hi, 1e-7), `${donde}: límite inferior invertido`);
      if (Number.isFinite(hiT) && lo > 0) assert.ok(cerca(hiT, 1 / lo, 1e-7), `${donde}: límite superior invertido`);
    }
  }
});

test('los pares concordantes (a y d) no entran en la prueba', () => {
  for (const [, b, c] of tablas()) {
    const uno = mcnemar(1, b, c, 1);
    const otro = mcnemar(500, b, c, 700);
    for (const k of ['n_disc', 'chi2', 'p_chi2', 'chi2_edwards', 'p_edwards', 'p_exacta', 'or_pareado'] as const) {
      assert.ok(
        (Number.isNaN(uno[k].valor) && Number.isNaN(otro[k].valor)) || uno[k].valor === otro[k].valor,
        `b=${b}, c=${c}: ${k} depende de los concordantes`,
      );
    }
    // δ sí cambia: su denominador es el total de pares.
    assert.equal(uno.n.valor, b + c + 2);
    assert.equal(otro.n.valor, b + c + 1200);
  }
});

test('χ² ≥ Edwards, los valores p están en [0, 1] y b = c deja la prueba en el centro', () => {
  for (const [a, b, c, d] of tablas()) {
    const donde = `${a}/${b}/${c}/${d}`;
    const v = mcnemar(a, b, c, d);
    if (b + c === 0) {
      assert.ok(Number.isNaN(v.chi2.valor) && Number.isNaN(v.chi2_edwards.valor), donde);
      continue;
    }
    assert.ok(v.chi2.valor >= v.chi2_edwards.valor - EPS, `${donde}: Edwards por encima de χ² sin corregir`);
    for (const k of ['p_chi2', 'p_edwards', 'p_exacta'] as const) {
      assert.ok(v[k].valor >= 0 && v[k].valor <= 1 + EPS, `${donde}: ${k} = ${v[k].valor} fuera de [0, 1]`);
    }
    if (b === c) {
      assert.equal(v.chi2.valor, 0, `${donde}: χ² con b = c`);
      assert.equal(v.chi2_edwards.valor, 0, `${donde}: Edwards con b = c (R no corrige cuando b = c)`);
      assert.equal(v.p_exacta.valor, 1, `${donde}: p exacto con b = c`);
      assert.equal(v.delta.valor, 0, donde);
    }
  }
});

test('el IC de Wald contiene su estimación y el de Agresti-Min contiene el punto salvo recorte', () => {
  for (const [a, b, c, d] of tablas()) {
    const donde = `${a}/${b}/${c}/${d}`;
    const n = a + b + c + d;
    const wald = deltaPareada(b, c, n, { metodo: 'wald' });
    const [lo, hi] = wald.ic as [number, number];
    assert.ok(lo <= wald.valor + EPS && hi >= wald.valor - EPS, `${donde}: Wald no contiene δ`);
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi), `${donde}: Wald sin límites finitos`);

    const am = deltaPareada(b, c, n, { metodo: 'agresti-min' });
    const [loAm, hiAm] = am.ic as [number, number];
    assert.equal(am.valor, wald.valor, `${donde}: la estimación puntual no debe depender del método`);
    assert.ok(loAm >= -1 - EPS && hiAm <= 1 + EPS, `${donde}: Agresti-Min fuera de [−1, 1]`);
    if (!agrestiMinRecortado(b, c, n)) {
      assert.ok(loAm <= am.valor + EPS && hiAm >= am.valor - EPS, `${donde}: Agresti-Min sin recorte no contiene δ`);
    } else {
      assert.ok(loAm === -1 || hiAm === 1, `${donde}: el aviso de recorte no corresponde a un límite tocado`);
    }
  }
  // El intervalo de Wald NO se recorta, igual que en R: con pocos pares puede
  // salirse de [−1, 1]. Es una propiedad del método que la interfaz muestra.
  const fuera = deltaPareada(1, 2, 3, { metodo: 'wald' });
  assert.ok((fuera.ic as [number, number])[0] < -1, 'el Wald pareado debería poder bajar de −1 sin recortarse');
  assert.equal(deltaPareada(5, 0, 5, { metodo: 'agresti-min' }).ic?.[1], 1, 'Agresti-Min sí se recorta');
  assert.ok(agrestiMinRecortado(5, 0, 5) && !agrestiMinRecortado(1, 2, 3));
});

test('el p exacto replica la regla bilateral de binom.test', () => {
  // Valores de R: binom.test(x, m, 0.5)$p.value
  assert.ok(cerca(pBinomialBilateral(15, 20), 0.041389465332031285, 1e-12));
  assert.ok(cerca(pBinomialBilateral(0, 7), 0.015625, 1e-12));
  assert.ok(cerca(pBinomialBilateral(9, 12), 0.14599609375000008, 1e-12));
  assert.ok(cerca(pBinomialBilateral(5, 5), 0.0625, 1e-12));
  assert.equal(pBinomialBilateral(10, 20), 1); // x = m·p: la regla devuelve 1 exacto
  assert.equal(pBinomialBilateral(1, 1), 1);
  // Simetría en p = 1/2 y coherencia con la envoltura de McNemar.
  for (let m = 1; m <= 40; m += 1) {
    for (let x = 0; x <= m; x += 1) {
      const p = pBinomialBilateral(x, m);
      assert.ok(p >= 0 && p <= 1 + EPS, `x=${x}, m=${m}: p = ${p}`);
      assert.ok(cerca(p, pBinomialBilateral(m - x, m), 1e-12), `x=${x}, m=${m}: asimetría`);
      assert.ok(cerca(p, pExactaMcNemar(x, m - x), 1e-15), `x=${x}, m=${m}: envoltura`);
    }
  }
  assert.ok(Number.isNaN(pExactaMcNemar(0, 0)));
});

test('las entradas imposibles lanzan RangeError', () => {
  assert.throws(() => validarPareada({ a: 0, b: 0, c: 0, d: 0 }), RangeError); // tabla vacía
  assert.throws(() => validarPareada({ a: -1, b: 0, c: 0, d: 1 }), RangeError);
  assert.throws(() => validarPareada({ a: 1.5, b: 0, c: 0, d: 1 }), RangeError);
  assert.throws(() => mcnemar(40, 15, 5, 90, { nivel: 1 }), RangeError);
  assert.throws(() => mcnemar(40, 15, 5, 90, { nivel: 0 }), RangeError);
  assert.throws(() => mcnemar(40, 15, 5, 90, { metodo: 'newcombe' as never }), RangeError);
  assert.throws(() => orPareado(15, 5, 1), RangeError);
  assert.throws(() => pBinomialBilateral(3, 2), RangeError);
  assert.throws(() => pBinomialBilateral(1.5, 4), RangeError);
});

test('los estadísticos sueltos coinciden con la comprobación manual', () => {
  assert.equal(chi2McNemar(15, 5), 5);
  assert.equal(chi2Edwards(15, 5), 4.05);
  assert.equal(chi2Edwards(10, 10), 0); // b = c: mcnemar.test no corrige
  assert.ok(Number.isNaN(chi2McNemar(0, 0)) && Number.isNaN(chi2Edwards(0, 0)));
  const or = orPareado(15, 5);
  assert.equal(or.valor, 3);
  assert.ok(cerca(or.ic?.[0] as number, 1.0364696204894186, 1e-9));
  assert.ok(cerca(or.ic?.[1] as number, 10.551149707628438, 1e-9));
  assert.equal(orPareado(0, 7).ic?.[0], 0);
  assert.equal(orPareado(5, 0).ic?.[1], Number.POSITIVE_INFINITY);
});

// ---------------------------------------------------------------------------
// Contrato de interfaz: validar, bandas, avisos y presentación en ambos idiomas
// ---------------------------------------------------------------------------

test('validar() reclama celdas no enteras, la tabla vacía, el nivel y la opción', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.equal(definicion.validar({ ...EJEMPLO, b: 0, c: 0 }), null, 'b + c = 0 es admisible');
  assert.deepEqual(definicion.validar({ ...EJEMPLO, a: 2.5 }), { a: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, c: -1 }), { c: 'err_entero' });
  assert.deepEqual(definicion.validar({ a: 0, b: 0, c: 0, d: 0, metodo_delta: 'wald', nivel: 0.95 }), {
    a: 'err_rango',
    b: 'err_rango',
    c: 'err_rango',
    d: 'err_rango',
  });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 1 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, metodo_delta: 'newcombe' }), { metodo_delta: 'err_opcion' });
});

test('bandas y avisos del ejemplo y de los casos límite', () => {
  const ej = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ej.bandas, { principal: 'exacta', decision: 'rechaza', direccion: 'a_mayor' });
  assert.deepEqual(ej.avisos.map((a) => a.codigo), ['pocos_discordantes', 'solo_discordantes']);
  assert.deepEqual(ej.avisos[0]?.params, { n_disc: 20 });

  // 25 pares discordantes o más: la χ² corregida pasa a ser la prueba principal.
  const grande = calcular({ ...EJEMPLO, a: 1000, b: 60, c: 40, d: 900 }, 0.95);
  assert.equal(grande.bandas.principal, 'edwards');
  assert.equal(grande.bandas.decision, 'no_rechaza');
  assert.deepEqual(grande.avisos.map((a) => a.codigo), ['solo_discordantes']);
  const frontera = calcular({ ...EJEMPLO, a: 50, b: 13, c: 12, d: 80 }, 0.95);
  assert.equal(frontera.valores.n_disc.valor, MIN_DISCORDANTES);
  assert.equal(frontera.bandas.principal, 'edwards');
  assert.equal(calcular({ ...EJEMPLO, a: 50, b: 12, c: 12, d: 80 }, 0.95).bandas.principal, 'exacta');

  assert.equal(calcular({ ...EJEMPLO, b: 0, c: 7 }, 0.95).bandas.direccion, 'b_mayor');
  assert.equal(calcular({ ...EJEMPLO, b: 10, c: 10 }, 0.95).bandas.direccion, 'igual');

  const recorte = calcular({ a: 0, b: 5, c: 0, d: 0, metodo_delta: 'agresti-min', nivel: 0.95 }, 0.95);
  assert.ok(recorte.avisos.some((a) => a.codigo === 'agresti_min_recortado'));
  // El mismo caso con Wald no emite el aviso: el recorte es propio de Agresti-Min.
  const conWald = calcular({ a: 0, b: 5, c: 0, d: 0, metodo_delta: 'wald', nivel: 0.95 }, 0.95);
  assert.ok(!conWald.avisos.some((a) => a.codigo === 'agresti_min_recortado'));
});

test('presentar() rellena todas las plantillas en español e inglés, con ambos métodos y sin discordantes', () => {
  const entradas: EntradasMcNemar[] = [
    ...METODOS_DELTA.map((metodo_delta) => ({ ...EJEMPLO, metodo_delta })),
    { ...EJEMPLO, b: 0, c: 0 },
    { ...EJEMPLO, b: 0, c: 7 },
    { ...EJEMPLO, b: 1, c: 0 },
    { ...EJEMPLO, b: 10, c: 10 },
    { ...EJEMPLO, a: 1000, b: 60, c: 40, d: 900 },
    { a: 0, b: 5, c: 0, d: 0, metodo_delta: 'agresti-min', nivel: 0.95 },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const donde = `${lang} · ${e.a}/${e.b}/${e.c}/${e.d} ${String(e.metodo_delta)}`;
      const p = presentar(calcular(e, e.nivel), e, ctx);
      assert.deepEqual(Object.keys(p.celdas).sort(), [...definicion.salidas].sort(), donde);
      const textos = [
        ...p.interpretacion,
        p.metodos,
        ...Object.values(p.celdas).flatMap((cel) => [cel.valor, cel.ic ?? '', cel.nota ?? '']),
      ];
      for (const texto of textos) {
        assert.ok(!texto.includes('{'), `${donde}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, e.b + e.c === 0 ? 3 : 5, donde);
      assert.ok(p.grafica && p.grafica.tipo === 'barras', donde);
      assert.equal(p.grafica.tipo === 'barras' ? p.grafica.categorias.length : 0, 2, donde);
      assert.equal(p.resumen.length, definicion.salidas.length, donde);
    }
  }
});

test('la presentación del ejemplo dice lo que dice la comprobación manual', () => {
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  // Comprobado en R: mcnemar.test(x, correct = FALSE)$p.value = 0.02534732…,
  // correct = TRUE → 0.04417134…, binom.test(15, 20)$p.value = 0.04138947…
  assert.equal(es.celdas.p_chi2.valor, '0.025');
  assert.equal(es.celdas.p_edwards.valor, '0.044');
  assert.equal(es.celdas.p_exacta.valor, '0.041');
  assert.equal(es.celdas.p_exacta.clase, 'destacada');
  assert.equal(es.celdas.chi2.valor, '5.000');
  assert.equal(es.celdas.chi2_edwards.valor, '4.050');
  assert.equal(es.celdas.n_disc.valor, '20');
  assert.equal(es.celdas.delta.valor, '6.7');
  assert.equal(es.celdas.delta.ic, '0.9 a 12.4');
  assert.equal(es.celdas.or_pareado.valor, '3.00');
  assert.equal(es.celdas.or_pareado.ic, '1.04 a 10.55');
  assert.ok(es.interpretacion[0].includes('36.7\u202f%') && es.interpretacion[0].includes('30.0\u202f%'), es.interpretacion[0]);
  assert.ok(es.interpretacion[0].includes('6.7 puntos porcentuales'), es.interpretacion[0]);
  assert.ok(es.interpretacion[1].includes('0.041'), es.interpretacion[1]);
  assert.ok(es.interpretacion[2].includes('se rechaza'), es.interpretacion[2]);
  assert.ok(es.metodos.includes('[1]') && es.metodos.includes('de Wald'), es.metodos);

  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.delta.valor, '6.7');
  assert.ok(en.metodos.includes('by the Wald method'), en.metodos);

  // Con Agresti-Min cambia el intervalo y el párrafo de Métodos cita a Agresti y Min.
  const conAm: EntradasMcNemar = { ...EJEMPLO, metodo_delta: 'agresti-min' };
  const am = presentar(calcular(conAm, 0.95), conAm, contextoDePrueba(SLUG, 'es'));
  assert.equal(am.celdas.delta.valor, '6.7', 'la estimación puntual no cambia con el método');
  assert.equal(am.celdas.delta.ic, '0.8 a 12.4');
  assert.ok(am.metodos.includes('de Agresti-Min [3]'), am.metodos);

  // Sin discordantes: celdas «no definido», OR sin intervalo y párrafo alternativo.
  const sinDisc: EntradasMcNemar = { ...EJEMPLO, b: 0, c: 0 };
  const sd = presentar(calcular(sinDisc, 0.95), sinDisc, contextoDePrueba(SLUG, 'es'));
  assert.equal(sd.celdas.chi2.valor, 'no definido');
  assert.equal(sd.celdas.p_exacta.valor, 'no definido');
  assert.equal(sd.celdas.or_pareado.ic, undefined);
  assert.equal(sd.celdas.or_pareado.nota, 'IC no definido');
  assert.equal(sd.celdas.delta.valor, '0.0');
  assert.ok(sd.interpretacion[1].includes('Ninguno de los 130 pares'), sd.interpretacion[1]);

  // Con c = 0 el límite superior del OR es infinito y sí se muestra.
  const cCero: EntradasMcNemar = { ...EJEMPLO, b: 5, c: 0 };
  const inf = presentar(calcular(cCero, 0.95), cCero, contextoDePrueba(SLUG, 'es'));
  assert.equal(inf.celdas.or_pareado.valor, '∞');
  assert.ok(inf.celdas.or_pareado.ic?.endsWith('∞'), inf.celdas.or_pareado.ic);
  assert.ok(inf.interpretacion[3].includes('∞'), inf.interpretacion[3]);
});

test('la gráfica de barras lleva los dos pares discordantes y la línea de H₀', () => {
  const ctx = contextoDePrueba(SLUG, 'es');
  const datos = definicion.grafica?.(calcular(EJEMPLO, 0.95), EJEMPLO, ctx);
  assert.ok(datos && datos.tipo === 'barras');
  assert.equal(datos.series.length, 1);
  assert.deepEqual(datos.categorias.map((cat) => cat.valores), [[15], [5]]);
  assert.deepEqual(datos.ejeY.dominio, [0, 15]);
  assert.equal(datos.referencia?.valor, 10);
  assert.ok(datos.resumen.includes('15') && datos.resumen.includes('5'));
});

/**
 * Calculadora «Independencia en 2×2 (χ² y Fisher)» contra el oráculo R y sus
 * propiedades.
 *
 *   node --test tests/bioestadistica/chi-cuadrada-fisher.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo chi-cuadrada-fisher`. Se comprueba
 * (1) que las quince salidas de TypeScript coinciden con las de `chisq.test` y
 * `fisher.test` caso por caso, incluidos el OR condicional 0 o ∞ de los bordes
 * del soporte; (2) que el snippet ejecutado es, byte a byte, el que ve el
 * usuario; (3) que el SHA-256 de `r.codigo` es el grabado en el fixture; y
 * (4) propiedades algebraicas y de interfaz que valen para cualquier tabla.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import {
  correccionYates,
  esperados,
  independencia2x2,
  orEnBorde,
  pruebaRecomendada,
  sentidoPhi,
  validarTablaIndependencia,
} from '../../src/lib/bioestadistica/metodos/independencia.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/chi-cuadrada-fisher.ts';
import type { EntradasChi2Fisher } from '../../src/lib/bioestadistica/calculadoras/chi-cuadrada-fisher.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'chi-cuadrada-fisher';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const IDIOMAS: readonly Lang[] = ['es', 'en'];

const EJEMPLO: EntradasChi2Fisher = { a: 12, b: 88, c: 30, d: 70, nivel: 0.95 };

function entradasDe(caso: CasoFixture): EntradasChi2Fisher {
  return conDerivadas(definicion, caso.entradas) as EntradasChi2Fisher;
}

/** Diferencia relativa; 0 cuando los dos valores son idénticos (incluidos ±∞). */
function difRel(x: number, y: number): number {
  if (x === y) return 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Number.POSITIVE_INFINITY;
  return Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), Number.MIN_VALUE);
}

function cerca(x: number, y: number, rel: number, donde: string): void {
  assert.ok(difRel(x, y) <= rel, `${donde}: ${x} vs ${y} (dif. rel. ${difRel(x, y)})`);
}

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
  assert.equal(fixture.casos.length, 15);
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

test('los bordes del soporte dejan el OR condicional en 0 o ∞, exactamente como R', () => {
  const cero = fixture.casos.find((c) => c.id === 'phi_menos_uno');
  const infinito = fixture.casos.find((c) => c.id === 'phi_uno');
  assert.ok(cero && infinito);
  const rCero = normalizarR(cero.esperado) as Record<string, unknown>;
  const rInf = normalizarR(infinito.esperado) as Record<string, unknown>;
  assert.equal((rCero.or_cond as number[])[0], 0);
  assert.equal((rInf.or_cond as number[])[0], Number.POSITIVE_INFINITY);
  assert.equal((rInf.or_cond as number[])[2], Number.POSITIVE_INFINITY);

  const tsCero = calcular(entradasDe(cero), 0.95);
  assert.equal(tsCero.valores.or_cond.valor, 0);
  assert.equal(tsCero.valores.or_cond.ic?.[0], 0);
  assert.ok(tsCero.avisos.some((a) => a.codigo === 'or_cond_borde'));

  const tsInf = calcular(entradasDe(infinito), 0.95);
  assert.equal(tsInf.valores.or_cond.valor, Number.POSITIVE_INFINITY);
  assert.equal(tsInf.valores.or_cond.ic?.[1], Number.POSITIVE_INFINITY);
  assert.ok(tsInf.avisos.some((a) => a.codigo === 'or_cond_borde'));
});

// ---------------------------------------------------------------------------
// Propiedades algebraicas
// ---------------------------------------------------------------------------

/** Rejilla de tablas con y sin ceros, márgenes equilibrados y desequilibrados. */
function* tablas(): Generator<[number, number, number, number]> {
  for (const a of [0, 1, 4, 12, 40]) {
    for (const b of [1, 3, 9, 88]) {
      for (const c of [0, 2, 7, 30]) {
        for (const d of [1, 5, 20, 70]) {
          if (a + b > 0 && c + d > 0 && a + c > 0 && b + d > 0) yield [a, b, c, d];
        }
      }
    }
  }
}

/**
 * El intervalo del OR condicional que devuelve R no siempre es simétrico bajo
 * inversión: cuando la raíz cae fuera del corchete que usa `uniroot`, R
 * devuelve el extremo, es decir 0 por abajo y 1/`.Machine$double.eps` por
 * arriba, mientras que en la tabla invertida el mismo límite sale como ∞ o
 * como 0. Esta saturación iguala los dos artefactos antes de comparar.
 */
const TOPE = 1 / Number.EPSILON;
function satura(x: number): number {
  if (x <= Number.EPSILON) return 0;
  if (x >= TOPE) return Number.POSITIVE_INFINITY;
  return x;
}

/** Recíproco con los extremos bien definidos: 1/0 = ∞ y 1/∞ = 0. */
function reciproco(x: number): number {
  if (x === 0) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(x)) return 0;
  return 1 / x;
}

/**
 * Tolerancia de las propiedades que comparan dos raíces distintas del mismo
 * problema (la tabla y su reflejo): `fisher.test` resuelve cada orientación con
 * `uniroot` a tolerancia 1.2e-4, así que las dos soluciones coinciden solo
 * hasta ~1e-4 relativo. No es imprecisión de esta biblioteca: es la del oráculo
 * que reproduce (medido sobre la rejilla: máximo 8.9e-5).
 */
const TOL_RAIZ = 2e-4;
/** Igualdades exactas en aritmética de doble: solo cambia el orden de la suma. */
const TOL_EXACTA = 1e-12;

test('intercambiar filas o columnas conserva los estadísticos e invierte φ y el OR condicional', () => {
  for (const [a, b, c, d] of tablas()) {
    const donde = `${a}/${b}/${c}/${d}`;
    const v = independencia2x2(a, b, c, d);
    for (const [nombre, w] of [
      ['filas', independencia2x2(c, d, a, b)],
      ['columnas', independencia2x2(b, a, d, c)],
    ] as const) {
      for (const k of ['n', 'chi2', 'p_chi2', 'chi2_yates', 'p_yates', 'chi2_n1', 'p_n1', 'p_fisher'] as const) {
        cerca(v[k].valor, w[k].valor, TOL_EXACTA, `${donde} ${nombre}: ${k}`);
      }
      cerca(Math.abs(v.phi.valor), Math.abs(w.phi.valor), TOL_EXACTA, `${donde} ${nombre}: |φ|`);
      assert.equal(Math.sign(v.phi.valor), -Math.sign(w.phi.valor) || 0, `${donde} ${nombre}: el signo de φ no se invirtió`);
      cerca(satura(v.or_cond.valor), satura(reciproco(w.or_cond.valor)), TOL_RAIZ, `${donde} ${nombre}: OR condicional`);
      const [lo, hi] = v.or_cond.ic as [number, number];
      const [loW, hiW] = w.or_cond.ic as [number, number];
      cerca(satura(lo), satura(reciproco(hiW)), TOL_RAIZ, `${donde} ${nombre}: límite inferior`);
      cerca(satura(hi), satura(reciproco(loW)), TOL_RAIZ, `${donde} ${nombre}: límite superior`);
    }
  }
});

test('trasponer la tabla no cambia nada', () => {
  for (const [a, b, c, d] of tablas()) {
    const donde = `${a}/${b}/${c}/${d}`;
    const v = independencia2x2(a, b, c, d);
    const t = independencia2x2(a, c, b, d);
    for (const k of ['n', 'e_min', 'chi2', 'p_chi2', 'chi2_yates', 'p_yates', 'chi2_n1', 'p_n1', 'p_fisher', 'phi'] as const) {
      cerca(v[k].valor, t[k].valor, TOL_EXACTA, `${donde} traspuesta: ${k}`);
    }
    cerca(v.or_cond.valor, t.or_cond.valor, TOL_EXACTA, `${donde} traspuesta: OR condicional`);
    cerca((v.or_cond.ic as [number, number])[0], (t.or_cond.ic as [number, number])[0], TOL_EXACTA, `${donde} traspuesta: límite inferior`);
    cerca((v.or_cond.ic as [number, number])[1], (t.or_cond.ic as [number, number])[1], TOL_EXACTA, `${donde} traspuesta: límite superior`);
  }
});

test('las identidades de los estadísticos se cumplen con cualquier tabla', () => {
  for (const [a, b, c, d] of tablas()) {
    const donde = `${a}/${b}/${c}/${d}`;
    const v = independencia2x2(a, b, c, d);
    const n = a + b + c + d;
    assert.equal(v.n.valor, n, donde);

    // χ² ≥ χ²_Yates ≥ 0: la corrección solo puede restar.
    assert.ok(v.chi2.valor >= 0, `${donde}: χ² negativa`);
    assert.ok(v.chi2_yates.valor >= 0, `${donde}: χ² de Yates negativa`);
    assert.ok(v.chi2_yates.valor <= v.chi2.valor + 1e-12, `${donde}: Yates por encima de Pearson`);

    // χ²_{N−1} = χ² (n − 1)/n, φ = (ad − bc)/√(n₁n₀m₁m₀) y |φ| = √(χ²/n). Las
    // dos primeras se reescriben aquí a mano: llamar a la función del módulo
    // compararía el módulo consigo mismo y no probaría nada.
    cerca(v.chi2_n1.valor, (v.chi2.valor * (n - 1)) / n, 1e-12, `${donde}: χ² N−1`);
    cerca(v.phi.valor, (a * d - b * c) / Math.sqrt((a + b) * (c + d) * (a + c) * (b + d)), 1e-12, `${donde}: φ`);
    cerca(Math.abs(v.phi.valor), Math.sqrt(v.chi2.valor / n), 1e-9, `${donde}: |φ| = √(χ²/n)`);
    assert.ok(Math.abs(v.phi.valor) <= 1 + 1e-12, `${donde}: |φ| mayor que 1`);

    // Las esperadas suman n y respetan los márgenes.
    const e = esperados({ a, b, c, d });
    cerca(e.e_a + e.e_b + e.e_c + e.e_d, n, 1e-12, `${donde}: las esperadas no suman n`);
    cerca(e.e_a + e.e_b, a + b, 1e-12, `${donde}: margen de la fila 1`);
    cerca(e.e_a + e.e_c, a + c, 1e-12, `${donde}: margen de la columna 1`);
    assert.equal(v.e_min.valor, Math.min(e.e_a, e.e_b, e.e_c, e.e_d), `${donde}: e_min`);

    // Valores p dentro de [0, 1] y el OR condicional dentro de su intervalo.
    // El p de Fisher es la suma de una masa ya normalizada y puede rebasar 1 en
    // un ulp; ni `fisher.test` ni esta biblioteca lo recortan (la biblioteca
    // nunca redondea), así que se admite ese margen.
    for (const k of ['p_chi2', 'p_yates', 'p_n1', 'p_fisher'] as const) {
      assert.ok(v[k].valor >= 0 && v[k].valor <= 1 + 1e-12, `${donde}: ${k} fuera de [0, 1] (${v[k].valor})`);
    }
    const [lo, hi] = v.or_cond.ic as [number, number];
    assert.ok(lo <= hi, `${donde}: intervalo del OR condicional invertido`);
    assert.ok(lo <= v.or_cond.valor && v.or_cond.valor <= hi, `${donde}: el OR condicional ${v.or_cond.valor} cae fuera de [${lo}, ${hi}]`);

    // La corrección de Yates está acotada a 0.5 y deja el estadístico en 0
    // cuando |ad − bc| < n/2 (comportamiento de chisq.test).
    const k = correccionYates({ a, b, c, d }, e);
    assert.ok(k >= 0 && k <= 0.5, `${donde}: corrección fuera de [0, 0.5]`);
    // Con |ad − bc| < n/2 el estadístico corregido se anula. Queda un residuo
    // de ~1e-29 en las tablas donde las cuatro |O − E| difieren en un ulp
    // (p. ej. 0/1/2/20, donde R da exactamente el mismo 2.5357477311245812e-29).
    if (Math.abs(a * d - b * c) < n / 2) {
      assert.ok(v.chi2_yates.valor < 1e-20, `${donde}: |ad − bc| < n/2 y el estadístico corregido es ${v.chi2_yates.valor}`);
      assert.ok(v.p_yates.valor > 1 - 1e-12, `${donde}: |ad − bc| < n/2 y el p corregido es ${v.p_yates.valor}`);
    }

    // La prueba recomendada y el sentido de φ dependen solo de n, E y el signo.
    assert.equal(v.e_min.valor < 5 || n < 20, pruebaRecomendada(n, v.e_min.valor) === 'fisher', donde);
    assert.equal(sentidoPhi(v.phi.valor), v.phi.valor > 0 ? 'positiva' : v.phi.valor < 0 ? 'negativa' : 'nula', donde);
    assert.equal(orEnBorde({ a, b, c, d }), v.or_cond.valor === 0 || !Number.isFinite(v.or_cond.valor), donde);
  }
});

test('con n < 20 la frecuencia esperada mínima nunca llega a 5 (E_min ≤ n/4)', () => {
  for (const [a, b, c, d] of tablas()) {
    const n = a + b + c + d;
    const e = esperados({ a, b, c, d });
    assert.ok(e.e_min <= n / 4 + 1e-12, `${a}/${b}/${c}/${d}: E_min = ${e.e_min} > n/4`);
    if (n < 20) assert.equal(pruebaRecomendada(n, e.e_min), 'fisher', `${a}/${b}/${c}/${d}`);
  }
});

test('con muchos datos el OR condicional se acerca al OR de Woolf ad/bc', () => {
  const grandes: Array<[number, number, number, number]> = [
    [100, 900, 120, 880],
    [500, 500, 400, 600],
    [300, 700, 200, 800],
    [50, 950, 80, 920],
  ];
  for (const [a, b, c, d] of grandes) {
    assert.equal(a + b + c + d, 2000);
    const v = independencia2x2(a, b, c, d);
    const woolf = (a * d) / (b * c);
    cerca(v.or_cond.valor, woolf, 0.05, `${a}/${b}/${c}/${d}: OR condicional frente a ad/bc`);
  }
});

test('el OR condicional reproduce a fisher.test muy por debajo del perfil fisher_or', () => {
  // El comparador admite 5e-4 (perfil `fisher_or`) porque `uniroot` resuelve a
  // 1.2e-4. Al reproducir su algoritmo (zeroin) la coincidencia real es de
  // ~1e-14, y esta prueba es la que la vigila: si alguien cambiara el buscador
  // de raíces por otro que converja distinto, el perfil lo dejaría pasar.
  let peor = 0;
  let donde = '';
  for (const caso of fixture.casos) {
    const e = entradasDe(caso);
    const ts = calcular(e, e.nivel).valores.or_cond;
    const r = (normalizarR(caso.esperado) as Record<string, unknown>).or_cond;
    assert.ok(Array.isArray(r) && r.length === 3, `${caso.id}: R no devolvió [est, lo, hi]`);
    const ic = ts.ic as [number, number];
    const partes: Array<[string, number, unknown]> = [
      ['estimación', ts.valor, r[0]],
      ['límite inferior', ic[0], r[1]],
      ['límite superior', ic[1], r[2]],
    ];
    for (const [parte, x, y] of partes) {
      assert.equal(typeof y, 'number', `${caso.id}: R devolvió ${JSON.stringify(y)} en el ${parte}`);
      const d = difRel(x, y as number);
      if (d > peor) {
        peor = d;
        donde = `${caso.id} · ${parte}`;
      }
    }
  }
  console.log(`  · or_cond frente a fisher.test: peor diferencia relativa ${peor.toExponential(2)} (${donde})`);
  assert.ok(peor < 1e-12, `el OR condicional se apartó ${peor} de R en ${donde}; el perfil fisher_or lo taparía`);
});

test('las entradas imposibles lanzan RangeError', () => {
  assert.throws(() => validarTablaIndependencia(0, 0, 5, 5), RangeError); // fila 1 vacía
  assert.throws(() => validarTablaIndependencia(5, 5, 0, 0), RangeError); // fila 2 vacía
  assert.throws(() => validarTablaIndependencia(0, 5, 0, 5), RangeError); // columna 1 vacía
  assert.throws(() => validarTablaIndependencia(5, 0, 5, 0), RangeError); // columna 2 vacía
  assert.throws(() => independencia2x2(-1, 5, 5, 5), RangeError);
  assert.throws(() => independencia2x2(1.5, 5, 5, 5), RangeError);
  assert.throws(() => independencia2x2(12, 88, 30, 70, { nivel: 1 }), RangeError);
  assert.throws(() => independencia2x2(12, 88, 30, 70, { nivel: 0 }), RangeError);
});

// ---------------------------------------------------------------------------
// Contrato de interfaz: validar, bandas, avisos y presentación en ambos idiomas
// ---------------------------------------------------------------------------

test('validar() reclama filas y columnas vacías, celdas no enteras y nivel fuera de rango', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, a: 0, b: 0 }), { a: 'err_fila_vacia', b: 'err_fila_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, c: 0, d: 0 }), { c: 'err_fila_vacia', d: 'err_fila_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, a: 0, c: 0 }), { a: 'err_columna_vacia', c: 'err_columna_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, b: 0, d: 0 }), { b: 'err_columna_vacia', d: 'err_columna_vacia' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, a: 2.5 }), { a: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, d: -1 }), { d: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 1 }), { nivel: 'err_rango' });
});

test('bandas y avisos del ejemplo y de los casos límite', () => {
  const ej = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ej.bandas, { prueba: 'pearson', decision: 'rechaza', phi: 'pequeno', sentido: 'negativa' });
  assert.deepEqual(ej.avisos, []);

  // Esperada mínima 4: Cochran manda a Fisher y el aviso lleva la cifra redondeada.
  const bajas = calcular({ a: 3, b: 7, c: 9, d: 1, nivel: 0.95 }, 0.95);
  assert.equal(bajas.bandas.prueba, 'fisher');
  assert.deepEqual(bajas.avisos.find((a) => a.codigo === 'esperados_bajos')?.params, { e_min: 4 });
  assert.ok(!bajas.avisos.some((a) => a.codigo === 'n_pequeno'), 'n = 20 no debe activar n_pequeno');

  // |ad − bc| = 5 < n/2 = 10.5: Yates deja el estadístico en 0.
  const yates = calcular({ a: 5, b: 5, c: 5, d: 6, nivel: 0.95 }, 0.95);
  assert.ok(yates.avisos.some((a) => a.codigo === 'yates_cero'));
  assert.equal(yates.valores.chi2_yates.valor, 0);
  assert.equal(yates.bandas.decision, 'no_rechaza');
  assert.equal(yates.bandas.sentido, 'positiva');

  // n = 15: los tres avisos de conteos pequeños más el borde del soporte.
  const chica = calcular({ a: 0, b: 5, c: 5, d: 5, nivel: 0.95 }, 0.95);
  assert.deepEqual(chica.avisos.map((a) => a.codigo).sort(), ['esperados_bajos', 'n_pequeno', 'or_cond_borde']);
  assert.deepEqual(chica.avisos.find((a) => a.codigo === 'n_pequeno')?.params, { n: 15 });
  assert.equal(chica.bandas.prueba, 'fisher');

  // Asociación perfecta: φ = ±1, banda «grande» y OR condicional en el borde.
  const perfecta = calcular({ a: 10, b: 0, c: 0, d: 10, nivel: 0.95 }, 0.95);
  assert.deepEqual(perfecta.bandas, { prueba: 'pearson', decision: 'rechaza', phi: 'grande', sentido: 'positiva' });
  assert.deepEqual(perfecta.avisos.map((a) => a.codigo), ['or_cond_borde']);

  // Tabla sin asociación alguna: φ = 0 y sentido nulo.
  const nula = calcular({ a: 5, b: 5, c: 5, d: 5, nivel: 0.95 }, 0.95);
  assert.equal(nula.bandas.sentido, 'nula');
  assert.equal(nula.bandas.phi, 'trivial');
  assert.equal(nula.bandas.decision, 'no_rechaza');
});

test('presentar() rellena todas las plantillas en español e inglés, también en los bordes', () => {
  const entradas: EntradasChi2Fisher[] = [
    EJEMPLO,
    { ...EJEMPLO, nivel: 0.9 },
    { ...EJEMPLO, nivel: 0.999 },
    { a: 3, b: 7, c: 9, d: 1, nivel: 0.95 },
    { a: 5, b: 5, c: 5, d: 6, nivel: 0.95 },
    { a: 0, b: 10, c: 10, d: 0, nivel: 0.95 },
    { a: 10, b: 0, c: 0, d: 10, nivel: 0.95 },
    { a: 1, b: 1, c: 1, d: 1, nivel: 0.95 },
    { a: 2, b: 50, c: 30, d: 3, nivel: 0.95 },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const p = presentar(calcular(e, e.nivel), e, ctx);
      // Sin ordenar: `tipos.ts` pide las celdas EN el orden de `salidas`.
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas]);
      for (const texto of [
        ...p.interpretacion,
        p.metodos,
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
      ]) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, 6);
      assert.equal(p.resumen.length, definicion.salidas.length);
      assert.ok(p.grafica && p.grafica.tipo === 'barras', `${lang}: falta la gráfica de barras`);
      if (p.grafica.tipo === 'barras') {
        assert.equal(p.grafica.categorias.length, 4, `${lang}: la gráfica no tiene las cuatro celdas`);
        assert.equal(p.grafica.series.length, 2, `${lang}: la gráfica no tiene observado y esperado`);
        for (const cat of p.grafica.categorias) {
          assert.equal(cat.valores.length, 2, `${lang}: la categoría ${cat.id} no trae un valor por serie`);
          assert.ok(cat.etiqueta.trim().length > 0, `${lang}: categoría sin etiqueta`);
          for (const valor of cat.valores) assert.ok(Number.isFinite(valor), `${lang}: valor no finito en la gráfica`);
        }
        assert.ok(p.grafica.ejeY.dominio[1] > 0, `${lang}: el eje de frecuencias no tiene dominio`);
      }
    }
  }
});

test('la presentación del ejemplo dice lo que dice la comprobación manual', () => {
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  // Valores de R: χ² = 9.764919, Yates = 8.710066, p de Fisher = 0.002866561,
  // OR condicional = 0.3200005 (IC 0.1385342 a 0.6993573), φ = −0.2209629.
  assert.equal(es.celdas.n.valor, '200');
  assert.equal(es.celdas.e_a.valor, '21.00');
  assert.equal(es.celdas.e_min.valor, '21.00');
  assert.equal(es.celdas.chi2.valor, '9.765');
  assert.equal(es.celdas.chi2_yates.valor, '8.710');
  assert.equal(es.celdas.chi2_n1.valor, '9.716');
  assert.equal(es.celdas.p_chi2.valor, '0.002');
  assert.equal(es.celdas.p_fisher.valor, '0.003');
  assert.equal(es.celdas.or_cond.valor, '0.32');
  assert.equal(es.celdas.or_cond.ic, '0.14 a 0.70');
  assert.equal(es.celdas.p_chi2.clase, 'destacada');
  assert.equal(es.celdas.p_fisher.clase, undefined);
  // El «%» español lleva espacio fino U+202F delante: se comprueba la cifra.
  assert.ok(es.interpretacion[0].includes('12.0') && es.interpretacion[0].includes('30.0'), es.interpretacion[0]);
  assert.ok(es.interpretacion[1].includes('χ² de Pearson'), es.interpretacion[1]);
  assert.ok(es.interpretacion[2].includes('se rechaza'), es.interpretacion[2]);
  assert.ok(es.interpretacion[3].includes('pequeña') && es.interpretacion[3].includes('negativa'), es.interpretacion[3]);
  assert.ok(es.metodos.includes('Bioestadística abierta') && es.metodos.includes('[1]'), es.metodos);

  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.or_cond.ic, '0.14 to 0.70');
  assert.ok(en.interpretacion[1].includes("Pearson's chi-squared"), en.interpretacion[1]);
  assert.ok(en.metodos.includes("Pearson's chi-squared test [1]"), en.metodos);

  // Con esperadas pequeñas se recomienda Fisher y se destaca su celda.
  const bajas: EntradasChi2Fisher = { a: 3, b: 7, c: 9, d: 1, nivel: 0.95 };
  const f = presentar(calcular(bajas, 0.95), bajas, contextoDePrueba(SLUG, 'es'));
  assert.equal(f.celdas.p_fisher.clase, 'destacada');
  assert.equal(f.celdas.p_chi2.clase, undefined);
  assert.equal(f.celdas.p_fisher.valor, '0.020');
  assert.ok(f.interpretacion[1].includes('Fisher'), f.interpretacion[1]);
  assert.ok(f.metodos.includes('la prueba exacta de Fisher bilateral'), f.metodos);

  // El OR condicional infinito se muestra como ∞ y su intervalo también.
  const perfecta: EntradasChi2Fisher = { a: 10, b: 0, c: 0, d: 10, nivel: 0.95 };
  const p = presentar(calcular(perfecta, 0.95), perfecta, contextoDePrueba(SLUG, 'es'));
  assert.equal(p.celdas.or_cond.valor, '∞');
  assert.ok(p.celdas.or_cond.ic?.endsWith('∞'), p.celdas.or_cond.ic);
});

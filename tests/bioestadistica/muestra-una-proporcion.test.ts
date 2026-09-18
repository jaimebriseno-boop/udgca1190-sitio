/**
 * Calculadora «Tamaño de muestra para una proporción» (C1) contra el oráculo R
 * y sus propiedades.
 *
 *   node --test tests/bioestadistica/muestra-una-proporcion.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo muestra-una-proporcion`.
 *
 * Convenio del grupo `muestra`: una entrada opcional vacía vale 0, no `NaN`.
 * Así el valor «sin dato» viaja por el JSON de los casos y las DOS ramas de
 * cada opcional (población declarada o no, modo inverso o no) quedan validadas
 * contra R, no solo la rama que el ejemplo activa.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { techo } from '../../src/lib/bioestadistica/metodos/muestra-comun.ts';
import {
  SIN_DATO,
  conCpf,
  hayDato,
  nProporcion,
  precisionProporcion,
  sinCpf,
} from '../../src/lib/bioestadistica/metodos/muestra-estimacion.ts';
import { calcular, definicion, grafica, presentar } from '../../src/lib/bioestadistica/calculadoras/muestra-una-proporcion.ts';
import type { EntradasMuestraUnaProporcion } from '../../src/lib/bioestadistica/calculadoras/muestra-una-proporcion.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'muestra-una-proporcion';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);

const IDIOMAS: readonly Lang[] = ['es', 'en'];

/** Ejemplo de la interfaz: prevalencia de dengue entre febriles (datos ficticios). */
const EJEMPLO: EntradasMuestraUnaProporcion = {
  p: 0.3,
  d: 0.05,
  nivel: 0.95,
  poblacion: 2000,
  perdidas: 0.1,
  n_dado: SIN_DATO,
};

/**
 * Ajustes sobre el ejemplo, campo a campo: `Partial<EntradasMuestraUnaProporcion>`
 * haría opcional también la firma de índice de `Entradas`, y el objeto
 * resultante dejaría de ser asignable (`ValorEntrada | undefined`).
 */
interface Ajustes {
  p?: number;
  d?: number;
  nivel?: number;
  poblacion?: number;
  perdidas?: number;
  n_dado?: number;
}

/** Entradas con lo capturado sobre el ejemplo y el resto derivado. */
function entradas(parcial: Ajustes): EntradasMuestraUnaProporcion {
  return conDerivadas(definicion, { ...EJEMPLO, ...parcial }) as EntradasMuestraUnaProporcion;
}

/** Igualdad relativa para las propiedades algebraicas. */
function casiIgual(a: number, b: number, donde: string, rel = 1e-12): void {
  const escala = Math.max(1, Math.abs(a), Math.abs(b));
  assert.ok(Math.abs(a - b) <= rel * escala, `${donde}: ${a} ≠ ${b}`);
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
  assert.deepEqual(fixture.casos[0]?.entradas, EJEMPLO, 'el ejemplo del YAML y el de la prueba divergieron');
  assert.deepEqual(
    fixture.casos.map((c) => c.id),
    ['ejemplo', ...curados.casos.map((c) => c.id)],
    `casos/${SLUG}.json cambió sin regenerar: node scripts/bio-fixtures.mjs --solo ${SLUG}`,
  );
  assert.equal(fixture.casos.length, 19);
  assert.equal(new Set(fixture.casos.map((c) => c.id)).size, fixture.casos.length);
  for (const curado of curados.casos) assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota`);
  // Todo caso declara las tres opcionales: el snippet necesita un número en cada
  // marcador y el «sin dato» es 0, no una clave ausente.
  for (const caso of fixture.casos) {
    for (const clave of ['poblacion', 'perdidas', 'n_dado'] as const) {
      assert.equal(typeof caso.entradas[clave], 'number', `${caso.id}: falta ${clave}`);
    }
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
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const perfil = TOL[caso.tol];
    assert.ok(perfil, `no hay perfil de tolerancia «${caso.tol}» en tolerancias.ts`);
    const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraUnaProporcion;
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

test('R devuelve NA en el modo inverso apagado y un número cuando está encendido', () => {
  const apagado = fixture.casos.find((c) => c.id === 'sin_poblacion');
  assert.ok(apagado);
  assert.equal(apagado.esperado.d_dado, 'NA', 'con n_dado = 0 el snippet debe devolver NA_real_');
  assert.equal(apagado.esperado.n, apagado.esperado.n0, 'con poblacion = 0 no hay corrección');
  const encendido = fixture.casos.find((c) => c.id === 'con_n_dado');
  assert.ok(encendido);
  assert.equal(typeof encendido.esperado.d_dado, 'number');
});

test('el 1 se trata como «sin dato» en los dos lados, igual en R que en TypeScript', () => {
  const uno = fixture.casos.find((c) => c.id === 'poblacion_uno');
  assert.ok(uno);
  assert.equal(uno.esperado.n, uno.esperado.n0, 'poblacion = 1 no debe corregir nada');
  assert.equal(uno.esperado.d_dado, 'NA', 'n_dado = 1 no enciende el modo inverso');
  assert.equal(hayDato(0), false);
  assert.equal(hayDato(1), false);
  assert.equal(hayDato(2), true);
  const e = conDerivadas(definicion, uno.entradas) as EntradasMuestraUnaProporcion;
  const s = calcular(e, e.nivel);
  assert.equal(s.valores.n.valor, s.valores.n0.valor);
  assert.ok(Number.isNaN(s.valores.d_dado.valor));
  assert.deepEqual(s.bandas, { cpf: 'sin', perdidas: 'sin', inverso: 'sin' });
});

test('el censo da precisión exactamente 0 en R y en TypeScript', () => {
  const censo = fixture.casos.find((c) => c.id === 'n_dado_censo');
  assert.ok(censo);
  assert.equal(censo.esperado.d_dado, 0, 'con n = N la precisión alcanzable debe ser 0 en R');
  const e = conDerivadas(definicion, censo.entradas) as EntradasMuestraUnaProporcion;
  assert.equal(calcular(e, e.nivel).valores.d_dado.valor, 0);
  assert.equal(sinCpf(500, 500), Number.POSITIVE_INFINITY, 'la inversa de la CPF en el censo es infinita');
});

test('un tamaño diminuto se presenta como 1 participante en vez de lanzar', () => {
  // Defecto que destapó `npm run barrido:bio`: `techo()` tolera 1e-9 absoluto
  // (para que 322.00000000001 no suba a 323) y por sí solo hunde a 0 un tamaño
  // positivo pero minúsculo. Con el marcador en n = 0 la gráfica evaluaba la
  // precisión ahí y `presentar()` lanzaba `RangeError` con entradas que
  // `validar()` había dado por buenas. `ceiling()` de R devuelve 1, no 0.
  const caso = fixture.casos.find((c) => c.id === 'n_diminuto');
  assert.ok(caso);
  const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraUnaProporcion;
  assert.equal(definicion.validar(e), null, 'validar() las acepta, así que presentar() no puede lanzar');
  const s = calcular(e, e.nivel);
  assert.equal(techo(s.valores.n.valor), 0, 'techo() por sí solo devuelve 0 en este régimen');
  assert.ok(s.valores.n.valor > 0, 'el tamaño exacto sigue siendo positivo');
  for (const lang of IDIOMAS) {
    const p = presentar(s, e, contextoDePrueba(SLUG, lang));
    assert.equal(p.celdas.n.valor, '1', `${lang}: el titular debe ser 1 participante, no 0`);
    assert.equal(p.celdas.n0.valor, '1');
    assert.equal(p.celdas.n_ajustado.valor, '1');
    // Por debajo de 1, el detalle usa cifras significativas: «0.00» haría creer
    // que no hace falta nadie.
    assert.ok(p.celdas.n0.nota?.includes('0.000000000657'), p.celdas.n0.nota);
    const g = p.grafica;
    assert.ok(g && g.tipo === 'curvas');
    if (g && g.tipo === 'curvas') {
      assert.equal(g.marcador?.x, 1, 'el marcador no puede caer en n = 0');
      assert.ok(Number.isFinite(g.marcador?.valores?.precision ?? Number.NaN));
      for (const [x, y] of g.curvas[0]?.puntos ?? []) {
        assert.ok(x > 0 && Number.isFinite(y), `punto no finito en n = ${x}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// La ruta de la interfaz: un campo vacío se guarda como 0
// ---------------------------------------------------------------------------

test('derivar() completa con 0 los campos vacíos y respeta un 0 capturado', () => {
  const capturado = { p: 0.3, d: 0.05, nivel: 0.95 } as unknown as EntradasMuestraUnaProporcion;
  const derivadas = definicion.derivar?.(capturado);
  assert.ok(derivadas);
  assert.equal(derivadas.poblacion, 0, 'una población vacía vale 0, no NaN');
  assert.equal(derivadas.n_dado, 0, 'un tamaño disponible vacío vale 0, no NaN');
  assert.equal(derivadas.perdidas, 0);

  const completas = conDerivadas(definicion, capturado) as EntradasMuestraUnaProporcion;
  const codigo = rellenarR(yamlCalc.r.codigo, completas);
  assert.match(codigo, /^poblacion <- 0\b/m);
  assert.match(codigo, /^n_dado <- 0\b/m);
  assert.ok(!codigo.includes('NA_real_ else'), 'el snippet ya no ramifica por NA en las entradas');
  assert.equal(definicion.validar(completas), null, 'las tres entradas vacías son un estado válido');

  // Es exactamente el caso `sin_poblacion` del fixture, ya validado contra R.
  const s = calcular(completas, 0.95);
  assert.equal(s.valores.n.valor, s.valores.n0.valor);
  assert.equal(s.valores.n_ajustado.valor, s.valores.n0.valor);
  assert.ok(Number.isNaN(s.valores.d_dado.valor));

  // derivar() no toca un valor capturado, incluido el 0.
  assert.equal(definicion.derivar?.(EJEMPLO).poblacion, 2000);
  assert.equal(definicion.derivar?.(EJEMPLO).n_dado, 0);
  assert.equal(definicion.derivar?.(EJEMPLO).perdidas, 0.1);
  assert.equal(definicion.derivar?.(entradas({ poblacion: 0, n_dado: 400 })).n_dado, 400);
});

// ---------------------------------------------------------------------------
// Propiedades de las fórmulas
// ---------------------------------------------------------------------------

test('n crece con la confianza y decrece con la precisión pedida', () => {
  const niveles = [0.8, 0.9, 0.95, 0.99, 0.999];
  for (let i = 1; i < niveles.length; i += 1) {
    assert.ok(
      nProporcion(0.3, 0.05, niveles[i] as number) > nProporcion(0.3, 0.05, niveles[i - 1] as number),
      `n₀ no crece del ${niveles[i - 1]} al ${niveles[i]}`,
    );
  }
  const ds = [0.01, 0.02, 0.05, 0.1, 0.2];
  for (let i = 1; i < ds.length; i += 1) {
    assert.ok(
      nProporcion(0.3, ds[i] as number, 0.95) < nProporcion(0.3, ds[i - 1] as number, 0.95),
      `n₀ no decrece de d = ${ds[i - 1]} a d = ${ds[i]}`,
    );
  }
  // Ley 1/d²: dividir d entre 2 multiplica n₀ por 4.
  casiIgual(nProporcion(0.3, 0.025, 0.95), 4 * nProporcion(0.3, 0.05, 0.95), 'ley 1/d²');
});

test('p = 0.5 es el peor caso y la fórmula es simétrica alrededor de 0.5', () => {
  const peor = nProporcion(0.5, 0.05, 0.95);
  for (const p of [0.01, 0.1, 0.2, 0.3, 0.45, 0.55, 0.7, 0.9, 0.99]) {
    assert.ok(nProporcion(p, 0.05, 0.95) < peor, `p = ${p} pide más muestra que p = 0.5`);
    casiIgual(nProporcion(p, 0.05, 0.95), nProporcion(1 - p, 0.05, 0.95), `simetría en p = ${p}`);
  }
});

test('la corrección por población finita nunca sube n y tiende a n₀ con N grande', () => {
  const n0 = nProporcion(0.3, 0.05, 0.95);
  let previo = 0;
  for (const N of [2, 10, 100, 500, 2000, 100000, 1e9]) {
    const n = conCpf(n0, N);
    assert.ok(n <= n0, `N = ${N}: la corrección subió n por encima de n₀`);
    assert.ok(n < N, `N = ${N}: la corrección pide más muestra que población`);
    assert.ok(n > previo, `N = ${N}: n no crece con la población`);
    previo = n;
  }
  casiIgual(conCpf(n0, 1e12), n0, 'CPF con N = 1e12', 1e-8);
  assert.equal(conCpf(n0, 0), n0, 'sin población declarada la corrección es la identidad');
  assert.equal(conCpf(n0, 1), n0, 'una población de 1 también es «sin dato»');
});

test('la precisión alcanzable invierte exactamente el tamaño necesario', () => {
  for (const poblacion of [0, 500, 2000, 1000000]) {
    for (const p of [0.05, 0.3, 0.5, 0.8]) {
      for (const nivel of [0.9, 0.95, 0.99]) {
        const n = conCpf(nProporcion(p, 0.05, nivel), poblacion);
        casiIgual(precisionProporcion(p, n, poblacion, nivel), 0.05, `inversa con N = ${poblacion}, p = ${p}`, 1e-10);
      }
    }
  }
  // Y en el otro sentido: el n que la precisión alcanzada exige es el de partida.
  for (const nDado of [50, 100, 400]) {
    const d = precisionProporcion(0.3, nDado, 2000, 0.95);
    casiIgual(conCpf(nProporcion(0.3, d, 0.95), 2000), nDado, `vuelta con n = ${nDado}`, 1e-10);
  }
});

test('más participantes dan mejor precisión, y el ajuste por pérdidas sube el reclutamiento', () => {
  let previa = Number.POSITIVE_INFINITY;
  for (const n of [10, 50, 100, 278, 1000, 5000]) {
    const d = precisionProporcion(0.3, n, 0, 0.95);
    assert.ok(d < previa, `n = ${n}: la precisión no mejoró`);
    previa = d;
  }
  const s = calcular(entradas({ perdidas: 0.2 }), 0.95);
  casiIgual(s.valores.n_ajustado.valor, s.valores.n.valor / 0.8, 'n ajustado con 20 % de pérdidas');
  const sinPerdidas = calcular(entradas({ perdidas: 0 }), 0.95);
  assert.equal(sinPerdidas.valores.n_ajustado.valor, sinPerdidas.valores.n.valor);
});

test('las entradas imposibles lanzan RangeError', () => {
  assert.throws(() => nProporcion(0, 0.05, 0.95), RangeError);
  assert.throws(() => nProporcion(1, 0.05, 0.95), RangeError);
  assert.throws(() => nProporcion(0.3, 0, 0.95), RangeError);
  assert.throws(() => nProporcion(0.3, 0.05, 1), RangeError);
  assert.throws(() => conCpf(100, -1), RangeError);
  assert.throws(() => conCpf(100, 10.5), RangeError);
  assert.throws(() => precisionProporcion(0.3, 0, 0, 0.95), RangeError);
});

// ---------------------------------------------------------------------------
// Validación, bandas y avisos
// ---------------------------------------------------------------------------

test('validar() acepta el ejemplo y rechaza cada entrada fuera de rango', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, p: 1.2 }), { p: 'err_proporcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, p: -0.1 }), { p: 'err_proporcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, p: 0 }), { p: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, p: 1 }), { p: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, d: 0.0005 }), { d: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, d: 0.6 }), { d: 'err_max' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, poblacion: -1 }), { poblacion: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, poblacion: 2000.5 }), { poblacion: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, perdidas: 0.6 }), { perdidas: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: -3 }), { n_dado: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: 12.5 }), { n_dado: 'err_entero' });
  // 0 y 1 son el estado «sin dato», no un error.
  for (const v of [0, 1]) {
    assert.equal(definicion.validar({ ...EJEMPLO, poblacion: v, n_dado: v }), null, `${v} debería ser válido`);
  }
  assert.deepEqual(definicion.validar({ ...EJEMPLO, d: Number.NaN }), { d: 'err_numero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, perdidas: Number.NaN }), { perdidas: 'err_numero' });
});

test('las bandas y los avisos siguen los cortes documentados', () => {
  const ejemplo = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ejemplo.bandas, { cpf: 'con', perdidas: 'con', inverso: 'sin' });
  // N = 2000 < 10 × 322.7: la corrección importa; y el aviso de supuestos siempre.
  assert.deepEqual(ejemplo.avisos.map((a) => a.codigo), ['cpf_importante', 'supuestos']);

  const holgada = calcular(entradas({ poblacion: 100000 }), 0.95);
  assert.deepEqual(holgada.avisos.map((a) => a.codigo), ['supuestos'], 'con N ≥ 10·n₀ no hay aviso de CPF');
  const sinN = calcular(entradas({ poblacion: 0 }), 0.95);
  assert.deepEqual(sinN.avisos.map((a) => a.codigo), ['supuestos'], 'sin población no se avisa de la CPF');

  const extrema = calcular(entradas({ p: 0.02, poblacion: 0 }), 0.95);
  assert.deepEqual(extrema.avisos.map((a) => a.codigo), ['p_extrema', 'wald_dudoso', 'supuestos']);
  assert.deepEqual(extrema.avisos[0]?.params, { p: 0.02, d: 0.05 });

  // p − d = 0 exacto: el intervalo toca 0 pero no lo cruza.
  const borde = calcular(entradas({ p: 0.05, poblacion: 0 }), 0.95);
  assert.deepEqual(borde.avisos.map((a) => a.codigo), ['wald_dudoso', 'supuestos']);

  const simetrico = calcular(entradas({ p: 0.95, poblacion: 0 }), 0.95);
  assert.deepEqual(simetrico.avisos.map((a) => a.codigo), ['wald_dudoso', 'supuestos'], 'el corte mira las dos categorías');

  // El reclutamiento con pérdidas puede pasarse de la población: la corrección
  // acota n, pero no n_ajustado.
  const desborda = calcular(entradas({ p: 0.5, d: 0.01, poblacion: 10, perdidas: 0.5 }), 0.95);
  assert.ok(desborda.valores.n.valor < 10 && desborda.valores.n_ajustado.valor > 10);
  assert.deepEqual(
    desborda.avisos.find((a) => a.codigo === 'supera_poblacion')?.params,
    { poblacion: 10 },
    'falta el aviso supera_poblacion',
  );
  // Sin población declarada no hay con qué compararlo, y con una holgada no ocurre.
  assert.ok(!calcular(entradas({ p: 0.5, d: 0.01, poblacion: 0, perdidas: 0.5 }), 0.95).avisos.some((a) => a.codigo === 'supera_poblacion'));
  assert.ok(!calcular(EJEMPLO, 0.95).avisos.some((a) => a.codigo === 'supera_poblacion'));

  assert.equal(calcular(entradas({ perdidas: 0 }), 0.95).bandas.perdidas, 'sin');
  assert.equal(calcular(entradas({ n_dado: 400 }), 0.95).bandas.inverso, 'con');
  assert.equal(calcular(entradas({ poblacion: 0 }), 0.95).bandas.cpf, 'sin');
});

// ---------------------------------------------------------------------------
// Presentación en los dos idiomas
// ---------------------------------------------------------------------------

test('presentar() rellena todas las plantillas en todas las combinaciones de banda', () => {
  const combinaciones: EntradasMuestraUnaProporcion[] = [
    EJEMPLO,
    entradas({ poblacion: 0, perdidas: 0, n_dado: 0 }),
    entradas({ poblacion: 0, perdidas: 0.5, n_dado: 100 }),
    entradas({ poblacion: 100, perdidas: 0, n_dado: 0 }),
    entradas({ poblacion: 2000, perdidas: 0.1, n_dado: 400 }),
    entradas({ p: 0.02, poblacion: 0, perdidas: 0.3, n_dado: 3000 }),
    entradas({ p: 0.5, d: 0.5, poblacion: 2, perdidas: 0, n_dado: 2 }),
    entradas({ p: 1e-10, d: 0.5, nivel: 0.8, poblacion: 0, perdidas: 0.1, n_dado: 0 }),
    entradas({ p: 0.5, d: 0.01, poblacion: 10, perdidas: 0.5, n_dado: 0 }),
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of combinaciones) {
      const s = calcular(e, e.nivel);
      const p = presentar(s, e, ctx);
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas]);
      assert.equal(p.interpretacion.length, 4);
      const textos = [
        ...p.interpretacion,
        p.metodos,
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
        ...p.resumen.flat(),
      ];
      for (const texto of textos) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      }
      assert.ok(p.grafica && p.grafica.tipo === 'curvas');
      if (p.grafica && p.grafica.tipo === 'curvas') {
        const g = p.grafica;
        assert.equal(g.curvas.length, 1);
        assert.ok((g.curvas[0]?.puntos.length ?? 0) >= 41, 'la curva necesita al menos 40 puntos');
        assert.ok(g.referenciaY && g.referenciaY.valor === e.d, 'falta la línea de precisión objetivo');
        assert.ok(g.marcador && Number.isFinite(g.marcador.x));
        const [desde, hasta] = g.ejeX.dominio;
        assert.ok(desde < hasta, `dominio degenerado [${desde}, ${hasta}]`);
        assert.ok(desde >= 1, 'el eje de n empieza en un tamaño positivo');
        if (hayDato(e.poblacion)) assert.ok(hasta <= e.poblacion, 'la curva se sale de la población');
        const marca = g.marcador?.x ?? Number.NaN;
        assert.ok(marca >= desde && marca <= hasta, `el marcador (${marca}) queda fuera de [${desde}, ${hasta}]`);
        for (const [x, y] of g.curvas[0]?.puntos ?? []) {
          assert.ok(Number.isFinite(x) && x >= desde && x <= hasta, `punto fuera del dominio: ${x}`);
          assert.ok(Number.isFinite(y) && y >= 0, `precisión no finita en n = ${x}: ${y}`);
        }
        assert.equal(g.ejeX.pista, 'int');
        for (const texto of [g.titulo, g.resumen, g.ejeX.etiqueta, g.ejeY.etiqueta, g.curvas[0]?.etiqueta ?? '', g.marcador?.etiqueta ?? '', g.referenciaY?.etiqueta ?? '']) {
          assert.ok(texto.trim().length > 0 && !texto.includes('{'), `${lang}: texto de gráfica inválido «${texto}»`);
        }
      }
    }
  }
});

test('la curva decrece y pasa por el punto marcado', () => {
  const ctx = contextoDePrueba(SLUG, 'es');
  const e = EJEMPLO;
  const g = grafica(calcular(e, 0.95), e, ctx);
  assert.ok(g && g.tipo === 'curvas');
  if (!g || g.tipo !== 'curvas') return;
  const puntos = g.curvas[0]?.puntos ?? [];
  for (let i = 1; i < puntos.length; i += 1) {
    assert.ok((puntos[i]?.[1] ?? 0) < (puntos[i - 1]?.[1] ?? 0), `la curva no decrece en el punto ${i}`);
  }
  const marca = g.marcador?.x ?? Number.NaN;
  assert.equal(marca, techo(calcular(e, 0.95).valores.n.valor));
  casiIgual(g.marcador?.valores?.precision ?? Number.NaN, precisionProporcion(e.p, marca, e.poblacion, 0.95), 'y del marcador');
  // El n calculado alcanza la precisión objetivo; con el techo, la mejora un poco.
  assert.ok((g.marcador?.valores?.precision ?? 1) <= e.d, 'el n redondeado hacia arriba debe alcanzar la precisión pedida');
});

test('el ejemplo se presenta con las cifras comprobadas a mano en los dos idiomas', () => {
  // p = 0.30, d = 0.05, 95 %: n₀ = 322.682540938306 → 323.
  // Con N = 2000: n = 277.973009012588 → 278. Con 10 % de pérdidas: 308.858898902876 → 309.
  // Sin tamaño disponible, la precisión alcanzable es «no definido» (NA_real_ en R).
  const s = calcular(EJEMPLO, 0.95);
  casiIgual(s.valores.n0.valor, 322.682540938306, 'n₀ del ejemplo', 1e-12);
  casiIgual(s.valores.n.valor, 277.973009012588, 'n del ejemplo', 1e-12);
  casiIgual(s.valores.n_ajustado.valor, 308.858898902876, 'n ajustado del ejemplo', 1e-12);
  assert.ok(Number.isNaN(s.valores.d_dado.valor));

  const es = presentar(s, EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.n0.valor, '323');
  assert.equal(es.celdas.n.valor, '278');
  assert.equal(es.celdas.n_ajustado.valor, '309');
  assert.equal(es.celdas.z.valor, '1.960');
  assert.ok(es.celdas.n0.nota?.includes('322.68'), es.celdas.n0.nota);
  assert.ok(es.celdas.n.nota?.includes('277.97'), es.celdas.n.nota);
  assert.equal(es.celdas.d_dado.valor, 'no definido');
  assert.ok(es.celdas.d_dado.nota?.includes('captura'), es.celdas.d_dado.nota);
  assert.equal(es.celdas.n.clase, 'destacada');
  assert.ok(es.interpretacion[0]?.includes('278 participantes'), es.interpretacion[0]);
  assert.ok(es.interpretacion[1]?.includes('2,000') && es.interpretacion[1]?.includes('323'), es.interpretacion[1]);
  assert.ok(es.interpretacion[2]?.includes('309'), es.interpretacion[2]);
  assert.ok(es.metodos.includes('Cochran') && es.metodos.includes('población finita de 2,000'), es.metodos);
  assert.ok(es.metodos.includes('309 participantes'), es.metodos);

  const en = presentar(s, EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.n.valor, '278');
  assert.equal(en.celdas.d_dado.valor, 'not defined');
  assert.ok(en.interpretacion[0]?.includes('278 participants'), en.interpretacion[0]);
  assert.ok(en.metodos.includes("Cochran's normal formula"), en.metodos);

  // Con el modo inverso encendido: 400 participantes dan ±4.0 puntos.
  const inverso = entradas({ n_dado: 400 });
  const invEs = presentar(calcular(inverso, 0.95), inverso, contextoDePrueba(SLUG, 'es'));
  casiIgual(calcular(inverso, 0.95).valores.d_dado.valor, 0.0401773544997531, 'precisión con n = 400', 1e-12);
  assert.ok(invEs.celdas.d_dado.valor.startsWith('4.0'), invEs.celdas.d_dado.valor);
  assert.ok(invEs.interpretacion[3]?.includes('400'), invEs.interpretacion[3]);

  // Sin población ni pérdidas, el titular es el n₀ y las frases cambian de variante.
  const suelto = entradas({ poblacion: 0, perdidas: 0, n_dado: 0 });
  const sueltoEs = presentar(calcular(suelto, 0.95), suelto, contextoDePrueba(SLUG, 'es'));
  assert.equal(sueltoEs.celdas.n.valor, '323');
  assert.equal(sueltoEs.celdas.n_ajustado.valor, '323');
  assert.ok(sueltoEs.metodos.includes('sin corrección por población finita'), sueltoEs.metodos);
  assert.ok(sueltoEs.metodos.includes('no se previeron pérdidas'), sueltoEs.metodos);
});

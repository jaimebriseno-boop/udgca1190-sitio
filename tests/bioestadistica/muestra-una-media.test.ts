/**
 * Calculadora «Tamaño de muestra para una media» (C2) contra el oráculo R y sus
 * propiedades.
 *
 *   node --test tests/bioestadistica/muestra-una-media.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo muestra-una-media`.
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
  PASOS_T,
  SIN_DATO,
  conCpf,
  hayDato,
  nMedia,
  nMediaT,
  precisionMedia,
  precisionMediaT,
} from '../../src/lib/bioestadistica/metodos/muestra-estimacion.ts';
import { calcular, definicion, grafica, presentar } from '../../src/lib/bioestadistica/calculadoras/muestra-una-media.ts';
import type { EntradasMuestraUnaMedia } from '../../src/lib/bioestadistica/calculadoras/muestra-una-media.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'muestra-una-media';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);

const IDIOMAS: readonly Lang[] = ['es', 'en'];

/** Ejemplo de la interfaz: plaquetas ×10³/µL en pacientes con dengue (datos ficticios). */
const EJEMPLO: EntradasMuestraUnaMedia = {
  sigma: 60,
  d: 10,
  nivel: 0.95,
  poblacion: SIN_DATO,
  perdidas: 0.1,
  n_dado: SIN_DATO,
};

/**
 * Ajustes sobre el ejemplo, campo a campo: `Partial<EntradasMuestraUnaMedia>`
 * haría opcional también la firma de índice de `Entradas`, y el objeto
 * resultante dejaría de ser asignable (`ValorEntrada | undefined`).
 */
interface Ajustes {
  sigma?: number;
  d?: number;
  nivel?: number;
  poblacion?: number;
  perdidas?: number;
  n_dado?: number;
}

/** Entradas con lo capturado sobre el ejemplo y el resto derivado. */
function entradas(parcial: Ajustes): EntradasMuestraUnaMedia {
  return conDerivadas(definicion, { ...EJEMPLO, ...parcial }) as EntradasMuestraUnaMedia;
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
  assert.equal(fixture.casos.length, 20);
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
    const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraUnaMedia;
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
  const apagado = fixture.casos.find((c) => c.id === 'sin_perdidas');
  assert.ok(apagado);
  assert.equal(apagado.esperado.d_dado, 'NA', 'con n_dado = 0 el snippet debe devolver NA_real_');
  assert.equal(apagado.esperado.n, apagado.esperado.n_z, 'con poblacion = 0 no hay corrección');
  const encendido = fixture.casos.find((c) => c.id === 'con_n_dado');
  assert.ok(encendido);
  assert.equal(typeof encendido.esperado.d_dado, 'number');
});

test('el 1 se trata como «sin dato» en los dos lados, igual en R que en TypeScript', () => {
  const uno = fixture.casos.find((c) => c.id === 'poblacion_uno');
  assert.ok(uno);
  assert.equal(uno.esperado.n, uno.esperado.n_z, 'poblacion = 1 no debe corregir nada');
  assert.equal(uno.esperado.d_dado, 'NA', 'n_dado = 1 no enciende el modo inverso');
  assert.equal(hayDato(0), false);
  assert.equal(hayDato(1), false);
  assert.equal(hayDato(2), true);
  const e = conDerivadas(definicion, uno.entradas) as EntradasMuestraUnaMedia;
  const s = calcular(e, e.nivel);
  assert.equal(s.valores.n.valor, s.valores.n_z.valor);
  assert.ok(Number.isNaN(s.valores.d_dado.valor));
  assert.deepEqual(s.bandas, { cpf: 'sin', perdidas: 'sin', inverso: 'sin' });
});

test('n_t es el MENOR tamaño que alcanza la precisión pedida', () => {
  // Defecto CRÍTICO que encontró la revisión independiente: el punto fijo con el
  // techo dentro del bucle entra en un ciclo de periodo 2 y publicaba la fase en
  // la que caía la última pasada, que podía quedar POR DEBAJO del mínimo. La
  // definición vigente es «el menor entero n ≥ 2 con n ≥ (t_{n−1}·σ/d)²», que es
  // lo mismo que «la semiamplitud alcanzada con n no pasa de d».
  const alcanza = (n: number, sigma: number, d: number, nivel: number): boolean =>
    precisionMediaT(sigma, n, nivel) <= d;

  const rejilla: Array<[number, number, number]> = [
    [1, 0.36, 0.8], [60, 10, 0.95], [10, 5, 0.95], [1, 1, 0.95], [1, 2, 0.95],
    [0.35, 0.07, 0.95], [60, 1, 0.95], [60, 10, 0.9], [60, 10, 0.99], [60, 10, 0.999],
    [1, 0.3, 0.8], [1, 0.25, 0.9], [2, 0.5, 0.99], [5, 1.7, 0.95], [100, 31, 0.8],
  ];
  for (const [sigma, d, nivel] of rejilla) {
    const n = nMediaT(sigma, d, nivel);
    assert.ok(Number.isInteger(n) && n >= 2, `σ=${sigma} d=${d}: n_t = ${n} no es un entero ≥ 2`);
    assert.ok(alcanza(n, sigma, d, nivel), `σ=${sigma} d=${d} nivel=${nivel}: con ${n} NO se alcanza la precisión`);
    if (n > 2) {
      assert.ok(!alcanza(n - 1, sigma, d, nivel), `σ=${sigma} d=${d} nivel=${nivel}: ${n - 1} ya alcanzaba, n_t no es el mínimo`);
    }
  }
  // Y lo mismo sobre cada caso del fixture, que es lo que valida R.
  for (const caso of fixture.casos) {
    const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraUnaMedia;
    const n = calcular(e, e.nivel).valores.n_t.valor;
    if (!Number.isFinite(n)) continue;
    assert.ok(alcanza(n, e.sigma, e.d, e.nivel), `${caso.id}: con ${n} no se alcanza la precisión`);
    if (n > 2) assert.ok(!alcanza(n - 1, e.sigma, e.d, e.nivel), `${caso.id}: ${n - 1} ya alcanzaba`);
  }
});

test('el caso que destapó el ciclo de periodo 2 da 15, no 14', () => {
  // σ = 1, d = 0.36, 80 %: el punto fijo publicaba 14, pero con 14 sujetos la
  // semiamplitud es 0.360848 y no baja de 0.36 hasta n = 15.
  const caso = fixture.casos.find((c) => c.id === 'ciclo_periodo_2');
  assert.ok(caso);
  assert.equal(caso.esperado.n_t, 15, 'R también debe dar 15');
  const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraUnaMedia;
  assert.equal(calcular(e, e.nivel).valores.n_t.valor, 15);
  casiIgual(precisionMediaT(1, 14, 0.8), 0.360848, 'semiamplitud con 14', 1e-5);
  assert.ok(precisionMediaT(1, 14, 0.8) > 0.36, 'con 14 no se alcanza 0.36');
  assert.ok(precisionMediaT(1, 15, 0.8) <= 0.36, 'con 15 sí se alcanza');
});

test('la búsqueda arranca en max(2, ceil(n_z)) y termina siempre', () => {
  assert.equal(PASOS_T, 64);
  // Cota inferior: como t > z, el mínimo nunca baja de ⌈n_z⌉ ni de 2.
  for (const [sigma, d, nivel] of [[60, 10, 0.95], [1, 1, 0.95], [1, 2, 0.95], [0.35, 0.07, 0.99]] as Array<[number, number, number]>) {
    assert.ok(nMediaT(sigma, d, nivel) >= Math.max(2, Math.ceil(nMedia(sigma, d, nivel))), `σ=${sigma} d=${d}`);
  }
  // Por encima de 2^53 sumar uno no cambia el doble: el bucle no se cuelga y
  // publica el tamaño de partida en vez de agotar los pasos.
  const enorme = nMediaT(1e6, 1e-6, 0.95);
  assert.ok(Number.isFinite(enorme) && enorme >= 3.8e24, String(enorme));
});

test('el censo da precisión exactamente 0 en R y en TypeScript', () => {
  const censo = fixture.casos.find((c) => c.id === 'n_dado_censo');
  assert.ok(censo);
  assert.equal(censo.esperado.d_dado, 0, 'con n = N la precisión alcanzable debe ser 0 en R');
  const e = conDerivadas(definicion, censo.entradas) as EntradasMuestraUnaMedia;
  assert.equal(calcular(e, e.nivel).valores.d_dado.valor, 0);
});

test('un tamaño diminuto se presenta como 1 sujeto en vez de lanzar', () => {
  // Defecto que destapó `npm run barrido:bio` (484 avisos, todos de esta causa):
  // `techo()` tolera 1e-9 absoluto (para que 322.00000000001 no suba a 323) y
  // por sí solo hunde a 0 un tamaño positivo pero minúsculo. Con el marcador en
  // n = 0 la gráfica evaluaba la precisión ahí y `presentar()` lanzaba
  // `RangeError` con entradas que `validar()` había dado por buenas.
  const caso = fixture.casos.find((c) => c.id === 'n_diminuto');
  assert.ok(caso);
  const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraUnaMedia;
  assert.equal(definicion.validar(e), null, 'validar() las acepta, así que presentar() no puede lanzar');
  const s = calcular(e, e.nivel);
  assert.equal(techo(s.valores.n.valor), 0, 'techo() por sí solo devuelve 0 en este régimen');
  assert.ok(s.valores.n.valor > 0, 'el tamaño exacto sigue siendo positivo');
  // La guarda de grados de libertad evita que la variante t se vaya a NaN: con
  // n = 2 los grados de libertad son 1, y R devuelve el mismo entero.
  assert.ok(Number.isFinite(s.valores.n_t.valor), 'n_t no puede ser NaN');
  assert.equal(caso.esperado.n_t, 2, 'R también publica el mínimo de la variante t, que es 2');
  for (const lang of IDIOMAS) {
    const p = presentar(s, e, contextoDePrueba(SLUG, lang));
    assert.equal(p.celdas.n.valor, '1', `${lang}: el titular debe ser 1 sujeto, no 0`);
    assert.equal(p.celdas.n_z.valor, '1');
    assert.equal(p.celdas.n_t.valor, '2', 'la variante t no baja de 2: una media necesita dos observaciones');
    assert.equal(p.celdas.n_ajustado.valor, '1');
    // Por debajo de 1, el detalle usa cifras significativas: «0.00» haría creer
    // que no hace falta nadie.
    assert.ok(p.celdas.n_z.nota?.includes('0.000000000164'), p.celdas.n_z.nota);
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
  const capturado = { sigma: 60, d: 10, nivel: 0.95 } as unknown as EntradasMuestraUnaMedia;
  const derivadas = definicion.derivar?.(capturado);
  assert.ok(derivadas);
  assert.equal(derivadas.poblacion, 0, 'una población vacía vale 0, no NaN');
  assert.equal(derivadas.n_dado, 0, 'un tamaño disponible vacío vale 0, no NaN');
  assert.equal(derivadas.perdidas, 0);

  const completas = conDerivadas(definicion, capturado) as EntradasMuestraUnaMedia;
  const codigo = rellenarR(yamlCalc.r.codigo, completas);
  assert.match(codigo, /^poblacion <- 0\b/m);
  assert.match(codigo, /^n_dado <- 0\b/m);
  assert.ok(!codigo.includes('NA_real_ else'), 'el snippet ya no ramifica por NA en las entradas');
  assert.equal(definicion.validar(completas), null, 'las tres entradas vacías son un estado válido');

  // Es exactamente el caso `sin_perdidas` del fixture, ya validado contra R.
  const s = calcular(completas, 0.95);
  assert.equal(s.valores.n.valor, s.valores.n_z.valor);
  assert.equal(s.valores.n_ajustado.valor, s.valores.n_z.valor);
  assert.ok(Number.isNaN(s.valores.d_dado.valor));

  assert.equal(definicion.derivar?.(EJEMPLO).poblacion, 0);
  assert.equal(definicion.derivar?.(EJEMPLO).n_dado, 0);
  assert.equal(definicion.derivar?.(EJEMPLO).perdidas, 0.1);
  assert.equal(definicion.derivar?.(entradas({ poblacion: 300, n_dado: 100 })).n_dado, 100);
});

// ---------------------------------------------------------------------------
// Propiedades de las fórmulas
// ---------------------------------------------------------------------------

test('la variante t nunca pide menos que la normal y converge a ella con n grande', () => {
  for (const [sigma, d] of [[1, 2], [1, 1], [10, 5], [60, 10], [0.35, 0.07], [60, 1], [600, 1]] as Array<[number, number]>) {
    for (const nivel of [0.9, 0.95, 0.99]) {
      const nZ = nMedia(sigma, d, nivel);
      const nT = nMediaT(sigma, d, nivel);
      assert.ok(nT >= nZ, `σ=${sigma} d=${d} nivel=${nivel}: n_t (${nT}) por debajo de n_z (${nZ})`);
    }
  }
  // La brecha tiende a (1 + z²)/2 ≈ 2.42 al 95 %: relativa despreciable, absoluta constante.
  const brecha = (sigma: number, d: number): number => nMediaT(sigma, d, 0.95) - nMedia(sigma, d, 0.95);
  assert.ok(brecha(60, 1) < 3 && brecha(60, 1) > 2, String(brecha(60, 1)));
  assert.ok(brecha(600, 1) < 3 && brecha(600, 1) > 2, String(brecha(600, 1)));
  assert.ok(brecha(10, 5) > 2, String(brecha(10, 5)));
});

test('n crece con la confianza y con σ, y decrece con la precisión pedida', () => {
  const niveles = [0.8, 0.9, 0.95, 0.99, 0.999];
  for (let i = 1; i < niveles.length; i += 1) {
    assert.ok(
      nMedia(60, 10, niveles[i] as number) > nMedia(60, 10, niveles[i - 1] as number),
      `n_z no crece del ${niveles[i - 1]} al ${niveles[i]}`,
    );
  }
  const ds = [1, 5, 10, 20];
  for (let i = 1; i < ds.length; i += 1) {
    assert.ok(nMedia(60, ds[i] as number, 0.95) < nMedia(60, ds[i - 1] as number, 0.95), `n_z no decrece en d = ${ds[i]}`);
  }
  // Solo depende del cociente σ/d, y con el cuadrado.
  casiIgual(nMedia(0.35, 0.07, 0.95), nMedia(5, 1, 0.95), 'homogeneidad de σ/d');
  casiIgual(nMedia(120, 10, 0.95), 4 * nMedia(60, 10, 0.95), 'ley σ²');
  casiIgual(nMedia(60, 5, 0.95), 4 * nMedia(60, 10, 0.95), 'ley 1/d²');
});

test('la corrección por población finita nunca sube n y tiende a n_z con N grande', () => {
  const nZ = nMedia(60, 10, 0.95);
  let previo = 0;
  for (const N of [2, 10, 100, 300, 900, 100000, 1e9]) {
    const n = conCpf(nZ, N);
    assert.ok(n <= nZ, `N = ${N}: la corrección subió n por encima de n_z`);
    assert.ok(n < N, `N = ${N}: la corrección pide más muestra que población`);
    assert.ok(n > previo, `N = ${N}: n no crece con la población`);
    previo = n;
  }
  casiIgual(conCpf(nZ, 1e12), nZ, 'CPF con N = 1e12', 1e-8);
  assert.equal(conCpf(nZ, 0), nZ, 'sin población declarada la corrección es la identidad');
  assert.equal(conCpf(nZ, 1), nZ, 'una población de 1 también es «sin dato»');
});

test('la precisión alcanzable invierte exactamente el tamaño necesario', () => {
  for (const poblacion of [0, 300, 900, 1000000]) {
    for (const sigma of [0.35, 10, 60]) {
      for (const nivel of [0.9, 0.95, 0.99]) {
        const d = sigma / 6;
        const n = conCpf(nMedia(sigma, d, nivel), poblacion);
        casiIgual(precisionMedia(sigma, n, poblacion, nivel), d, `inversa con N = ${poblacion}, σ = ${sigma}`, 1e-10);
      }
    }
  }
  for (const nDado of [50, 100, 250]) {
    const d = precisionMedia(60, nDado, 900, 0.95);
    casiIgual(conCpf(nMedia(60, d, 0.95), 900), nDado, `vuelta con n = ${nDado}`, 1e-10);
  }
});

test('más sujetos dan mejor precisión, y el ajuste por pérdidas sube el reclutamiento', () => {
  let previa = Number.POSITIVE_INFINITY;
  for (const n of [5, 20, 50, 120, 500, 5000]) {
    const d = precisionMedia(60, n, 0, 0.95);
    assert.ok(d < previa, `n = ${n}: la precisión no mejoró`);
    previa = d;
  }
  const s = calcular(entradas({ perdidas: 0.2 }), 0.95);
  casiIgual(s.valores.n_ajustado.valor, s.valores.n.valor / 0.8, 'n ajustado con 20 % de pérdidas');
  const sinPerdidas = calcular(entradas({ perdidas: 0 }), 0.95);
  assert.equal(sinPerdidas.valores.n_ajustado.valor, sinPerdidas.valores.n.valor);
});

test('las entradas imposibles lanzan RangeError', () => {
  assert.throws(() => nMedia(0, 10, 0.95), RangeError);
  assert.throws(() => nMedia(-1, 10, 0.95), RangeError);
  assert.throws(() => nMedia(60, 0, 0.95), RangeError);
  assert.throws(() => nMedia(60, 10, 0), RangeError);
  assert.throws(() => nMediaT(60, 0, 0.95), RangeError);
  assert.throws(() => conCpf(100, -1), RangeError);
  assert.throws(() => conCpf(100, 10.5), RangeError);
  assert.throws(() => precisionMedia(60, 0, 0, 0.95), RangeError);
});

// ---------------------------------------------------------------------------
// Validación, bandas y avisos
// ---------------------------------------------------------------------------

test('validar() acepta el ejemplo y rechaza cada entrada fuera de rango', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sigma: 0 }), { sigma: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sigma: -3 }), { sigma: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sigma: Number.NaN }), { sigma: 'err_numero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, d: 0 }), { d: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, d: Number.NaN }), { d: 'err_numero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, poblacion: -1 }), { poblacion: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, poblacion: 900.5 }), { poblacion: 'err_entero' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, perdidas: 0.6 }), { perdidas: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: -3 }), { n_dado: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: 12.5 }), { n_dado: 'err_entero' });
  for (const v of [0, 1]) {
    assert.equal(definicion.validar({ ...EJEMPLO, poblacion: v, n_dado: v }), null, `${v} debería ser válido`);
  }
  // Magnitudes diminutas pero legales (el mínimo declarado es 1e-6).
  assert.equal(definicion.validar({ ...EJEMPLO, sigma: 0.000001, d: 0.000001 }), null);
});

test('las bandas y los avisos siguen los cortes documentados', () => {
  const ejemplo = calcular(EJEMPLO, 0.95);
  assert.deepEqual(ejemplo.bandas, { cpf: 'sin', perdidas: 'con', inverso: 'sin' });
  // n_z ≥ 30 y sin población: solo los dos avisos permanentes.
  assert.deepEqual(ejemplo.avisos.map((a) => a.codigo), ['asimetria', 'supuestos']);

  const estrecha = calcular(entradas({ poblacion: 300 }), 0.95);
  assert.deepEqual(estrecha.avisos.map((a) => a.codigo), ['cpf_importante', 'asimetria', 'supuestos']);
  assert.deepEqual(estrecha.avisos[0]?.params, { poblacion: 300 });
  const holgada = calcular(entradas({ poblacion: 5000 }), 0.95);
  assert.deepEqual(holgada.avisos.map((a) => a.codigo), ['asimetria', 'supuestos'], 'con N ≥ 10·n_z no hay aviso de CPF');

  const pequeno = calcular(entradas({ sigma: 10, d: 5 }), 0.95);
  assert.deepEqual(pequeno.avisos.map((a) => a.codigo), ['n_pequeno', 'asimetria', 'supuestos']);
  assert.ok(nMedia(60, 10, 0.95) > 30);
  assert.ok(!ejemplo.avisos.some((a) => a.codigo === 'n_pequeno'));

  // El reclutamiento con pérdidas puede pasarse de la población: la corrección
  // acota n, pero no n_ajustado.
  const desborda = calcular(entradas({ sigma: 60, d: 1, poblacion: 10, perdidas: 0.5 }), 0.95);
  assert.ok(desborda.valores.n.valor < 10 && desborda.valores.n_ajustado.valor > 10);
  assert.deepEqual(
    desborda.avisos.find((a) => a.codigo === 'supera_poblacion')?.params,
    { poblacion: 10 },
    'falta el aviso supera_poblacion',
  );
  // Sin población declarada no hay con qué compararlo, y con una holgada no ocurre.
  assert.ok(!calcular(entradas({ sigma: 60, d: 1, poblacion: 0, perdidas: 0.5 }), 0.95).avisos.some((a) => a.codigo === 'supera_poblacion'));
  assert.ok(!calcular(EJEMPLO, 0.95).avisos.some((a) => a.codigo === 'supera_poblacion'));

  assert.equal(calcular(entradas({ perdidas: 0 }), 0.95).bandas.perdidas, 'sin');
  assert.equal(calcular(entradas({ n_dado: 50 }), 0.95).bandas.inverso, 'con');
  assert.equal(calcular(entradas({ poblacion: 300 }), 0.95).bandas.cpf, 'con');
});

// ---------------------------------------------------------------------------
// Presentación en los dos idiomas
// ---------------------------------------------------------------------------

test('presentar() rellena todas las plantillas en todas las combinaciones de banda', () => {
  const combinaciones: EntradasMuestraUnaMedia[] = [
    EJEMPLO,
    entradas({ poblacion: 0, perdidas: 0, n_dado: 0 }),
    entradas({ poblacion: 0, perdidas: 0.5, n_dado: 500 }),
    entradas({ sigma: 10, d: 5, poblacion: 300, perdidas: 0, n_dado: 0 }),
    entradas({ poblacion: 900, perdidas: 0.1, n_dado: 50 }),
    entradas({ sigma: 0.35, d: 0.07, poblacion: 0, perdidas: 0.3, n_dado: 30 }),
    entradas({ sigma: 1, d: 2, poblacion: 2, perdidas: 0, n_dado: 2 }),
    entradas({ sigma: 1e-6, d: 0.1, nivel: 0.8, poblacion: 0, perdidas: 0.1, n_dado: 0 }),
    entradas({ sigma: 1e6, d: 1e-6, nivel: 0.999, poblacion: 0, perdidas: 0, n_dado: 0 }),
    entradas({ sigma: 60, d: 1, poblacion: 10, perdidas: 0.5, n_dado: 0 }),
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of combinaciones) {
      const s = calcular(e, e.nivel);
      const p = presentar(s, e, ctx);
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas]);
      assert.equal(p.interpretacion.length, 5);
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
  const g = grafica(calcular(EJEMPLO, 0.95), EJEMPLO, ctx);
  assert.ok(g && g.tipo === 'curvas');
  if (!g || g.tipo !== 'curvas') return;
  const puntos = g.curvas[0]?.puntos ?? [];
  for (let i = 1; i < puntos.length; i += 1) {
    assert.ok((puntos[i]?.[1] ?? 0) < (puntos[i - 1]?.[1] ?? 0), `la curva no decrece en el punto ${i}`);
  }
  const marca = g.marcador?.x ?? Number.NaN;
  assert.equal(marca, techo(calcular(EJEMPLO, 0.95).valores.n.valor));
  casiIgual(g.marcador?.valores?.precision ?? Number.NaN, precisionMedia(EJEMPLO.sigma, marca, EJEMPLO.poblacion, 0.95), 'y del marcador');
  assert.ok((g.marcador?.valores?.precision ?? 1e9) <= EJEMPLO.d, 'el n redondeado hacia arriba debe alcanzar la precisión pedida');
});

test('el ejemplo se presenta con las cifras comprobadas a mano en los dos idiomas', () => {
  // σ = 60, d = 10, 95 %: n_z = 138.292517544988 → 139; n_t = 141, el menor entero
  // con el que la semiamplitud de la t no pasa de 10 (con 140 todavía la pasa).
  // Sin población declarada, n = n_z. Con 10 % de pérdidas: 153.658352827765 → 154.
  // Sin tamaño disponible, la precisión alcanzable es «no definido» (NA_real_ en R).
  const s = calcular(EJEMPLO, 0.95);
  casiIgual(s.valores.n_z.valor, 138.292517544988, 'n_z del ejemplo', 1e-12);
  assert.equal(s.valores.n_t.valor, 141, 'n_t del ejemplo');
  assert.ok(precisionMediaT(60, 141, 0.95) <= 10 && precisionMediaT(60, 140, 0.95) > 10);
  assert.equal(s.valores.n.valor, s.valores.n_z.valor);
  casiIgual(s.valores.n_ajustado.valor, 153.658352827765, 'n ajustado del ejemplo', 1e-12);
  assert.ok(Number.isNaN(s.valores.d_dado.valor));

  const es = presentar(s, EJEMPLO, contextoDePrueba(SLUG, 'es'));
  const en = presentar(s, EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(es.celdas.n_z.valor, '139');
  assert.equal(es.celdas.n_t.valor, '141');
  assert.equal(es.celdas.n.valor, '139');
  assert.equal(es.celdas.n_ajustado.valor, '154');
  assert.equal(es.celdas.z.valor, '1.960');
  assert.equal(es.celdas.d_dado.valor, 'no definido');
  assert.ok(es.celdas.d_dado.nota?.includes('captura'), es.celdas.d_dado.nota);
  assert.ok(es.celdas.n_z.nota?.includes('138.29'), es.celdas.n_z.nota);
  assert.ok(es.celdas.n_ajustado.nota?.includes('153.66'), es.celdas.n_ajustado.nota);
  // El detalle de n_t no repite el entero: dice qué semiamplitud se alcanza.
  assert.ok(es.celdas.n_t.nota?.startsWith('semiamplitud alcanzada:'), es.celdas.n_t.nota);
  // 9.989877… con cuatro cifras significativas: Intl deja «9.99».
  assert.ok(es.celdas.n_t.nota?.includes('9.99'), es.celdas.n_t.nota);
  assert.ok(en.celdas.n_t.nota?.startsWith('half-width achieved:'), en.celdas.n_t.nota);
  assert.equal(es.celdas.n.clase, 'destacada');
  assert.ok(es.interpretacion[0]?.includes('139 sujetos'), es.interpretacion[0]);
  assert.ok(es.interpretacion[1]?.includes('141'), es.interpretacion[1]);
  assert.ok(es.interpretacion[3]?.includes('154'), es.interpretacion[3]);
  assert.ok(es.metodos.includes('Cochran') && es.metodos.includes('sin corrección por población finita'), es.metodos);
  assert.ok(es.metodos.includes('t de Student') && es.metodos.includes('141 sujetos'), es.metodos);

  assert.equal(en.celdas.n.valor, '139');
  assert.equal(en.celdas.d_dado.valor, 'not defined');
  assert.ok(en.interpretacion[0]?.includes('139 subjects'), en.interpretacion[0]);
  assert.ok(en.metodos.includes("Student's t"), en.metodos);

  // Con población finita y modo inverso: N = 900 baja n a 120 y 50 sujetos dan ±16.17.
  const completo = entradas({ poblacion: 900, n_dado: 50 });
  const sc = calcular(completo, 0.95);
  casiIgual(sc.valores.n.valor, 119.988589221739, 'n con N = 900', 1e-12);
  casiIgual(sc.valores.d_dado.valor, 16.1712635936127, 'precisión con n = 50 y N = 900', 1e-12);
  const compEs = presentar(sc, completo, contextoDePrueba(SLUG, 'es'));
  assert.equal(compEs.celdas.n.valor, '120');
  assert.equal(compEs.celdas.d_dado.valor, '16.17');
  assert.ok(compEs.interpretacion[2]?.includes('900') && compEs.interpretacion[2]?.includes('139'), compEs.interpretacion[2]);
  assert.ok(compEs.interpretacion[4]?.includes('16.17'), compEs.interpretacion[4]);
  assert.ok(compEs.metodos.includes('población finita de 900'), compEs.metodos);
});

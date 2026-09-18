/**
 * Calculadora «Tamaño de muestra (dos proporciones)» contra el oráculo R y sus
 * propiedades.
 *
 *   node --test tests/bioestadistica/muestra-dos-proporciones.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo muestra-dos-proporciones`. Se comprueba
 * (1) que las catorce salidas de TypeScript coinciden con las de R caso por
 * caso, incluidos los `NA` de las comparaciones que solo existen con grupos
 * iguales; (2) que el snippet ejecutado es, byte a byte, el que ve el usuario;
 * (3) que el SHA-256 de `r.codigo` es el grabado en el fixture; y (4)
 * propiedades del diseño (monotonía en el poder y en la diferencia, simetría al
 * intercambiar las proporciones, identidad entre Fleiss sin corregir y
 * `power.prop.test`, y que el modo inverso invierte de verdad la fórmula).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { techo } from '../../src/lib/bioestadistica/metodos/muestra-comun.ts';
import {
  hCohen,
  muestraDosProporciones,
  n1Fleiss,
  n1FleissCc,
  nPowerPropTest,
  poderFleiss,
  validarDosProporciones,
} from '../../src/lib/bioestadistica/metodos/muestra-proporciones.ts';
import type { DisenoDosProporciones } from '../../src/lib/bioestadistica/metodos/muestra-proporciones.ts';
import { calcular, definicion, grafica, presentar } from '../../src/lib/bioestadistica/calculadoras/muestra-dos-proporciones.ts';
import type { EntradasMuestraDosProporciones } from '../../src/lib/bioestadistica/calculadoras/muestra-dos-proporciones.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'muestra-dos-proporciones';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const IDIOMAS: readonly Lang[] = ['es', 'en'];

/** Cuantiles normales escritos a mano, para que la comprobación manual no dependa de la biblioteca. */
const Z_975 = 1.959963984540054;
const Z_80 = 0.8416212335729143;

/** Espacio fino U+202F que `formato.ts` inserta antes del signo % en español. */
const PCT = ' %';

const EJEMPLO: EntradasMuestraDosProporciones = {
  p1: 0.7,
  p2: 0.85,
  alfa: 0.05,
  lateralidad: 'bilateral',
  poder: 0.8,
  r: 1,
  correccion: 'si',
  perdidas: 0.1,
  n_dado: 0,
};

function entradasDe(caso: CasoFixture): EntradasMuestraDosProporciones {
  return conDerivadas(definicion, caso.entradas) as EntradasMuestraDosProporciones;
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

// ---------------------------------------------------------------------------
// TypeScript contra R, caso por caso
// ---------------------------------------------------------------------------

for (const caso of fixture.casos) {
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const e = entradasDe(caso);
    const esperado = normalizarR(caso.esperado) as Record<string, unknown>;
    const informe = comparar(calcular(e), esperado, TOL[caso.tol] as NonNullable<(typeof TOL)[string]>);
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

test('las comparaciones que suponen grupos iguales vienen como NA cuando r ≠ 1', () => {
  for (const id of ['r_2', 'r_05', 'n_dado_r2']) {
    const caso = fixture.casos.find((c) => c.id === id);
    assert.ok(caso, `falta el caso ${id}`);
    const esperado = normalizarR(caso.esperado) as Record<string, unknown>;
    assert.equal(esperado.n_ppt, null, `${id}: R debería devolver NA en n_ppt`);
    assert.equal(esperado.n_pwr_h, null, `${id}: R debería devolver NA en n_pwr_h`);
    // La h de Cohen no depende del reparto: sigue existiendo.
    assert.equal(typeof esperado.h_cohen, 'number', `${id}: h_cohen debería seguir definida`);
    const ts = calcular(entradasDe(caso));
    assert.ok(Number.isNaN(ts.valores.n_ppt.valor) && Number.isNaN(ts.valores.n_pwr_h.valor), id);
  }
});

test('n_ppt reproduce el extendInt = «upX», no solo el corchete de partida', () => {
  // `power.prop.test` pide la raíz en [1, 1e7] PERO con extendInt = "upX": si el
  // n cae fuera, R estira el corchete y devuelve un número. Quedarse en el
  // corchete daba «no definido» donde el oráculo sí responde.
  const caso = fixture.casos.find((c) => c.id === 'diferencia_minuscula');
  assert.ok(caso, 'falta el caso diferencia_minuscula');
  const rN = (normalizarR(caso.esperado) as Record<string, unknown>).n_ppt as number;
  assert.ok(rN > 1e7, `el caso debe caer fuera del corchete de partida (n = ${rN})`);
  const ts = nPowerPropTest(0.5, 0.5001, 0.05, 'bilateral', 0.8);
  assert.ok(Number.isFinite(ts), 'TypeScript no puede rendirse donde R resuelve');
  assert.ok(Math.abs(ts - rN) <= 1e-6 * rN, `TS ${ts} vs R ${rN}`);

  // El otro extremo, con su propio caso de fixture: R extiende hacia ABAJO y
  // devuelve menos de un participante por grupo, donde antes salía NaN.
  const abajo = fixture.casos.find((c) => c.id === 'extension_por_debajo');
  assert.ok(abajo, 'falta el caso extension_por_debajo');
  const rAbajo = (normalizarR(abajo.esperado) as Record<string, unknown>).n_ppt as number;
  assert.ok(rAbajo < 1, `el caso debe caer por debajo del corchete de partida (n = ${rAbajo})`);
  const tsAbajo = nPowerPropTest(0.001, 0.998, 0.2, 'bilateral', 0.5);
  assert.ok(Number.isFinite(tsAbajo), 'TypeScript no puede rendirse donde R extiende hacia abajo');
  assert.ok(Math.abs(tsAbajo - rAbajo) <= 1e-6 * rAbajo, `TS ${tsAbajo} vs R ${rAbajo}`);

  // Y sigue coincidiendo con la forma cerrada, que es la misma cantidad.
  const d = { p1: 0.001, p2: 0.998, alfa: 0.2, lateralidad: 'bilateral' as const, poder: 0.5, r: 1 };
  assert.ok(Math.abs(tsAbajo - n1Fleiss(d)) <= 1e-6 * n1Fleiss(d), `${tsAbajo} vs ${n1Fleiss(d)}`);
});

test('sin modo inverso, poder_dado es NA en los dos lados', () => {
  const caso = fixture.casos.find((c) => c.id === 'ejemplo');
  assert.ok(caso);
  assert.equal((normalizarR(caso.esperado) as Record<string, unknown>).poder_dado, null);
  assert.ok(Number.isNaN(calcular(EJEMPLO).valores.poder_dado.valor));
});

// ---------------------------------------------------------------------------
// Comprobación manual del ejemplo
// ---------------------------------------------------------------------------

test('el ejemplo coincide con la fórmula de Fleiss calculada a mano', () => {
  const p1 = 0.7;
  const p2 = 0.85;
  const pbar = (p1 + p2) / 2;
  const suma = Z_975 * Math.sqrt(2 * pbar * (1 - pbar)) + Z_80 * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  const n1Mano = (suma * suma) / Math.pow(p1 - p2, 2);
  const ccMano = (n1Mano / 4) * Math.pow(1 + Math.sqrt(1 + 4 / (n1Mano * Math.abs(p1 - p2))), 2);

  const v = calcular(EJEMPLO).valores;
  assert.ok(Math.abs(v.n1_fleiss.valor - n1Mano) < 1e-10, `n1 = ${v.n1_fleiss.valor} vs ${n1Mano}`);
  assert.ok(Math.abs(v.n1_cc.valor - ccMano) < 1e-10, `n1_cc = ${v.n1_cc.valor} vs ${ccMano}`);
  // Los números que la especificación fija como comprobación manual.
  assert.equal(techo(v.n1_fleiss.valor), 121);
  assert.equal(techo(v.n1_cc.valor), 134);
  assert.equal(techo(v.n_ppt.valor), 121);
  assert.ok(Math.abs(v.h_cohen.valor - hCohen(0.7, 0.85)) === 0);
  assert.ok(Math.abs(v.z_alfa.valor - Z_975) < 1e-12 && Math.abs(v.z_beta.valor - Z_80) < 1e-12);
});

// ---------------------------------------------------------------------------
// Propiedades del diseño
// ---------------------------------------------------------------------------

/** Rejilla de diseños con grupos iguales y desiguales, en todo el rango admitido. */
function* disenos(): Generator<DisenoDosProporciones> {
  for (const [p1, p2] of [
    [0.7, 0.85],
    [0.4, 0.6],
    [0.02, 0.08],
    [0.5, 0.52],
    [0.9, 0.95],
  ] as const) {
    for (const alfa of [0.001, 0.01, 0.05, 0.2]) {
      for (const poder of [0.5, 0.8, 0.9, 0.99]) {
        for (const r of [0.5, 1, 2]) {
          for (const lateralidad of ['bilateral', 'unilateral'] as const) {
            yield { p1, p2, alfa, lateralidad, poder, r, correccion: 'si', perdidas: 0, nDado: 0 };
          }
        }
      }
    }
  }
}

test('la corrección de continuidad nunca pide menos participantes que la fórmula sin corregir', () => {
  for (const d of disenos()) {
    const v = muestraDosProporciones(d);
    const donde = JSON.stringify(d);
    assert.ok(v.n1_cc.valor >= v.n1_fleiss.valor, `${donde}: n1_cc < n1_fleiss`);
    assert.ok(v.n2_cc.valor >= v.n2_fleiss.valor, `${donde}: n2_cc < n2_fleiss`);
    // n₂ siempre es r·n₁, con y sin corrección.
    assert.ok(Math.abs(v.n2_fleiss.valor - d.r * v.n1_fleiss.valor) <= 1e-9 * v.n2_fleiss.valor, donde);
    assert.ok(Math.abs(v.n2_cc.valor - d.r * v.n1_cc.valor) <= 1e-9 * v.n2_cc.valor, donde);
  }
});

test('con grupos iguales, intercambiar p₁ y p₂ no cambia ningún tamaño', () => {
  for (const d of disenos()) {
    if (d.r !== 1) continue;
    const directo = muestraDosProporciones(d);
    const invertido = muestraDosProporciones({ ...d, p1: d.p2, p2: d.p1 });
    const donde = JSON.stringify(d);
    for (const k of ['n1_fleiss', 'n1_cc', 'n_total', 'n_ppt', 'n_pwr_h'] as const) {
      assert.ok(
        Math.abs(directo[k].valor - invertido[k].valor) <= 1e-9 * Math.max(1, Math.abs(directo[k].valor)),
        `${donde}: ${k} cambió al intercambiar las proporciones`,
      );
    }
    // El h de Cohen sí cambia de signo: es una diferencia con dirección.
    assert.ok(Math.abs(directo.h_cohen.valor + invertido.h_cohen.valor) < 1e-12, donde);
  }
});

test('el tamaño crece con el poder y decrece al aumentar la diferencia', () => {
  const base: DisenoDosProporciones = {
    p1: 0.7,
    p2: 0.85,
    alfa: 0.05,
    lateralidad: 'bilateral',
    poder: 0.8,
    r: 1,
    correccion: 'si',
    perdidas: 0,
    nDado: 0,
  };
  let previo = 0;
  for (const poder of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]) {
    const n = muestraDosProporciones({ ...base, poder }).n1.valor;
    assert.ok(n > previo, `el poder ${poder} no pidió más que el anterior (${n} ≤ ${previo})`);
    previo = n;
  }
  let anterior = Number.POSITIVE_INFINITY;
  for (const p2 of [0.72, 0.75, 0.8, 0.85, 0.9, 0.95]) {
    const n = muestraDosProporciones({ ...base, p2 }).n1.valor;
    assert.ok(n < anterior, `p₂ = ${p2} no bajó el tamaño (${n} ≥ ${anterior})`);
    anterior = n;
  }
  // Y crece al bajar α, porque la prueba se vuelve más exigente.
  let menor = 0;
  for (const alfa of [0.2, 0.1, 0.05, 0.01, 0.001]) {
    const n = muestraDosProporciones({ ...base, alfa }).n1.valor;
    assert.ok(n > menor, `α = ${alfa} no pidió más participantes que el α anterior (${n} ≤ ${menor})`);
    menor = n;
  }
});

test('con grupos iguales, Fleiss sin corregir es power.prop.test', () => {
  for (const d of disenos()) {
    if (d.r !== 1) continue;
    const v = muestraDosProporciones(d);
    const donde = JSON.stringify(d);
    assert.ok(Number.isFinite(v.n_ppt.valor), `${donde}: power.prop.test no resolvió`);
    assert.ok(
      Math.abs(v.n1_fleiss.valor - v.n_ppt.valor) <= 1e-6 * Math.max(v.n1_fleiss.valor, v.n_ppt.valor),
      `${donde}: n1_fleiss = ${v.n1_fleiss.valor} vs n_ppt = ${v.n_ppt.valor}`,
    );
    // Ambas salen del mismo cuerpo, así que también coinciden con la forma cerrada.
    assert.ok(
      Math.abs(nPowerPropTest(d.p1, d.p2, d.alfa, d.lateralidad, d.poder) - n1Fleiss(d)) <=
        1e-6 * n1Fleiss(d),
      donde,
    );
  }
});

test('el modo inverso invierte la fórmula: con n₁ requerido devuelve el poder pedido', () => {
  for (const d of disenos()) {
    const n1 = n1Fleiss(d);
    const donde = JSON.stringify(d);
    assert.ok(Math.abs(poderFleiss(n1, d) - d.poder) < 1e-10, `${donde}: poder recuperado ${poderFleiss(n1, d)}`);
    // El poder crece con el tamaño y nunca sale de [0, 1].
    let previo = -1;
    for (const factor of [0.25, 0.5, 1, 1.5, 2]) {
      const p = poderFleiss(n1 * factor, d);
      assert.ok(p >= 0 && p <= 1, `${donde}: poder fuera de [0, 1]`);
      assert.ok(p > previo, `${donde}: el poder no creció con n`);
      previo = p;
    }
  }
});

test('la corrección de continuidad es la fórmula publicada y depende de r', () => {
  const d: DisenoDosProporciones = {
    p1: 0.7,
    p2: 0.85,
    alfa: 0.05,
    lateralidad: 'bilateral',
    poder: 0.8,
    r: 2,
    correccion: 'si',
    perdidas: 0,
    nDado: 0,
  };
  const n1 = n1Fleiss(d);
  const esperado = (n1 / 4) * Math.pow(1 + Math.sqrt(1 + (2 * 3) / (2 * n1 * 0.15)), 2);
  assert.ok(Math.abs(n1FleissCc(n1, d.p1, d.p2, d.r) - esperado) < 1e-12);
});

test('el ajuste por pérdidas divide entre 1 − L y el selector elige qué n se reporta', () => {
  const base = { ...EJEMPLO, perdidas: 0 };
  const con = calcular({ ...base, perdidas: 0.5 }).valores;
  assert.ok(Math.abs(con.n_ajustado.valor - 2 * con.n_total.valor) < 1e-9);

  const cc = calcular({ ...base, correccion: 'si' }).valores;
  const sin = calcular({ ...base, correccion: 'no' }).valores;
  assert.equal(cc.n1.valor, cc.n1_cc.valor);
  assert.equal(sin.n1.valor, sin.n1_fleiss.valor);
  // Las cuatro cifras de referencia no dependen del selector.
  for (const k of ['n1_fleiss', 'n2_fleiss', 'n1_cc', 'n2_cc'] as const) {
    assert.equal(cc[k].valor, sin[k].valor, k);
  }
});

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

test('las entradas imposibles lanzan RangeError en la capa numérica', () => {
  const d: DisenoDosProporciones = { ...EJEMPLO, lateralidad: 'bilateral', correccion: 'si', nDado: 0 } as DisenoDosProporciones;
  assert.doesNotThrow(() => validarDosProporciones(d));
  assert.throws(() => validarDosProporciones({ ...d, p1: 0 }), RangeError);
  assert.throws(() => validarDosProporciones({ ...d, p2: 1 }), RangeError);
  assert.throws(() => validarDosProporciones({ ...d, p2: 0.7 }), RangeError); // p1 = p2
  assert.throws(() => validarDosProporciones({ ...d, alfa: 0.5 }), RangeError);
  assert.throws(() => validarDosProporciones({ ...d, poder: 0.4 }), RangeError);
  assert.throws(() => validarDosProporciones({ ...d, r: 0 }), RangeError);
  assert.throws(() => validarDosProporciones({ ...d, r: 11 }), RangeError);
  assert.throws(() => validarDosProporciones({ ...d, perdidas: 0.8 }), RangeError);
  assert.throws(() => validarDosProporciones({ ...d, correccion: 'quizas' as never }), RangeError);
  assert.throws(() => validarDosProporciones({ ...d, nDado: 2.5 }), RangeError);
});

test('validar() marca el campo culpable con el código de error de la interfaz', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  const casos: Array<[Partial<EntradasMuestraDosProporciones>, string, string]> = [
    [{ p1: 0 }, 'p1', 'err_proporcion'],
    [{ p2: 1 }, 'p2', 'err_proporcion'],
    [{ p2: 0.7 }, 'p2', 'err_rango'],
    [{ alfa: 0.0005 }, 'alfa', 'err_min'],
    [{ alfa: 0.3 }, 'alfa', 'err_max'],
    [{ poder: 0.4 }, 'poder', 'err_min'],
    [{ poder: 0.999 }, 'poder', 'err_max'],
    [{ r: 0.05 }, 'r', 'err_min'],
    [{ r: 12 }, 'r', 'err_max'],
    [{ perdidas: 0.6 }, 'perdidas', 'err_max'],
    [{ lateralidad: 'dos_colas' }, 'lateralidad', 'err_opcion'],
    [{ correccion: 'quizas' }, 'correccion', 'err_opcion'],
    [{ n_dado: 12.5 }, 'n_dado', 'err_entero'],
    [{ n_dado: -3 }, 'n_dado', 'err_min'],
  ];
  for (const [parche, campo, codigo] of casos) {
    // El spread de un parcial sobre una interfaz con firma de índice deja
    // `undefined` en el tipo; aquí ninguna clave se borra, así que se acota.
    const err = definicion.validar({ ...EJEMPLO, ...parche } as EntradasMuestraDosProporciones);
    assert.ok(err, `${JSON.stringify(parche)} debería ser inválido`);
    assert.equal(err[campo], codigo, JSON.stringify(parche));
  }
});

test('derivar() rellena las dos entradas opcionales con 0, que es lo que viaja a R', () => {
  const sinOpcionales = { ...EJEMPLO } as Record<string, unknown>;
  delete sinOpcionales.perdidas;
  delete sinOpcionales.n_dado;
  const e = conDerivadas(definicion, sinOpcionales as EntradasMuestraDosProporciones);
  assert.equal(e.perdidas, 0);
  assert.equal(e.n_dado, 0);
  // Con 0 en los dos, el snippet se rellena sin NA y el modo inverso queda apagado.
  assert.match(rellenarR(yamlCalc.r.codigo, e), /n_dado\s+<- 0/);
  assert.ok(Number.isNaN(calcular(e as EntradasMuestraDosProporciones).valores.poder_dado.valor));
});

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

test('cada aviso se activa exactamente cuando debe', () => {
  const codigos = (e: EntradasMuestraDosProporciones): string[] => calcular(e).avisos.map((a) => a.codigo);

  // El aviso de supuestos acompaña siempre a cualquier resultado.
  for (const caso of fixture.casos) {
    assert.ok(codigos(entradasDe(caso)).includes('supuestos'), caso.id);
  }
  assert.deepEqual(codigos(EJEMPLO), ['supuestos']);
  assert.ok(codigos({ ...EJEMPLO, p1: 0.5, p2: 0.505 }).includes('diferencia_minima'));
  assert.ok(!codigos({ ...EJEMPLO, p1: 0.5, p2: 0.52 }).includes('diferencia_minima'));
  assert.ok(codigos({ ...EJEMPLO, p1: 0.02, p2: 0.08 }).includes('aproximacion_dudosa'));
  assert.ok(!codigos(EJEMPLO).includes('aproximacion_dudosa'));
  assert.ok(codigos({ ...EJEMPLO, lateralidad: 'unilateral' }).includes('unilateral'));
  assert.ok(codigos({ ...EJEMPLO, r: 2 }).includes('r_distinto'));
  assert.ok(!codigos(EJEMPLO).includes('r_distinto'));

  // Todo aviso emitido está declarado en la definición.
  for (const e of [EJEMPLO, { ...EJEMPLO, r: 0.5, lateralidad: 'unilateral', p1: 0.02, p2: 0.025 }]) {
    for (const codigo of codigos(e as EntradasMuestraDosProporciones)) {
      assert.ok(definicion.avisos.includes(codigo), `aviso no declarado: ${codigo}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Presentación en los dos idiomas
// ---------------------------------------------------------------------------

/** Variantes que recorren todas las ramas de interpretación de la calculadora. */
const VARIANTES: Array<[string, EntradasMuestraDosProporciones]> = [
  ['ejemplo', EJEMPLO],
  ['sin_correccion', { ...EJEMPLO, correccion: 'no' }],
  ['unilateral', { ...EJEMPLO, lateralidad: 'unilateral' }],
  ['r_2', { ...EJEMPLO, r: 2 }],
  ['r_05', { ...EJEMPLO, r: 0.5, correccion: 'no' }],
  ['sin_perdidas', { ...EJEMPLO, perdidas: 0 }],
  ['con_n_dado', { ...EJEMPLO, n_dado: 100 }],
  ['extremas', { ...EJEMPLO, p1: 0.02, p2: 0.08, n_dado: 300 }],
  // Grupos iguales pero con pwr fuera de su corchete: la rama en la que la
  // página explicaba la ausencia con un motivo falso.
  ['pwr_fuera', { ...EJEMPLO, p1: 0.5, p2: 0.50001, poder: 0.9, correccion: 'no', perdidas: 0 }],
];

test('presentar() rellena todas las plantillas en español y en inglés', () => {
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const [nombre, e] of VARIANTES) {
      const donde = `${lang} · ${nombre}`;
      const p = presentar(calcular(e), e, ctx);
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas], `${donde}: orden de celdas`);
      assert.equal(p.interpretacion.length, 5, donde);
      const textos = [
        ...p.interpretacion,
        p.metodos,
        ...p.resumen.flat(),
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
      ];
      const noDefinido = ctx.fmt.num(Number.NaN);
      for (const texto of textos) {
        assert.ok(!texto.includes('{'), `${donde}: marcador sin rellenar en «${texto}»`);
        // Ninguna celda ni párrafo puede publicar el «no definido» del
        // formateador: una cifra que falta se explica con su motivo, no con un
        // hueco. Es lo que destapó el hallazgo de power.prop.test.
        assert.ok(!texto.includes(noDefinido), `${donde}: «${noDefinido}» en «${texto}»`);
      }
      assert.ok(p.metodos.includes('UDG-CA-1190'), donde);

      const g = p.grafica;
      assert.ok(g && g.tipo === 'curvas', `${donde}: la gráfica debe ser de curvas`);
      assert.equal(g.curvas.length, 1, donde);
      assert.ok(g.curvas[0].puntos.length >= 40, `${donde}: la curva necesita al menos 40 puntos`);
      assert.deepEqual(g.ejeY.dominio, [0, 1], donde);
      assert.ok(g.referenciaY && Math.abs(g.referenciaY.valor - e.poder) < 1e-15, `${donde}: falta la referencia del poder`);
      assert.ok(g.marcador && g.marcador.x === techo(calcular(e).valores.n1.valor), `${donde}: marcador en el n₁ requerido`);
      // El dominio va de n₁/4 a 2·n₁ y contiene el marcador.
      assert.ok(
        g.ejeX.dominio[0] <= (g.marcador?.x ?? 0) && (g.marcador?.x ?? 0) <= g.ejeX.dominio[1],
        `${donde}: el marcador cae fuera del eje`,
      );
      assert.ok(g.ejeX.dominio[0] >= 2, `${donde}: el eje no puede bajar de dos participantes`);
      // El poder del punto marcado alcanza el objetivo (el techo nunca lo baja).
      assert.ok((g.marcador?.valores?.poder ?? 0) >= e.poder - 1e-9, `${donde}: el marcador no alcanza el poder`);
    }
  }
});

test('la presentación del ejemplo dice lo que dice la comprobación manual', () => {
  const es = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.z_alfa.valor, '1.960');
  assert.equal(es.celdas.z_beta.valor, '0.842');
  assert.equal(es.celdas.n1_fleiss.valor, '121');
  assert.equal(es.celdas.n1_cc.valor, '134');
  assert.equal(es.celdas.n1.valor, '134');
  assert.equal(es.celdas.n2.valor, '134');
  assert.equal(es.celdas.n_total.valor, '268', 'el total es la suma de los dos grupos redondeados');
  // Con un 10 % de pérdidas: 133.47/0.9 = 148.3 → 149 por grupo.
  assert.equal(es.celdas.n_ajustado.valor, '298');
  assert.equal(es.celdas.n_ppt.valor, '121');
  assert.equal(es.celdas.h_cohen.valor, '-0.364');
  assert.equal(es.celdas.n_pwr_h.valor, '119');
  assert.equal(es.celdas.poder_dado.valor, 'No aplica');
  // El detalle lleva dos decimales (convenio del grupo `muestra`): con uno solo,
  // el exacto coincidiría con el techo y no explicaría nada.
  assert.ok(es.celdas.n1_cc.nota?.includes('133.47'), es.celdas.n1_cc.nota);
  assert.ok(es.celdas.n1_fleiss.nota?.includes('120.47'), es.celdas.n1_fleiss.nota);
  assert.ok(es.celdas.n_total.nota?.includes('266.94'), es.celdas.n_total.nota);
  assert.ok(es.celdas.n_ajustado.nota?.includes('296.61'), es.celdas.n_ajustado.nota);
  assert.ok(es.celdas.n_ppt.nota?.includes('120.47'), es.celdas.n_ppt.nota);

  assert.ok(es.interpretacion[0].includes('134') && es.interpretacion[0].includes('268'), es.interpretacion[0]);
  assert.ok(es.interpretacion[0].includes(`70.0${PCT}`), es.interpretacion[0]);
  assert.ok(es.interpretacion[1].includes('Fisher') && es.interpretacion[1].includes('121'), es.interpretacion[1]);
  assert.ok(es.interpretacion[2].includes('power.prop.test'), es.interpretacion[2]);
  assert.ok(es.interpretacion[3].includes('298'), es.interpretacion[3]);
  assert.ok(es.interpretacion[4].includes('participantes disponibles'), es.interpretacion[4]);
  // El párrafo de Métodos cita a Fleiss, Tytun y Ury y a Lwanga y Lemeshow.
  assert.ok(es.metodos.includes('[1,2]') && es.metodos.includes('[7]'), es.metodos);

  const en = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.n_total.valor, '268');
  assert.equal(en.celdas.poder_dado.valor, 'Not applicable');
  assert.ok(en.interpretacion[0].includes('70.0%'), en.interpretacion[0]);
  assert.ok(en.metodos.includes('[1,2]') && en.metodos.includes('[7]'), en.metodos);
});

test('por debajo de un participante el detalle pasa a tres cifras significativas', () => {
  // Único camino a esa rama del formato: un efecto descomunal en los extremos
  // del rango admitido (α máxima, poder mínimo), que deja n₁ por debajo de 1.
  const e: EntradasMuestraDosProporciones = {
    ...EJEMPLO,
    p1: 0.001,
    p2: 0.999,
    alfa: 0.2,
    poder: 0.5,
    correccion: 'no',
    perdidas: 0,
  };
  assert.equal(definicion.validar(e), null, 'el diseño está dentro de los rangos declarados');
  const s = calcular(e);
  assert.ok(s.valores.n1_fleiss.valor < 1, `n₁ = ${s.valores.n1_fleiss.valor}`);
  const es = presentar(s, e, contextoDePrueba(SLUG, 'es'));
  assert.ok(es.celdas.n1_fleiss.nota?.includes('0.824'), es.celdas.n1_fleiss.nota);
  // El total sí pasa de 1, así que vuelve a los dos decimales.
  assert.ok(es.celdas.n_total.nota?.includes('1.65'), es.celdas.n_total.nota);
  assert.equal(es.celdas.n1_fleiss.valor, '1', 'el titular sigue siendo el techo');
});

test('sin corrección de continuidad cambia la cifra reportada y el párrafo de Métodos', () => {
  const e: EntradasMuestraDosProporciones = { ...EJEMPLO, correccion: 'no' };
  const es = presentar(calcular(e), e, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.n1.valor, '121');
  assert.equal(es.celdas.n_total.valor, '242');
  assert.ok(es.interpretacion[1].includes('Pearson'), es.interpretacion[1]);
  // Cita la complementaria de Casagrande, Pike y Smith en vez de la de 1980.
  assert.ok(es.metodos.includes('[2,3]'), es.metodos);
  const en = presentar(calcular(e), e, contextoDePrueba(SLUG, 'en'));
  assert.ok(en.interpretacion[1].includes("Pearson's chi-squared"), en.interpretacion[1]);
});

test('con r ≠ 1 la interpretación explica por qué no hay comparación con R', () => {
  const e: EntradasMuestraDosProporciones = { ...EJEMPLO, r: 2 };
  for (const lang of IDIOMAS) {
    const p = presentar(calcular(e), e, contextoDePrueba(SLUG, lang));
    assert.equal(p.celdas.n_ppt.valor, lang === 'es' ? 'No aplica' : 'Not applicable');
    assert.equal(p.celdas.n_pwr_h.valor, lang === 'es' ? 'No aplica' : 'Not applicable');
    assert.ok(p.interpretacion[2].includes('pwr'), p.interpretacion[2]);
    assert.ok(p.avisos.includes('r_distinto'), lang);
    // n₂ dobla a n₁ y el total los suma ya redondeados.
    assert.equal(p.celdas.n1.valor, '97');
    assert.equal(p.celdas.n2.valor, '194');
    assert.equal(p.celdas.n_total.valor, '291');
  }
});

test('cuando falta una comparación, la celda da el motivo real y no el de los grupos', () => {
  const FUERA: EntradasMuestraDosProporciones = {
    ...EJEMPLO,
    p1: 0.5,
    p2: 0.50001,
    poder: 0.9,
    correccion: 'no',
    perdidas: 0,
  };
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    const { nota_comparacion: porGrupos, nota_sin_solucion: porRango, no_aplica: noAplica } = ctx.textos.etiquetas;
    assert.notEqual(porGrupos, porRango, `${lang}: los dos motivos deben ser rótulos distintos`);

    // r ≠ 1: las dos faltan, y el motivo son los grupos desiguales.
    const desigual: EntradasMuestraDosProporciones = { ...EJEMPLO, r: 2 };
    const d = presentar(calcular(desigual), desigual, ctx);
    assert.equal(d.celdas.n_ppt.nota, porGrupos, lang);
    assert.equal(d.celdas.n_pwr_h.nota, porGrupos, lang);

    // r = 1 con n ≈ 5.25e10: power.prop.test llega estirando el corchete, pwr no.
    const s = calcular(FUERA);
    assert.ok(Number.isFinite(s.valores.n_ppt.valor), `${lang}: power.prop.test sí debe resolver`);
    assert.ok(Number.isNaN(s.valores.n_pwr_h.valor), `${lang}: pwr se queda fuera de su corchete`);
    const f = presentar(s, FUERA, ctx);
    assert.ok(f.celdas.n_ppt.nota?.startsWith(porGrupos), f.celdas.n_ppt.nota);
    assert.equal(f.celdas.n_pwr_h.valor, noAplica, lang);
    assert.equal(f.celdas.n_pwr_h.nota, porRango, `${lang}: los grupos SÍ son iguales aquí`);
    assert.equal(s.bandas.comparacion, 'sin_solucion', lang);
    // El párrafo tampoco puede decir que R «devuelve no definido».
    assert.ok(!f.interpretacion[2].includes(ctx.fmt.num(Number.NaN)), f.interpretacion[2]);
    assert.ok(f.interpretacion[2].includes('pwr'), f.interpretacion[2]);
  }
});

test('las ecuaciones no fijan la lateralidad ni esconden el techo del ajuste', () => {
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    const porId = (id: string) => {
      const ec = ctx.textos.ecuaciones.find((x) => x.id === id);
      assert.ok(ec, `${lang}: falta la ecuación ${id}`);
      return ec;
    };
    // La celda publica 1.645 con α = 0.05 unilateral: la ecuación no puede
    // afirmar α/2. Se escribe α/k y k se define en los símbolos.
    for (const id of ['fleiss', 'poder_inverso', 'h_cohen']) {
      const ec = porId(id);
      assert.ok(ec.tex.includes('z_{1-\\alpha/k}'), `${lang}/${id}: ${ec.tex}`);
      assert.ok(!ec.tex.includes('\\alpha/2'), `${lang}/${id} sigue fijando el contraste bilateral`);
      assert.ok(
        ec.simbolos.some((sim) => sim.s === 'k'),
        `${lang}/${id}: k debe estar definido junto a la ecuación que lo usa`,
      );
    }
    // El ajuste por pérdidas lleva el techo explícito, y por grupo, que es lo
    // que hace la tabla.
    const ajuste = porId('ajuste_perdidas');
    assert.ok(ajuste.tex.includes('\\lceil') && ajuste.tex.includes('\\rceil'), ajuste.tex);
    assert.equal((ajuste.tex.match(/\\lceil/g) ?? []).length, 2, 'un techo por grupo');
  }
});

test('una h de Cohen diminuta no se imprime como cero', () => {
  // Con 0.50 frente a 0.5001 la h vale −0.0002: a tres decimales se publicaba
  // «0.000», un efecto nulo junto a un tamaño de muestra de 392 millones.
  const e: EntradasMuestraDosProporciones = { ...EJEMPLO, p1: 0.5, p2: 0.5001, perdidas: 0 };
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    const p = presentar(calcular(e), e, ctx);
    assert.notEqual(p.celdas.h_cohen.valor, '0.000', lang);
    assert.equal(p.celdas.h_cohen.valor, '-0.0002', lang);
    assert.ok(p.interpretacion[2].includes('-0.0002'), p.interpretacion[2]);
  }
  // Los valores corrientes conservan los tres decimales de siempre.
  const es = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.h_cohen.valor, '-0.364');
});

test('la prueba unilateral baja el tamaño y lo dice en el aviso', () => {
  const e: EntradasMuestraDosProporciones = { ...EJEMPLO, lateralidad: 'unilateral' };
  const es = presentar(calcular(e), e, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.z_alfa.valor, '1.645');
  assert.equal(es.celdas.n1.valor, '108');
  assert.ok(es.interpretacion[0].includes('unilateral'), es.interpretacion[0]);
  assert.ok(es.avisos.includes('unilateral'));
  assert.ok(es.metodos.includes('unilateral'), es.metodos);
  const en = presentar(calcular(e), e, contextoDePrueba(SLUG, 'en'));
  assert.ok(en.interpretacion[0].includes('one-sided'), en.interpretacion[0]);
});

test('el modo inverso reporta el poder alcanzable con los participantes disponibles', () => {
  const e: EntradasMuestraDosProporciones = { ...EJEMPLO, n_dado: 100 };
  const es = presentar(calcular(e), e, contextoDePrueba(SLUG, 'es'));
  // 100 por grupo quedan por debajo de los 121 de Fleiss: el poder baja de 0.80.
  assert.equal(es.celdas.poder_dado.valor, `72.2${PCT}`);
  assert.ok(es.interpretacion[4].includes('100'), es.interpretacion[4]);
  assert.ok(es.interpretacion[4].includes(`72.2${PCT}`), es.interpretacion[4]);

  // Con r = 2 el segundo grupo es el doble, y así lo dice la frase.
  const desigual: EntradasMuestraDosProporciones = { ...EJEMPLO, r: 2, n_dado: 60 };
  const dos = presentar(calcular(desigual), desigual, contextoDePrueba(SLUG, 'es'));
  assert.ok(dos.interpretacion[4].includes('60') && dos.interpretacion[4].includes('120'), dos.interpretacion[4]);
});

test('la gráfica dibuja la curva de poder de n₁/4 a 2·n₁ con el objetivo de referencia', () => {
  const ctx = contextoDePrueba(SLUG, 'es');
  const s = calcular(EJEMPLO);
  const g = grafica(s, EJEMPLO, ctx);
  assert.ok(g && g.tipo === 'curvas');
  const n1 = s.valores.n1.valor;
  assert.ok(Math.abs(g.ejeX.dominio[0] - n1 / 4) < 1e-9, `desde = ${g.ejeX.dominio[0]}`);
  assert.ok(Math.abs(g.ejeX.dominio[1] - 2 * n1) < 1e-9, `hasta = ${g.ejeX.dominio[1]}`);
  assert.equal(g.referenciaY?.valor, 0.8);
  assert.ok(g.referenciaY?.etiqueta?.includes(`80${PCT}`), g.referenciaY?.etiqueta);
  // La curva es monótona creciente y pasa por el poder objetivo dentro del tramo.
  const ys = g.curvas[0].puntos.map((p) => p[1]);
  for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i] > ys[i - 1], `la curva baja en el punto ${i}`);
  assert.ok(ys[0] < 0.8 && ys[ys.length - 1] > 0.8, `la curva no cruza el poder objetivo (${ys[0]}, ${ys[ys.length - 1]})`);
});

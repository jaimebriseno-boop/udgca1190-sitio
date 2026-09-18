/**
 * Calculadora «Tamaño de muestra para comparar dos medias independientes»
 * contra el oráculo R y sus propiedades.
 *
 *   node --test tests/bioestadistica/muestra-dos-medias.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo muestra-dos-medias`. Se comprueba
 * (1) que las doce salidas coinciden con las de R caso por caso, incluidos los
 * `NA` del modo inverso apagado y de `power.t.test` cuando r ≠ 1; (2) que el
 * snippet ejecutado es, byte a byte, el que ve el usuario; (3) que la solución
 * exacta de la t no central y la aproximación normal de Guenther no se separan
 * más de dos participantes por grupo; y (4) las monotonías del poder, el
 * contrato de `validar()` y la presentación completa en los dos idiomas.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { LATERALIDADES, techo } from '../../src/lib/bioestadistica/metodos/muestra-comun.ts';
import type { Lateralidad } from '../../src/lib/bioestadistica/metodos/muestra-comun.ts';
import {
  n1DosMedias,
  n1NormalDosMedias,
  nPowerTTestDosMuestras,
  poderDosMedias,
} from '../../src/lib/bioestadistica/metodos/muestra-medias.ts';
import { calcular, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/muestra-dos-medias.ts';
import type { EntradasMuestraDosMedias } from '../../src/lib/bioestadistica/calculadoras/muestra-dos-medias.ts';
import type { Entradas, Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'muestra-dos-medias';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const IDIOMAS: readonly Lang[] = ['es', 'en'];

const EJEMPLO: EntradasMuestraDosMedias = {
  delta: 1,
  sigma: 3,
  alfa: 0.05,
  lateralidad: 'bilateral',
  poder: 0.8,
  r: 1,
  perdidas: 0.1,
  n_dado: 0,
};

/**
 * Ajustes al ejemplo. `Partial<EntradasMuestraDosMedias>` volvería opcional
 * también la firma de índice que hereda de `Entradas`, y el resultado del
 * spread dejaría de ser asignable; nombrar los campos evita ese borde.
 */
type AjustesDosMedias = Partial<
  Pick<EntradasMuestraDosMedias, 'delta' | 'sigma' | 'alfa' | 'lateralidad' | 'poder' | 'r' | 'perdidas' | 'n_dado'>
>;

function entradasDe(caso: CasoFixture): EntradasMuestraDosMedias {
  return conDerivadas(definicion, caso.entradas) as EntradasMuestraDosMedias;
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
  assert.equal(fixture.casos.length, 16);
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

test('R devuelve NA donde la calculadora dice «no aplica»: power.t.test con r ≠ 1 y el modo inverso apagado', () => {
  const porId = (id: string): Record<string, unknown> => {
    const c = fixture.casos.find((x) => x.id === id);
    assert.ok(c, `falta el caso ${id} en el fixture`);
    return normalizarR(c.esperado) as Record<string, unknown>;
  };
  // Grupos desiguales: power.t.test no cubre el caso y el snippet lo dice con NA_real_.
  assert.equal(porId('r_2').n_ptt, null);
  assert.equal(porId('r_05').n_ptt, null);
  assert.ok(typeof porId('ejemplo').n_ptt === 'number');
  // Sin n dado no hay poder inverso ni en TypeScript ni en R.
  assert.equal(porId('ejemplo').poder_dado, null);
  assert.equal(porId('ejemplo').poder_dado_normal, null);
  const ts = calcular(EJEMPLO);
  assert.ok(Number.isNaN(ts.valores.poder_dado.valor) && Number.isNaN(ts.valores.poder_dado_normal.valor));
});

test('el objetivo de reclutamiento suma los techos por grupo, no redondea la suma', () => {
  const e: EntradasMuestraDosMedias = { ...EJEMPLO, perdidas: 0.1 };
  const s = calcular(e);
  const porGrupo = techo(s.valores.n1.valor / 0.9);
  assert.equal(porGrupo, 159, 'cada grupo ajustado: 142.2466/0.9 = 158.05 → 159');
  assert.equal(techo(s.valores.n_ajustado.valor), 317, 'el techo de la suma se quedaría corto');
  const es = presentar(s, e, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.n_ajustado.valor, '318', 'el titular recluta 159 + 159');
  // El crudo no se toca: sigue siendo n_total/(1 − L), idéntico al de R.
  assert.ok(Math.abs(s.valores.n_ajustado.valor - 316.103546320837) < 1e-9);
  assert.ok(es.celdas.n_ajustado.nota?.includes('316.10'), es.celdas.n_ajustado.nota);
  // Con r ≠ 1 los dos grupos se ajustan por separado igual que se calculan.
  const dos: EntradasMuestraDosMedias = { ...EJEMPLO, r: 2, perdidas: 0.2 };
  const sd = calcular(dos);
  const esperado = techo(sd.valores.n1.valor / 0.8) + techo(sd.valores.n2.valor / 0.8);
  assert.equal(presentar(sd, dos, contextoDePrueba(SLUG, 'es')).celdas.n_ajustado.valor, String(esperado));
});

test('power.t.test lleva las mismas dos guardas que la ecuación general', () => {
  const porId = (id: string): Record<string, unknown> => {
    const c = fixture.casos.find((x) => x.id === id);
    assert.ok(c, `falta el caso ${id} en el fixture`);
    return normalizarR(c.esperado) as Record<string, unknown>;
  };
  // Efecto ridículo: ni con 1e7 por grupo se alcanza el poder. Sin guarda, R
  // extendía el corchete y devolvía 21655135.05 donde TypeScript decía «no definido».
  assert.equal(porId('sigma_enorme').n1, null);
  assert.equal(porId('sigma_enorme').n_ptt, null);
  const enorme = calcular({ ...EJEMPLO, delta: 1, sigma: 1000, perdidas: 0 });
  assert.ok(Number.isNaN(enorme.valores.n1.valor) && Number.isNaN(enorme.valores.n_ptt.valor));

  // Efecto descomunal: con dos por grupo ya sobra poder. Sin guarda, R bajaba a 1.000770.
  assert.equal(porId('efecto_enorme').n1, 2);
  assert.equal(porId('efecto_enorme').n_ptt, 2);
  const minimo = calcular({ delta: 1000, sigma: 0.001, alfa: 0.2, lateralidad: 'unilateral', poder: 0.5, r: 1, perdidas: 0, n_dado: 0 });
  assert.equal(minimo.valores.n1.valor, 2);
  assert.equal(minimo.valores.n_ptt.valor, 2);

  // Con r = 1 un diseño irresoluble se lee «no definido», como n₁; «no aplica»
  // queda reservado a los grupos desiguales, que es cuando power.t.test no cubre el caso.
  const ctx = contextoDePrueba(SLUG, 'es');
  const sinSolucion: EntradasMuestraDosMedias = { ...EJEMPLO, delta: 1, sigma: 1000, perdidas: 0 };
  const pSin = presentar(calcular(sinSolucion), sinSolucion, ctx);
  assert.equal(pSin.celdas.n_ptt.valor, 'no definido');
  assert.equal(pSin.celdas.n_ptt.valor, pSin.celdas.n1.valor);
  assert.equal(pSin.celdas.n_ptt.nota, undefined);
  const desiguales: EntradasMuestraDosMedias = { ...EJEMPLO, r: 2 };
  const pDes = presentar(calcular(desiguales), desiguales, ctx);
  assert.equal(pDes.celdas.n_ptt.valor, 'no aplica');
  assert.equal(pDes.celdas.n_ptt.nota, ctx.textos.etiquetas.solo_r1);
});

test('el signo de la diferencia no cambia ninguna salida', () => {
  const positiva = fixture.casos.find((c) => c.id === 'ejemplo');
  const negativa = fixture.casos.find((c) => c.id === 'delta_negativa');
  assert.ok(positiva && negativa);
  assert.deepEqual(negativa.esperado, positiva.esperado, 'R debería dar lo mismo con Δ y con −Δ');
  const ts = calcular({ ...EJEMPLO, delta: -1 });
  assert.deepEqual(ts.valores, calcular(EJEMPLO).valores);
});

// ---------------------------------------------------------------------------
// Propiedades de la solución exacta
// ---------------------------------------------------------------------------

/** Rejilla razonable de diseños: efectos de 0.2 a 1.5 desviaciones, ambos poderes y ambas colas. */
function* disenos(): Generator<{ delta: number; sigma: number; alfa: number; lateralidad: Lateralidad; poder: number; r: number }> {
  for (const delta of [0.2, 0.5, 1, 3]) {
    for (const sigma of [1, 3]) {
      for (const alfa of [0.01, 0.05]) {
        for (const lateralidad of LATERALIDADES) {
          for (const poder of [0.8, 0.9]) {
            for (const r of [1, 2]) yield { delta, sigma, alfa, lateralidad, poder, r };
          }
        }
      }
    }
  }
}

test('la solución exacta y la aproximación normal de Guenther no se separan más de dos por grupo', () => {
  for (const d of disenos()) {
    const exacta = n1DosMedias(d.delta, d.sigma, d.alfa, d.lateralidad, d.poder, d.r);
    const normal = n1NormalDosMedias(d.delta, d.sigma, d.alfa, d.lateralidad, d.poder, d.r);
    const donde = JSON.stringify(d);
    assert.ok(Number.isFinite(exacta) && exacta >= 2, `${donde}: n1 exacta no es un tamaño de muestra`);
    assert.ok(exacta >= normal - 2 && exacta <= normal + 2, `${donde}: exacta ${exacta} vs normal ${normal}`);
  }
});

test('el poder que alcanza la n exacta es justo el poder pedido, y crece con n', () => {
  for (const d of disenos()) {
    const n1 = n1DosMedias(d.delta, d.sigma, d.alfa, d.lateralidad, d.poder, d.r);
    const donde = JSON.stringify(d);
    const enN = poderDosMedias(n1, d.delta, d.sigma, d.alfa, d.lateralidad, d.r);
    if (n1 > 2) {
      assert.ok(Math.abs(enN - d.poder) < 1e-8, `${donde}: poder en n = ${enN}, se pedía ${d.poder}`);
    } else {
      // El mínimo del corchete: con dos por grupo ya se supera el objetivo y la
      // respuesta se queda en 2 en vez de bajar a un tamaño de muestra imposible.
      assert.ok(enN >= d.poder, `${donde}: n quedó en el mínimo con poder ${enN} < ${d.poder}`);
    }
    // Monotonía: el techo alcanza el objetivo y el entero anterior se queda corto.
    const arriba = techo(n1);
    assert.ok(
      poderDosMedias(arriba, d.delta, d.sigma, d.alfa, d.lateralidad, d.r) >= d.poder - 1e-9,
      `${donde}: el techo ${arriba} no alcanza el poder`,
    );
    const abajo = arriba - 1;
    if (abajo >= 2) {
      assert.ok(
        poderDosMedias(abajo, d.delta, d.sigma, d.alfa, d.lateralidad, d.r) < d.poder,
        `${donde}: con ${abajo} por grupo ya se alcanzaba el poder`,
      );
    }
  }
});

test('n crece con el poder y decrece con la magnitud de la diferencia', () => {
  for (const r of [1, 2]) {
    for (const lateralidad of LATERALIDADES) {
      let previa = Infinity;
      for (const poder of [0.5, 0.7, 0.8, 0.9, 0.95, 0.99]) {
        const n = n1DosMedias(1, 3, 0.05, lateralidad, poder, r);
        assert.ok(n > previa || previa === Infinity, `poder ${poder}: n = ${n} no creció`);
        previa = n;
      }
      let anterior = -Infinity;
      for (const delta of [3, 2, 1, 0.5, 0.25]) {
        const n = n1DosMedias(delta, 3, 0.05, lateralidad, 0.8, r);
        assert.ok(n > anterior, `Δ = ${delta}: n = ${n} no creció al reducir la diferencia`);
        anterior = n;
      }
    }
  }
});

// Ojo con el nombre: esto NO valida contra R, compara dos funciones de
// TypeScript entre sí (la ecuación general con r y la réplica de la
// parametrización de `power.t.test`). Quien valida contra R es el fixture.
test('con grupos iguales, la ecuación general y la réplica de power.t.test dan el mismo n en TypeScript', () => {
  for (const d of disenos()) {
    if (d.r !== 1) continue;
    const general = n1DosMedias(d.delta, d.sigma, d.alfa, d.lateralidad, d.poder, 1);
    const ptt = nPowerTTestDosMuestras(d.delta, d.sigma, d.alfa, d.lateralidad, d.poder);
    assert.ok(Math.abs(general - ptt) < 1e-6, `${JSON.stringify(d)}: general ${general} vs power.t.test ${ptt}`);
    assert.equal(techo(general), techo(ptt), `${JSON.stringify(d)}: el techo difiere`);
  }
});

test('un efecto que ya se detecta con dos por grupo no devuelve un tamaño menor que dos', () => {
  // Con Δ/σ enorme, R extendería el intervalo por debajo de 2 (extendInt = "upX");
  // el snippet y TypeScript llevan la misma guarda y se quedan en el mínimo.
  const n = n1DosMedias(100, 1, 0.2, 'unilateral', 0.5, 1);
  assert.equal(n, 2);
});

// ---------------------------------------------------------------------------
// Contrato de interfaz: derivar, validar, bandas, avisos y presentación
// ---------------------------------------------------------------------------

test('derivar() completa las dos entradas opcionales con el valor que el snippet espera', () => {
  const sinOpcionales: Entradas = { delta: 1, sigma: 3, alfa: 0.05, lateralidad: 'bilateral', poder: 0.8, r: 1 };
  const e = conDerivadas(definicion, sinOpcionales) as EntradasMuestraDosMedias;
  assert.equal(e.perdidas, 0, 'sin pérdidas capturadas no se ajusta nada');
  assert.equal(e.n_dado, 0, '0 es el «modo inverso apagado» que el snippet lee como NA');
  assert.equal(definicion.validar(e), null);
  const s = calcular(e);
  assert.equal(s.bandas.inverso, 'sin');
  assert.ok(Number.isNaN(s.valores.poder_dado.valor));
  assert.equal(s.valores.n_ajustado.valor, s.valores.n_total.valor, 'sin pérdidas el ajuste es la identidad');
  // Un valor ya capturado no se toca.
  const conValores = conDerivadas(definicion, { ...sinOpcionales, perdidas: 0.2, n_dado: 50 }) as EntradasMuestraDosMedias;
  assert.equal(conValores.perdidas, 0.2);
  assert.equal(conValores.n_dado, 50);
});

test('validar() acepta el ejemplo y reclama cada entrada fuera de contrato', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, delta: 0 }), { delta: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sigma: 0 }), { sigma: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sigma: -1 }), { sigma: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, alfa: 0.0005 }), { alfa: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, alfa: 0.25 }), { alfa: 'err_max' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, lateralidad: 'ambas' }), { lateralidad: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, poder: 0.4 }), { poder: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, poder: 0.995 }), { poder: 'err_max' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, r: 0.05 }), { r: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, r: 11 }), { r: 'err_max' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, perdidas: 0.6 }), { perdidas: 'err_max' });
  // 0 y 1 son la misma cosa, «sin modo inverso»: con uno solo no hay varianza que estimar.
  assert.equal(definicion.validar({ ...EJEMPLO, n_dado: 1 }), null);
  assert.equal(calcular({ ...EJEMPLO, n_dado: 1 }).bandas.inverso, 'sin');
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: -4 }), { n_dado: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: 12.5 }), { n_dado: 'err_entero' });
  assert.equal(definicion.validar({ ...EJEMPLO, n_dado: 2 }), null, 'dos por grupo es el mínimo admitido');
  // El cálculo nunca corre con entradas imposibles.
  assert.throws(() => calcular({ ...EJEMPLO, alfa: 0.5 }), RangeError);
  assert.throws(() => calcular({ ...EJEMPLO, poder: 0.2 }), RangeError);
  assert.throws(() => calcular({ ...EJEMPLO, sigma: 0 }), RangeError);
});

test('bandas y avisos: supuestos siempre, y n pequeño, unilateral, r ≠ 1 y efecto enorme cuando toca', () => {
  const ej = calcular(EJEMPLO);
  assert.deepEqual(ej.bandas, { lateralidad: 'bilateral', r: 'r1', perdidas: 'con', inverso: 'sin' });
  assert.deepEqual(ej.avisos.map((a) => a.codigo), ['supuestos']);

  const chico = calcular({ ...EJEMPLO, delta: 5, sigma: 3 });
  const nPequeno = chico.avisos.find((a) => a.codigo === 'n_pequeno');
  assert.deepEqual(nPequeno?.params, { n1: 7 });

  const uni = calcular({ ...EJEMPLO, lateralidad: 'unilateral' });
  assert.equal(uni.bandas.lateralidad, 'unilateral');
  assert.ok(uni.avisos.some((a) => a.codigo === 'unilateral'));

  const dos = calcular({ ...EJEMPLO, r: 2 });
  assert.equal(dos.bandas.r, 'r');
  assert.deepEqual(dos.avisos.find((a) => a.codigo === 'r_distinto')?.params, { r: 2 });
  assert.ok(Number.isNaN(dos.valores.n_ptt.valor), 'con r ≠ 1 power.t.test no aplica');

  const enorme = calcular({ ...EJEMPLO, delta: 10, sigma: 3 });
  assert.ok(enorme.avisos.some((a) => a.codigo === 'delta_grande'));

  const sinPerdidas = calcular({ ...EJEMPLO, perdidas: 0 });
  assert.equal(sinPerdidas.bandas.perdidas, 'sin');
  const inverso = calcular({ ...EJEMPLO, n_dado: 100 });
  assert.equal(inverso.bandas.inverso, 'con');
});

test('presentar() rellena todas las plantillas en español e inglés para cada combinación de bandas', () => {
  const variantes: AjustesDosMedias[] = [
    {},
    { lateralidad: 'unilateral' },
    { r: 2 },
    { r: 0.5 },
    { perdidas: 0 },
    { perdidas: 0.5 },
    { n_dado: 100 },
    { n_dado: 2 },
    { delta: -1 },
    { delta: 5, sigma: 3 },
    { delta: 0.2, sigma: 1 },
    { poder: 0.99, alfa: 0.001 },
    { r: 2, n_dado: 80, perdidas: 0.2, lateralidad: 'unilateral' },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const parcial of variantes) {
      const e: EntradasMuestraDosMedias = { ...EJEMPLO, ...parcial };
      const donde = `${lang} · ${JSON.stringify(e)}`;
      const p = presentar(calcular(e), e, ctx);
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas], donde);
      const textos = [
        ...p.interpretacion,
        p.metodos,
        ...p.resumen.flat(),
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
      ];
      for (const texto of textos) assert.ok(!texto.includes('{'), `${donde}: marcador sin rellenar en «${texto}»`);
      assert.equal(p.interpretacion.length, 5, donde);
      assert.ok(p.avisos.includes('supuestos'), donde);
      const g = p.grafica;
      assert.ok(g && g.tipo === 'curvas', `${donde}: la gráfica debe ser de curvas`);
      assert.equal(g.curvas.length, 1, donde);
      assert.ok(g.curvas[0].puntos.length >= 40, `${donde}: la curva necesita al menos 40 puntos`);
      assert.ok(g.curvas[0].puntos.every(([x]) => x >= 2), `${donde}: la curva baja de dos por grupo`);
      assert.ok(g.referenciaY && Math.abs(g.referenciaY.valor - e.poder) < 1e-12, `${donde}: falta la línea del poder objetivo`);
      assert.ok(g.marcador && g.marcador.x === techo(calcular(e).valores.n1.valor), `${donde}: el marcador no está en el n elegido`);
    }
  }
});

test('la presentación del ejemplo dice lo que dice la comprobación manual', () => {
  const es = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  // power.t.test(delta = 1, sd = 3, power = 0.8)$n = 142.2466 → 143 por grupo.
  assert.equal(es.celdas.n1.valor, '143');
  assert.equal(es.celdas.n2.valor, '143');
  assert.equal(es.celdas.n_total.valor, '286');
  assert.equal(es.celdas.n_ptt.valor, '143');
  assert.equal(es.celdas.n1_normal.valor, '143');
  assert.equal(es.celdas.z_alfa.valor, '1.960');
  assert.equal(es.celdas.z_beta.valor, '0.842');
  assert.equal(es.celdas.d_cohen.valor, '0.333');
  assert.equal(es.celdas.poder_dado.valor, 'no aplica');
  assert.ok(es.celdas.n1.nota?.includes('142.25'), es.celdas.n1.nota);
  assert.ok(es.celdas.n_total.nota?.includes('284.49'), es.celdas.n_total.nota);
  assert.ok(es.celdas.n_ajustado.nota?.includes('316.10'), es.celdas.n_ajustado.nota);
  // El ajuste por pérdidas también se redondea POR GRUPO: 142.2466/0.9 = 158.05
  // → 159 en cada grupo, 318 a reclutar. El techo de la suma (317) dejaría a un
  // grupo con 142.2 tras las pérdidas, por debajo de los 143 que exige el cálculo.
  assert.equal(es.celdas.n_ajustado.valor, '318');
  assert.ok(es.interpretacion[0].includes('143') && es.interpretacion[0].includes('286'), es.interpretacion[0]);
  assert.ok(es.interpretacion[2].includes('power.t.test'), es.interpretacion[2]);
  assert.ok(es.interpretacion[3].includes('318') && es.interpretacion[3].includes('159'), es.interpretacion[3]);
  assert.ok(es.metodos.includes('UDG-CA-1190') && es.metodos.includes('[1]'), es.metodos);

  const en = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.n1.valor, '143');
  assert.ok(en.celdas.poder_dado.valor === 'not applicable', en.celdas.poder_dado.valor);
  assert.ok(en.interpretacion[0].includes("Cohen's d"), en.interpretacion[0]);
});

test('el modo inverso reporta el poder exacto y el aproximado, y el exacto es el que manda', () => {
  const e: EntradasMuestraDosMedias = { ...EJEMPLO, n_dado: 100, perdidas: 0 };
  const s = calcular(e);
  // Con 100 por grupo, por debajo de los 143 que exige el objetivo, el poder baja de 0.80.
  assert.ok(s.valores.poder_dado.valor < 0.8, `poder = ${s.valores.poder_dado.valor}`);
  assert.ok(Math.abs(s.valores.poder_dado.valor - 0.650108691364332) < 1e-9);
  assert.ok(Math.abs(s.valores.poder_dado_normal.valor - 0.654337883048977) < 1e-9);
  const es = presentar(s, e, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.poder_dado.valor, '65.0 %'.replace(' ', ' '));
  assert.ok(es.interpretacion[4].includes('100'), es.interpretacion[4]);

  // Con el techo del cálculo, el poder alcanzado supera el objetivo.
  const justo: EntradasMuestraDosMedias = { ...EJEMPLO, n_dado: techo(s.valores.n1.valor) };
  assert.ok(calcular(justo).valores.poder_dado.valor >= 0.8 - 1e-9);
});

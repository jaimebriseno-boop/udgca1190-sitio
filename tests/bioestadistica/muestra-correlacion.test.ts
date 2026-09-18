/**
 * Calculadora «Muestra para una correlación» (z de Fisher) contra el oráculo R
 * y sus propiedades.
 *
 *   node --test tests/bioestadistica/muestra-correlacion.test.ts
 *
 * Consume los fixtures commiteados (`node scripts/bio-fixtures.mjs --solo
 * muestra-correlacion`). El caso interesante es `n_pwr`: TypeScript no imita la
 * fórmula de `pwr::pwr.r.test`, sino su ejecución —el mismo `p.body`, el mismo
 * corchete `[4 + 1e-10, 1e9]` y el `uniroot` de R con su tolerancia por
 * omisión—, así que el perfil `potencia` (1e-6) es una red, no el objetivo.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { techo } from '../../src/lib/bioestadistica/metodos/muestra-comun.ts';
import {
  N_MINIMO_CORRELACION,
  alternativaDe,
  muestraCorrelacion,
  nPwrCorrelacion,
  poderClasico,
  potenciaPwr,
  tsideDe,
  zFisher,
} from '../../src/lib/bioestadistica/metodos/muestra-correlacion.ts';
import type { DisenoCorrelacion } from '../../src/lib/bioestadistica/metodos/muestra-correlacion.ts';
import { calcular, definicion, grafica, presentar } from '../../src/lib/bioestadistica/calculadoras/muestra-correlacion.ts';
import type { EntradasMuestraCorrelacion } from '../../src/lib/bioestadistica/calculadoras/muestra-correlacion.ts';
import type { Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'muestra-correlacion';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-9;
const IDIOMAS: readonly Lang[] = ['es', 'en'];
const EJEMPLO: EntradasMuestraCorrelacion = {
  r: 0.3,
  alfa: 0.05,
  lateralidad: 'bilateral',
  poder: 0.8,
  perdidas: 0.1,
  n_dado: 0,
};

/** Diseño para los métodos puros (los mismos valores del ejemplo, sin pérdidas). */
const DISENO: DisenoCorrelacion = { r: 0.3, alfa: 0.05, lateralidad: 'bilateral', poder: 0.8, perdidas: 0, n_dado: 0 };

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
  assert.deepEqual(fixture.casos.map((c) => c.id), ['ejemplo', ...curados.casos.map((c) => c.id)]);
  assert.equal(fixture.casos.length, 15);
  assert.ok(fixture.meta.paquetes.pwr, 'el fixture debe registrar la versión de pwr');
  for (const curado of curados.casos) assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota`);
});

// ---------------------------------------------------------------------------
// TypeScript contra R, caso por caso
// ---------------------------------------------------------------------------

for (const caso of fixture.casos) {
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const perfil = TOL[caso.tol];
    assert.ok(perfil, `no hay perfil de tolerancia «${caso.tol}»`);
    const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraCorrelacion;
    const informe = comparar(calcular(e), normalizarR(caso.esperado) as Record<string, unknown>, perfil);
    assert.ok(informe.coincide, `${caso.id} · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`);
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), readFileSync(rutaGenerado(SLUG, caso.id), 'utf8'));
  });
}

test('sin n disponible R devuelve NA y TypeScript, NaN', () => {
  const sinN = fixture.casos.find((c) => c.id === 'ejemplo');
  assert.ok(sinN);
  assert.equal(sinN.esperado.poder_dado, 'NA');
  const ts = calcular(conDerivadas(definicion, sinN.entradas) as EntradasMuestraCorrelacion);
  assert.ok(Number.isNaN(ts.valores.poder_dado.valor));
  assert.equal(ts.bandas.inverso, 'sin');
});

// ---------------------------------------------------------------------------
// Propiedades del diseño
// ---------------------------------------------------------------------------

test('el signo de r no cambia el tamaño: n(r) = n(−r) con hipótesis bilateral', () => {
  for (const r of [0.05, 0.1, 0.3, 0.5, 0.8, 0.98]) {
    const positiva = muestraCorrelacion({ ...DISENO, r });
    const negativa = muestraCorrelacion({ ...DISENO, r: -r });
    assert.ok(Math.abs(positiva.n_clasico - negativa.n_clasico) <= EPS * positiva.n_clasico, `n clásico en r = ${r}`);
    assert.ok(Math.abs(positiva.n_pwr - negativa.n_pwr) <= 1e-6 * positiva.n_pwr, `n de pwr en r = ${r}`);
    assert.ok(Math.abs(positiva.c_fisher + negativa.c_fisher) <= EPS, `C debe cambiar de signo en r = ${r}`);
  }
  // Unilateral, el lado lo fija el signo de r y el tamaño sigue siendo el mismo.
  const arriba = muestraCorrelacion({ ...DISENO, r: 0.3, lateralidad: 'unilateral' });
  const abajo = muestraCorrelacion({ ...DISENO, r: -0.3, lateralidad: 'unilateral' });
  assert.ok(Math.abs(arriba.n_pwr - abajo.n_pwr) <= 1e-6 * arriba.n_pwr);
  assert.equal(alternativaDe(tsideDe('unilateral', 0.3)), 'greater');
  assert.equal(alternativaDe(tsideDe('unilateral', -0.3)), 'less');
  assert.equal(alternativaDe(tsideDe('bilateral', -0.3)), 'two.sided');
});

test('el tamaño decrece con |r| y crece con el poder y con la exigencia de α', () => {
  const rs = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9];
  for (let i = 1; i < rs.length; i += 1) {
    const anterior = muestraCorrelacion({ ...DISENO, r: rs[i - 1] as number });
    const actual = muestraCorrelacion({ ...DISENO, r: rs[i] as number });
    assert.ok(actual.n_clasico < anterior.n_clasico, `n no bajó al pasar de r = ${rs[i - 1]} a ${rs[i]}`);
    assert.ok(actual.n_pwr < anterior.n_pwr, `n de pwr no bajó en r = ${rs[i]}`);
  }
  assert.ok(muestraCorrelacion({ ...DISENO, poder: 0.9 }).n_clasico > muestraCorrelacion(DISENO).n_clasico);
  assert.ok(muestraCorrelacion({ ...DISENO, alfa: 0.01 }).n_clasico > muestraCorrelacion(DISENO).n_clasico);
  // Una cola concentra α y abarata el estudio.
  assert.ok(muestraCorrelacion({ ...DISENO, lateralidad: 'unilateral' }).n_clasico < muestraCorrelacion(DISENO).n_clasico);
});

test('con el n calculado (ya redondeado hacia arriba) se alcanza el poder pedido', () => {
  for (const [r, alfa, poder] of [
    [0.3, 0.05, 0.8],
    [0.1, 0.05, 0.9],
    [0.5, 0.01, 0.95],
    [0.8, 0.05, 0.8],
  ] as const) {
    const v = muestraCorrelacion({ ...DISENO, r, alfa, poder });
    const alcanzado = poderClasico(v.c_fisher, techo(v.n_clasico), v.z_alfa);
    assert.ok(alcanzado >= poder - EPS, `r ${r}: poder alcanzado ${alcanzado} < ${poder}`);
    // Y con un sujeto menos que el techo, todavía no se alcanza el objetivo.
    assert.ok(poderClasico(v.c_fisher, Math.floor(v.n_clasico), v.z_alfa) < poder + EPS, `r ${r}: el techo sobra`);
  }
});

test('la fórmula clásica y pwr.r.test se separan en menos de tres sujetos', () => {
  for (const r of [0.04, 0.1, 0.3, 0.5, 0.8, 0.98]) {
    for (const lateralidad of ['bilateral', 'unilateral'] as const) {
      for (const poder of [0.8, 0.9, 0.95]) {
        const v = muestraCorrelacion({ ...DISENO, r, lateralidad, poder });
        // Con r enorme y poder modesto pwr.r.test no tiene raíz que buscar: ese
        // caso lo cubre la prueba de abajo, no esta.
        if (Number.isNaN(v.n_pwr)) continue;
        const dif = Math.abs(v.n_pwr - v.n_clasico);
        assert.ok(dif < 3, `r ${r} ${lateralidad} poder ${poder}: difieren en ${dif}`);
        // pwr siempre pide algo menos: corrige el sesgo de C a favor del efecto.
        assert.ok(v.n_pwr < v.n_clasico, `r ${r}: pwr pidió más que la fórmula clásica`);
      }
    }
  }
});

test('la potencia de pwr crece con n y su raíz devuelve exactamente el poder pedido', () => {
  const tside = tsideDe('bilateral', 0.3);
  let previa = 0;
  for (const n of [5, 10, 30, 84, 200, 1000]) {
    const p = potenciaPwr(n, 0.3, 0.05, tside);
    assert.ok(p > previa, `la potencia no creció en n = ${n}`);
    previa = p;
  }
  for (const poder of [0.5, 0.8, 0.9, 0.99]) {
    const n = nPwrCorrelacion(0.3, 0.05, poder, tside);
    // `uniroot` para con tol ≈ 1.2e-4 en n, que en la potencia es aún menos.
    assert.ok(Math.abs(potenciaPwr(n, 0.3, 0.05, tside) - poder) <= 1e-6, `poder ${poder}: la raíz no cierra`);
  }
});

test('el poder inverso es monótono y no está definido por debajo de cuatro pares', () => {
  const c = zFisher(0.3);
  const za = muestraCorrelacion(DISENO).z_alfa;
  let previa = 0;
  for (const n of [4, 10, 50, 85, 300]) {
    const p = poderClasico(c, n, za);
    assert.ok(p > previa, `el poder no creció en n = ${n}`);
    previa = p;
  }
  assert.ok(Number.isNaN(poderClasico(c, 3, za)));
  assert.ok(Math.abs(zFisher(0.3) - 0.5 * Math.log(1.3 / 0.7)) <= EPS, 'C debe ser ½·ln((1 + r)/(1 − r))');
});

test('las entradas imposibles lanzan RangeError y validar() las reclama', () => {
  assert.throws(() => muestraCorrelacion({ ...DISENO, r: 0 }), RangeError);
  assert.throws(() => muestraCorrelacion({ ...DISENO, r: 0.99 }), RangeError);
  assert.throws(() => muestraCorrelacion({ ...DISENO, alfa: 0.5 }), RangeError);
  assert.throws(() => muestraCorrelacion({ ...DISENO, poder: 0.3 }), RangeError);
  assert.throws(() => muestraCorrelacion({ ...DISENO, perdidas: 0.8 }), RangeError);
  assert.throws(() => muestraCorrelacion({ ...DISENO, n_dado: -1 }), RangeError);
  assert.throws(() => muestraCorrelacion({ ...DISENO, n_dado: 2.5 }), RangeError);
  assert.throws(() => muestraCorrelacion({ ...DISENO, lateralidad: 'ambas' as unknown as DisenoCorrelacion['lateralidad'] }), RangeError);

  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, r: 0 }), { r: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, r: 0.99 }), { r: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, alfa: 0.5 }), { alfa: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, lateralidad: 'ambas' }), { lateralidad: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, poder: 0.3 }), { poder: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, perdidas: 0.8 }), { perdidas: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: 2.5 }), { n_dado: 'err_entero' });
  // De 1 a 3 pares es una muestra real, solo demasiado corta: la reclama el aviso, no el campo.
  assert.equal(definicion.validar({ ...EJEMPLO, n_dado: 3 }), null);
  assert.equal(definicion.validar({ ...EJEMPLO, n_dado: 1 }), null);
  assert.equal(definicion.validar({ ...EJEMPLO, n_dado: N_MINIMO_CORRELACION }), null);
});

test('derivar() convierte las pérdidas y el n ausentes en 0 y el ejemplo no cambia', () => {
  assert.deepEqual(
    definicion.derivar?.({ r: 0.3, alfa: 0.05, lateralidad: 'bilateral', poder: 0.8 } as EntradasMuestraCorrelacion),
    { perdidas: 0, n_dado: 0 },
  );
  assert.deepEqual(definicion.derivar?.(EJEMPLO), { perdidas: 0.1, n_dado: 0 });
  const parcial = calcular(
    conDerivadas(definicion, { ...EJEMPLO, perdidas: undefined, n_dado: undefined } as unknown as EntradasMuestraCorrelacion) as EntradasMuestraCorrelacion,
  );
  assert.equal(parcial.bandas.perdidas, 'sin');
  assert.equal(parcial.bandas.inverso, 'sin');
  assert.equal(parcial.valores.n_ajustado.valor, parcial.valores.n_clasico.valor);
});

// ---------------------------------------------------------------------------
// Avisos y bandas
// ---------------------------------------------------------------------------

test('cada aviso se activa solo en su situación y pwr_difiere lleva su diferencia', () => {
  const avisos = (e: EntradasMuestraCorrelacion) => calcular(e).avisos;
  const codigos = (e: EntradasMuestraCorrelacion): string[] => avisos(e).map((a) => a.codigo);
  assert.deepEqual(codigos(EJEMPLO), ['supuestos']);
  assert.ok(codigos({ ...EJEMPLO, r: 0.04 }).includes('r_pequena'));
  assert.ok(!codigos({ ...EJEMPLO, r: 0.05 }).includes('r_pequena'));
  assert.ok(codigos({ ...EJEMPLO, r: -0.04 }).includes('r_pequena'), '|r| es lo que cuenta, no el signo');
  assert.ok(codigos({ ...EJEMPLO, lateralidad: 'unilateral' }).includes('unilateral'));

  const corto = avisos({ ...EJEMPLO, n_dado: 2 }).find((a) => a.codigo === 'n_dado_corto');
  assert.ok(corto, 'con dos pares disponibles debe avisar de que la z de Fisher no está definida');
  assert.equal(corto.params?.minimo, N_MINIMO_CORRELACION);
  assert.ok(!codigos({ ...EJEMPLO, n_dado: 0 }).includes('n_dado_corto'), '0 es «no capturado», no una muestra corta');
  assert.ok(!codigos({ ...EJEMPLO, n_dado: 4 }).includes('n_dado_corto'));

  const difiere = avisos({ ...EJEMPLO, r: 0.04 }).find((a) => a.codigo === 'pwr_difiere');
  assert.ok(difiere, 'con r = 0.04 los dos techos difieren en 1');
  assert.equal(difiere.params?.dif, 1);
  assert.ok(!codigos(EJEMPLO).includes('pwr_difiere'), 'con r = 0.30 ambas rutas dan 85');
});

test('cuando pwr.r.test no tiene raíz, n_pwr es «no definido» y la comparación cambia de variante', () => {
  // Reproduce el caso del fixture `pwr_sin_solucion`: R se detiene con «f() values
  // at end points not of opposite sign» y el snippet lo devuelve como NA.
  const imposible: EntradasMuestraCorrelacion = { ...EJEMPLO, r: 0.98, lateralidad: 'unilateral', perdidas: 0 };
  const s = calcular(imposible);
  assert.ok(Number.isNaN(s.valores.n_pwr.valor));
  assert.equal(s.bandas.pwr, 'sin');
  // La fórmula clásica sí responde: es el resultado principal.
  assert.ok(Number.isFinite(s.valores.n_clasico.valor));
  // Y el aviso de discrepancia no se enciende con un valor que no existe.
  assert.ok(!s.avisos.some((a) => a.codigo === 'pwr_difiere'));
  for (const lang of IDIOMAS) {
    const p = presentar(s, imposible, contextoDePrueba(SLUG, lang));
    assert.equal(p.celdas.n_pwr.clase, 'invalida');
    for (const texto of [...p.interpretacion, p.metodos]) {
      assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      assert.ok(!texto.includes('NaN'), `${lang}: NaN crudo en «${texto}»`);
    }
  }
  const es = presentar(s, imposible, contextoDePrueba(SLUG, 'es'));
  assert.ok(es.interpretacion[1].includes('no puede resolver'), es.interpretacion[1]);
  assert.ok(es.metodos.includes('no resuelve esta combinación'), es.metodos);
  assert.equal(es.celdas.n_pwr.valor, 'no definido');
  assert.equal(presentar(s, imposible, contextoDePrueba(SLUG, 'en')).celdas.n_pwr.valor, 'not defined');
});

test('la banda «inverso» se enciende solo con cuatro pares o más', () => {
  assert.equal(calcular({ ...EJEMPLO, n_dado: 0 }).bandas.inverso, 'sin');
  assert.equal(calcular({ ...EJEMPLO, n_dado: 2 }).bandas.inverso, 'sin');
  assert.equal(calcular({ ...EJEMPLO, n_dado: 4 }).bandas.inverso, 'con');
  assert.equal(calcular({ ...EJEMPLO, n_dado: 50 }).bandas.inverso, 'con');
  assert.ok(Number.isNaN(calcular({ ...EJEMPLO, n_dado: 0 }).valores.poder_dado.valor));
  assert.ok(Number.isNaN(calcular({ ...EJEMPLO, n_dado: 2 }).valores.poder_dado.valor));
  assert.ok(calcular({ ...EJEMPLO, n_dado: 200 }).valores.poder_dado.valor > 0.8);
});

// ---------------------------------------------------------------------------
// Presentación en los dos idiomas
// ---------------------------------------------------------------------------

test('presentar() rellena todas las plantillas en ambos idiomas y la gráfica lleva la curva de poder con su referencia', () => {
  const entradas: EntradasMuestraCorrelacion[] = [
    EJEMPLO,
    { ...EJEMPLO, perdidas: 0 },
    { ...EJEMPLO, r: -0.3 },
    { ...EJEMPLO, r: 0.04 },
    { ...EJEMPLO, r: 0.98, alfa: 0.01, poder: 0.95 },
    { ...EJEMPLO, lateralidad: 'unilateral' },
    { ...EJEMPLO, n_dado: 50 },
    { ...EJEMPLO, n_dado: 4, perdidas: 0.5 },
    { ...EJEMPLO, n_dado: 2 },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const s = calcular(e);
      const p = presentar(s, e, ctx);
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas], `${lang}: las celdas no siguen el orden de salidas`);
      const textos: string[] = [
        ...p.interpretacion,
        p.metodos,
        ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']),
      ];
      for (const texto of textos) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar en «${texto}»`);
      }
      assert.equal(p.interpretacion.length, 4);
      assert.ok(p.grafica && p.grafica.tipo === 'curvas');
      if (p.grafica && p.grafica.tipo === 'curvas') {
        const g = p.grafica;
        assert.equal(g.curvas.length, 1);
        assert.equal(g.curvas[0]?.puntos.length, 61);
        for (const [, y] of g.curvas[0]?.puntos ?? []) assert.ok(y >= 0 && y <= 1, `${lang}: poder fuera de [0, 1]`);
        // De n/4 a 2n, sin bajar del mínimo que admite la z de Fisher.
        const nGrafica = Math.max(s.valores.n_clasico.valor, N_MINIMO_CORRELACION);
        assert.equal(g.ejeX.dominio[1], 2 * nGrafica);
        assert.ok(g.ejeX.dominio[0] >= N_MINIMO_CORRELACION);
        assert.equal(g.marcador?.x, nGrafica);
        // El marcador y su rótulo tienen que caer DENTRO del dominio dibujado.
        assert.ok(
          g.marcador !== undefined && g.marcador.x >= g.ejeX.dominio[0] && g.marcador.x <= g.ejeX.dominio[1],
          `${lang}: el marcador cae fuera del eje`,
        );
        assert.ok(Number.isFinite(g.marcador?.valores?.poder), `${lang}: el marcador no tiene poder definido`);
        assert.equal(g.referenciaY?.valor, e.poder);
        assert.ok((g.referenciaY?.etiqueta ?? '').length > 0, `${lang}: la referencia horizontal no lleva rótulo`);
      }
    }
  }
});

test('ningún tamaño de C7 puede caer por debajo de 1: el suelo de participantes no aplica aquí', () => {
  // C1, C2 y C6 necesitan un suelo de 1 porque su n puede salir positivo pero
  // diminuto y `techo()` lo hunde a 0. Aquí no puede pasar: n = ((z + z)/C)² + 3
  // nunca baja de 3, el ajuste por pérdidas solo lo sube, y el n de pwr sale de
  // un `uniroot` acotado por abajo en 4 + 1e-10. Este barrido lo fija.
  const extremos = {
    r: [-0.98, -0.05, -0.001, 0.001, 0.05, 0.98],
    alfa: [0.001, 0.05, 0.2],
    lateralidad: ['bilateral', 'unilateral'] as const,
    poder: [0.5, 0.8, 0.99],
    perdidas: [0, 0.5],
  };
  let combinaciones = 0;
  for (const r of extremos.r) {
    for (const alfa of extremos.alfa) {
      for (const lateralidad of extremos.lateralidad) {
        for (const poder of extremos.poder) {
          for (const perdidas of extremos.perdidas) {
            const v = muestraCorrelacion({ r, alfa, lateralidad, poder, perdidas, n_dado: 0 });
            combinaciones += 1;
            assert.ok(v.n_clasico >= 3, `r ${r} α ${alfa} poder ${poder}: n clásico ${v.n_clasico}`);
            assert.ok(v.n_ajustado >= v.n_clasico, `r ${r}: el ajuste por pérdidas no puede bajar el tamaño`);
            assert.ok(
              Number.isNaN(v.n_pwr) || v.n_pwr >= N_MINIMO_CORRELACION,
              `r ${r} α ${alfa} poder ${poder}: n de pwr ${v.n_pwr}`,
            );
            assert.ok(techo(v.n_clasico) >= 4 && techo(v.n_ajustado) >= 4);
          }
        }
      }
    }
  }
  assert.equal(combinaciones, 216);
});

test('con n por debajo de cuatro pares el marcador se queda dentro del eje', () => {
  // r = 0.90, α = 0.20 unilateral y poder 0.50 dan n = 3.33, por debajo del
  // mínimo de la z de Fisher. Antes el marcador se dibujaba a la izquierda del
  // dominio y arrastraba su rótulo fuera del lienzo del SVG.
  const flojo: EntradasMuestraCorrelacion = {
    r: 0.9,
    alfa: 0.2,
    lateralidad: 'unilateral',
    poder: 0.5,
    perdidas: 0,
    n_dado: 0,
  };
  const s = calcular(flojo);
  assert.ok(s.valores.n_clasico.valor < N_MINIMO_CORRELACION, String(s.valores.n_clasico.valor));
  for (const lang of IDIOMAS) {
    const g = grafica(s, flojo, contextoDePrueba(SLUG, lang));
    assert.ok(g && g.tipo === 'curvas');
    if (g && g.tipo === 'curvas') {
      assert.equal(g.marcador?.x, N_MINIMO_CORRELACION);
      assert.ok(g.marcador !== undefined && g.marcador.x >= g.ejeX.dominio[0] && g.marcador.x <= g.ejeX.dominio[1]);
      assert.ok(Number.isFinite(g.marcador?.valores?.poder));
      for (const [, y] of g.curvas[0]?.puntos ?? []) assert.ok(Number.isFinite(y), `${lang}: punto sin poder`);
    }
  }
  // La tabla y el texto siguen mostrando el techo del valor real, que es 4.
  const p = presentar(s, flojo, contextoDePrueba(SLUG, 'es'));
  assert.equal(p.celdas.n_clasico.valor, '4');
});

test('el ejemplo se lee igual que el cálculo manual, en español y en inglés', () => {
  const es = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.n_clasico.valor, '85');
  assert.equal(es.celdas.n_pwr.valor, '85');
  assert.equal(es.celdas.n_ajustado.valor, '95');
  assert.equal(es.celdas.c_fisher.valor, '0.3095');
  // Mismo convenio del grupo: dos decimales en el detalle y en el «exacto» del texto.
  assert.equal(es.celdas.n_clasico.nota, 'valor exacto 84.93');
  assert.equal(es.celdas.n_ajustado.nota, 'valor exacto 94.36');
  assert.ok(es.interpretacion[1].includes('84.93 pares'), es.interpretacion[1]);
  assert.equal(es.celdas.z_alfa.valor, '1.960');
  assert.equal(es.celdas.poder_dado.valor, 'sin n disponible');
  assert.ok(es.interpretacion[0].includes('85 pares'), es.interpretacion[0]);
  assert.ok(es.metodos.includes('Fisher') && es.metodos.includes('pwr.r.test'), es.metodos);

  const conN: EntradasMuestraCorrelacion = { ...EJEMPLO, n_dado: 50 };
  const inverso = presentar(calcular(conN), conN, contextoDePrueba(SLUG, 'es'));
  assert.equal(inverso.celdas.poder_dado.valor, '56.4\u202f%');
  assert.ok(inverso.interpretacion[3].includes('50 pares'), inverso.interpretacion[3]);

  const en = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.n_clasico.valor, '85');
  assert.ok(en.interpretacion[0].includes('two-sided'), en.interpretacion[0]);
  assert.ok(en.metodos.includes('pwr.r.test'), en.metodos);
});

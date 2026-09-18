/**
 * Calculadora «Muestra para una prueba diagnóstica» (Buderer 1996) contra el
 * oráculo R y sus propiedades.
 *
 *   node --test tests/bioestadistica/muestra-prueba-diagnostica.test.ts
 *
 * Consume los fixtures commiteados (`node scripts/bio-fixtures.mjs --solo
 * muestra-prueba-diagnostica`). Además de la coincidencia con R (prevalencias
 * extremas, proporciones altas, tres niveles de confianza y pérdidas al
 * máximo), se comprueban las identidades que definen el diseño: N_Sn es n_D
 * repartido por la prevalencia, la varianza de Wald se maximiza en 0.5 y el
 * total es el mayor de los dos requisitos, con el techo aplicado una sola vez.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { techo } from '../../src/lib/bioestadistica/metodos/muestra-comun.ts';
import {
  muestraDiagnostica,
  nWald,
  totalParaSn,
  totalParaSp,
} from '../../src/lib/bioestadistica/metodos/muestra-diagnostica.ts';
// El cuantil del nivel de confianza es el compartido: la misma forma que escribe
// el snippet de R, sin una segunda copia que difiera en unos ulp.
import { zNivel } from '../../src/lib/bioestadistica/metodos/proporciones.ts';
import {
  calcular,
  definicion,
  presentar,
} from '../../src/lib/bioestadistica/calculadoras/muestra-prueba-diagnostica.ts';
import type { EntradasMuestraDiagnostica } from '../../src/lib/bioestadistica/calculadoras/muestra-prueba-diagnostica.ts';
import type { Lang, Presentacion } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { qnorm } from '../../src/lib/bioestadistica/primitivas/distribuciones.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'muestra-prueba-diagnostica';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-9;
const IDIOMAS: readonly Lang[] = ['es', 'en'];
const EJEMPLO: EntradasMuestraDiagnostica = { sn: 0.85, sp: 0.95, prev: 0.3, w: 0.05, nivel: 0.95, perdidas: 0.1 };

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
  assert.equal(fixture.casos.length, 14);
  for (const curado of curados.casos) assert.ok(curado.nota.length > 0, `${curado.id}: falta la nota`);
});

// ---------------------------------------------------------------------------
// TypeScript contra R, caso por caso
// ---------------------------------------------------------------------------

for (const caso of fixture.casos) {
  test(`${SLUG} · ${caso.id} coincide con R`, () => {
    const perfil = TOL[caso.tol];
    assert.ok(perfil, `no hay perfil de tolerancia «${caso.tol}»`);
    const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraDiagnostica;
    const informe = comparar(calcular(e, e.nivel), normalizarR(caso.esperado) as Record<string, unknown>, perfil);
    assert.ok(informe.coincide, `${caso.id} · ${informe.resumen}\n${informe.discrepancias.map(describir).join('\n')}`);
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), readFileSync(rutaGenerado(SLUG, caso.id), 'utf8'));
  });
}

test('las salidas viajan sin redondear: el fixture del ejemplo trae los decimales completos', () => {
  const ejemplo = fixture.casos[0];
  assert.ok(ejemplo);
  const nTotal = ejemplo.esperado.n_total as number;
  assert.ok(!Number.isInteger(nTotal), `R devolvió un entero (${nTotal}): alguien redondeó antes de tiempo`);
  // 653.048 → 654: el techo redondea hacia arriba, no trunca.
  assert.equal(techo(nTotal), 654);
  assert.equal(techo(ejemplo.esperado.n_ajustado as number), 726);
});

// ---------------------------------------------------------------------------
// Propiedades del diseño
// ---------------------------------------------------------------------------

test('N_Sn es n_D repartido por la prevalencia y N_Sp, n_D̄ entre los sanos', () => {
  for (const prev of [0.02, 0.1, 0.3, 0.5, 0.9, 0.97]) {
    const v = muestraDiagnostica({ ...EJEMPLO, prev, perdidas: 0 });
    assert.ok(Math.abs(v.n_sn - v.n_d / prev) <= EPS * v.n_sn, `prev ${prev}: N_Sn`);
    assert.ok(Math.abs(v.n_sp - v.n_nd / (1 - prev)) <= EPS * v.n_sp, `prev ${prev}: N_Sp`);
    assert.equal(v.n_total, Math.max(v.n_sn, v.n_sp));
  }
});

test('la varianza de Wald se maximiza en 0.5: ninguna Sn pide más enfermos que Sn = 0.5', () => {
  const z = zNivel(0.95);
  const maximo = nWald(0.5, 0.05, z);
  for (const sn of [0.01, 0.2, 0.4, 0.49, 0.51, 0.6, 0.85, 0.99]) {
    assert.ok(nWald(sn, 0.05, z) < maximo, `Sn ${sn} pidió más que Sn = 0.5`);
  }
  // Simétrica: Sn y 1 − Sn cuestan lo mismo.
  assert.ok(Math.abs(nWald(0.85, 0.05, z) - nWald(0.15, 0.05, z)) <= EPS);
});

test('el cuantil del nivel es el compartido y coincide bit a bit con la forma del snippet', () => {
  // El snippet escribe `qnorm(1 - (1 - nivel)/2)`. Evaluar en su lugar
  // `qnorm((1 - nivel)/2, lower = FALSE)` da el mismo número salvo unos ulp, y
  // esa diferencia se eleva al cuadrado en n_D y se divide luego entre la
  // prevalencia: por eso el cuantil tiene que venir de un único sitio.
  for (const nivel of [0.8, 0.9, 0.95, 0.99, 0.999]) {
    assert.equal(zNivel(nivel), qnorm(1 - (1 - nivel) / 2), `nivel ${nivel}`);
    const v = muestraDiagnostica({ ...EJEMPLO, nivel });
    assert.equal(v.z, qnorm(1 - (1 - nivel) / 2), `nivel ${nivel}: el diseño usa otro cuantil`);
  }
});

test('al 99.9 % de confianza TS sigue pegado a R: ahí es donde una copia del cuantil se notaría', () => {
  const caso = fixture.casos.find((c) => c.id === 'nivel_0999');
  assert.ok(caso, 'falta el caso nivel_0999');
  const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraDiagnostica;
  const ts = calcular(e, e.nivel);
  const rSn = caso.esperado.n_sn as number;
  const dif = Math.abs(ts.valores.n_sn.valor - rSn) / rSn;
  // Con `qnorm((1 - nivel)/2, lower = FALSE)` la diferencia era 1.9e-14; con la
  // forma que escribe el snippet se queda en el ruido de impresión de jsonlite.
  assert.ok(dif < 2e-15, `n_sn se separa de R en ${dif.toExponential(2)}`);
});

test('bajar la prevalencia encarece la sensibilidad y subirla encarece la especificidad', () => {
  const z = zNivel(0.95);
  const prevs = [0.02, 0.05, 0.2, 0.5, 0.8, 0.95, 0.98];
  for (let i = 1; i < prevs.length; i += 1) {
    const anterior = prevs[i - 1] as number;
    const actual = prevs[i] as number;
    assert.ok(totalParaSn(0.85, actual, 0.05, z) < totalParaSn(0.85, anterior, 0.05, z), `N_Sn en ${actual}`);
    assert.ok(totalParaSp(0.95, actual, 0.05, z) > totalParaSp(0.95, anterior, 0.05, z), `N_Sp en ${actual}`);
  }
});

test('el tamaño va con 1/w² y el ajuste por pérdidas con 1/(1 − L)', () => {
  const base = muestraDiagnostica({ ...EJEMPLO, w: 0.05, perdidas: 0 });
  const mitad = muestraDiagnostica({ ...EJEMPLO, w: 0.025, perdidas: 0 });
  assert.ok(Math.abs(mitad.n_total - 4 * base.n_total) <= EPS * mitad.n_total, 'la mitad de w debe cuadruplicar n');
  assert.equal(base.n_ajustado, base.n_total);
  const conPerdidas = muestraDiagnostica({ ...EJEMPLO, perdidas: 0.5 });
  assert.ok(Math.abs(conPerdidas.n_ajustado - 2 * conPerdidas.n_total) <= EPS * conPerdidas.n_ajustado);
});

test('las entradas imposibles lanzan RangeError y validar() las reclama', () => {
  assert.throws(() => muestraDiagnostica({ ...EJEMPLO, sn: 1 }), RangeError);
  assert.throws(() => muestraDiagnostica({ ...EJEMPLO, sp: 0 }), RangeError);
  assert.throws(() => muestraDiagnostica({ ...EJEMPLO, prev: 0 }), RangeError);
  assert.throws(() => muestraDiagnostica({ ...EJEMPLO, w: 0 }), RangeError);
  assert.throws(() => muestraDiagnostica({ ...EJEMPLO, nivel: 0.5 }), RangeError);
  assert.throws(() => muestraDiagnostica({ ...EJEMPLO, perdidas: 0.8 }), RangeError);

  assert.equal(definicion.validar(EJEMPLO), null);
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sn: 1.5 }), { sn: 'err_proporcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sn: 1 }), { sn: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, sp: 0 }), { sp: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, prev: 0 }), { prev: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, w: 0.001 }), { w: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, w: 0.6 }), { w: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, nivel: 0.5 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, perdidas: 0.8 }), { perdidas: 'err_rango' });
});

test('derivar() convierte unas pérdidas ausentes en 0 y el ejemplo no cambia', () => {
  assert.deepEqual(
    definicion.derivar?.({ sn: 0.85, sp: 0.95, prev: 0.3, w: 0.05, nivel: 0.95 } as EntradasMuestraDiagnostica),
    { perdidas: 0 },
  );
  assert.deepEqual(definicion.derivar?.(EJEMPLO), { perdidas: 0.1 });
  const sinPerdidas = calcular(
    conDerivadas(definicion, { ...EJEMPLO, perdidas: undefined } as unknown as EntradasMuestraDiagnostica) as EntradasMuestraDiagnostica,
    0.95,
  );
  assert.equal(sinPerdidas.bandas.perdidas, 'sin');
  assert.equal(sinPerdidas.valores.n_ajustado.valor, sinPerdidas.valores.n_total.valor);
});

// ---------------------------------------------------------------------------
// Avisos y bandas
// ---------------------------------------------------------------------------

test('cada aviso se activa solo en su situación', () => {
  const codigos = (e: EntradasMuestraDiagnostica): string[] => calcular(e, e.nivel).avisos.map((a) => a.codigo);
  // `supuestos` es informativo y acompaña siempre al resultado.
  assert.deepEqual(codigos({ ...EJEMPLO, sp: 0.9 }), ['supuestos']);
  assert.ok(codigos(EJEMPLO).includes('wald_subestima'), 'Sp = 0.95 debe disparar wald_subestima');
  assert.ok(codigos({ ...EJEMPLO, sn: 0.98, sp: 0.9 }).includes('wald_subestima'));
  assert.ok(codigos({ ...EJEMPLO, sp: 0.9, prev: 0.02 }).includes('prevalencia_baja'));
  assert.ok(codigos({ ...EJEMPLO, sp: 0.9, prev: 0.97 }).includes('prevalencia_alta'));
  assert.ok(codigos({ ...EJEMPLO, sp: 0.9, w: 0.15 }).includes('w_grande'));
  assert.ok(!codigos({ ...EJEMPLO, sp: 0.9, w: 0.14 }).includes('w_grande'));
});

test('la banda «manda» señala el requisito que fija el tamaño, con el empate a favor de Sn', () => {
  assert.equal(calcular(EJEMPLO, 0.95).bandas.manda, 'sn');
  assert.equal(calcular({ ...EJEMPLO, prev: 0.97 }, 0.95).bandas.manda, 'sp');
  // Sn = Sp y prevalencia del 50 %: los dos requisitos son idénticos.
  const empate = calcular({ ...EJEMPLO, sn: 0.9, sp: 0.9, prev: 0.5 }, 0.95);
  assert.equal(empate.valores.n_sn.valor, empate.valores.n_sp.valor);
  assert.equal(empate.bandas.manda, 'sn');
});

// ---------------------------------------------------------------------------
// Presentación en los dos idiomas
// ---------------------------------------------------------------------------

test('un tamaño positivo pero diminuto se publica como 1 participante, nunca como 0', () => {
  // `techo()` tolera 1e-9 absoluto para no subir 322.00000000001 a 323, y esa
  // tolerancia hunde a 0 un n de 6.6e-12. En R `ceiling(6.6e-12)` es 1, así que
  // publicar 0 contradiría al `ceiling()` que documenta la ecuación y la
  // interpretación diría «reunir 0 enfermos».
  const casos: Array<{ e: EntradasMuestraDiagnostica; celdas: readonly (keyof typeof p.celdas)[] }> = [
    { e: { sn: 1e-12, sp: 0.5, prev: 0.5, w: 0.5, nivel: 0.8, perdidas: 0 }, celdas: ['n_d', 'n_sn'] },
    { e: { sn: 0.5, sp: 1e-12, prev: 1e-12, w: 0.5, nivel: 0.8, perdidas: 0 }, celdas: ['n_nd', 'n_sp'] },
  ];
  let p!: Presentacion;
  for (const { e, celdas } of casos) {
    // La entrada es válida: el arreglo es de presentación, no de validación.
    assert.equal(definicion.validar(e), null, JSON.stringify(e));
    const s = calcular(e, e.nivel);
    for (const k of celdas) {
      const crudo = s.valores[k as string]?.valor as number;
      assert.ok(crudo > 0 && crudo < 1, `${String(k)}: se esperaba un valor diminuto, no ${crudo}`);
      // Sin el suelo, el techo compartido daría 0.
      assert.equal(techo(crudo), 0, `${String(k)}: techo() ya no devuelve 0; la prueba dejó de probar lo suyo`);
    }
    for (const lang of IDIOMAS) {
      p = presentar(s, e, contextoDePrueba(SLUG, lang));
      for (const k of celdas) {
        assert.equal(p.celdas[k as string]?.valor, '1', `${lang} · ${String(k)}: el titular debe ser 1`);
        const nota = p.celdas[k as string]?.nota ?? '';
        // El detalle no puede decir «0.0»: por debajo de 1 manda la cifra significativa.
        assert.ok(!/\b0[.,]0\b/.test(nota), `${lang} · ${String(k)}: el detalle dice cero en «${nota}»`);
        assert.ok(/[1-9]/.test(nota), `${lang} · ${String(k)}: el detalle no trae ninguna cifra en «${nota}»`);
      }
      for (const texto of [...p.interpretacion, p.metodos]) {
        assert.ok(!texto.includes('{'), `${lang}: marcador sin rellenar`);
      }
    }
  }
});

test('el caso n_diminuto del fixture publica 1 y coincide con el ceiling de R', () => {
  const caso = fixture.casos.find((c) => c.id === 'n_diminuto');
  assert.ok(caso, 'falta el caso n_diminuto en el fixture');
  const e = conDerivadas(definicion, caso.entradas) as EntradasMuestraDiagnostica;
  const s = calcular(e, e.nivel);
  // R devolvió el mismo valor diminuto, sin redondear.
  assert.ok((caso.esperado.n_d as number) < 1e-9, String(caso.esperado.n_d));
  // Y `ceiling()` de R sobre ese valor es 1, comprobado con Rscript.
  const es = presentar(s, e, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.n_d.valor, '1');
  assert.equal(es.celdas.n_sn.valor, '1');
  assert.equal(es.celdas.n_nd.valor, '2');
  assert.equal(es.celdas.n_total.valor, '4');
});

test('presentar() rellena todas las plantillas en ambos idiomas y la gráfica lleva las dos curvas con su referencia', () => {
  const entradas: EntradasMuestraDiagnostica[] = [
    EJEMPLO,
    { ...EJEMPLO, perdidas: 0 },
    { ...EJEMPLO, prev: 0.02 },
    { ...EJEMPLO, prev: 0.97 },
    { ...EJEMPLO, sn: 0.98, sp: 0.9 },
    { ...EJEMPLO, w: 0.15 },
    { ...EJEMPLO, w: 0.005, nivel: 0.999 },
    { ...EJEMPLO, sn: 0.9, sp: 0.9, prev: 0.5, perdidas: 0.5 },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const e of entradas) {
      const s = calcular(e, e.nivel);
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
      assert.equal(p.interpretacion.length, 3);
      assert.ok(p.grafica && p.grafica.tipo === 'curvas');
      if (p.grafica && p.grafica.tipo === 'curvas') {
        const g = p.grafica;
        assert.equal(g.curvas.length, 2);
        assert.deepEqual(g.curvas.map((c) => c.id), ['n_sn', 'n_sp']);
        for (const curva of g.curvas) {
          assert.ok(curva.puntos.length > 1, `${lang}: la curva ${curva.id} se quedó sin puntos`);
          // El recorte deja fuera lo que no cabe en el eje, nunca lo aplasta.
          for (const [, y] of curva.puntos) assert.ok(y <= g.ejeY.dominio[1] + EPS, `${lang}: punto fuera del eje`);
        }
        assert.equal(g.marcador?.x, e.prev);
        assert.equal(g.marcador?.valores?.n_sn, s.valores.n_sn.valor);
        assert.equal(g.marcador?.valores?.n_sp, s.valores.n_sp.valor);
        assert.equal(g.referenciaY?.valor, s.valores.n_total.valor);
        assert.ok((g.referenciaY?.etiqueta ?? '').length > 0, `${lang}: la referencia horizontal no lleva rótulo`);
        assert.ok(g.referenciaY !== undefined && g.referenciaY.valor <= g.ejeY.dominio[1]);
      }
    }
  }
});

test('el ejemplo se lee igual que el cálculo manual, en español y en inglés', () => {
  const es = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.n_d.valor, '196');
  assert.equal(es.celdas.n_sn.valor, '654');
  assert.equal(es.celdas.n_nd.valor, '73');
  assert.equal(es.celdas.n_sp.valor, '105');
  assert.equal(es.celdas.n_total.valor, '654');
  assert.equal(es.celdas.n_ajustado.valor, '726');
  assert.equal(es.celdas.z.valor, '1.960');
  // El detalle lleva DOS decimales: con uno, 195.91 se leería «195.9» y 653.05,
  // «653.0», a un paso de confundirse con el techo (convenio del grupo).
  assert.equal(es.celdas.n_d.nota, 'valor exacto 195.91');
  assert.equal(es.celdas.n_sn.nota, 'valor exacto 653.05');
  assert.equal(es.celdas.n_ajustado.nota, 'valor exacto 725.61');
  assert.equal(es.celdas.n_total.clase, 'destacada');
  assert.ok(es.interpretacion[1].includes('Manda la sensibilidad'), es.interpretacion[1]);
  assert.ok(es.metodos.includes('Buderer') && es.metodos.includes('726'), es.metodos);

  const en = presentar(calcular(EJEMPLO, 0.95), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.n_total.valor, '654');
  assert.ok(en.interpretacion[0].includes('654'), en.interpretacion[0]);
  assert.ok(en.metodos.includes('Buderer'), en.metodos);

  // Sin pérdidas, el párrafo de Métodos cambia de variante.
  const sinPerdidas: EntradasMuestraDiagnostica = { ...EJEMPLO, perdidas: 0 };
  const s = presentar(calcular(sinPerdidas, 0.95), sinPerdidas, contextoDePrueba(SLUG, 'es'));
  assert.ok(s.metodos.includes('No se previeron pérdidas'), s.metodos);
  assert.equal(s.celdas.n_ajustado.valor, '654');
});

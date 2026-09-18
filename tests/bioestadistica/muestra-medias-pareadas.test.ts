/**
 * Calculadora «Tamaño de muestra para comparar medias pareadas» contra el
 * oráculo R y sus propiedades.
 *
 *   node --test tests/bioestadistica/muestra-medias-pareadas.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo muestra-medias-pareadas`. Se comprueba
 * (1) que las nueve salidas coinciden con las de R caso por caso, incluida la
 * DE de las diferencias derivada de σ y ρ (que R calcula en el propio snippet)
 * y los `NA` del modo inverso apagado; (2) que el snippet ejecutado es, byte a
 * byte, el que ve el usuario; (3) que la solución exacta y la aproximación
 * normal de Guenther no se separan más de dos pares; y (4) las monotonías del
 * poder, el contrato de `validar()` y la presentación en los dos idiomas.
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
  deDiferencias,
  nNormalPareadas,
  nPareadas,
  poderPareadas,
} from '../../src/lib/bioestadistica/metodos/muestra-medias.ts';
import {
  calcular,
  deDifUsada,
  definicion,
  presentar,
} from '../../src/lib/bioestadistica/calculadoras/muestra-medias-pareadas.ts';
import type { EntradasMuestraMediasPareadas } from '../../src/lib/bioestadistica/calculadoras/muestra-medias-pareadas.ts';
import type { Entradas, Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'muestra-medias-pareadas';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const IDIOMAS: readonly Lang[] = ['es', 'en'];

const EJEMPLO: EntradasMuestraMediasPareadas = {
  delta: 0.5,
  de_dif: 1.5,
  sigma: 0,
  rho: 0,
  alfa: 0.05,
  lateralidad: 'bilateral',
  poder: 0.8,
  perdidas: 0.1,
  n_dado: 0,
};

/**
 * Ajustes al ejemplo. `Partial<EntradasMuestraMediasPareadas>` volvería
 * opcional también la firma de índice que hereda de `Entradas`, y el resultado
 * del spread dejaría de ser asignable; nombrar los campos evita ese borde.
 */
type AjustesPareadas = Partial<
  Pick<
    EntradasMuestraMediasPareadas,
    'delta' | 'de_dif' | 'sigma' | 'rho' | 'alfa' | 'lateralidad' | 'poder' | 'perdidas' | 'n_dado'
  >
>;

function entradasDe(caso: CasoFixture): EntradasMuestraMediasPareadas {
  return conDerivadas(definicion, caso.entradas) as EntradasMuestraMediasPareadas;
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
  assert.equal(fixture.casos.length, 13);
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

test('R deriva la DE de las diferencias con la misma regla que TypeScript', () => {
  const porId = (id: string): Record<string, unknown> => {
    const c = fixture.casos.find((x) => x.id === id);
    assert.ok(c, `falta el caso ${id} en el fixture`);
    return normalizarR(c.esperado) as Record<string, unknown>;
  };
  // σ = 1.5 con ρ = 0.5 da exactamente σ_d = σ; con ρ = 0.9 y ρ = 0 se separan.
  assert.equal(porId('desde_rho').de_dif, 1.5);
  assert.ok(Math.abs((porId('rho_alta').de_dif as number) - 1.5 * Math.sqrt(0.2)) < 1e-12);
  assert.ok(Math.abs((porId('rho_cero').de_dif as number) - 1.5 * Math.SQRT2) < 1e-12);
  // La ruta derivada con ρ = 0.5 devuelve el mismo número de pares que la directa.
  assert.equal(porId('desde_rho').n, porId('ejemplo').n);
  // Con la DE capturada, σ = 0 y ρ = 0 no se usan para nada.
  assert.equal(porId('unilateral').de_dif, 1.5);
});

test('σ_d derivada es σ·√(2(1 − ρ)) para cualquier ρ admitido', () => {
  for (const sigma of [0.5, 1.5, 12]) {
    for (const rho of [0, 0.25, 0.5, 0.75, 0.9, 0.98]) {
      const e: EntradasMuestraMediasPareadas = { ...EJEMPLO, de_dif: 0, sigma, rho };
      const esperado = sigma * Math.sqrt(2 * (1 - rho));
      assert.ok(Math.abs(deDifUsada(e) - esperado) < 1e-14, `σ = ${sigma}, ρ = ${rho}`);
      assert.ok(Math.abs(calcular(e).valores.de_dif.valor - esperado) < 1e-14);
      assert.equal(deDiferencias(sigma, rho), esperado);
    }
  }
  // Capturada, manda sobre σ y ρ aunque los dos vengan con valores coherentes.
  assert.equal(deDifUsada({ ...EJEMPLO, de_dif: 4, sigma: 1.5, rho: 0.9 }), 4);
});

test('con un solo grupo, el ajuste por pérdidas es un único techo', () => {
  // El hallazgo de C4 (repartir el total ajustado entre dos grupos deja a uno
  // corto) no tiene equivalente aquí: los pares son un solo grupo, así que la
  // suma de los techos por grupo y el techo del total son el mismo número.
  const e: EntradasMuestraMediasPareadas = { ...EJEMPLO, perdidas: 0.1 };
  const s = calcular(e);
  assert.ok(Math.abs(s.valores.n_ajustado.valor - 80.648972070841) < 1e-9);
  assert.equal(techo(s.valores.n_ajustado.valor), 81);
  assert.equal(techo(s.valores.n.valor / 0.9), 81, 'ajustar y redondear el único grupo da lo mismo');
  const es = presentar(s, e, contextoDePrueba(SLUG, 'es'));
  assert.equal(es.celdas.n_ajustado.valor, '81');
});

test('el signo del cambio medio no altera ninguna salida', () => {
  const positiva = fixture.casos.find((c) => c.id === 'ejemplo');
  const negativa = fixture.casos.find((c) => c.id === 'delta_negativa');
  assert.ok(positiva && negativa);
  assert.deepEqual(negativa.esperado, positiva.esperado, 'R debería dar lo mismo con Δ y con −Δ');
  assert.deepEqual(calcular({ ...EJEMPLO, delta: -0.5 }).valores, calcular(EJEMPLO).valores);
});

test('sin pares dados, R y TypeScript coinciden en que no hay poder inverso', () => {
  const ejemplo = fixture.casos.find((c) => c.id === 'ejemplo');
  const esperado = normalizarR(ejemplo?.esperado ?? {}) as Record<string, unknown>;
  assert.equal(esperado.poder_dado, null);
  assert.equal(esperado.poder_dado_normal, null);
  const ts = calcular(EJEMPLO);
  assert.ok(Number.isNaN(ts.valores.poder_dado.valor) && Number.isNaN(ts.valores.poder_dado_normal.valor));
});

// ---------------------------------------------------------------------------
// Propiedades de la solución exacta
// ---------------------------------------------------------------------------

/** Rejilla razonable de diseños pareados. */
function* disenos(): Generator<{ delta: number; deDif: number; alfa: number; lateralidad: Lateralidad; poder: number }> {
  for (const delta of [0.1, 0.5, 1, 2]) {
    for (const deDif of [1, 1.5]) {
      for (const alfa of [0.01, 0.05]) {
        for (const lateralidad of LATERALIDADES) {
          for (const poder of [0.8, 0.9]) yield { delta, deDif, alfa, lateralidad, poder };
        }
      }
    }
  }
}

test('la solución exacta y la aproximación normal de Guenther no se separan más de dos pares', () => {
  for (const d of disenos()) {
    const exacta = nPareadas(d.delta, d.deDif, d.alfa, d.lateralidad, d.poder);
    const normal = nNormalPareadas(d.delta, d.deDif, d.alfa, d.lateralidad, d.poder);
    const donde = JSON.stringify(d);
    assert.ok(Number.isFinite(exacta) && exacta >= 2, `${donde}: n exacta no es un tamaño de muestra`);
    assert.ok(exacta >= normal - 2 && exacta <= normal + 2, `${donde}: exacta ${exacta} vs normal ${normal}`);
  }
});

test('el poder que alcanza la n exacta es justo el poder pedido, y el par anterior se queda corto', () => {
  for (const d of disenos()) {
    const n = nPareadas(d.delta, d.deDif, d.alfa, d.lateralidad, d.poder);
    const donde = JSON.stringify(d);
    const enN = poderPareadas(n, d.delta, d.deDif, d.alfa, d.lateralidad);
    if (n > 2) {
      assert.ok(Math.abs(enN - d.poder) < 1e-8, `${donde}: poder en n = ${enN}, se pedía ${d.poder}`);
    } else {
      assert.ok(enN >= d.poder, `${donde}: n quedó en el mínimo con poder ${enN} < ${d.poder}`);
    }
    const arriba = techo(n);
    assert.ok(
      poderPareadas(arriba, d.delta, d.deDif, d.alfa, d.lateralidad) >= d.poder - 1e-9,
      `${donde}: el techo ${arriba} no alcanza el poder`,
    );
    const abajo = arriba - 1;
    if (abajo >= 2) {
      assert.ok(
        poderPareadas(abajo, d.delta, d.deDif, d.alfa, d.lateralidad) < d.poder,
        `${donde}: con ${abajo} pares ya se alcanzaba el poder`,
      );
    }
  }
});

test('los pares crecen con el poder y decrecen con la magnitud del cambio y con ρ', () => {
  for (const lateralidad of LATERALIDADES) {
    let previa = Infinity;
    for (const poder of [0.5, 0.7, 0.8, 0.9, 0.95, 0.99]) {
      const n = nPareadas(0.5, 1.5, 0.05, lateralidad, poder);
      assert.ok(n > previa || previa === Infinity, `poder ${poder}: n = ${n} no creció`);
      previa = n;
    }
    let anterior = -Infinity;
    for (const delta of [2, 1, 0.5, 0.25]) {
      const n = nPareadas(delta, 1.5, 0.05, lateralidad, 0.8);
      assert.ok(n > anterior, `Δ = ${delta}: n = ${n} no creció al reducir el cambio`);
      anterior = n;
    }
    // Cuanto más correlacionadas las mediciones, menos pares hacen falta.
    let previaRho = Infinity;
    for (const rho of [0, 0.25, 0.5, 0.75, 0.9]) {
      const n = nPareadas(0.5, deDiferencias(1.5, rho), 0.05, lateralidad, 0.8);
      assert.ok(n < previaRho, `ρ = ${rho}: n = ${n} no bajó`);
      previaRho = n;
    }
  }
});

test('un cambio que ya se detecta con dos pares no devuelve un tamaño menor que dos', () => {
  const n = nPareadas(50, 1, 0.2, 'unilateral', 0.5);
  assert.equal(n, 2);
});

// ---------------------------------------------------------------------------
// Contrato de interfaz: derivar, validar, bandas, avisos y presentación
// ---------------------------------------------------------------------------

test('derivar() completa las entradas opcionales con el valor que el snippet espera', () => {
  const soloDeDif: Entradas = {
    delta: 0.5,
    de_dif: 1.5,
    alfa: 0.05,
    lateralidad: 'bilateral',
    poder: 0.8,
  };
  const e = conDerivadas(definicion, soloDeDif) as EntradasMuestraMediasPareadas;
  assert.equal(e.sigma, 0, '0 es la DE por medición «no capturada»');
  assert.equal(e.rho, 0, 'ρ ausente vale 0: dos mediciones sin relación, un supuesto legítimo');
  assert.equal(e.perdidas, 0);
  assert.equal(e.n_dado, 0);
  assert.equal(definicion.validar(e), null);
  assert.equal(calcular(e).bandas.de_dif, 'directa');

  const soloSigmaRho: Entradas = {
    delta: 0.5,
    sigma: 1.5,
    rho: 0.5,
    alfa: 0.05,
    lateralidad: 'bilateral',
    poder: 0.8,
  };
  const d = conDerivadas(definicion, soloSigmaRho) as EntradasMuestraMediasPareadas;
  assert.equal(d.de_dif, 0, '0 es la DE de las diferencias «no capturada»');
  assert.equal(definicion.validar(d), null);
  const s = calcular(d);
  assert.equal(s.bandas.de_dif, 'derivada');
  assert.equal(s.valores.de_dif.valor, 1.5);
  assert.ok(s.avisos.some((a) => a.codigo === 'rho_supuesta'));
});

test('validar() exige la DE de las diferencias o, en su defecto, σ', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  const base = conDerivadas(definicion, { delta: 0.5, alfa: 0.05, lateralidad: 'bilateral', poder: 0.8 }) as EntradasMuestraMediasPareadas;
  assert.deepEqual(definicion.validar(base), { de_dif: 'err_requerido' }, 'sin DE, sin σ y sin ρ');
  assert.equal(definicion.validar({ ...base, sigma: 1.5 }), null, 'σ sola basta: ρ = 0 es el supuesto por omisión');
  assert.deepEqual(definicion.validar({ ...base, rho: 0.5 }), { de_dif: 'err_requerido' }, 'ρ sin σ no basta');
  assert.equal(definicion.validar({ ...base, sigma: 1.5, rho: 0 }), null, 'ρ = 0 es un valor legítimo');
  // ρ ≥ 0.99 queda bloqueado por el máximo declarado en el YAML (0.98).
  assert.deepEqual(definicion.validar({ ...base, sigma: 1.5, rho: 0.99 }), { rho: 'err_max' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, rho: 0.999 }), { rho: 'err_max' });
  assert.deepEqual(definicion.validar({ ...base, sigma: 1.5, rho: -0.1 }), { rho: 'err_min' });

  assert.deepEqual(definicion.validar({ ...EJEMPLO, delta: 0 }), { delta: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, alfa: 0.25 }), { alfa: 'err_max' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, lateralidad: 'ambas' }), { lateralidad: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, poder: 0.4 }), { poder: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, perdidas: 0.75 }), { perdidas: 'err_max' });
  assert.equal(definicion.validar({ ...EJEMPLO, n_dado: 1 }), null, '0 y 1 son «sin modo inverso»');
  assert.equal(calcular({ ...EJEMPLO, n_dado: 1 }).bandas.inverso, 'sin');
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: -4 }), { n_dado: 'err_min' });
  assert.deepEqual(definicion.validar({ ...EJEMPLO, n_dado: 3.5 }), { n_dado: 'err_entero' });

  assert.throws(() => calcular({ ...EJEMPLO, alfa: 0.5 }), RangeError);
  assert.throws(() => calcular({ ...EJEMPLO, de_dif: 0, sigma: 0, rho: 0.5 }), RangeError);
});

test('bandas y avisos: supuestos siempre, y ρ supuesta, n pequeño, unilateral y efecto enorme cuando toca', () => {
  const ej = calcular(EJEMPLO);
  assert.deepEqual(ej.bandas, { lateralidad: 'bilateral', de_dif: 'directa', perdidas: 'con', inverso: 'sin' });
  assert.deepEqual(ej.avisos.map((a) => a.codigo), ['supuestos']);

  const derivada = calcular({ ...EJEMPLO, de_dif: 0, sigma: 1.5, rho: 0.75 });
  assert.equal(derivada.bandas.de_dif, 'derivada');
  assert.deepEqual(derivada.avisos.find((a) => a.codigo === 'rho_supuesta')?.params, { rho: 0.75 });

  const chico = calcular({ ...EJEMPLO, delta: 1.5 });
  assert.deepEqual(chico.avisos.find((a) => a.codigo === 'n_pequeno')?.params, { n: 10 });

  const uni = calcular({ ...EJEMPLO, lateralidad: 'unilateral' });
  assert.ok(uni.avisos.some((a) => a.codigo === 'unilateral'));

  // d = 2 justo NO dispara el aviso; por encima, sí.
  assert.ok(!calcular({ ...EJEMPLO, delta: 3 }).avisos.some((a) => a.codigo === 'delta_grande'));
  assert.ok(calcular({ ...EJEMPLO, delta: 4 }).avisos.some((a) => a.codigo === 'delta_grande'));

  assert.equal(calcular({ ...EJEMPLO, perdidas: 0 }).bandas.perdidas, 'sin');
  assert.equal(calcular({ ...EJEMPLO, n_dado: 50 }).bandas.inverso, 'con');
});

test('presentar() rellena todas las plantillas en español e inglés para cada combinación de bandas', () => {
  const variantes: AjustesPareadas[] = [
    {},
    { de_dif: 0, sigma: 1.5, rho: 0.5 },
    { de_dif: 0, sigma: 1.5, rho: 0 },
    { de_dif: 0, sigma: 1.5, rho: 0.98 },
    { lateralidad: 'unilateral' },
    { perdidas: 0 },
    { perdidas: 0.5 },
    { n_dado: 50 },
    { n_dado: 2 },
    { delta: -0.5 },
    { delta: 4 },
    { delta: 0.1, de_dif: 1 },
    { poder: 0.99, alfa: 0.001 },
    { de_dif: 0, sigma: 1.5, rho: 0.9, n_dado: 20, perdidas: 0.2, lateralidad: 'unilateral' },
  ];
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang);
    for (const parcial of variantes) {
      const e: EntradasMuestraMediasPareadas = { ...EJEMPLO, ...parcial };
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
      assert.ok(g.curvas[0].puntos.length >= 40, `${donde}: la curva necesita al menos 40 puntos`);
      assert.ok(g.curvas[0].puntos.every(([x]) => x >= 2), `${donde}: la curva baja de dos pares`);
      assert.ok(g.referenciaY && Math.abs(g.referenciaY.valor - e.poder) < 1e-12, `${donde}: falta la línea del poder objetivo`);
      assert.ok(g.marcador && g.marcador.x === techo(calcular(e).valores.n.valor), `${donde}: el marcador no está en el n elegido`);
    }
  }
});

test('la presentación del ejemplo dice lo que dice la comprobación manual', () => {
  const es = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'es'));
  // power.t.test(delta = 0.5, sd = 1.5, power = 0.8, type = "paired")$n = 72.584 → 73 pares.
  assert.equal(es.celdas.n.valor, '73');
  assert.equal(es.celdas.de_dif.valor, '1.5');
  assert.equal(es.celdas.de_dif.nota, 'capturada');
  assert.equal(es.celdas.d_cohen.valor, '0.333');
  assert.equal(es.celdas.z_alfa.valor, '1.960');
  assert.equal(es.celdas.n_normal.valor, '73');
  // 72.584/(1 − 0.10) = 80.65 → 81 pares a reclutar.
  assert.equal(es.celdas.n_ajustado.valor, '81');
  assert.equal(es.celdas.poder_dado.valor, 'no aplica');
  assert.ok(es.celdas.n.nota?.includes('72.58'), es.celdas.n.nota);
  assert.ok(es.celdas.n_ajustado.nota?.includes('80.65'), es.celdas.n_ajustado.nota);
  assert.ok(es.interpretacion[0].includes('73 pares'), es.interpretacion[0]);
  assert.ok(es.interpretacion[1].includes('directamente'), es.interpretacion[1]);
  assert.ok(es.interpretacion[3].includes('81'), es.interpretacion[3]);
  assert.ok(es.metodos.includes('UDG-CA-1190') && es.metodos.includes('[1]'), es.metodos);

  const en = presentar(calcular(EJEMPLO), EJEMPLO, contextoDePrueba(SLUG, 'en'));
  assert.equal(en.celdas.n.valor, '73');
  assert.equal(en.celdas.poder_dado.valor, 'not applicable');
  assert.ok(en.interpretacion[0].includes('73 pairs'), en.interpretacion[0]);

  // Ruta derivada: el párrafo lo declara y nombra σ y ρ.
  const derivada: EntradasMuestraMediasPareadas = { ...EJEMPLO, de_dif: 0, sigma: 1.5, rho: 0.5 };
  const d = presentar(calcular(derivada), derivada, contextoDePrueba(SLUG, 'es'));
  assert.equal(d.celdas.de_dif.valor, '1.5');
  assert.equal(d.celdas.de_dif.nota, 'derivada de σ y ρ');
  assert.equal(d.celdas.n.valor, '73', 'con ρ = 0.5 la ruta derivada da el mismo n');
  assert.ok(d.interpretacion[1].includes('0.50') && d.interpretacion[1].includes('1.5'), d.interpretacion[1]);
  assert.ok(d.metodos.includes('se derivó la desviación estándar de las diferencias'), d.metodos);
});

test('el modo inverso reporta el poder exacto y el aproximado con los pares disponibles', () => {
  const e: EntradasMuestraMediasPareadas = { ...EJEMPLO, n_dado: 50, perdidas: 0 };
  const s = calcular(e);
  assert.ok(s.valores.poder_dado.valor < 0.8, `poder = ${s.valores.poder_dado.valor}`);
  assert.ok(Math.abs(s.valores.poder_dado.valor - 0.637084584596049) < 1e-9);
  assert.ok(Math.abs(s.valores.poder_dado_normal.valor - 0.654337883048977) < 1e-9);
  const es = presentar(s, e, contextoDePrueba(SLUG, 'es'));
  assert.ok(es.interpretacion[4].includes('50'), es.interpretacion[4]);

  const justo: EntradasMuestraMediasPareadas = { ...EJEMPLO, n_dado: techo(s.valores.n.valor) };
  assert.ok(calcular(justo).valores.poder_dado.valor >= 0.8 - 1e-9);
});

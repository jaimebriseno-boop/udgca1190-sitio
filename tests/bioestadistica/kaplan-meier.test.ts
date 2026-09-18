/**
 * Calculadora «Kaplan-Meier y log-rank» contra el oráculo R y sus propiedades.
 *
 *   node --test tests/bioestadistica/kaplan-meier.test.ts
 *
 * No necesita R instalado: consume los fixtures commiteados, generados con
 * `node scripts/bio-fixtures.mjs --solo kaplan-meier`. Se comprueba (1) que las
 * trece salidas y los dieciséis vectores de la tabla de vida coinciden con
 * `survfit`, `quantile.survfit` y `survdiff` caso por caso, incluidos los `NA`
 * de la mediana no alcanzada, de S(t) fuera del seguimiento y del log-rank sin
 * segundo grupo; (2) que el snippet ejecutado es, byte a byte, el que ve el
 * usuario, con las tres columnas escritas como `c(...)` de varias líneas;
 * (3) que el SHA-256 de `r.codigo` es el grabado en el fixture; y (4)
 * propiedades del estimador, de la validación y de la presentación que valen
 * para cualquier columna.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizarR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { comparar, describir } from '../../src/lib/bioestadistica/nucleo/comparar.ts';
import { interpolar } from '../../src/lib/bioestadistica/nucleo/avisos.ts';
import { rellenar } from '../../src/lib/bioestadistica/nucleo/plantillas.ts';
import {
  MAX_GRUPOS_KM,
  N_MIN_KM,
  TIPOS_IC_KM,
  codigosDeGrupo,
  columnaTablaVida,
  cuantilSurvfit,
  curvasCruzan,
  enRiesgoEn,
  intervaloKm,
  logRank,
  medianaKm,
  supervivenciaEn,
  tablaVida,
  tiemposEnRiesgo,
} from '../../src/lib/bioestadistica/metodos/supervivencia.ts';
import type { CurvaVida, TipoIcKm } from '../../src/lib/bioestadistica/metodos/supervivencia.ts';
import { calcular, curvasDe, definicion, presentar } from '../../src/lib/bioestadistica/calculadoras/kaplan-meier.ts';
import type { EntradasKm } from '../../src/lib/bioestadistica/calculadoras/kaplan-meier.ts';
import type { GraficaKm, Lang } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { TOL } from './tolerancias.ts';
import { RAIZ, conDerivadas, contextoDePrueba, leerCasos, leerFixture, leerYaml, rutaGenerado } from './util.ts';
import type { CasoFixture } from './util.ts';

process.chdir(RAIZ);

const SLUG = 'kaplan-meier';
const yamlCalc = leerYaml(SLUG);
const fixture = leerFixture(SLUG);
const EPS = 1e-12;
const IDIOMAS: readonly Lang[] = ['es', 'en'];

function entradasDe(caso: CasoFixture): EntradasKm {
  return conDerivadas(definicion, caso.entradas) as EntradasKm;
}

/** Ejemplo del YAML: 30 pacientes con dengue en dos grupos por NS1. */
const EJEMPLO = conDerivadas(definicion, yamlCalc.ejemplo) as EntradasKm;

/** Curvas del ejemplo, la primera (NS1 negativo) y la segunda (NS1 positivo). */
function curvasEjemplo(): [CurvaVida, CurvaVida] {
  const curvas = curvasDe(EJEMPLO, 0.95);
  return [curvas[0] as CurvaVida, curvas[1] as CurvaVida];
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
  assert.equal(fixture.casos.length, 24);
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

/**
 * DOS ESCENARIOS DE MOTOR §1.6 NO SE CUBREN AL PIE DE LA LETRA, y no es un olvido:
 *
 * - «n = 1» se sustituye por `n_2`. Una columna de un solo valor no pasa la
 *   validación (`N_MIN_KM = 2`, `min: 2` en el YAML) porque con un sujeto no hay
 *   dispersión que estimar, así que esa entrada nunca llega al motor.
 * - «tres grupos (gl = 2)» no se cubre. Kaplan-Meier admite en H3 un máximo de
 *   dos curvas (`MAX_GRUPOS_KM = 2`); el log-rank de k grupos y los grupos ≥ 3
 *   llegan en H5 con el pegado de tabla con roles. Está registrado en
 *   docs/bioestadistica/DECISIONES.md, sección «H3 · Por patrón».
 *
 * Quien lea esta lista no debe concluir que MOTOR §1.6 queda cubierto entero.
 */
test('los casos cubren los escenarios obligatorios del plan del motor', () => {
  const ids = fixture.casos.map((c) => c.id);
  // Las dos sustituciones documentadas arriba, comprobadas para que el día que
  // se levante el límite alguien tenga que volver aquí.
  assert.equal(N_MIN_KM, 2, 'si el mínimo baja a 1, MOTOR §1.6 pide un caso con n = 1');
  assert.equal(MAX_GRUPOS_KM, 2, 'si se admiten tres grupos, MOTOR §1.6 pide un caso con gl = 2');
  assert.ok(ids.includes('n_2'), 'el sustituto de «n = 1» es el mínimo admitido');
  for (const obligatorio of [
    'un_grupo',
    'sin_censuras',
    'todo_censurado_tras_ultimo_evento',
    'empates_evento_censura',
    'grupo_sin_eventos',
    'n_2',
    'meseta_05',
    's_fuera',
    'ic_log',
    'nivel_090',
    'nivel_099',
    'censura_alta',
    'cruce',
    'sin_tiempos',
    'solo_t2',
    'logrank_singular',
    'grupo_nunca_en_riesgo',
    'ic_mediana_no_monotona',
  ]) {
    assert.ok(ids.includes(obligatorio), `falta el caso obligatorio ${obligatorio}`);
  }
  // Una sola curva y dos curvas, en los dos sentidos.
  assert.ok(fixture.casos.some((c) => (c.entradas.grupo as number[]).length === 0), 'ningún caso sin columna de grupo');
  assert.ok(fixture.casos.some((c) => (c.entradas.grupo as number[]).length > 0), 'ningún caso con dos grupos');
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
      `${caso.id} (n = ${(caso.entradas.tiempo as number[]).length}) · ${informe.resumen}\n${informe.discrepancias
        .map(describir)
        .join('\n')}`,
    );
  });

  test(`${SLUG} · ${caso.id} ejecutó exactamente el código que ve el usuario`, () => {
    const generado = readFileSync(rutaGenerado(SLUG, caso.id), 'utf8');
    assert.equal(rellenarR(yamlCalc.r.codigo, caso.entradas), generado);
  });
}

test('las tres columnas se interpolan como c(...) de varias líneas y la de grupo vacía como c()', () => {
  const texto = rellenarR(yamlCalc.r.codigo, yamlCalc.ejemplo);
  assert.match(texto, /^tiempo <- c\(2, 5, 3, 7,/m, 'la columna de tiempos no empieza por sus propios valores');
  const bloque = texto.slice(texto.indexOf('tiempo <- c('), texto.indexOf('nivel <-'));
  assert.ok(bloque.includes('\n  '), 'los vectores deberían partirse con sangría de dos espacios');
  // `codigoR.ts` corta el vector a 72 caracteres de contenido; la primera línea
  // añade además `tiempo <- c(` y la coma final, de ahí el tope de 85.
  for (const linea of bloque.split('\n')) assert.ok(linea.length <= 85, `línea demasiado larga: ${linea}`);
  assert.match(bloque, /^evento <- c\(/m, 'falta la columna de evento');
  assert.match(bloque, /^grupo <- c\(/m, 'falta la columna de grupo');

  const sinGrupo = fixture.casos.find((c) => c.id === 'un_grupo');
  assert.ok(sinGrupo);
  assert.match(rellenarR(yamlCalc.r.codigo, sinGrupo.entradas), /^grupo <- c\(\)$/m, 'la columna vacía debería ser c()');
});

test('los NA de R llegan como «no definido» y TypeScript los reproduce', () => {
  // Una sola curva: el log-rank y todo el segundo grupo son NA en R.
  const unGrupo = fixture.casos.find((c) => c.id === 'un_grupo');
  assert.ok(unGrupo);
  const rUno = normalizarR(unGrupo.esperado) as Record<string, unknown>;
  for (const campo of ['n_2', 'eventos_2', 'chi2_logrank', 'gl', 'p_logrank']) {
    assert.equal(rUno[campo], null, `R debería devolver NA en ${campo} con un solo grupo`);
  }
  assert.deepEqual(rUno.t_2, [], 'los vectores del segundo grupo deberían ser numeric(0)');
  const tsUno = calcular(entradasDe(unGrupo), 0.95);
  for (const campo of ['n_2', 'eventos_2', 'chi2_logrank', 'gl', 'p_logrank'] as const) {
    assert.ok(Number.isNaN(tsUno.valores[campo]?.valor), `TypeScript debería dar NaN en ${campo}`);
  }
  assert.deepEqual(tsUno.extras?.t_2, []);
  assert.equal(tsUno.bandas.grupos, 'uno');

  // Mediana no alcanzada: R devuelve NA en la estimación y un límite inferior real.
  const sinMediana = fixture.casos.find((c) => c.id === 'todo_censurado_tras_ultimo_evento');
  assert.ok(sinMediana);
  const rMediana = normalizarR(sinMediana.esperado) as Record<string, unknown>;
  assert.deepEqual((rMediana.mediana_1 as unknown[])[0], null, 'la mediana debería ser NA');
  const tsMediana = calcular(entradasDe(sinMediana), 0.95);
  assert.ok(Number.isNaN(tsMediana.valores.mediana_1?.valor));
  assert.equal(tsMediana.bandas.mediana_1, 'no_alcanzada');

  // S = 0 sin censuras: std.err es Inf y los dos límites del IC son NA.
  const sinCensuras = fixture.casos.find((c) => c.id === 'sin_censuras');
  assert.ok(sinCensuras);
  const rCero = normalizarR(sinCensuras.esperado) as Record<string, number[]>;
  const ultimo = (rCero.s_1 as number[]).length - 1;
  assert.equal(rCero.s_1?.[ultimo], 0);
  assert.equal(rCero.ee_1?.[ultimo], Number.POSITIVE_INFINITY);
  assert.equal(rCero.lo_1?.[ultimo], null);

  // S(t) más allá del seguimiento: NA en los dos lados, sin prolongar la curva.
  const fuera = fixture.casos.find((c) => c.id === 's_fuera');
  assert.ok(fuera);
  const rFuera = normalizarR(fuera.esperado) as Record<string, unknown[]>;
  assert.deepEqual(rFuera.s_t2_1, [null, null, null], 't2 = 25 supera los dos seguimientos');
  assert.deepEqual(rFuera.s_t1_1, [null, null, null], 't1 = 19 supera el seguimiento del grupo 0');
  assert.ok((rFuera.s_t1_2 as number[])[0] !== null, 't1 = 19 sí cabe en el seguimiento del grupo 1');
});

// ---------------------------------------------------------------------------
// Propiedades del estimador
// ---------------------------------------------------------------------------

/** Muestras de prueba: cortas, con empates, sin censuras y con mucha censura. */
function* muestras(): Generator<[string, number[], number[]]> {
  yield ['n2', [3, 5], [1, 0]];
  yield ['empates', [2, 3, 3, 3, 5, 5, 7, 9, 9, 12], [1, 1, 0, 1, 0, 0, 1, 1, 0, 0]];
  yield ['sin_censuras', [1, 2, 3, 4, 5, 6, 7, 8], [1, 1, 1, 1, 1, 1, 1, 1]];
  yield ['meseta', [2, 4, 5, 9], [1, 1, 0, 0]];
  yield ['censura_alta', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 0, 0, 1, 0, 0, 1, 0, 0, 0]];
  yield ['decimales', [0.5, 1.25, 1.25, 3, 4.75, 6], [1, 1, 0, 1, 0, 1]];
  yield ['ceros', [0, 0, 1, 2, 3], [1, 0, 1, 1, 0]];
}

const OPCIONES: ReadonlyArray<{ nivel: number; tipoIC: TipoIcKm }> = [
  { nivel: 0.95, tipoIC: 'log-log' },
  { nivel: 0.9, tipoIC: 'log' },
  { nivel: 0.99, tipoIC: 'log-log' },
];

test('la curva no crece, se queda en [0, 1] y vale 1 antes del primer evento', () => {
  for (const [id, t, e] of muestras()) {
    for (const op of OPCIONES) {
      const curva = tablaVida(t, e, op);
      let previa = 1;
      for (const paso of curva.pasos) {
        assert.ok(paso.s <= previa + EPS, `${id}: la curva sube en t = ${paso.t}`);
        assert.ok(paso.s >= -EPS && paso.s <= 1 + EPS, `${id}: S fuera de [0, 1] en t = ${paso.t}`);
        previa = paso.s;
      }
      // En t = 0 (o justo antes del primer tiempo con evento) la curva vale 1.
      const primerEvento = curva.pasos.find((p) => p.eventos > 0);
      assert.ok(primerEvento);
      const antes = curva.pasos.filter((p) => p.t < primerEvento.t);
      for (const paso of antes) assert.equal(paso.s, 1, `${id}: la curva baja antes del primer evento`);
    }
  }
});

test('sin censuras la curva llega exactamente a 0 y con censuras no', () => {
  const sin = tablaVida([1, 2, 3, 4, 5, 6, 7, 8], [1, 1, 1, 1, 1, 1, 1, 1], OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
  assert.equal(sin.pasos[sin.pasos.length - 1]?.s, 0);
  assert.equal(sin.pasos[sin.pasos.length - 1]?.eeLog, Number.POSITIVE_INFINITY);
  const con = tablaVida([1, 2, 3, 4, 5, 6, 7, 8], [1, 1, 1, 1, 1, 1, 1, 0], OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
  assert.ok((con.pasos[con.pasos.length - 1]?.s ?? 0) > 0);
});

test('el número en riesgo es el de los sujetos con tiempo ≥ t y los eventos preceden a las censuras', () => {
  for (const [id, t, e] of muestras()) {
    const curva = tablaVida(t, e, OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
    for (const paso of curva.pasos) {
      assert.equal(paso.enRiesgo, t.filter((x: number) => x >= paso.t).length, `${id}: n.risk en t = ${paso.t}`);
      assert.equal(paso.eventos, t.filter((x: number, i: number) => x === paso.t && e[i] === 1).length, `${id}: eventos`);
      assert.equal(paso.censuras, t.filter((x: number, i: number) => x === paso.t && e[i] === 0).length, `${id}: censuras`);
      // Un tiempo con solo censuras aparece igualmente y deja Ŝ intacta.
      assert.ok(paso.eventos + paso.censuras > 0, `${id}: tiempo sin nada en t = ${paso.t}`);
    }
    assert.deepEqual(
      curva.pasos.map((p) => p.t),
      [...new Set(t)].sort((a: number, b: number) => a - b),
      `${id}: la tabla debería traer todos los tiempos distintos`,
    );
  }
});

test('el EE tabulado es el de log Ŝ: √g de Greenwood, no el de Ŝ', () => {
  for (const [id, t, e] of muestras()) {
    const curva = tablaVida(t, e, OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
    let g = 0;
    for (const paso of curva.pasos) {
      if (paso.eventos > 0) g += paso.eventos / (paso.enRiesgo * (paso.enRiesgo - paso.eventos));
      const esperado = Math.sqrt(g);
      const ok = esperado === Number.POSITIVE_INFINITY ? paso.eeLog === esperado : Math.abs(paso.eeLog - esperado) <= 1e-14;
      assert.ok(ok, `${id}: EE en t = ${paso.t} es ${paso.eeLog} y no ${esperado}`);
    }
  }
});

test('el intervalo contiene a la estimación y respeta los límites de cada escala', () => {
  for (const [id, t, e] of muestras()) {
    for (const op of OPCIONES) {
      for (const paso of tablaVida(t, e, op).pasos) {
        if (Number.isNaN(paso.lo) || Number.isNaN(paso.hi)) continue;
        assert.ok(paso.lo <= paso.s + EPS, `${id}: límite inferior por encima de Ŝ en t = ${paso.t}`);
        assert.ok(paso.hi >= paso.s - EPS, `${id}: límite superior por debajo de Ŝ en t = ${paso.t}`);
        assert.ok(paso.lo >= -EPS && paso.hi <= 1 + EPS, `${id}: intervalo fuera de [0, 1] en t = ${paso.t}`);
      }
    }
  }
  // Las tres ramas de survfit_confint que la especificación fija.
  assert.deepEqual(intervaloKm(1, 0, 1.96, 'log-log'), [1, 1], 'con EE = 0 el intervalo es la propia Ŝ');
  assert.deepEqual(intervaloKm(0, Number.POSITIVE_INFINITY, 1.96, 'log-log'), [Number.NaN, Number.NaN]);
  assert.deepEqual(intervaloKm(0, Number.POSITIVE_INFINITY, 1.96, 'log'), [Number.NaN, Number.NaN]);
  assert.equal(intervaloKm(0.9, 2, 1.96, 'log')[1], 1, 'el límite superior de la escala log se recorta a 1');
});

test('un intervalo más ancho nunca es más estrecho: 90 %, 95 % y 99 % están anidados', () => {
  for (const [id, t, e] of muestras()) {
    const bandas = [0.9, 0.95, 0.99].map((nivel) => tablaVida(t, e, { nivel, tipoIC: 'log-log' }).pasos);
    for (let i = 0; i < (bandas[0]?.length ?? 0); i += 1) {
      for (let k = 1; k < bandas.length; k += 1) {
        const estrecho = bandas[k - 1]?.[i];
        const ancho = bandas[k]?.[i];
        if (!estrecho || !ancho || Number.isNaN(estrecho.lo) || Number.isNaN(ancho.lo)) continue;
        assert.ok(ancho.lo <= estrecho.lo + EPS, `${id}: el 99 % tiene un inferior mayor que el 95 %`);
        assert.ok(ancho.hi >= estrecho.hi - EPS, `${id}: el 99 % tiene un superior menor que el 95 %`);
      }
    }
  }
});

test('la mediana es el cruce del 50 % y es NaN cuando la curva no baja de 0.5', () => {
  // Sin bajar de 0.5 no hay mediana, aunque el límite inferior exista.
  const meseta = tablaVida([2, 4, 6, 8, 10], [1, 0, 0, 0, 0], OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
  assert.ok(Number.isNaN(medianaKm(meseta).valor));
  assert.equal(medianaKm(meseta).ic?.[0], 2, 'la banda inferior sí cruza el 0.5');

  // Con la curva bajando a 0.5 y luego por debajo, el punto medio del tramo.
  const exacta = tablaVida([1, 2, 3, 4], [1, 1, 1, 1], OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
  assert.equal(medianaKm(exacta).valor, 2.5, 'quantile.survfit promedia t = 2 y t = 3');

  // Con la curva terminando en 0.5, findq usa el último tiempo observado.
  const final = tablaVida([2, 4, 5, 9], [1, 1, 0, 0], OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
  assert.equal(medianaKm(final).valor, 6.5, 'R da (4 + 9)/2');

  // Y en general cae entre el primer tiempo con Ŝ ≤ 0.5 y el último observado.
  for (const [id, t, e] of muestras()) {
    const curva = tablaVida(t, e, OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
    const m = medianaKm(curva).valor;
    if (Number.isNaN(m)) {
      assert.ok(
        curva.pasos.every((p) => p.s > 0.5 - EPS),
        `${id}: la mediana es NaN pero la curva sí baja de 0.5`,
      );
      continue;
    }
    const primero = curva.pasos.find((p) => p.s <= 0.5 + EPS)?.t ?? Number.NaN;
    assert.ok(m >= primero - EPS && m <= curva.tMax + EPS, `${id}: mediana ${m} fuera de [${primero}, ${curva.tMax}]`);
  }
});

test('el intervalo de la mediana sale de las bandas y el inferior nunca supera al superior', () => {
  for (const [id, t, e] of muestras()) {
    for (const op of OPCIONES) {
      const est = medianaKm(tablaVida(t, e, op));
      const [lo, hi] = est.ic as [number, number];
      if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
      assert.ok(lo <= hi + EPS, `${id}: intervalo invertido (${lo}, ${hi})`);
      if (!Number.isNaN(est.valor)) {
        assert.ok(lo <= est.valor + EPS && hi >= est.valor - EPS, `${id}: la mediana ${est.valor} queda fuera del IC`);
      }
    }
  }
});

test('findq reproduce el caso límite de R: sin alcanzar p devuelve NaN y con p = 0 el primer tiempo', () => {
  assert.ok(Number.isNaN(cuantilSurvfit([0, 1, 2], [0, 0.1, 0.2], 0.5)), 'la función de fallo no llega a 0.5');
  assert.equal(cuantilSurvfit([0, 1, 2], [0, 0.6, 0.8], 0), 0, 'p = 0 devuelve el primer x');
  assert.equal(cuantilSurvfit([0, 1, 2, 3], [0, 0.25, 0.5, 0.75], 0.5), 2.5);
  // Un NA en la banda no impide encontrar el cuantil: approx descarta el par.
  assert.equal(cuantilSurvfit([0, 1, 2, 3], [0, 0.25, 0.75, Number.NaN], 0.5), 2);
});

test('S(t) es escalonada continua por la derecha y no se define más allá del seguimiento', () => {
  const curva = tablaVida([2, 4, 6, 8], [1, 1, 1, 0], OPCIONES[0] as { nivel: number; tipoIC: TipoIcKm });
  assert.equal(supervivenciaEn(curva, 0).valor, 1, 'antes del primer tiempo la curva vale 1');
  assert.equal(supervivenciaEn(curva, 1.999).valor, 1);
  assert.equal(supervivenciaEn(curva, 2).valor, 0.75, 'en el propio tiempo del evento ya bajó');
  assert.equal(supervivenciaEn(curva, 7).valor, supervivenciaEn(curva, 6).valor);
  assert.equal(supervivenciaEn(curva, 8).valor, supervivenciaEn(curva, 6).valor, 'una censura no baja la curva');
  assert.ok(Number.isNaN(supervivenciaEn(curva, 8.0001).valor), 'más allá del último tiempo no hay estimación');
  assert.ok(Number.isNaN(supervivenciaEn(curva, Number.NaN).valor), 'un tiempo no pedido no tiene estimación');
});

test('la tabla de pacientes en riesgo cuenta los tiempos ≥ t y usa pasos redondeados', () => {
  const [g1, g2] = curvasEjemplo();
  assert.deepEqual(tiemposEnRiesgo(21), [0, 5, 10, 15, 20]);
  assert.deepEqual(tiemposEnRiesgo(7), [0, 2, 4, 6]);
  assert.deepEqual(tiemposEnRiesgo(100), [0, 25, 50, 75, 100]);
  assert.deepEqual(tiemposEnRiesgo(0), [0], 'sin seguimiento solo queda el origen');
  const tiempos = EJEMPLO.tiempo;
  const grupos = EJEMPLO.grupo;
  for (const t of tiemposEnRiesgo(21)) {
    assert.equal(enRiesgoEn(g1, t), tiempos.filter((x: number, i: number) => grupos[i] === 0 && x >= t).length);
    assert.equal(enRiesgoEn(g2, t), tiempos.filter((x: number, i: number) => grupos[i] === 1 && x >= t).length);
  }
  assert.equal(enRiesgoEn(g1, 0), 15, 'en el origen están todos');
  assert.equal(enRiesgoEn(g1, 1000), 0);
});

// ---------------------------------------------------------------------------
// Propiedades del log-rank y de la comparación de curvas
// ---------------------------------------------------------------------------

/** Muestras con dos grupos, para el log-rank. */
function* pares(): Generator<[string, number[], number[], number[]]> {
  yield ['ejemplo', EJEMPLO.tiempo, EJEMPLO.evento, EJEMPLO.grupo];
  yield [
    'sin_eventos_en_uno',
    [2, 4, 6, 8, 3, 5, 7, 9],
    [1, 1, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1],
  ];
  yield [
    'cruce',
    [1, 2, 3, 10, 11, 12, 13, 14, 4, 5, 6, 7, 8, 9, 10, 11],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  ];
  yield ['codigos_altos', [3, 5, 7, 9, 2, 4, 6, 8], [1, 1, 0, 1, 1, 0, 1, 1], [10, 10, 10, 10, 2, 2, 2, 2]];
}

test('el log-rank no cambia al intercambiar los códigos de grupo', () => {
  for (const [id, t, e, g] of pares()) {
    const codigos = codigosDeGrupo(g);
    const directo = logRank(t, e, g, codigos);
    // Mismos datos con los códigos cambiados de sitio: el χ² es simétrico.
    const cambiado = g.map((c: number) => (c === codigos[0] ? (codigos[1] as number) : (codigos[0] as number)));
    const inverso = logRank(t, e, cambiado, codigosDeGrupo(cambiado));
    assert.ok(
      Math.abs(directo.chi2 - inverso.chi2) <= 1e-12 * Math.max(1, directo.chi2),
      `${id}: χ² ${directo.chi2} vs ${inverso.chi2}`,
    );
    assert.equal(directo.gl, 1);
    assert.ok(directo.observados[0] + directo.observados[1] === e.reduce((s: number, v: number) => s + v, 0));
    assert.ok(
      Math.abs(directo.esperados[0] + directo.esperados[1] - (directo.observados[0] + directo.observados[1])) <= 1e-9,
      `${id}: los esperados no suman los eventos observados`,
    );
  }
});

test('multiplicar los tiempos por 2 no cambia ni la curva ni el log-rank', () => {
  for (const [id, t, e, g] of pares()) {
    const codigos = codigosDeGrupo(g);
    const dobles = t.map((x: number) => 2 * x);
    assert.ok(
      Math.abs(logRank(t, e, g, codigos).chi2 - logRank(dobles, e, g, codigos).chi2) <= 1e-12,
      `${id}: el log-rank depende de la escala del tiempo`,
    );
    const op = { nivel: 0.95, tipoIC: 'log-log' as const };
    const original = tablaVida(t, e, op);
    const escalada = tablaVida(dobles, e, op);
    assert.deepEqual(columnaTablaVida(escalada, 's'), columnaTablaVida(original, 's'), `${id}: Ŝ cambió con la escala`);
    assert.deepEqual(
      columnaTablaVida(escalada, 't'),
      columnaTablaVida(original, 't').map((x: number) => 2 * x),
      `${id}: los tiempos no se escalaron`,
    );
    // Y la mediana se escala con ellos.
    const m = medianaKm(original).valor;
    const m2 = medianaKm(escalada).valor;
    assert.ok(Number.isNaN(m) ? Number.isNaN(m2) : Math.abs(m2 - 2 * m) <= 1e-12, `${id}: la mediana no se escaló`);
  }
});

test('el cruce se detecta solo cuando la diferencia de las curvas cambia de signo', () => {
  const op = { nivel: 0.95, tipoIC: 'log-log' as const };
  const [g1, g2] = curvasEjemplo();
  assert.equal(curvasCruzan(g1, g2), false, 'las curvas del ejemplo no se cruzan');
  const a = tablaVida([1, 2, 3, 10, 11, 12, 13, 14], [1, 1, 1, 0, 0, 0, 0, 0], op);
  const b = tablaVida([4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 1, 1, 1, 1], op);
  assert.equal(curvasCruzan(a, b), true, 'una curva que empieza peor y acaba mejor sí cruza');
  // Una curva consigo misma nunca se cruza, y sin eventos tampoco hay cruce.
  assert.equal(curvasCruzan(a, a), false);
  assert.equal(curvasCruzan(tablaVida([1, 2], [0, 0], op), tablaVida([1, 2], [0, 0], op)), false);
});

// ---------------------------------------------------------------------------
// derivar() y validar()
// ---------------------------------------------------------------------------

test('derivar() completa la columna de grupo ausente y los tiempos de interés no pedidos', () => {
  const derivadas = conDerivadas(definicion, {
    tiempo: [1, 2, 3],
    evento: [1, 0, 1],
    nivel: 0.95,
    tipo_ic: 'log-log',
  }) as EntradasKm;
  assert.deepEqual(derivadas.grupo, [], 'sin columna de grupo se estima una sola curva');
  assert.equal(derivadas.t1, 0, 'un tiempo no pedido viaja a R como 0');
  assert.equal(derivadas.t2, 0);
  assert.equal(definicion.validar(derivadas), null, 'el caso mínimo sin grupo ni tiempos debería validar');
  // El snippet los escribe como 0, que es lo que un caso de fixture (JSON, sin
  // NaN) sí puede llevar, y la guarda `t <= 0` de s_en los lee como «no pedido».
  const texto = rellenarR(yamlCalc.r.codigo, derivadas);
  assert.match(texto, /^t1 <- 0 /m);
  assert.match(texto, /^t2 <- 0 /m);
  // Y un 0 capturado a mano sigue siendo 0: derivar() nunca lo reinterpreta.
  const conCero = conDerivadas(definicion, { ...yamlCalc.ejemplo, t1: 0, t2: 0 }) as EntradasKm;
  assert.equal(conCero.t1, 0);
  assert.equal(conCero.t2, 0);

  // Un resultado sin tiempos de interés deja las cuatro celdas de S(t) en NaN.
  const s = calcular(derivadas, 0.95);
  for (const campo of ['s_t1_1', 's_t2_1'] as const) assert.ok(Number.isNaN(s.valores[campo]?.valor));
});

test('validar() rechaza columnas descuadradas, eventos que no son 0/1 y más de dos grupos', () => {
  const base: EntradasKm = {
    tiempo: [1, 2, 3, 4],
    evento: [1, 0, 1, 0],
    grupo: [0, 0, 1, 1],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 2,
    t2: 3,
  };
  assert.equal(definicion.validar(base), null);
  assert.deepEqual(definicion.validar({ ...base, evento: [1, 0, 1] }), { evento: 'err_longitud' });
  assert.deepEqual(definicion.validar({ ...base, evento: [1, 0, 2, 0] }), { evento: 'err_binario' });
  // I10: «Valor fuera de rango» no dice nada; el código propio sí.
  assert.deepEqual(definicion.validar({ ...base, evento: [0, 0, 0, 0] }), { evento: 'err_sin_eventos' });
  assert.deepEqual(definicion.validar({ ...base, grupo: [0, 0, 1] }), { grupo: 'err_longitud' });
  assert.deepEqual(definicion.validar({ ...base, grupo: [0, 1, 2, 3] }), { grupo: 'err_grupos' });
  // Acortar la columna de tiempos descuadra a las otras dos a la vez.
  assert.deepEqual(definicion.validar({ ...base, tiempo: [1, 2] }), {
    evento: 'err_longitud',
    grupo: 'err_longitud',
  });
  assert.deepEqual(definicion.validar({ ...base, tiempo: [1] as number[], evento: [1] as number[], grupo: [] }), {
    tiempo: 'err_n_min',
    evento: 'err_n_min',
  });
  // I2: `err_min` interpolaría el `min: 2` de la columna, que cuenta valores.
  assert.deepEqual(definicion.validar({ ...base, tiempo: [-1, 2, 3, 4] }), { tiempo: 'err_tiempo_negativo' });
  assert.deepEqual(definicion.validar({ ...base, nivel: 0.5 }), { nivel: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...base, tipo_ic: 'logit' }), { tipo_ic: 'err_opcion' });
  assert.deepEqual(definicion.validar({ ...base, t1: -1 }), { t1: 'err_tiempo_negativo' });
  assert.deepEqual(definicion.validar({ ...base, t1: 3, t2: 2 }), { t2: 'err_rango' });
  assert.deepEqual(definicion.validar({ ...base, t1: Number.NaN }), { t1: 'err_numero' });
  // 0 = «no se pidió»: ni es un tiempo negativo ni entra en la regla t1 ≤ t2.
  assert.equal(definicion.validar({ ...base, t1: 0, t2: 0 }), null);
  assert.equal(definicion.validar({ ...base, t1: 0, t2: 14 }), null);
  assert.equal(definicion.validar({ ...base, t1: 3, t2: 0 }), null, 'pedir solo el primero es válido');
  // Dos códigos cualesquiera valen, no solo 0 y 1; y con grupo vacío hay una curva.
  assert.equal(definicion.validar({ ...base, grupo: [2, 2, 10, 10] }), null);
  assert.equal(definicion.validar({ ...base, grupo: [] }), null);
  // t1 = t2 es el límite admitido.
  assert.equal(definicion.validar({ ...base, t1: 2, t2: 2 }), null);
});

test('el ejemplo del YAML valida y da los números publicados', () => {
  assert.equal(definicion.validar(EJEMPLO), null);
  const s = calcular(EJEMPLO, 0.95);
  assert.equal(s.valores.n_1?.valor, 15);
  assert.equal(s.valores.n_2?.valor, 15);
  assert.equal(s.valores.eventos_1?.valor, 12);
  assert.equal(s.valores.eventos_2?.valor, 12);
  assert.equal(s.valores.mediana_1?.valor, 6);
  assert.equal(s.valores.mediana_2?.valor, 14);
  assert.equal(s.bandas.grupos, 'dos');
  assert.equal(s.bandas.logrank, 'rechaza');
  assert.equal(s.bandas.cruce, 'no');
  assert.deepEqual(s.avisos.map((a) => a.codigo), []);
});

// ---------------------------------------------------------------------------
// Presentación y gráfica
// ---------------------------------------------------------------------------

/** Entradas del ejemplo con una variante puntual (las columnas no cambian). */
interface CambiosKm {
  grupo?: number[];
  nivel?: number;
  tipo_ic?: string;
  t1?: number;
  t2?: number;
}

function variante(cambios: CambiosKm): EntradasKm {
  // Se construye campo a campo y no con un spread de Partial<EntradasKm>: el
  // índice de cadena de `Entradas` convertiría cada campo en `| undefined`.
  return {
    tiempo: EJEMPLO.tiempo,
    evento: EJEMPLO.evento,
    grupo: cambios.grupo ?? EJEMPLO.grupo,
    nivel: cambios.nivel ?? EJEMPLO.nivel,
    tipo_ic: cambios.tipo_ic ?? EJEMPLO.tipo_ic,
    t1: cambios.t1 ?? EJEMPLO.t1,
    t2: cambios.t2 ?? EJEMPLO.t2,
  };
}

test('presentar() rellena todas las plantillas en los dos idiomas, con una y con dos curvas', () => {
  const escenarios: Array<[string, EntradasKm]> = [
    ['dos_grupos', EJEMPLO],
    ['un_grupo', variante({ grupo: [] })],
    ['sin_tiempos', variante({ t1: 0, t2: 0 })],
    ['solo_t2', variante({ t1: 0, t2: 14 })],
    ['t_fuera', variante({ t1: 19, t2: 25 })],
    ['ic_log', variante({ tipo_ic: 'log' })],
  ];
  for (const [id, entradas] of escenarios) {
    const resultado = calcular(entradas, entradas.nivel);
    for (const lang of IDIOMAS) {
      const ctx = contextoDePrueba(SLUG, lang, entradas.nivel);
      const p = presentar(resultado, entradas, ctx);
      assert.deepEqual(Object.keys(p.celdas), [...definicion.salidas], `${id}/${lang}: orden de las celdas`);
      assert.ok(p.interpretacion.length >= 4, `${id}/${lang}: interpretación incompleta`);
      assert.ok(p.metodos.length > 0, `${id}/${lang}: párrafo de Métodos vacío`);
      const textos = [...p.interpretacion, p.metodos, ...Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? ''])];
      for (const texto of textos) assert.ok(!texto.includes('{'), `${id}/${lang}: marcador sin rellenar en «${texto}»`);
      for (const aviso of p.avisos) assert.ok(definicion.avisos.includes(aviso), `${id}/${lang}: aviso no declarado ${aviso}`);
      assert.equal(p.resumen.length, definicion.salidas.length);
    }
  }
});

test('con una sola curva la interpretación habla del log-rank ausente y no del cruce', () => {
  const entradas = variante({ grupo: [] });
  const resultado = calcular(entradas, 0.95);
  const ctx = contextoDePrueba(SLUG, 'es', 0.95);
  const p = presentar(resultado, entradas, ctx);
  assert.equal(p.interpretacion.length, 4, 'sin segunda curva no hay párrafo de cruce');
  assert.equal(p.interpretacion[2], ctx.textos.interpretacion['logrank.uno']);
  assert.ok(p.avisos.includes('un_grupo'));
  // Y las celdas del segundo grupo dicen que no hay segundo grupo.
  for (const campo of ['n_2', 'eventos_2', 'mediana_2', 's_t1_2', 's_t2_2', 'chi2_logrank', 'gl', 'p_logrank'] as const) {
    assert.equal(p.celdas[campo]?.nota, ctx.textos.etiquetas.nota_sin_grupo, `${campo} debería avisar de la falta`);
  }
});

test('la mediana no alcanzada se escribe con su marcador de texto, no como «no definido»', () => {
  const entradas: EntradasKm = {
    tiempo: [2, 4, 6, 8, 10],
    evento: [1, 0, 0, 0, 0],
    grupo: [],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 2,
    t2: 10,
  };
  const resultado = calcular(entradas, 0.95);
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang, 0.95);
    const p = presentar(resultado, entradas, ctx);
    assert.equal(p.celdas.mediana_1?.valor, ctx.textos.etiquetas.no_alcanzada);
    assert.ok(p.interpretacion[1]?.includes(ctx.textos.etiquetas.no_alcanzada), `${lang}: la frase no lo dice`);
    assert.ok(p.avisos.includes('mediana_no_alcanzada'));
  }
});

test('la gráfica km empieza en (0, 1), trae una curva por grupo y la tabla de pacientes en riesgo', () => {
  for (const [id, entradas] of [
    ['dos_grupos', EJEMPLO],
    ['un_grupo', variante({ grupo: [] })],
    ['sin_tiempos', variante({ t1: 0, t2: 0 })],
    ['solo_t2', variante({ t1: 0, t2: 14 })],
    ['t_iguales', variante({ t1: 10, t2: 10 })],
  ] as Array<[string, EntradasKm]>) {
    const resultado = calcular(entradas, entradas.nivel);
    for (const lang of IDIOMAS) {
      const ctx = contextoDePrueba(SLUG, lang, entradas.nivel);
      const g = definicion.grafica?.(resultado, entradas, ctx) as GraficaKm;
      assert.ok(g && g.tipo === 'km', `${id}/${lang}: no se produjo la gráfica`);
      assert.equal(g.curvas.length, entradas.grupo.length === 0 ? 1 : 2);
      assert.deepEqual(g.ejeY.dominio, [0, 1]);
      assert.equal(g.ejeX.dominio[0], 0);
      assert.ok(g.tiemposRiesgo.length >= 2 && g.tiemposRiesgo[0] === 0);
      assert.ok(g.etiquetaRiesgo.length > 0);
      for (const curva of g.curvas) {
        assert.equal(curva.pasos[0]?.t, 0, `${id}/${lang}: el primer escalón no está en t = 0`);
        assert.equal(curva.pasos[0]?.s, 1, `${id}/${lang}: el primer escalón no vale 1`);
        assert.equal(curva.enRiesgo.length, g.tiemposRiesgo.length, `${id}/${lang}: la fila en riesgo descuadra`);
        assert.ok(curva.etiqueta.length > 0);
        let previa = 1;
        for (const paso of curva.pasos) {
          assert.ok(paso.s <= previa + EPS, `${id}/${lang}: la curva sube`);
          previa = paso.s;
        }
        // Las marcas de censura caen en tiempos que están en la curva.
        for (const t of curva.censuras) {
          assert.ok(curva.pasos.some((p) => p.t === t), `${id}/${lang}: censura en un tiempo que no es escalón`);
        }
      }
      const marcadores = g.marcadores ?? [];
      const esperados = id === 'sin_tiempos' ? 0 : id === 't_iguales' || id === 'solo_t2' ? 1 : 2;
      assert.equal(marcadores.length, esperados, `${id}/${lang}: marcadores de los tiempos de interés`);
    }
  }
});

test('la gráfica de cada caso del fixture es coherente con la tabla de vida de R', () => {
  for (const caso of fixture.casos) {
    const entradas = entradasDe(caso);
    const resultado = calcular(entradas, entradas.nivel);
    const ctx = contextoDePrueba(SLUG, 'es', entradas.nivel);
    const g = definicion.grafica?.(resultado, entradas, ctx) as GraficaKm;
    const r = normalizarR(caso.esperado) as Record<string, number[]>;
    g.curvas.forEach((curva, i) => {
      const tiempos = r[`t_${i + 1}`] as number[];
      assert.deepEqual(curva.pasos.slice(1).map((p) => p.t), tiempos, `${caso.id}: los escalones no son los de R`);
      const censuras = (r[`cens_${i + 1}`] as number[]).map((c, k) => (c > 0 ? tiempos[k] : null)).filter((t) => t !== null);
      assert.deepEqual(curva.censuras, censuras, `${caso.id}: las marcas de censura no son las de R`);
    });
  }
});

// ---------------------------------------------------------------------------
// Regresiones de la revisión independiente de H3
// ---------------------------------------------------------------------------

/** Textos publicados de una presentación, incluidas las celdas y los avisos ya interpolados. */
function textosDe(entradas: EntradasKm, lang: Lang): { p: ReturnType<typeof presentar>; ctx: ReturnType<typeof contextoDePrueba>; todos: string[] } {
  const resultado = calcular(entradas, entradas.nivel);
  const ctx = contextoDePrueba(SLUG, lang, entradas.nivel);
  const p = presentar(resultado, entradas, ctx);
  const avisos = resultado.avisos.map((a) => interpolar(ctx.textos.avisos[a.codigo] as string, a.params));
  const celdas = Object.values(p.celdas).flatMap((c) => [c.valor, c.ic ?? '', c.nota ?? '']);
  return { p, ctx, todos: [...p.interpretacion, p.metodos, ...celdas, ...avisos] };
}

test('A2 · el aviso de tiempo fuera se redacta por curva, no con el seguimiento más corto', () => {
  // Grupo 0 hasta 30 y grupo 1 hasta 11: t = 20 cabe en la primera curva y no en la segunda.
  const entradas: EntradasKm = {
    tiempo: [5, 10, 20, 25, 30, 2, 4, 6, 8, 11],
    evento: [1, 1, 1, 0, 0, 1, 1, 1, 1, 0],
    grupo: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 20,
    t2: 0,
  };
  const s = calcular(entradas, 0.95);
  const aviso = s.avisos.find((a) => a.codigo === 't_fuera');
  assert.ok(aviso, 'el tiempo se sale de una de las dos curvas: debería avisar');
  assert.equal(aviso.params?.tiempos, '20');
  assert.equal(aviso.params?.detalle, '1: 11', 'solo la curva rebasada, con su último tiempo');
  assert.ok(!('seguimiento' in (aviso.params ?? {})), 'ya no se publica un seguimiento único');

  // Y la primera curva sí tiene estimación en t = 20: la interpretación la publica.
  assert.ok(!Number.isNaN(s.valores.s_t1_1?.valor), 'S(20) del grupo 0 existe');
  assert.ok(Number.isNaN(s.valores.s_t1_2?.valor), 'S(20) del grupo 1 no existe');
  for (const lang of IDIOMAS) {
    const { ctx, p, todos } = textosDe(entradas, lang);
    const resumen = p.interpretacion[0] as string;
    assert.ok(resumen.includes(rellenar(ctx.textos.etiquetas.grupo_nombre, { codigo: '0' })), `${lang}: falta el grupo con estimación`);
    // El texto del aviso nombra el código del grupo rebasado, no «el seguimiento observado (11)».
    const aviso11 = todos.find((t) => t.includes('1: 11'));
    assert.ok(aviso11, `${lang}: el aviso no trae el detalle por grupo`);
  }
});

test('A3 · nunca se publica un intervalo «no definido a no definido»', () => {
  const escenarios: EntradasKm[] = [
    // S(8) = 0 sin censuras: hay estimación y no hay intervalo.
    { tiempo: [1, 2, 3, 4, 5, 6, 7, 8], evento: [1, 1, 1, 1, 1, 1, 1, 1], grupo: [], nivel: 0.95, tipo_ic: 'log-log', t1: 8, t2: 0 },
    { tiempo: [1, 2, 3, 4, 5, 6, 7, 8], evento: [1, 1, 1, 1, 1, 1, 1, 1], grupo: [], nivel: 0.95, tipo_ic: 'log', t1: 8, t2: 0 },
    // Mediana no alcanzada con banda que tampoco cruza: ningún límite existe.
    { tiempo: [2, 4, 6, 8, 10], evento: [1, 0, 0, 0, 0], grupo: [], nivel: 0.999, tipo_ic: 'log-log', t1: 2, t2: 10 },
    EJEMPLO,
  ];
  // La cadena prohibida se deriva del formateador, no se escribe a mano: el
  // rótulo inglés pasó de «undefined» a «not defined» y una constante literal se
  // habría quedado atrás sin que la prueba dejara de pasar. Las dos redacciones
  // conocidas se comprueban además como red de seguridad.
  const literales = ['no definido a no definido', 'undefined to undefined', 'not defined to not defined'];
  for (const entradas of escenarios) {
    for (const lang of IDIOMAS) {
      const { ctx, todos } = textosDe(entradas, lang);
      const vacio = ctx.fmt.ic([Number.NaN, Number.NaN], 'pct1');
      assert.ok(vacio.length > 0, `${lang}: el formateador no produce un intervalo vacío que vigilar`);
      for (const texto of todos) {
        assert.ok(!texto.includes(vacio), `${lang}: intervalo vacío publicado en «${texto.slice(0, 140)}»`);
        for (const literal of literales) {
          assert.ok(!texto.includes(literal), `${lang}: «${literal}» en «${texto.slice(0, 140)}»`);
        }
      }
    }
  }
  // Y en su lugar se escribe la cadena de interfaz.
  const { ctx, p } = textosDe(escenarios[0] as EntradasKm, 'es');
  assert.ok(
    (p.interpretacion[0] as string).includes(ctx.ui.sin_ic as string),
    'la frase debería decir que el IC no está definido',
  );
});

test('A3 · con una sola curva dentro del seguimiento la frase omite la que no llega', () => {
  const entradas: EntradasKm = {
    tiempo: [5, 10, 20, 25, 30, 2, 4, 6, 8, 11],
    evento: [1, 1, 1, 0, 0, 1, 1, 1, 1, 0],
    grupo: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 20,
    t2: 0,
  };
  for (const lang of IDIOMAS) {
    const { ctx, p } = textosDe(entradas, lang);
    const resumen = p.interpretacion[0] as string;
    // La cola literal de la plantilla (lo que va tras el último marcador) es lo
    // único que distingue a `tiempo.parcial` de `tiempo.uno` y `tiempo.dos`.
    const plantilla = ctx.textos.interpretacion['tiempo.parcial'] as string;
    const cola = plantilla.slice(plantilla.lastIndexOf('}') + 1);
    assert.ok(cola.length > 20, `${lang}: la plantilla no tiene cola literal que comprobar`);
    assert.ok(resumen.includes(cola), `${lang}: no se usó tiempo.parcial`);
    assert.ok(!resumen.includes(ctx.fmt.num(Number.NaN)), `${lang}: se publicó un «no definido» en la frase`);
  }
});

test('A4 · el texto alternativo de la gráfica rotula cada curva con sus propios números', () => {
  const resultado = calcular(EJEMPLO, 0.95);
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang, 0.95);
    const g = definicion.grafica?.(resultado, EJEMPLO, ctx) as GraficaKm;
    // 12 eventos en las dos curvas, pero medianas distintas: 6 y 14.
    assert.ok(g.resumen.includes('6'), `${lang}: falta la mediana de la primera curva`);
    assert.ok(g.resumen.includes('14'), `${lang}: falta la mediana de la segunda curva`);
    // Y no se cuela el rótulo de la primera curva para describir la segunda.
    assert.ok(!g.resumen.includes(ctx.textos.etiquetas.mediana_1), `${lang}: rótulo de la primera curva reutilizado`);
    assert.ok(g.resumen.includes(ctx.textos.etiquetas.grafica_mediana), `${lang}: falta el rótulo neutro`);
  }
});

test('M1 · Kalbfleisch y Prentice se citan solo con la escala log-log', () => {
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang, 0.95);
    const cita = `[${ctx.refs.kalbfleisch2002}]`;
    const conLogLog = textosDe(EJEMPLO, lang).p.metodos;
    const conLog = textosDe({ ...EJEMPLO, tipo_ic: 'log' }, lang).p.metodos;
    assert.ok(conLogLog.includes(cita), `${lang}: la escala log-log debería citarlos`);
    assert.ok(!conLog.includes(cita), `${lang}: la escala log no es la de Kalbfleisch y Prentice`);
  }
});

test('M2 · la prosa no depende del plural: un paciente y un evento por curva', () => {
  const entradas: EntradasKm = {
    tiempo: [3, 5],
    evento: [1, 1],
    grupo: [0, 1],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 3,
    t2: 0,
  };
  const malos: Record<Lang, RegExp[]> = {
    es: [/\b1 pacientes\b/, /\b1 eventos\b/, /\b1 valores\b/],
    en: [/\b1 patients\b/, /\b1 events\b/],
  };
  for (const lang of IDIOMAS) {
    const { todos } = textosDe(entradas, lang);
    for (const texto of todos) {
      for (const malo of malos[lang]) {
        assert.ok(!malo.test(texto), `${lang}: concordancia rota en «${texto.slice(0, 140)}»`);
      }
    }
  }
  // Y el caso que la revisión señaló: un grupo de tres con un solo evento.
  const tres: EntradasKm = {
    tiempo: [2, 4, 6, 1, 3, 5],
    evento: [1, 0, 0, 1, 1, 1],
    grupo: [0, 0, 0, 1, 1, 1],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 0,
    t2: 0,
  };
  for (const lang of IDIOMAS) {
    for (const texto of textosDe(tres, lang).todos) {
      for (const malo of malos[lang]) assert.ok(!malo.test(texto), `${lang}: «${texto.slice(0, 140)}»`);
    }
  }
});

test('M3 · la mediana no alcanzada se lee como una frase, no como «fue no alcanzada»', () => {
  const entradas: EntradasKm = {
    tiempo: [2, 4, 6, 8, 10],
    evento: [1, 0, 0, 0, 0],
    grupo: [],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 0,
    t2: 0,
  };
  for (const lang of IDIOMAS) {
    const { ctx, p } = textosDe(entradas, lang);
    const frase = p.interpretacion[1] as string;
    assert.ok(frase.includes(ctx.textos.etiquetas.no_alcanzada), `${lang}: no dice que no se alcanzó`);
    assert.ok(!/fue no alcanzada/.test(frase), `${lang}: construcción agramatical → «${frase.slice(0, 90)}»`);
    assert.ok(!/was not reached\./.test(frase.slice(0, 40)), `${lang}: «${frase.slice(0, 90)}»`);
  }
});

test('M6 · sin censuras el párrafo de censura no publica «0 de n»', () => {
  const entradas: EntradasKm = {
    tiempo: [1, 2, 3, 4],
    evento: [1, 1, 1, 1],
    grupo: [],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 0,
    t2: 0,
  };
  const s = calcular(entradas, 0.95);
  assert.equal(s.bandas.censura, 'no');
  for (const lang of IDIOMAS) {
    const { ctx, p } = textosDe(entradas, lang);
    assert.equal(p.interpretacion[3], rellenar(ctx.textos.interpretacion['censura.no'] as string, { n_tot: '4' }));
  }
  // Y con censuras se sigue publicando el reparto por curva.
  assert.equal(calcular(EJEMPLO, 0.95).bandas.censura, 'si');
  assert.ok((textosDe(EJEMPLO, 'es').p.interpretacion[3] as string).includes('3/15'));
});

test('M7 · con una sola curva el aviso de pocos eventos no habla del log-rank', () => {
  const entradas: EntradasKm = {
    tiempo: [2, 4, 6, 8],
    evento: [1, 0, 0, 0],
    grupo: [],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 0,
    t2: 0,
  };
  const s = calcular(entradas, 0.95);
  assert.ok(s.avisos.some((a) => a.codigo === 'pocos_eventos.uno'));
  assert.ok(!s.avisos.some((a) => a.codigo === 'pocos_eventos.dos'));
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang, 0.95);
    assert.ok(!(ctx.textos.avisos['pocos_eventos.uno'] as string).includes('log-rank'), `${lang}: menciona el log-rank`);
    assert.ok((ctx.textos.avisos['pocos_eventos.dos'] as string).includes('log-rank'), `${lang}: debería mencionarlo`);
  }
  // Con dos curvas escasas manda la variante de dos.
  const dos = calcular(
    { tiempo: [2, 4, 1, 3], evento: [1, 0, 1, 0], grupo: [0, 0, 1, 1], nivel: 0.95, tipo_ic: 'log-log', t1: 0, t2: 0 },
    0.95,
  );
  assert.ok(dos.avisos.some((a) => a.codigo === 'pocos_eventos.dos'));
});

test('B2, B3 y B6 · el contenido no usa jerga interna, describe el código que se muestra y avisa del evento deseable', () => {
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang, 0.95);
    assert.ok(!(ctx.textos.ayudas.grupo as string).includes('hito'), `${lang}: «hito» es jerga del plan`);
    const greenwood = ctx.textos.ecuaciones.find((eq) => eq.id === 'greenwood');
    assert.ok(greenwood?.nota?.includes('sf$std.err'), `${lang}: la nota debería nombrar el código R que se muestra`);
    assert.ok(!greenwood?.nota?.includes('fixture'), `${lang}: la nota no debería hablar del fixture`);
    const descripcion = ctx.textos.ejemplo_descripcion;
    const marca = lang === 'es' ? 'fiebre' : 'febrile';
    assert.ok(descripcion.includes(marca), `${lang}: el ejemplo no advierte de cómo se lee la curva`);
  }
});

test('B8 · con una sola curva la banda de la segunda mediana dice que no hay curva', () => {
  const una = calcular({ ...EJEMPLO, grupo: [] }, 0.95);
  assert.equal(una.bandas.mediana_2, 'sin_curva');
  assert.equal(una.bandas.grupos, 'uno');
  // Con dos curvas sigue distinguiendo alcanzada de no alcanzada.
  assert.equal(calcular(EJEMPLO, 0.95).bandas.mediana_2, 'alcanzada');
  const sinMediana = calcular(
    {
      tiempo: [2, 4, 6, 8, 1, 3, 5, 7],
      evento: [1, 1, 1, 1, 1, 0, 0, 0],
      grupo: [0, 0, 0, 0, 1, 1, 1, 1],
      nivel: 0.95,
      tipo_ic: 'log-log',
      t1: 0,
      t2: 0,
    },
    0.95,
  );
  assert.equal(sinMediana.bandas.mediana_2, 'no_alcanzada');
});

// ---------------------------------------------------------------------------
// Regresiones de la revisión numérica de H3
// ---------------------------------------------------------------------------

test('N1 · con varianza nula del log-rank el snippet no aborta y los dos lados dan NA', () => {
  // Las cuatro entradas que validar() acepta y que hacen singular a survdiff.
  const singulares: Array<[string, number[], number[], number[]]> = [
    ['dos_en_un_tiempo', [5, 5], [1, 1], [0, 1]],
    ['eventos_empatados', [1, 2, 3, 3], [0, 0, 1, 1], [0, 1, 0, 1]],
    ['todo_en_un_tiempo', [4, 4, 4, 4], [1, 1, 1, 1], [0, 0, 1, 1]],
    ['uno_censurado_antes', [2, 5, 5], [0, 1, 1], [0, 0, 1]],
  ];
  for (const [id, tiempo, evento, grupo] of singulares) {
    const entradas: EntradasKm = { tiempo, evento, grupo, nivel: 0.95, tipo_ic: 'log-log', t1: 0, t2: 0 };
    assert.equal(definicion.validar(entradas), null, `${id}: validar() lo acepta, así que el snippet lo recibirá`);
    const s = calcular(entradas, 0.95);
    for (const campo of ['chi2_logrank', 'gl', 'p_logrank'] as const) {
      assert.ok(Number.isNaN(s.valores[campo]?.valor), `${id}: ${campo} debería ser NaN`);
    }
    assert.equal(s.bandas.logrank, 'indefinido', `${id}: la banda debería decir que no hay prueba`);
    assert.ok(s.avisos.some((a) => a.codigo === 'logrank_indefinido'), `${id}: falta el aviso`);
    // Y el snippet que se ejecutaría es R válido que imprime JSON, no un error.
    assert.match(rellenarR(yamlCalc.r.codigo, entradas), /tryCatch\(survdiff\(/);
  }
});

test('N1 · el fixture prueba que R llega al final con los datos singulares', () => {
  for (const id of ['logrank_singular', 'logrank_singular_empate']) {
    const caso = fixture.casos.find((c) => c.id === id);
    assert.ok(caso, `falta el caso ${id}`);
    const r = normalizarR(caso.esperado) as Record<string, unknown>;
    // Si el script hubiera abortado no habría fixture que leer; y el contrato es NA.
    for (const campo of ['chi2_logrank', 'gl', 'p_logrank']) {
      assert.equal(r[campo], null, `${id}: R debería devolver NA en ${campo}`);
    }
    // La curva sí existe: el fallo era solo del contraste.
    assert.ok((r.t_1 as number[]).length > 0, `${id}: la tabla de vida del grupo 1 está vacía`);
  }
});

test('N2 · el límite inferior del IC de la mediana reproduce a quantile.survfit con la banda no monótona', () => {
  const tiempo = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const evento = [1, 1, 0, 1, 1, 1, 0, 1, 1, 0];
  // La banda inferior BAJA y luego SUBE: por eso hay que ordenar los nodos.
  const curva = tablaVida(tiempo, evento, { nivel: 0.999, tipoIC: 'log-log' });
  const falla = curva.pasos.map((paso) => 1 - paso.lo);
  assert.ok(
    falla.some((v, i) => i > 0 && v < (falla[i - 1] as number)),
    'el reproductor debería traer una banda inferior no monótona',
  );
  // Valores de R 4.5.2: quantile(survfit(...), 0.5) da 6 con IC [2, NA].
  for (const nivel of [0.999, 0.99]) {
    const m = medianaKm(tablaVida(tiempo, evento, { nivel, tipoIC: 'log-log' }));
    assert.equal(m.valor, 6, `nivel ${nivel}: mediana`);
    assert.equal(m.ic?.[0], 2, `nivel ${nivel}: el límite inferior es 2 en R, no 1`);
    assert.ok(Number.isNaN(m.ic?.[1] as number), `nivel ${nivel}: la banda superior no cruza el 0.5`);
  }
});

test('N2 · approxConstante ordena los nodos como approx() de R', () => {
  // Nodos desordenados a propósito: R ordena antes de interpolar, así que el
  // resultado no puede depender del orden de entrada.
  const ordenados = cuantilSurvfit([0, 1, 2, 3, 4], [0, 0.3, 0.55, 0.8, 0.9], 0.5);
  assert.equal(ordenados, 2);
  // Mismos pares, con dos filas intercambiadas en el medio de la curva.
  const revuelto = cuantilSurvfit([0, 2, 1, 3, 4], [0, 0.55, 0.3, 0.8, 0.9], 0.5);
  assert.equal(revuelto, 2, 'el cuantil no debería depender del orden en que llegan los nodos');
  // Y la propiedad general sobre las curvas de prueba, en los tres niveles.
  for (const [id, t, e] of muestras()) {
    for (const nivel of [0.9, 0.99, 0.999]) {
      const curva = tablaVida(t, e, { nivel, tipoIC: 'log-log' });
      const est = medianaKm(curva);
      const [lo, hi] = est.ic as [number, number];
      if (!Number.isNaN(lo) && !Number.isNaN(hi)) {
        assert.ok(lo <= hi + EPS, `${id}/${nivel}: intervalo invertido`);
      }
      // El límite inferior nunca es anterior al primer tiempo observado.
      if (!Number.isNaN(lo)) assert.ok(lo >= (curva.pasos[0]?.t ?? 0) - EPS, `${id}/${nivel}: límite imposible`);
    }
  }
});

test('N3 · un grupo que nunca está en riesgo deja la prueba sin grados de libertad', () => {
  const entradas: EntradasKm = {
    tiempo: [2, 3, 4, 5, 6, 7],
    evento: [0, 0, 0, 1, 1, 1],
    grupo: [0, 0, 0, 1, 1, 1],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 4,
    t2: 6,
  };
  const s = calcular(entradas, 0.95);
  // survdiff NO falla aquí: devuelve chisq = 0 y length(lr$n) - 1 = 1, aunque
  // imprima «on 0 degrees of freedom». El contrato es NA en los tres campos.
  assert.ok(Number.isNaN(s.valores.chi2_logrank?.valor), 'chi2 no puede valer 0');
  assert.ok(Number.isNaN(s.valores.gl?.valor), 'gl no puede valer 1');
  assert.ok(Number.isNaN(s.valores.p_logrank?.valor), 'p no puede valer 1');
  assert.equal(s.bandas.logrank, 'indefinido');
  // Y el log-rank de la biblioteca coincide: sin varianza no hay gl.
  const lr = logRank(entradas.tiempo, entradas.evento, entradas.grupo, codigosDeGrupo(entradas.grupo));
  assert.equal(lr.varianza, 0);
  assert.ok(Number.isNaN(lr.gl) && Number.isNaN(lr.chi2) && Number.isNaN(lr.p));
});

test('N1 y N3 · la interpretación dice que no hay prueba, en vez de «no se rechaza»', () => {
  const entradas: EntradasKm = {
    tiempo: [2, 3, 4, 5, 6, 7],
    evento: [0, 0, 0, 1, 1, 1],
    grupo: [0, 0, 0, 1, 1, 1],
    nivel: 0.95,
    tipo_ic: 'log-log',
    t1: 0,
    t2: 0,
  };
  for (const lang of IDIOMAS) {
    const { ctx, p } = textosDe(entradas, lang);
    assert.equal(p.interpretacion[2], ctx.textos.interpretacion['logrank.indefinido']);
    assert.notEqual(p.interpretacion[2], ctx.textos.interpretacion['logrank.no_rechaza']);
    for (const campo of ['chi2_logrank', 'gl', 'p_logrank'] as const) {
      assert.equal(p.celdas[campo]?.nota, ctx.textos.etiquetas.nota_sin_logrank, `${lang}: ${campo}`);
      assert.ok(!(p.celdas[campo]?.valor ?? '').includes(ctx.fmt.num(Number.NaN)), `${lang}: ${campo} publica «no definido»`);
    }
    assert.ok(p.avisos.includes('logrank_indefinido'));
  }
});

test('S3 · las ecuaciones publican la regla que el código ejecuta y las dos escalas del selector', () => {
  for (const lang of IDIOMAS) {
    const ctx = contextoDePrueba(SLUG, lang, 0.95);
    const porId = new Map(ctx.textos.ecuaciones.map((eq) => [eq.id, eq]));

    // El selector ofrece dos escalas: las dos tienen su ecuación.
    for (const id of ['ic_loglog', 'ic_log']) {
      assert.ok(porId.has(id), `${lang}: falta la ecuación ${id}`);
    }
    for (const opcion of TIPOS_IC_KM) {
      assert.ok(ctx.textos.etiquetas[`tipo_ic.${opcion}`], `${lang}: falta el rótulo de ${opcion}`);
    }

    // La mediana no es «el primer tiempo por debajo de 0.5»: es el promedio de
    // dos tiempos, que es lo que reproduce `cuantilSurvfit`.
    const mediana = porId.get('mediana');
    assert.ok(mediana, `${lang}: falta la ecuación de la mediana`);
    assert.ok(!mediana.tex.includes('\\inf'), `${lang}: sigue publicando la definición ingenua`);
    assert.match(mediana.tex, /t_\{1\}/, `${lang}: la ecuación no nombra el primer tiempo`);
    assert.match(mediana.tex, /t_\{2\}/, `${lang}: la ecuación no nombra el segundo tiempo`);
    assert.equal(mediana.simbolos.length, 3, `${lang}: faltan símbolos de la regla`);
  }

  // Y la regla escrita es la que da el código: cruce de golpe, meseta y final en 0.5.
  const op = { nivel: 0.95, tipoIC: 'log-log' as const };
  assert.equal(medianaKm(tablaVida([1, 2, 3], [1, 1, 1], op)).valor, 2, 't1 = t2 cuando cruza de golpe');
  assert.equal(medianaKm(tablaVida([1, 2, 3, 4], [1, 1, 1, 1], op)).valor, 2.5, 'punto medio de la meseta');
  assert.equal(medianaKm(tablaVida([2, 4, 5, 9], [1, 1, 0, 0], op)).valor, 6.5, 'el último tiempo ocupa el de t2');
  assert.ok(Number.isNaN(medianaKm(tablaVida([2, 4, 6], [1, 0, 0], op)).valor), 'sin llegar al 50 % no hay mediana');
});

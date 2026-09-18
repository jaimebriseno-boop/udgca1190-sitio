#!/usr/bin/env node
/**
 * Barrido de presentar() y grafica() de TODAS las calculadoras en los dos
 * idiomas sobre decenas de miles de combinaciones de entradas (unos 3 minutos).
 *
 *   npm run barrido:bio
 *
 * Compuerta de cierre de hito, complementaria a `npm run test`: la batería
 * comprueba el ejemplo y los casos de fixture; esto recorre el espacio de
 * entradas válidas (celdas en 0, márgenes vacíos, n mínimos, columnas
 * constantes, escenarios y selectores) y destapa lo que solo aparece en una
 * combinación concreta, como una plantilla de aviso sin texto en el YAML o un
 * SVG con una coordenada no finita. Lo escribió el revisor independiente de H2
 * y en esa revisión vio dos ventanas rotas que la batería no vio. Termina con
 * código 1 si hay problemas. Comprueba:
 *  - ninguna excepción;
 *  - ningún marcador {...} sin rellenar en ningún texto visible;
 *  - ninguna cadena vacía visible (celda.valor, interpretación, metodos, resumen);
 *  - `Object.keys(celdas)` = `definicion.salidas`;
 *  - `renderGrafica` no lanza y produce SVG bien formado;
 *  - todo aviso emitido tiene texto en el YAML, en ambos idiomas;
 *  - todo texto de aviso queda interpolado (sin {param}).
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Raíz del repositorio (este archivo vive en `scripts/`); `src/i18n.mjs` lee
// `data/sitio.yml` desde el directorio de trabajo.
const RAIZ = `${path.resolve(fileURLToPath(import.meta.url), '../..')}/`;
process.chdir(RAIZ);

const { contextoDePrueba, conDerivadas } = await import(RAIZ + 'tests/bioestadistica/util.ts');
const { renderGrafica } = await import(RAIZ + 'src/lib/bioestadistica/nucleo/svg.ts');
const { interpolar } = await import(RAIZ + 'src/lib/bioestadistica/nucleo/avisos.ts');

const SLUGS = [
  'ic-proporcion',
  'prueba-diagnostica-2x2',
  'probabilidad-posprueba',
  'valores-predictivos',
  'efecto-2x2',
  'chi-cuadrada-fisher',
  'mcnemar',
  'ic-media',
  'media-desde-mediana',
  'descriptivos',
  'muestra-una-proporcion',
  'muestra-una-media',
  'muestra-dos-proporciones',
  'muestra-dos-medias',
  'muestra-medias-pareadas',
  'muestra-prueba-diagnostica',
  'muestra-correlacion',
  'kappa',
  'kaplan-meier',
];
const DEFS = {};
for (const s of SLUGS) DEFS[s] = (await import(RAIZ + `src/lib/bioestadistica/calculadoras/${s}.ts`)).definicion;

const CTX = {};
for (const s of SLUGS) CTX[s] = { es: contextoDePrueba(s, 'es'), en: contextoDePrueba(s, 'en') };

const MARCADOR = /\{[a-z][a-z0-9_]*\}/;
const problemas = [];
let casos = 0;
let render = 0;
const porSlug = {};

function reportar(slug, lang, e, msg) {
  problemas.push(`[${slug}/${lang}] ${msg}\n     entradas=${JSON.stringify(e, (_k, v) => (Number.isNaN(v) ? 'NaN' : v))}`);
}

function revisarTexto(slug, lang, e, donde, txt) {
  if (typeof txt !== 'string') return reportar(slug, lang, e, `${donde}: no es cadena (${JSON.stringify(txt)})`);
  if (txt.trim() === '') return reportar(slug, lang, e, `${donde}: cadena vacía`);
  const m = txt.match(MARCADOR);
  if (m) reportar(slug, lang, e, `${donde}: marcador sin rellenar ${m[0]} → «${txt.slice(0, 160)}»`);
  // En español «undefined» solo puede ser un valor de JavaScript que se coló.
  // En inglés la palabra aparece en prosa legítima («the geometric mean is
  // undefined»), pero desde la revisión de H3 el rótulo de un valor no definido
  // es «not defined»: un texto que sea exactamente «undefined» es una fuga.
  if (lang === 'es' && txt.includes('undefined')) reportar(slug, lang, e, `${donde}: contiene «undefined» → «${txt.slice(0, 160)}»`);
  if (txt.trim() === 'undefined') reportar(slug, lang, e, `${donde}: es exactamente «undefined»`);
  if (/\bNaN\b/.test(txt)) reportar(slug, lang, e, `${donde}: contiene «NaN» literal → «${txt.slice(0, 160)}»`);
  if (txt.includes('[object')) reportar(slug, lang, e, `${donde}: contiene «[object …]» → «${txt.slice(0, 160)}»`);
}

function ejercer(slug, entradas) {
  const def = DEFS[slug];
  const e = conDerivadas(def, entradas);
  if (def.validar(e)) return;
  casos += 1;
  porSlug[slug] = (porSlug[slug] ?? 0) + 1;
  let s;
  try {
    s = def.calcular(e, e.nivel ?? 0.95);
  } catch (err) {
    return reportar(slug, '--', e, `calcular() lanzó: ${err.message}`);
  }
  for (const lang of ['es', 'en']) {
    const ctx = CTX[slug][lang];
    let p;
    try {
      p = def.presentar(s, e, ctx);
    } catch (err) {
      reportar(slug, lang, e, `presentar() lanzó: ${err.message}`);
      continue;
    }
    // celdas = salidas, mismo conjunto y mismo orden
    const claves = Object.keys(p.celdas);
    const salidas = [...def.salidas];
    if (claves.length !== salidas.length || claves.some((k, i) => k !== salidas[i])) {
      reportar(slug, lang, e, `celdas ≠ salidas: celdas=[${claves}] salidas=[${salidas}]`);
    }
    for (const [k, c] of Object.entries(p.celdas)) {
      revisarTexto(slug, lang, e, `celda ${k}.valor`, c.valor);
      if (c.ic !== undefined) revisarTexto(slug, lang, e, `celda ${k}.ic`, c.ic);
      if (c.nota !== undefined) revisarTexto(slug, lang, e, `celda ${k}.nota`, c.nota);
    }
    p.interpretacion.forEach((t, i) => revisarTexto(slug, lang, e, `interpretacion[${i}]`, t));
    revisarTexto(slug, lang, e, 'metodos', p.metodos);
    p.resumen.forEach((fila, i) => {
      revisarTexto(slug, lang, e, `resumen[${i}][0]`, fila[0]);
      revisarTexto(slug, lang, e, `resumen[${i}][1]`, fila[1]);
    });
    // avisos: existen en el YAML y quedan interpolados
    const params = Object.fromEntries(s.avisos.filter((a) => a.params).map((a) => [a.codigo, a.params]));
    for (const codigo of p.avisos) {
      const plantilla = ctx.textos.avisos[codigo];
      if (plantilla === undefined) {
        reportar(slug, lang, e, `aviso «${codigo}» sin texto en el YAML`);
        continue;
      }
      revisarTexto(slug, lang, e, `aviso ${codigo}`, interpolar(plantilla, params[codigo]));
    }
    // gráfica
    if (p.grafica) {
      revisarTexto(slug, lang, e, 'grafica.titulo', p.grafica.titulo);
      revisarTexto(slug, lang, e, 'grafica.resumen', p.grafica.resumen);
      let svg;
      try {
        svg = renderGrafica(p.grafica, { fmt: ctx.fmt });
        render += 1;
      } catch (err) {
        reportar(slug, lang, e, `renderGrafica lanzó: ${err.message}`);
        continue;
      }
      if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) reportar(slug, lang, e, 'SVG mal formado');
      // Solo importa un valor no finito dentro de un ATRIBUTO geométrico:
      // en <title>/<desc> «undefined» es el texto legítimo del idioma inglés.
      const atr = svg.match(/(?:x|y|cx|cy|r|rx|ry|width|height|d|x1|x2|y1|y2|points|transform|viewBox|offset|stroke-dasharray)="[^"]*(?:NaN|Infinity|undefined)[^"]*"/);
      if (atr) reportar(slug, lang, e, `SVG con atributo no finito: ${atr[0].slice(0, 120)}`);
      const abiertas = (svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
      const cerradas = (svg.match(/<\/[a-zA-Z]|\/>/g) ?? []).length;
      if (abiertas !== cerradas) reportar(slug, lang, e, `SVG con etiquetas descompensadas ${abiertas}/${cerradas}`);
    }
  }
}

// ---------------------------------------------------------------- combinaciones
const NIVELES = [0.8, 0.9, 0.95, 0.99, 0.999];
const CELDAS = [0, 1, 2, 5, 12, 30, 100];

for (const a of CELDAS)
  for (const b of CELDAS)
    for (const c of CELDAS)
      for (const d of CELDAS) {
        for (const [diseno, metodo_rra, corr] of [
          ['cohorte', 'newcombe', 0],
          ['cohorte', 'newcombe', 0.5],
          ['cohorte', 'wald', 0],
          ['casos_controles', 'newcombe', 0],
          ['transversal', 'wald', 0.5],
        ]) {
          ejercer('efecto-2x2', { a, b, c, d, diseno, metodo_rra, corr, nivel: 0.95 });
        }
        ejercer('chi-cuadrada-fisher', { a, b, c, d, nivel: 0.95 });
        for (const metodo_delta of ['wald', 'agresti-min']) {
          ejercer('mcnemar', { a, b, c, d, metodo_delta, nivel: 0.95 });
        }
      }

for (const nivel of NIVELES) {
  ejercer('efecto-2x2', { a: 12, b: 88, c: 30, d: 70, diseno: 'cohorte', metodo_rra: 'newcombe', corr: 0, nivel });
  ejercer('efecto-2x2', { a: 0, b: 5, c: 5, d: 0, diseno: 'transversal', metodo_rra: 'wald', corr: 0.5, nivel });
  ejercer('chi-cuadrada-fisher', { a: 3, b: 7, c: 9, d: 1, nivel });
  ejercer('mcnemar', { a: 1, b: 0, c: 0, d: 1, metodo_delta: 'agresti-min', nivel });
}

for (const n of [2, 3, 4, 5, 10, 29, 30, 31, 100, 5000])
  for (const de of [0, 0.001, 1, 40, 1e6])
    for (const media of [-100, -1, 0, 0.5, 95, 1e6])
      for (const nivel of NIVELES) ejercer('ic-media', { media, de, n, nivel });

const CINCO = [-10, 0, 1, 2, 5, 6, 9, 21];
for (const escenario of ['s1', 's2', 's3'])
  for (const n of [2, 4, 9, 10, 15, 16, 25, 26, 70, 71, 500])
    for (const min of CINCO)
      for (const q1 of CINCO)
        for (const mediana of CINCO)
          for (const q3 of CINCO)
            for (const max of CINCO) {
              if (!(min <= q1 && q1 <= mediana && mediana <= q3 && q3 <= max)) continue;
              ejercer('media-desde-mediana', { escenario, n, min, q1, mediana, q3, max });
            }

const COLUMNAS = [
  [1, 2],
  [5, 5],
  [1, 2, 3],
  [5, 5, 5],
  [0, 0, 0, 1],
  [1, 1, 1, 2],
  [2, 2, 3, 3, 3],
  [-5, 0, 3, 8, 12, 20],
  [-3, -1, 0, 1, 3],
  [1, 2, 3, 4, 5, 1000],
  [1e9, 1e9 + 1, 1e9 + 2, 1e9 + 3],
  [0.1, 0.2, 0.3, 0.4],
  [1, 7, 7, 7, 7, 7, 7, 7, 40],
  [-10, -8, -6, -4, -2],
  [1, 1, 1, 1, 1, 100, 100, 100, 100, 100],
  [1, 1 + 1e-12, 1 + 2e-12, 1 + 3e-12, 1 + 4e-12],
  Array.from({ length: 40 }, (_v, i) => 100 + Math.sin(i) * 30),
  Array.from({ length: 1200 }, (_v, i) => 50 + (i % 17)),
  Array.from({ length: 5001 }, (_v, i) => (i % 97) * 1.5),
  [1e-9, 2e-9, 3e-9],
  [-1e6, 1e6],
];
for (const x of COLUMNAS) for (const nivel of NIVELES) ejercer('descriptivos', { x, nivel });

// ---------------------------------------------------------------- H0 y H1
for (const n of [1, 2, 7, 20, 80, 1000])
  for (const x of [0, 1, 3, 10, 68, 80, 1000]) {
    if (x > n) continue;
    for (const nivel of NIVELES) ejercer('ic-proporcion', { x, n, nivel });
  }

for (const vp of CELDAS)
  for (const fp of CELDAS)
    for (const fn of CELDAS)
      for (const vn of CELDAS)
        for (const [metodo, corr] of [
          ['wilson', 0],
          ['wilson', 0.5],
          ['clopper-pearson', 0],
          ['agresti-coull', 0.5],
          ['jeffreys', 0],
          ['wald', 0],
        ]) {
          ejercer('prueba-diagnostica-2x2', { vp, fp, fn, vn, metodo, corr, nivel: 0.95 });
        }
for (const nivel of NIVELES) ejercer('prueba-diagnostica-2x2', { vp: 68, fp: 6, fn: 12, vn: 114, metodo: 'wilson', corr: 0, nivel });

for (const pre of [0, 0.001, 0.05, 0.3, 0.5, 0.95, 0.999, 1])
  for (const lr_pos of [0, 0.5, 1, 2, 17, 1e6])
    for (const lr_neg of [0, 0.01, 0.158, 1, 5]) ejercer('probabilidad-posprueba', { pre, lr_pos, lr_neg });

for (const sn of [0, 0.5, 0.85, 1])
  for (const sp of [0, 0.5, 0.95, 1])
    for (const prev of [0, 0.001, 0.3, 0.999, 1])
      for (const n_d of [0, 5, 80])
        for (const n_nd of [0, 5, 120])
          for (const nivel of [0.9, 0.95, 0.999]) ejercer('valores-predictivos', { sn, sp, prev, n_d, n_nd, nivel });

// H3 · C3: tamaño de muestra para dos proporciones. Rejilla de p1 × p2 con los
// extremos 0 y 1 (lo irresoluble lo debe rechazar validar sin lanzar) y, sobre
// tres pares, el resto de perillas; n_dado 0 = «sin dato», > 0 = modo inverso.
const PROPS = [0, 0.001, 0.01, 0.05, 0.3, 0.5, 0.7, 0.85, 0.95, 0.99, 0.999, 1];
for (const p1 of PROPS)
  for (const p2 of PROPS)
    for (const lateralidad of ['bilateral', 'unilateral'])
      for (const correccion of ['si', 'no'])
        for (const r of [0.5, 1, 2])
          ejercer('muestra-dos-proporciones', { p1, p2, alfa: 0.05, lateralidad, poder: 0.8, r, correccion, perdidas: 0.1, n_dado: 0 });
for (const alfa of [0.001, 0.01, 0.05, 0.2])
  for (const poder of [0.5, 0.8, 0.9, 0.99])
    for (const r of [0.1, 0.5, 1, 2, 10])
      for (const perdidas of [0, 0.1, 0.5, undefined])
        for (const n_dado of [0, 1, 2, 60, 134, 100000, undefined])
          for (const [p1, p2] of [[0.7, 0.85], [0.5, 0.505], [0.05, 0.01]])
            ejercer('muestra-dos-proporciones', { p1, p2, alfa, lateralidad: 'bilateral', poder, r, correccion: 'si', perdidas, n_dado });

// Los campos con requerido: false llegan undefined cuando el cuadro está en
// blanco (el controlador no registra lo vacío) y derivar() los convierte en
// «0 = sin dato»; por eso los opcionales se barren también con undefined.
const OPC_PERDIDAS = [0, 0.1, 0.5, undefined];

// H3 · C1: una proporción (Cochran + CPF + inverso). Rejilla p × d × población y,
// sobre el ejemplo, nivel × pérdidas × n_dado.
for (const p of PROPS)
  for (const d of [0.001, 0.01, 0.05, 0.1, 0.5])
    for (const poblacion of [0, 1, 10, 385, 2000, 1e6])
      ejercer('muestra-una-proporcion', { p, d, nivel: 0.95, poblacion, perdidas: 0.1, n_dado: 0 });
for (const nivel of NIVELES)
  for (const poblacion of [0, 100, 2000, undefined])
    for (const perdidas of OPC_PERDIDAS)
      for (const n_dado of [0, 1, 30, 323, 100000, undefined])
        for (const [p, d] of [[0.3, 0.05], [0.001, 0.001], [0.999, 0.5]])
          ejercer('muestra-una-proporcion', { p, d, nivel, poblacion, perdidas, n_dado });

// H3 · C2: una media (z y t, CPF, inverso).
for (const sigma of [1e-6, 0.5, 1, 60, 1e6])
  for (const d of [1e-6, 0.1, 10, 60, 1e6])
    for (const poblacion of [0, 1, 2, 50, 2000, 1e7])
      for (const nivel of [0.8, 0.95, 0.999]) ejercer('muestra-una-media', { sigma, d, nivel, poblacion, perdidas: 0.1, n_dado: 0 });
for (const nivel of NIVELES)
  for (const perdidas of OPC_PERDIDAS)
    for (const n_dado of [0, 1, 2, 3, 139, 100000, undefined])
      for (const [sigma, d] of [[60, 10], [1, 1], [1e6, 1e-6], [1e-6, 1e6]])
        ejercer('muestra-una-media', { sigma, d, nivel, poblacion: undefined, perdidas, n_dado });

// H3 · C4: dos medias (t no central como power.t.test, Guenther, inverso).
const DELTAS = [-5, -1, -0.01, 0, 0.01, 0.2, 1, 5, 1e3];
const SIGMAS = [0, 1e-6, 1, 3, 1e3];
for (const delta of DELTAS)
  for (const sigma of SIGMAS)
    for (const lateralidad of ['bilateral', 'unilateral'])
      for (const r of [0.1, 1, 10])
        ejercer('muestra-dos-medias', { delta, sigma, alfa: 0.05, lateralidad, poder: 0.8, r, perdidas: 0.1, n_dado: 0 });
for (const alfa of [0.001, 0.05, 0.2])
  for (const poder of [0.5, 0.8, 0.99])
    for (const perdidas of OPC_PERDIDAS)
      for (const n_dado of [0, 1, 2, 3, 100, 100000, undefined])
        for (const [delta, sigma] of [[1, 3], [0.01, 1], [5, 1e-6]])
          ejercer('muestra-dos-medias', { delta, sigma, alfa, lateralidad: 'bilateral', poder, r: 1, perdidas, n_dado });

// H3 · C5: medias pareadas (DE de la diferencia directa o desde σ y ρ).
for (const delta of [-1, 0, 0.5, 2])
  for (const de_dif of [0, 1.5, 5, undefined])
    for (const sigma of [0, 1, 3, undefined])
      for (const rho of [0, 0.5, 0.98, undefined])
        for (const lateralidad of ['bilateral', 'unilateral'])
          ejercer('muestra-medias-pareadas', { delta, de_dif, sigma, rho, alfa: 0.05, lateralidad, poder: 0.8, perdidas: 0.1, n_dado: 0 });
for (const alfa of [0.001, 0.05, 0.2])
  for (const poder of [0.5, 0.8, 0.99])
    for (const perdidas of OPC_PERDIDAS)
      for (const n_dado of [0, 1, 2, 3, 50, 100000, undefined])
        for (const [de_dif, sigma, rho] of [[1.5, 0, 0], [0, 3, 0.5], [0, 3, 0.98]])
          ejercer('muestra-medias-pareadas', { delta: 0.5, de_dif, sigma, rho, alfa, lateralidad: 'bilateral', poder, perdidas, n_dado });

// H3 · C6: precisión diagnóstica de Buderer (sin modo inverso).
const SN_SP = [0, 0.001, 0.5, 0.85, 0.95, 0.999, 1];
for (const sn of SN_SP)
  for (const sp of SN_SP)
    for (const prev of [0, 0.001, 0.05, 0.3, 0.999, 1])
      for (const w of [0.005, 0.05, 0.5]) ejercer('muestra-prueba-diagnostica', { sn, sp, prev, w, nivel: 0.95, perdidas: 0.1 });
for (const nivel of NIVELES)
  for (const perdidas of OPC_PERDIDAS)
    for (const [sn, sp, prev] of [[0.85, 0.95, 0.3], [0.999, 0.001, 0.5], [0.5, 0.5, 0.001]])
      ejercer('muestra-prueba-diagnostica', { sn, sp, prev, w: 0.05, nivel, perdidas });

// H3 · C7: correlación (z de Fisher, clásico, inverso).
const RHOS = [-0.98, -0.5, -0.01, 0, 0.01, 0.1, 0.3, 0.5, 0.9, 0.98];
for (const r of RHOS)
  for (const alfa of [0.001, 0.05, 0.2])
    for (const lateralidad of ['bilateral', 'unilateral'])
      for (const poder of [0.5, 0.8, 0.99]) ejercer('muestra-correlacion', { r, alfa, lateralidad, poder, perdidas: 0.1, n_dado: 0 });
for (const r of RHOS)
  for (const perdidas of OPC_PERDIDAS)
    for (const n_dado of [0, 1, 2, 3, 4, 84, 100000, undefined])
      ejercer('muestra-correlacion', { r, alfa: 0.05, lateralidad: 'bilateral', poder: 0.8, perdidas, n_dado });

// H3 · D1: kappa de Cohen (tabla k×k aplanada por filas; k la deriva la calculadora).
const TABLAS = [
  [20, 5, 10, 15],
  [10, 0, 0, 10],
  [0, 10, 10, 0],
  [50, 0, 0, 0],
  [0, 0, 5, 5],
  [1, 0, 0, 0],
  [1, 1, 1, 1],
  [1, 0, 0, 1],
  [1e6, 1, 1, 1e6],
  [3, 4, 5, 6],
  [5],
  [1, 2, 3, 4, 5, 6],
  [30, 5, 1, 4, 25, 6, 2, 3, 24],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [10, 0, 0, 0, 10, 0, 0, 0, 0],
  [0, 5, 5, 5, 0, 5, 5, 5, 0],
  [12, 3, 1, 0, 2, 15, 4, 1, 0, 3, 18, 2, 1, 0, 2, 20],
  [1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1],
  Array.from({ length: 100 }, (_v, i) => (i % 11 === 0 ? 9 : i % 7 === 0 ? 1 : 0)),
  Array.from({ length: 100 }, () => 1),
  // Ramas que la revisión de H3 vio sin ejercer: paradoja de kappa (una categoría
  // domina y κ se hunde con p₀ alto), banda «moderado» de Landis-Koch (κ = 0.50) y
  // acuerdo esperado cercano a 1 (z frente a κ = 0 mal condicionado).
  [90, 5, 5, 0],
  [35, 15, 10, 40],
  [9998, 1, 1, 0],
  [998, 1, 0, 1, 0, 0, 0, 0, 0],
];
for (const x of TABLAS)
  for (const ponderacion of ['ninguna', 'lineal', 'cuadratica'])
    for (const nivel of [...NIVELES, undefined]) ejercer('kappa', { x, ponderacion, nivel });

// H3 · D2: Kaplan-Meier (tiempo, evento 0/1, grupo opcional, t1/t2 opcionales).
const SUPERVIVENCIA = [
  // Gehan 1965 (6-MP frente a placebo), el ejemplo clásico de dos grupos.
  {
    tiempo: [6, 6, 6, 6, 7, 9, 10, 10, 11, 13, 16, 17, 19, 20, 22, 23, 25, 32, 32, 34, 35, 1, 1, 2, 2, 3, 4, 4, 5, 5, 8, 8, 8, 8, 11, 11, 12, 12, 15, 17, 22, 23],
    evento: [1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    grupo: [...Array(21).fill(1), ...Array(21).fill(2)],
  },
  { tiempo: [1, 2, 3, 4, 5, 6], evento: [1, 1, 1, 1, 1, 1] },
  { tiempo: [1, 2, 3, 4, 5, 6], evento: [0, 0, 0, 0, 0, 0] },
  { tiempo: [5, 5, 5, 5], evento: [1, 1, 1, 1] },
  { tiempo: [5, 5, 5, 5], evento: [1, 0, 1, 0] },
  { tiempo: [1, 2], evento: [1, 0] },
  { tiempo: [1, 2], evento: [1, 1] },
  { tiempo: [0, 0, 1, 2], evento: [1, 1, 1, 1] },
  { tiempo: [1, 2, 3, 4, 5, 6, 7, 8], evento: [1, 1, 1, 1, 0, 0, 0, 0], grupo: [1, 1, 1, 1, 2, 2, 2, 2] },
  { tiempo: [1, 2, 3, 4, 5, 6, 7, 8], evento: [1, 1, 1, 1, 1, 1, 1, 1], grupo: [1, 2, 1, 2, 1, 2, 1, 2] },
  { tiempo: [1, 2, 3, 4, 5, 6, 7, 8, 9], evento: [1, 0, 1, 0, 1, 0, 1, 0, 1], grupo: [1, 1, 1, 2, 2, 2, 3, 3, 3] },
  { tiempo: [1, 2, 3, 4], evento: [1, 1, 1, 1], grupo: [1, 1, 1, 1] },
  { tiempo: [1, 2, 3, 4], evento: [1, 2, 0, 1] },
  { tiempo: [1, 2, 3], evento: [1, 1] },
  { tiempo: [-1, 2, 3, 4], evento: [1, 1, 1, 1] },
  { tiempo: [0.5, 1.25, 1.25, 3.75, 10.5, 1e3], evento: [1, 1, 0, 1, 0, 1] },
  { tiempo: Array.from({ length: 400 }, (_v, i) => 1 + (i % 37)), evento: Array.from({ length: 400 }, (_v, i) => (i % 3 === 0 ? 0 : 1)), grupo: Array.from({ length: 400 }, (_v, i) => (i < 200 ? 1 : 2)) },
  // Ramas que la revisión de H3 vio sin ejercer: censura por encima del 50 % (aviso
  // `censura_alta`), varianza nula del log-rank (todos los que quedan en riesgo
  // presentan el evento a la vez) y un grupo que nunca está en riesgo durante los
  // eventos; y el reproductor del IC de la mediana con nodos no monótonos.
  { tiempo: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], evento: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
  { tiempo: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], evento: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0], grupo: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2] },
  { tiempo: [5, 5], evento: [1, 1], grupo: [0, 1] },
  { tiempo: [4, 4, 4, 4], evento: [1, 1, 1, 1], grupo: [0, 0, 1, 1] },
  { tiempo: [2, 3, 4, 5, 6, 7], evento: [0, 0, 0, 1, 1, 1], grupo: [0, 0, 0, 1, 1, 1] },
  { tiempo: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], evento: [1, 1, 0, 1, 1, 1, 0, 1, 1, 0] },
];
for (const datos of SUPERVIVENCIA)
  for (const tipo_ic of ['log-log', 'log'])
    for (const nivel of [0.8, 0.95, 0.999])
      for (const [t1, t2] of [[0, 0], [undefined, undefined], [3, 0], [0, 12], [3, 12], [12, 3], [1e6, 0], [5, 5]])
        ejercer('kaplan-meier', { ...datos, nivel, tipo_ic, t1, t2 });

for (const s of SLUGS) {
  if (!porSlug[s]) problemas.push('[' + s + '/--] ninguna combinación superó validar(): el bloque de combinaciones no ejerce la calculadora\n     entradas={}');
}
console.log('casos por calculadora: ' + SLUGS.map((s) => s + ' ' + (porSlug[s] ?? 0)).join(' · '));
console.log(`casos ejercidos: ${casos} (×2 idiomas) · SVG renderizados: ${render}`);
console.log(`problemas: ${problemas.length}`);
const vistos = new Set();
for (const p of problemas) {
  const clave = p.split('\n')[0].replace(/\d+/g, '#');
  if (vistos.has(clave)) continue;
  vistos.add(clave);
  console.log('  ' + p);
}
console.log(`(${vistos.size} problemas distintos tras agrupar)`);
process.exitCode = problemas.length > 0 ? 1 : 0;

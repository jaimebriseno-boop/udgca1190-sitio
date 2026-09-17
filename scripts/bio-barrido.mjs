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
];
const DEFS = {};
for (const s of SLUGS) DEFS[s] = (await import(RAIZ + `src/lib/bioestadistica/calculadoras/${s}.ts`)).definicion;

const CTX = {};
for (const s of SLUGS) CTX[s] = { es: contextoDePrueba(s, 'es'), en: contextoDePrueba(s, 'en') };

const MARCADOR = /\{[a-z][a-z0-9_]*\}/;
const problemas = [];
let casos = 0;
let render = 0;

function reportar(slug, lang, e, msg) {
  problemas.push(`[${slug}/${lang}] ${msg}\n     entradas=${JSON.stringify(e, (k, v) => (Number.isNaN(v) ? 'NaN' : v))}`);
}

function revisarTexto(slug, lang, e, donde, txt) {
  if (typeof txt !== 'string') return reportar(slug, lang, e, `${donde}: no es cadena (${JSON.stringify(txt)})`);
  if (txt.trim() === '') return reportar(slug, lang, e, `${donde}: cadena vacía`);
  const m = txt.match(MARCADOR);
  if (m) reportar(slug, lang, e, `${donde}: marcador sin rellenar ${m[0]} → «${txt.slice(0, 160)}»`);
  // «undefined» es la traducción legítima de «no definido» en inglés: solo se
  // vigila en español, donde sería un valor de JavaScript que se coló.
  if (lang === 'es' && txt.includes('undefined')) reportar(slug, lang, e, `${donde}: contiene «undefined» → «${txt.slice(0, 160)}»`);
  if (/\bNaN\b/.test(txt)) reportar(slug, lang, e, `${donde}: contiene «NaN» literal → «${txt.slice(0, 160)}»`);
  if (txt.includes('[object')) reportar(slug, lang, e, `${donde}: contiene «[object …]» → «${txt.slice(0, 160)}»`);
}

function ejercer(slug, entradas) {
  const def = DEFS[slug];
  const e = conDerivadas(def, entradas);
  if (def.validar(e)) return;
  casos += 1;
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

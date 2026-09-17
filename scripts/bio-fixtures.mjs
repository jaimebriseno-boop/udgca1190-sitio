#!/usr/bin/env node
/**
 * Generador de fixtures del oráculo R para «Bioestadística abierta».
 *
 *   node scripts/bio-fixtures.mjs [--solo <slug>] [--check]
 *
 * Para cada calculadora de `data/bioestadistica/calculadoras/`:
 *
 *   1. Lee `r.codigo`, `r.paquetes` y `ejemplo` del YAML (la misma fuente que la
 *      página) y los casos curados de `tests/bioestadistica/casos/<slug>.json`.
 *      El caso `ejemplo` se antepone siempre: lo primero que se valida es lo
 *      que ve quien pulsa «Cargar ejemplo».
 *   2. Escribe `tests/bioestadistica/r/generado/<slug>/<id>.R` con
 *      `rellenarR(r.codigo, entradas)`, sin transformar nada. Importa el mismo
 *      módulo `nucleo/codigoR.ts` que usan la página y webR: el texto que se
 *      ejecuta es, byte a byte, el que se muestra.
 *   3. Ejecuta `Rscript tests/bioestadistica/r/correr_casos.R <slug>`.
 *   4. Guarda `tests/bioestadistica/fixtures/<slug>.json` con la salida de R y
 *      los metadatos de reproducibilidad (versión de R, plataforma, versiones de
 *      los paquetes y SHA-256 de la plantilla).
 *
 * Con `--check` no toca el repositorio: genera en un directorio temporal y
 * compara con lo commiteado ignorando `meta.generado`. Sale con código 1 y un
 * informe legible si hay deriva (plantilla editada sin regenerar, versión de
 * paquete distinta, cambio de método en el oráculo).
 *
 * Node 22 ejecuta TypeScript borrando los tipos, así que este `.mjs` importa
 * `codigoR.ts` directamente, sin paso de compilación.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { rellenarR } from '../src/lib/bioestadistica/nucleo/codigoR.ts';

const RAIZ = path.resolve(fileURLToPath(import.meta.url), '../..');
const DIR_YAML = path.join(RAIZ, 'data/bioestadistica/calculadoras');
const DIR_PRUEBAS = path.join(RAIZ, 'tests/bioestadistica');
const DIR_CASOS = path.join(DIR_PRUEBAS, 'casos');
const DIR_FIXTURES = path.join(DIR_PRUEBAS, 'fixtures');
const CORRER = path.join(DIR_PRUEBAS, 'r/correr_casos.R');
const RSCRIPT = process.env.RSCRIPT ?? 'Rscript';

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

function leerArgumentos(argv) {
  const opciones = { solo: null, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') opciones.check = true;
    else if (a === '--solo') {
      opciones.solo = argv[i + 1];
      i += 1;
      if (!opciones.solo) throw new Error('--solo necesita el slug de una calculadora');
    } else if (a.startsWith('--solo=')) opciones.solo = a.slice('--solo='.length);
    else throw new Error(`argumento desconocido: ${a}`);
  }
  return opciones;
}

// ---------------------------------------------------------------------------
// Entrada: YAML + casos curados
// ---------------------------------------------------------------------------

function leerPlantilla(slug) {
  const doc = yaml.load(readFileSync(path.join(DIR_YAML, `${slug}.yml`), 'utf8'));
  if (!doc || typeof doc !== 'object') throw new Error(`${slug}.yml: no es un mapa YAML`);
  const r = doc.r;
  if (!r || typeof r.codigo !== 'string') throw new Error(`${slug}.yml: falta r.codigo`);
  if (!Array.isArray(r.paquetes)) throw new Error(`${slug}.yml: falta r.paquetes`);
  if (!doc.ejemplo || typeof doc.ejemplo !== 'object') throw new Error(`${slug}.yml: falta ejemplo`);
  return { codigo: r.codigo, paquetes: r.paquetes, ejemplo: doc.ejemplo };
}

function leerCasos(slug, plantilla) {
  const ruta = path.join(DIR_CASOS, `${slug}.json`);
  let curados = [];
  try {
    const doc = JSON.parse(readFileSync(ruta, 'utf8'));
    if (doc.calculadora !== slug) {
      throw new Error(`${slug}.json: el campo "calculadora" dice "${doc.calculadora}"`);
    }
    curados = doc.casos ?? [];
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // Sin archivo de casos solo se valida el ejemplo de la interfaz.
  }
  const casos = [
    { id: 'ejemplo', entradas: plantilla.ejemplo, nota: 'Ejemplo de la interfaz, tomado de `ejemplo:` del YAML.' },
    ...curados,
  ];
  const vistos = new Set();
  for (const c of casos) {
    if (!c.id || !/^[a-z0-9_]+$/.test(c.id)) throw new Error(`${slug}: id de caso inválido: ${JSON.stringify(c.id)}`);
    if (vistos.has(c.id)) throw new Error(`${slug}: id de caso repetido: ${c.id}`);
    vistos.add(c.id);
    if (!c.entradas || typeof c.entradas !== 'object') throw new Error(`${slug}/${c.id}: faltan entradas`);
  }
  return casos;
}

// ---------------------------------------------------------------------------
// Generación de snippets y ejecución de R
// ---------------------------------------------------------------------------

function escribirSnippets(dir, slug, casos, plantilla) {
  mkdirSync(dir, { recursive: true });
  const previos = new Set(readdirSync(dir).filter((f) => f.endsWith('.R')));
  const textos = new Map();
  for (const caso of casos) {
    let texto;
    try {
      texto = rellenarR(plantilla.codigo, caso.entradas);
    } catch (e) {
      throw new Error(`${slug}/${caso.id}: no se pudo rellenar la plantilla: ${e.message}`);
    }
    writeFileSync(path.join(dir, `${caso.id}.R`), texto);
    textos.set(caso.id, texto);
    previos.delete(`${caso.id}.R`);
  }
  // Un caso retirado de casos/*.json no debe dejar su .R huérfano: R los recorre todos.
  for (const sobrante of previos) rmSync(path.join(dir, sobrante));
  return textos;
}

function correrR(slug, dir, paquetes) {
  const res = spawnSync(RSCRIPT, [CORRER, slug, `--dir=${dir}`, `--paquetes=${paquetes.join(',')}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) {
    throw new Error(`no se pudo ejecutar ${RSCRIPT}: ${res.error.message}\nInstala R o exporta RSCRIPT=/ruta/a/Rscript`);
  }
  if (res.status !== 0) {
    throw new Error(`Rscript falló para ${slug} (código ${res.status}):\n${res.stderr.trim()}`);
  }
  if (res.stderr.trim()) process.stderr.write(`${res.stderr.trim()}\n`);
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`la salida de correr_casos.R no es JSON (${e.message}):\n${res.stdout.slice(0, 500)}`);
  }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const sha256 = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

function construirFixture(slug, casos, plantilla, salidaR, generado) {
  const paquetes = Array.isArray(salidaR.meta.paquetes) ? {} : salidaR.meta.paquetes;
  const fixture = {
    generado_por: 'scripts/bio-fixtures.mjs',
    meta: {
      calculadora: slug,
      generado,
      R: salidaR.meta.R,
      plataforma: salidaR.meta.plataforma,
      paquetes,
      plantilla_sha256: sha256(plantilla.codigo),
    },
    casos: casos.map((caso) => {
      const esperado = salidaR.casos[caso.id];
      if (esperado === undefined) throw new Error(`${slug}/${caso.id}: R no devolvió resultado para este caso`);
      return { id: caso.id, entradas: caso.entradas, esperado, tol: caso.tol ?? slug };
    }),
  };
  return fixture;
}

const serializar = (fixture) => `${JSON.stringify(fixture, null, 2)}\n`;

// ---------------------------------------------------------------------------
// Comparación para --check
// ---------------------------------------------------------------------------

function diferencias(a, b, ruta = '') {
  const salida = [];
  const tipo = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  if (tipo(a) !== tipo(b) || (tipo(a) !== 'object' && tipo(a) !== 'array')) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      salida.push(`  ${ruta || '(raíz)'}: commiteado ${JSON.stringify(a)} · regenerado ${JSON.stringify(b)}`);
    }
    return salida;
  }
  const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of claves) {
    const sub = ruta ? `${ruta}.${k}` : k;
    if (!(k in a)) salida.push(`  ${sub}: solo en el regenerado (${JSON.stringify(b[k])})`);
    else if (!(k in b)) salida.push(`  ${sub}: solo en el commiteado (${JSON.stringify(a[k])})`);
    else salida.push(...diferencias(a[k], b[k], sub));
  }
  return salida;
}

function sinFecha(fixture) {
  const copia = JSON.parse(JSON.stringify(fixture));
  delete copia.meta.generado;
  return copia;
}

// ---------------------------------------------------------------------------
// Proceso por calculadora
// ---------------------------------------------------------------------------

function procesar(slug, opciones) {
  const plantilla = leerPlantilla(slug);
  const casos = leerCasos(slug, plantilla);

  const dirFinal = path.join(DIR_PRUEBAS, 'r/generado', slug);
  const base = opciones.check ? mkdtempSync(path.join(tmpdir(), `bio-fixtures-${slug}-`)) : null;
  const dir = opciones.check ? path.join(base, 'generado', slug) : dirFinal;

  try {
    const textos = escribirSnippets(dir, slug, casos, plantilla);
    const salidaR = correrR(slug, dir, plantilla.paquetes);
    const fixture = construirFixture(slug, casos, plantilla, salidaR, new Date().toISOString());
    const rutaFixture = path.join(DIR_FIXTURES, `${slug}.json`);

    if (!opciones.check) {
      mkdirSync(DIR_FIXTURES, { recursive: true });
      writeFileSync(rutaFixture, serializar(fixture));
      console.log(`${slug}: ${casos.length} casos · ${Object.keys(fixture.casos[0].esperado).length} campos · ${path.relative(RAIZ, rutaFixture)}`);
      return true;
    }

    const problemas = [];
    let commiteado;
    try {
      commiteado = JSON.parse(readFileSync(rutaFixture, 'utf8'));
    } catch (e) {
      problemas.push(`  no se pudo leer el fixture commiteado: ${e.message}`);
    }
    if (commiteado) problemas.push(...diferencias(sinFecha(commiteado), sinFecha(fixture)));

    for (const [id, texto] of textos) {
      const rutaR = path.join(dirFinal, `${id}.R`);
      let guardado;
      try {
        guardado = readFileSync(rutaR, 'utf8');
      } catch {
        problemas.push(`  r/generado/${slug}/${id}.R: no existe en el repositorio`);
        continue;
      }
      if (guardado !== texto) problemas.push(`  r/generado/${slug}/${id}.R: difiere de la plantilla actual del YAML`);
    }
    // Un caso retirado de casos/<slug>.json deja su .R huérfano en el repositorio
    // y correr_casos.R lo seguiría ejecutando: también es deriva.
    const vigentes = new Set(Array.from(textos.keys()).map((id) => `${id}.R`));
    let enRepo = [];
    try {
      enRepo = readdirSync(dirFinal).filter((f) => f.endsWith('.R'));
    } catch {
      enRepo = [];
    }
    for (const f of enRepo) {
      if (!vigentes.has(f)) problemas.push(`  r/generado/${slug}/${f}: huérfano (no corresponde a ningún caso vigente)`);
    }

    if (problemas.length > 0) {
      console.error(`${slug}: DERIVA detectada (${problemas.length} diferencias)`);
      console.error(problemas.slice(0, 60).join('\n'));
      if (problemas.length > 60) console.error(`  … y ${problemas.length - 60} más`);
      console.error('  Regenera con: node scripts/bio-fixtures.mjs --solo ' + slug);
      return false;
    }
    console.log(`${slug}: sin deriva · ${casos.length} casos`);
    return true;
  } finally {
    if (base) rmSync(base, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------

function main() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const slugs = opciones.solo
    ? [opciones.solo]
    : readdirSync(DIR_YAML)
        .filter((f) => f.endsWith('.yml'))
        .map((f) => f.replace(/\.yml$/, ''))
        .sort();
  if (slugs.length === 0) throw new Error(`no hay calculadoras en ${path.relative(RAIZ, DIR_YAML)}`);

  let ok = true;
  for (const slug of slugs) ok = procesar(slug, opciones) && ok;
  if (!ok) process.exitCode = 1;
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}

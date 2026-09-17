/**
 * Lectura de los artefactos del pipeline de validación: el YAML de la
 * calculadora (fuente única de la plantilla de R y del ejemplo), la lista de
 * casos curados y el fixture generado por `scripts/bio-fixtures.mjs`.
 *
 * Todas las rutas se resuelven desde `import.meta.url`, no desde el directorio
 * de trabajo, para que las pruebas funcionen desde cualquier cwd.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { Entradas } from '../../src/lib/bioestadistica/nucleo/tipos.ts';

/** js-yaml 4 es CommonJS y no publica tipos; se carga con `require` y se acota aquí. */
interface ModuloYaml {
  load(texto: string): unknown;
}
const yaml = createRequire(import.meta.url)('js-yaml') as ModuloYaml;

/** Raíz del repositorio (este archivo vive en `tests/bioestadistica/`). */
export const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

/** Directorio de las pruebas de bioestadística. */
export const DIR_PRUEBAS = fileURLToPath(new URL('./', import.meta.url));

/** Ruta del YAML de contenido de una calculadora. */
export const rutaYaml = (slug: string): string => `${RAIZ}data/bioestadistica/calculadoras/${slug}.yml`;

/** Ruta del snippet de R generado para un caso, tal como se commitea. */
export const rutaGenerado = (slug: string, id: string): string => `${DIR_PRUEBAS}r/generado/${slug}/${id}.R`;

/** Parte del YAML que consume el pipeline: la plantilla de R y el ejemplo de la interfaz. */
export interface YamlCalculadora {
  ejemplo: Entradas;
  r: { paquetes: string[]; codigo: string };
}

function exigeObjeto(v: unknown, donde: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${donde}: se esperaba un objeto`);
  return v as Record<string, unknown>;
}

/** Lee `ejemplo`, `r.codigo` y `r.paquetes` del YAML de la calculadora. */
export function leerYaml(slug: string): YamlCalculadora {
  const doc = exigeObjeto(yaml.load(readFileSync(rutaYaml(slug), 'utf8')), `${slug}.yml`);
  const r = exigeObjeto(doc.r, `${slug}.yml → r`);
  if (typeof r.codigo !== 'string') throw new Error(`${slug}.yml → r.codigo: se esperaba una cadena`);
  if (!Array.isArray(r.paquetes) || r.paquetes.some((p) => typeof p !== 'string')) {
    throw new Error(`${slug}.yml → r.paquetes: se esperaba una lista de cadenas`);
  }
  return {
    ejemplo: exigeObjeto(doc.ejemplo, `${slug}.yml → ejemplo`) as Entradas,
    r: { codigo: r.codigo, paquetes: r.paquetes as string[] },
  };
}

/** Un caso curado a mano: entradas y por qué se probó. */
export interface Caso {
  id: string;
  entradas: Entradas;
  nota: string;
  /** Perfil de `tolerancias.ts`; por omisión, el slug de la calculadora. */
  tol?: string;
}

export interface ArchivoCasos {
  calculadora: string;
  casos: Caso[];
}

/** Lee `casos/<slug>.json`. El caso `ejemplo` no está aquí: lo antepone el generador desde el YAML. */
export function leerCasos(slug: string): ArchivoCasos {
  return JSON.parse(readFileSync(`${DIR_PRUEBAS}casos/${slug}.json`, 'utf8')) as ArchivoCasos;
}

/** Un caso del fixture: entradas, salida cruda de R y perfil de tolerancia. */
export interface CasoFixture {
  id: string;
  entradas: Entradas;
  esperado: Record<string, unknown>;
  tol: string;
}

export interface Fixture {
  generado_por: string;
  meta: {
    calculadora: string;
    generado: string;
    R: string;
    plataforma: string;
    paquetes: Record<string, string>;
    plantilla_sha256: string;
  };
  casos: CasoFixture[];
}

/** Lee `fixtures/<slug>.json` (salida de R commiteada; no requiere tener R instalado). */
export function leerFixture(slug: string): Fixture {
  return JSON.parse(readFileSync(`${DIR_PRUEBAS}fixtures/${slug}.json`, 'utf8')) as Fixture;
}

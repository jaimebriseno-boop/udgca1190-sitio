/**
 * Registro de calculadoras: resuelve el módulo puro de cada slug con
 * `import.meta.glob` (Vite). En build (frontmatter de Astro) y en el navegador
 * genera un chunk por calculadora, cargado solo en su página.
 *
 * Vive fuera de src/lib/bioestadistica/ porque `import.meta.glob` no existe en
 * Node: así `node --test` puede importar toda la biblioteca pura sin tocarlo.
 */
import type { Definicion } from '../lib/bioestadistica/nucleo/tipos.ts';

type Modulo = { definicion: Definicion };

const registro = import.meta.glob<Modulo>('../lib/bioestadistica/calculadoras/*.ts');

/** Slugs disponibles (nombre de archivo sin extensión), ordenados. */
export function slugs(): string[] {
  return Object.keys(registro)
    .map((ruta) => ruta.replace(/^.*\//, '').replace(/\.ts$/, ''))
    .sort();
}

/** Carga la `definicion` de una calculadora; error claro si el slug no tiene módulo. */
export async function cargarDefinicion(slug: string): Promise<Definicion> {
  const clave = `../lib/bioestadistica/calculadoras/${slug}.ts`;
  const cargar = registro[clave];
  if (!cargar) {
    throw new Error(
      `bioestadistica: no existe el módulo src/lib/bioestadistica/calculadoras/${slug}.ts para el YAML «${slug}» (disponibles: ${slugs().join(', ') || 'ninguno'})`,
    );
  }
  const mod = await cargar();
  if (!mod.definicion || mod.definicion.id !== slug) {
    throw new Error(`bioestadistica: el módulo ${slug}.ts debe exportar «definicion» con id «${slug}»`);
  }
  return mod.definicion;
}

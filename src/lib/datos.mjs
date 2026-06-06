/** Helpers de datos no-colección (config global del sitio). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const ROOT = process.cwd();

/** Lee data/sitio.yml (configuración global). */
export function getSitio() {
  return yaml.load(readFileSync(join(ROOT, 'data/sitio.yml'), 'utf8'));
}

/**
 * Copia las banderas SVG (4×3) de flag-icons a public/flags/ para el módulo
 * «Alcance». Solo códigos ISO 3166-1 alfa-2 (mx.svg, us.svg…). Se ejecuta
 * antes de dev/build/check, como las fuentes; public/flags/ está en .gitignore.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = join(RAIZ, 'node_modules/flag-icons/flags/4x3');
const DESTINO = join(RAIZ, 'public/flags');

rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(DESTINO, { recursive: true });
let n = 0;
for (const f of readdirSync(ORIGEN)) {
  if (/^[a-z]{2}\.svg$/.test(f)) {
    copyFileSync(join(ORIGEN, f), join(DESTINO, f));
    n++;
  }
}
copyFileSync(join(RAIZ, 'node_modules/flag-icons/LICENSE'), join(DESTINO, 'LICENSE.txt'));
console.log(`✓ ${n} banderas copiadas a public/flags/ (flag-icons, MIT)`);
